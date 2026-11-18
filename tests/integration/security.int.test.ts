import type { Guild } from 'discord.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as repo from '../../src/core/database/repositories/security.repository';
import { ALERTS_PER_MINUTE, resetAlertWindows } from '../../src/modules/security/services/alerts';
import { reportIncident } from '../../src/modules/security/services/incidents.service';
import { fakeClient, resetDatabase, settle } from './helpers';

const A = '610000000000000001';
const B = '610000000000000002';

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

const base = {
  type: 'SPAM' as const,
  severity: 'WARNING' as const,
  userId: 'u1',
  rule: 'Test',
  action: 'Aucune',
  observed: false,
  details: '',
  channelId: null,
};

describe('incidents de sécurité', () => {
  it('numérote sans trou ni doublon, indépendamment par serveur', async () => {
    const created = await Promise.all(
      Array.from({ length: 30 }, () => repo.createIncident({ ...base, guildId: A })),
    );
    expect(created.map((incident) => incident.number).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect((await repo.createIncident({ ...base, guildId: B })).number).toBe(1);
  });

  it('filtre par gravité, membre, période et statut', async () => {
    await repo.createIncident({ ...base, guildId: A, severity: 'CRITICAL', userId: 'u2' });
    expect(await repo.countIncidents(A, { severities: ['CRITICAL'] })).toBe(1);
    expect(await repo.countIncidents(A, { userId: 'u2' })).toBe(1);
    expect(await repo.countIncidents(A, { since: new Date(Date.now() + 60_000) })).toBe(0);
    expect((await repo.listIncidents(A, {}, 0, 3)).map((incident) => incident.number)).toEqual([
      31, 30, 29,
    ]);
    const counts = await repo.countIncidentsBySeverity(A, new Date(Date.now() - 60_000));
    expect(counts).toEqual({ INFO: 0, WARNING: 30, IMPORTANT: 0, CRITICAL: 1 });

    const handled = await repo.setIncidentStatus(A, 31, 'DISMISSED', 'staff', null);
    expect([handled?.status, handled?.handledById]).toEqual(['DISMISSED', 'staff']);
    expect(await repo.countIncidents(A, { status: 'OPEN' })).toBe(30);
    const reopened = await repo.setIncidentStatus(A, 31, 'OPEN', 'staff', null);
    expect([reopened?.status, reopened?.handledById]).toEqual(['OPEN', null]);
    // Un incident d'un autre serveur n'est jamais modifiable.
    expect(await repo.setIncidentStatus(B, 31, 'RESOLVED', 'staff', null)).toBeNull();
  });

  it('gère les exemptions sans perte en cas de modifications simultanées, dans la limite fixée', async () => {
    const G = '610000000000000003';
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repo.toggleListEntry(G, 'exemptRoleIds', `r${i}`, true, 25),
      ),
    );
    expect(
      (await prisma.securityConfig.findUnique({ where: { guildId: G } }))?.exemptRoleIds,
    ).toHaveLength(10);
    const overflow = await settle(
      Array.from({ length: 20 }, (_, i) =>
        repo.toggleListEntry(G, 'exemptRoleIds', `x${i}`, true, 25),
      ),
    );
    expect(overflow.ok).toHaveLength(15);
    expect(overflow.errors.every((error) => /limitée à 25/.test(error.message))).toBe(true);
    const config = await repo.toggleListEntry(G, 'exemptRoleIds', 'r0', false, 25);
    expect(config.exemptRoleIds).toHaveLength(24);
  });

  it('alerte le staff selon la gravité configurée, sans inonder le salon', async () => {
    const G = '610000000000000004';
    resetAlertWindows();
    const { client, sent } = fakeClient([G], ['alertes']);
    const guild = client.guilds.cache.get(G) as Guild;
    await repo.updateSecurityConfig(G, {
      alertChannelId: 'alertes',
      alertMinSeverity: 'IMPORTANT',
    });

    await reportIncident(guild, { ...base, severity: 'WARNING' });
    expect(sent).toHaveLength(0);
    await reportIncident(guild, { ...base, severity: 'CRITICAL' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.allowedMentions).toEqual({ parse: [] });

    // Rafale : toutes enregistrées, publication limitée par minute.
    await Promise.all(
      Array.from({ length: 20 }, () => reportIncident(guild, { ...base, severity: 'CRITICAL' })),
    );
    expect(sent).toHaveLength(ALERTS_PER_MINUTE);
    expect(await repo.countIncidents(G)).toBe(22);
  });

  it('supprime les incidents d’un serveur quitté et purge les anciens', async () => {
    await prisma.securityIncident.updateMany({
      where: { guildId: B },
      data: { createdAt: new Date('2020-01-01') },
    });
    expect(await repo.pruneIncidents(new Date('2021-01-01'))).toBe(1);
    await prisma.guildConfig.delete({ where: { guildId: A } });
    expect(await prisma.securityIncident.count({ where: { guildId: A } })).toBe(0);
    expect(await prisma.securityConfig.count({ where: { guildId: A } })).toBe(0);
  });
});
