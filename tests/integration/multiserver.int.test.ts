import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as economy from '../../src/core/database/repositories/economy.repository';
import * as gamingRepo from '../../src/core/database/repositories/gaming.repository';
import * as levels from '../../src/core/database/repositories/levels.repository';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import * as suggestions from '../../src/core/database/repositories/suggestions.repository';
import { announceNewOffers } from '../../src/modules/gaming/services/offers.service';
import { fakeClient, resetDatabase } from './helpers';

/** Cinq serveurs, comme en production. */
const GUILDS = Array.from({ length: 5 }, (_, i) => `51000000000000000${i}`);

beforeAll(async () => {
  await resetDatabase();
  moduleRepo.registerModuleDefaults([{ id: 'gaming', defaultEnabled: false }, { id: 'fun' }]);
});
afterAll(() => prisma.$disconnect());

describe('plusieurs serveurs en même temps', () => {
  it('garde activations et données de chaque serveur séparées sous charge simultanée', async () => {
    await Promise.all(
      GUILDS.map((guildId, i) => moduleRepo.setModuleEnabled(guildId, 'fun', i % 2 === 0)),
    );
    expect(
      await Promise.all(GUILDS.map((guildId) => moduleRepo.isModuleEnabled(guildId, 'fun'))),
    ).toEqual([true, false, true, false, true]);

    // Chaque serveur reçoit en parallèle de l'XP, de la monnaie et des suggestions.
    await Promise.all(
      GUILDS.flatMap((guildId, i) => [
        ...Array.from({ length: 10 }, () => levels.addMessageXp(guildId, 'membre', i + 1)),
        ...Array.from({ length: 10 }, () => economy.creditActivity(guildId, 'membre', i + 1)),
        ...Array.from({ length: 5 }, (_, n) =>
          suggestions.createSuggestion(guildId, 'membre', `Idée ${n}`),
        ),
      ]),
    );
    for (const [i, guildId] of GUILDS.entries()) {
      expect((await levels.getUserExperience(guildId, 'membre'))?.xp).toBe(10 * (i + 1));
      expect((await economy.getAccount(guildId, 'membre')).balance).toBe(10 * (i + 1));
      const numbers = (
        await prisma.suggestion.findMany({ where: { guildId }, select: { number: true } })
      ).map((s) => s.number);
      expect(numbers.sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('annonce une même offre une fois sur chaque serveur, même avec des passages simultanés', async () => {
    const { client, sent } = fakeClient(GUILDS);
    for (const guildId of GUILDS) {
      await moduleRepo.setModuleEnabled(guildId, 'gaming', true);
      await gamingRepo.saveGamingConfig(guildId, {
        channelId: 'c1',
        announceSince: new Date(Date.now() - 1000),
      });
    }
    const offer = (id: string) => ({
      externalId: id,
      title: id,
      description: '',
      kind: 'GAME' as const,
      stores: ['pc'],
      worthCents: null,
      currency: null,
      endsAt: null,
      imageUrl: null,
      url: `https://exemple.invalid/${id}`,
      keyRequired: false,
    });
    await gamingRepo.syncOffers('multi', [offer('reference')]);
    await gamingRepo.syncOffers('multi', [offer('reference'), offer('nouvelle')]);
    await Promise.all([
      announceNewOffers(client),
      announceNewOffers(client),
      announceNewOffers(client),
    ]);
    expect(sent).toHaveLength(GUILDS.length);
    expect(new Set(sent.map((message) => message.guildId))).toEqual(new Set(GUILDS));

    // Un serveur qui désactive le module ne reçoit plus rien ; les autres, si.
    await moduleRepo.setModuleEnabled(GUILDS[0]!, 'gaming', false);
    await gamingRepo.syncOffers('multi', [
      offer('reference'),
      offer('nouvelle'),
      offer('suivante'),
    ]);
    await announceNewOffers(client);
    const latest = sent.slice(GUILDS.length);
    expect(latest).toHaveLength(GUILDS.length - 1);
    expect(latest.some((message) => message.guildId === GUILDS[0])).toBe(false);
  });

  it('supprime les données d’un serveur quitté sans toucher aux autres', async () => {
    await prisma.guildConfig.delete({ where: { guildId: GUILDS[4]! } });
    expect(await prisma.userExperience.count({ where: { guildId: GUILDS[4]! } })).toBe(0);
    expect(await prisma.gamingAnnouncement.count({ where: { guildId: GUILDS[4]! } })).toBe(0);
    expect(await prisma.userExperience.count()).toBe(GUILDS.length - 1);
    expect(await prisma.gamingOffer.count()).toBe(3);
  });
});
