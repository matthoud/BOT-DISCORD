import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as guildRepo from '../../src/core/database/repositories/guild.repository';
import * as loggingRepo from '../../src/core/database/repositories/logging.repository';
import * as moderationRepo from '../../src/core/database/repositories/moderation.repository';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import * as permissionRepo from '../../src/core/database/repositories/permission.repository';
import * as userRepo from '../../src/core/database/repositories/user.repository';
import * as welcomeRepo from '../../src/core/database/repositories/welcome.repository';
import { resetDatabase } from './helpers';

const A = '100000000000000001';
const B = '100000000000000002';
const U = '200000000000000001';
const base = { targetId: U, targetTag: 'cible', moderatorId: '300000000000000001', reason: 'test' };

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('socle V1', () => {
  it('crée la configuration d’un serveur inconnu, même en accès simultanés', async () => {
    const configs = await Promise.all(
      Array.from({ length: 20 }, () => guildRepo.getGuildConfig('100000000000000099')),
    );
    expect(new Set(configs.map((config) => config.guildId)).size).toBe(1);
    expect(configs[0]?.timezone).toBe('Europe/Paris');
  });

  it('numérote les cas de modération sans trou ni doublon, par serveur', async () => {
    const cases = await Promise.all(
      Array.from({ length: 10 }, () =>
        moderationRepo.createCase({ guildId: A, type: 'WARN', ...base }),
      ),
    );
    expect(cases.map((c) => c.caseNumber).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 1),
    );
    expect(
      (await moderationRepo.createCase({ guildId: B, type: 'KICK', ...base })).caseNumber,
    ).toBe(1);

    for (const c of cases.slice(0, 3)) {
      await moderationRepo.createWarning({
        guildId: A,
        userId: U,
        moderatorId: base.moderatorId,
        reason: 'w',
        caseId: c.id,
      });
    }
    expect(await moderationRepo.countActiveWarnings(A, U)).toBe(3);
    expect(await moderationRepo.countActiveWarnings(B, U)).toBe(0);
    expect(await moderationRepo.clearWarnings(A, U)).toBe(3);
    expect(await moderationRepo.countCases(A, U)).toBe(10);
    expect((await moderationRepo.listCases(A, U, 0, 2)).map((c) => c.caseNumber)).toEqual([10, 9]);
  });

  it('retrouve les bannissements temporaires expirés', async () => {
    const G = '100000000000000003';
    await moderationRepo.createCase({
      guildId: G,
      type: 'BAN',
      ...base,
      duration: 1,
      expiresAt: new Date(Date.now() - 1000),
      resolved: false,
    });
    await moderationRepo.createCase({
      guildId: G,
      type: 'BAN',
      ...base,
      targetId: '200000000000000002',
      duration: 9999,
      expiresAt: new Date(Date.now() + 9_999_000),
      resolved: false,
    });
    expect(
      (await moderationRepo.findExpiredTempBans(new Date())).filter((c) => c.guildId === G),
    ).toHaveLength(1);
    await moderationRepo.resolvePendingBans(G, U);
    expect(
      (await moderationRepo.findExpiredTempBans(new Date())).filter((c) => c.guildId === G),
    ).toHaveLength(0);
  });

  it('isole sanctions, modules, permissions, bienvenue et logs par serveur', async () => {
    await moderationRepo.upsertSanctionRule(A, 3, 'TIMEOUT', 3600);
    await moderationRepo.upsertSanctionRule(A, 3, 'KICK', null);
    expect((await moderationRepo.findSanctionRule(A, 3))?.action).toBe('KICK');
    expect(await moderationRepo.findSanctionRule(B, 3)).toBeNull();

    moduleRepo.registerModuleDefaults([{ id: 'fun' }, { id: 'levels', defaultEnabled: false }]);
    expect(await moduleRepo.isModuleEnabled(A, 'fun')).toBe(true);
    expect(await moduleRepo.isModuleEnabled(A, 'levels')).toBe(false);
    await moduleRepo.setModuleEnabled(A, 'fun', false);
    await moduleRepo.setModuleEnabled(A, 'levels', true);
    expect(await moduleRepo.isModuleEnabled(A, 'fun')).toBe(false);
    expect(await moduleRepo.isModuleEnabled(A, 'levels')).toBe(true);
    expect(await moduleRepo.isModuleEnabled(B, 'fun')).toBe(true);

    await permissionRepo.setCustomPermission(A, 'ban', '400000000000000001', true);
    await permissionRepo.setCustomPermission(A, 'ban', '400000000000000001', false);
    expect(await permissionRepo.getCommandPermissions(A, 'ban')).toMatchObject([{ allow: false }]);
    expect(await permissionRepo.getCommandPermissions(B, 'ban')).toEqual([]);

    const C = '100000000000000004';
    expect((await welcomeRepo.getWelcomeConfig(C)).enabled).toBe(false);
    await welcomeRepo.updateWelcomeConfig(C, { enabled: true, channelId: '500000000000000001' });
    expect((await welcomeRepo.getWelcomeConfig(C)).enabled).toBe(true);
    expect((await welcomeRepo.getWelcomeConfig(A)).enabled).toBe(false);

    const D = '100000000000000005';
    await loggingRepo.setLogChannel(D, 'messages', '500000000000000002');
    expect(loggingRepo.getLogChannelId(await loggingRepo.getLoggingConfig(D), 'messages')).toBe(
      '500000000000000002',
    );
    expect(
      loggingRepo.getLogChannelId(await loggingRepo.getLoggingConfig(D), 'members'),
    ).toBeNull();
  });

  it('enregistre préférences et fuseau sans toucher au reste', async () => {
    // Le compteur de cas lu ici doit refléter les cas créés plus haut (cache invalidé).
    const before = await guildRepo.getGuildConfig(A);
    expect(before.caseCounter).toBe(10);
    const updated = await guildRepo.updateGuildConfig(A, {
      timezone: 'America/Montreal',
      dmOnSanction: false,
    });
    expect([updated.timezone, updated.dmOnSanction, updated.caseCounter]).toEqual([
      'America/Montreal',
      false,
      before.caseCounter,
    ]);
    expect(await userRepo.acceptsDirectMessages(U)).toBe(true);
    await userRepo.setDmNotifications(U, false);
    expect(await userRepo.acceptsDirectMessages(U)).toBe(false);
  });

  it('supprime en cascade toutes les données d’un serveur, et seulement les siennes', async () => {
    await prisma.guildConfig.delete({ where: { guildId: A } });
    expect(await prisma.moderationCase.count({ where: { guildId: A } })).toBe(0);
    expect(await prisma.moduleConfig.count({ where: { guildId: A } })).toBe(0);
    expect(await prisma.moderationCase.count({ where: { guildId: B } })).toBe(1);
  });
});
