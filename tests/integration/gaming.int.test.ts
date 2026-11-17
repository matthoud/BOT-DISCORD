import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as repo from '../../src/core/database/repositories/gaming.repository';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import type { GamingProvider, NormalizedOffer } from '../../src/modules/gaming/providers/types';
import { announceNewOffers, syncProvider } from '../../src/modules/gaming/services/offers.service';
import { embedTitle, fakeClient, resetDatabase } from './helpers';

const offer = (id: string, overrides: Partial<NormalizedOffer> = {}): NormalizedOffer => ({
  externalId: id,
  title: `Jeu ${id}`,
  description: 'Description',
  kind: 'GAME',
  stores: ['pc', 'epic'],
  worthCents: 1499,
  currency: 'USD',
  endsAt: null,
  imageUrl: null,
  url: `https://www.gamerpower.com/open/${id}`,
  keyRequired: false,
  ...overrides,
});

/** Fournisseur de test : ses offres sont fixées par le test, et ses appels comptés. */
const source = { offers: [] as NormalizedOffer[], calls: 0 };
const provider: GamingProvider = {
  id: 'gamerpower',
  name: 'GamerPower',
  website: 'https://www.gamerpower.com',
  intervalSeconds: 1800,
  fetchOffers: async () => {
    source.calls++;
    return source.offers;
  },
};

const A = '310000000000000001';
const B = '310000000000000002';

beforeAll(async () => {
  await resetDatabase();
  moduleRepo.registerModuleDefaults([{ id: 'gaming', defaultEnabled: false }]);
});
afterAll(() => prisma.$disconnect());

describe('offres gaming', () => {
  const discord = fakeClient([A, B], ['jeux', 'extras']);

  it('ne contacte pas la source si aucun serveur n’a activé le module', async () => {
    await syncProvider(discord.client, provider);
    expect(source.calls).toBe(0);
  });

  it('n’annonce pas les offres de la première synchronisation', async () => {
    await moduleRepo.setModuleEnabled(A, 'gaming', true);
    await repo.saveGamingConfig(A, {
      channelId: 'jeux',
      extrasChannelId: 'extras',
      kinds: ['GAME', 'DLC', 'BETA', 'OTHER'],
      announceSince: new Date(Date.now() - 1000),
    });
    source.offers = Array.from({ length: 20 }, (_, i) => offer(`base-${i}`));
    await syncProvider(discord.client, provider);
    expect(await prisma.gamingOffer.count({ where: { baseline: true } })).toBe(20);
    expect(discord.sent).toHaveLength(0);
  });

  it('annonce chaque nouvelle offre une seule fois, même en passages simultanés', async () => {
    source.offers = [
      ...source.offers,
      ...Array.from({ length: 6 }, (_, i) => offer(`n${i}`)),
      offer('dlc', { kind: 'DLC', stores: ['pc', 'steam'] }),
    ];
    await repo.syncOffers('gamerpower', source.offers);
    await Promise.all([
      announceNewOffers(discord.client),
      announceNewOffers(discord.client),
      announceNewOffers(discord.client),
    ]);
    await announceNewOffers(discord.client);
    await announceNewOffers(discord.client);
    const titles = discord.sent.map(embedTitle);
    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
    expect(
      discord.sent.find((message) => embedTitle(message)?.startsWith('Jeu dlc'))?.channelId,
    ).toBe('extras');
  });

  it('applique les filtres et n’envoie pas les offres antérieures à la configuration', async () => {
    await moduleRepo.setModuleEnabled(B, 'gaming', true);
    await repo.saveGamingConfig(B, {
      channelId: 'jeux',
      kinds: ['GAME'],
      stores: ['gog'],
      announceSince: new Date(),
    });
    source.offers = [...source.offers, offer('gog', { stores: ['pc', 'gog'] }), offer('epic')];
    await repo.syncOffers('gamerpower', source.offers);
    const before = discord.sent.length;
    await announceNewOffers(discord.client);
    const toB = discord.sent
      .slice(before)
      .filter((message) => message.guildId === B)
      .map(embedTitle);
    expect(toB).toEqual(['Jeu gog gratuit sur GOG !']);
    expect(discord.sent.slice(before).filter((message) => message.guildId === A)).toHaveLength(2);
  });

  it('respecte la pause et n’annonce jamais une offre expirée', async () => {
    await repo.saveGamingConfig(A, { paused: true });
    source.offers = [
      ...source.offers,
      offer('pause'),
      offer('expiree', { endsAt: new Date(Date.now() - 60_000) }),
    ];
    await repo.syncOffers('gamerpower', source.offers);
    const before = discord.sent.length;
    await announceNewOffers(discord.client);
    expect(discord.sent.slice(before).filter((message) => message.guildId === A)).toHaveLength(0);
    await repo.saveGamingConfig(A, { paused: false, announceSince: new Date() });
    expect((await repo.listAvailableOffers()).some((o) => o.externalId === 'expiree')).toBe(false);
  });

  it('annonce de nouveau une offre revenue longtemps après sa disparition', async () => {
    source.offers = source.offers.filter((o) => o.externalId !== 'n0');
    await repo.syncOffers('gamerpower', source.offers);
    await prisma.gamingOffer.updateMany({
      where: { active: false },
      data: { lastSeenAt: new Date(Date.now() - 100 * 86_400_000) },
    });
    expect(await repo.pruneOffers(new Date(Date.now() - 90 * 86_400_000))).toBe(1);
    await repo.saveGamingConfig(A, { announceSince: new Date(Date.now() - 1000) });
    source.offers = [...source.offers, offer('n0')];
    await repo.syncOffers('gamerpower', source.offers);
    const before = discord.sent.length;
    await announceNewOffers(discord.client);
    expect(discord.sent.slice(before).map(embedTitle)).toContain(
      "Jeu n0 gratuit sur l'Epic Games Store !",
    );
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "GamingOffer" SET "worthCents" = -1`),
    ).rejects.toThrow();
  });
});
