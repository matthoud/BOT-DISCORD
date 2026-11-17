import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GamingConfig, GamingOffer } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import { HttpClient } from '../src/core/http/client';
import {
  cleanTitle,
  createGamerPowerProvider,
  normalizeGiveaway,
  parseEndDate,
  parseStores,
  parseWorth,
} from '../src/modules/gaming/providers/gamerpower';
import { rejectReason, toCents } from '../src/modules/gaming/services/filters';
import { channelFor } from '../src/modules/gaming/services/offers.service';
import {
  buildOfferMessage,
  formatWorth,
  offerTitle,
  priceLine,
} from '../src/modules/gaming/services/presenter';
import { parseStoreList, primaryStore } from '../src/modules/gaming/services/stores';

/** Entrée réelle de l'API GamerPower (relevée le 17/11/2026). */
const KNIGHTICA = {
  id: 3850,
  title: 'Knightica (Epic Games) Giveaway',
  worth: '$14.99',
  thumbnail: 'https://www.gamerpower.com/offers/1/6af5f33e49913.jpg',
  image: 'https://www.gamerpower.com/offers/1b/6af5f33e49913.jpg',
  description:
    'Score Knightica for free via Epic Games Store!\r\n\r\n*Please note this game is also available via Epic Games App!',
  instructions:
    '1. Click the button to visit the giveaway page.\r\n2. Login into your Epic Games Store account.\r\n3. Click the button to add the game to your library',
  open_giveaway_url: 'https://www.gamerpower.com/open/knightica-epic-games-giveaway',
  published_date: '2026-11-12 12:11:26',
  type: 'Game',
  platforms: 'PC, Android, iOS, Epic Games Store',
  end_date: '2026-11-19 23:59:00',
  users: 20390,
  status: 'Active',
  gamerpower_url: 'https://www.gamerpower.com/knightica-epic-games-giveaway',
};

const PLAYTEST = {
  ...KNIGHTICA,
  id: 3848,
  title: 'RUNZ Playtest Steam Key Giveaway',
  worth: 'N/A',
  type: 'Early Access',
  platforms: 'PC, Steam',
  end_date: 'N/A',
  instructions:
    '1. Login into your free Alienware account and click the button to unlock your key.',
};

describe('lecture des offres GamerPower', () => {
  it('normalise une offre sans rien inventer', () => {
    const offer = normalizeGiveaway(KNIGHTICA);
    expect(offer).toMatchObject({
      externalId: '3850',
      title: 'Knightica',
      kind: 'GAME',
      stores: ['pc', 'android', 'ios', 'epic'],
      worthCents: 1499,
      currency: 'USD',
      imageUrl: KNIGHTICA.image,
      url: KNIGHTICA.open_giveaway_url,
      keyRequired: false,
    });
    expect(offer?.endsAt?.toISOString()).toBe('2026-11-19T23:59:00.000Z');
    expect(offer?.description).not.toContain('\r');

    const playtest = normalizeGiveaway(PLAYTEST);
    expect(playtest).toMatchObject({
      title: 'RUNZ Playtest',
      kind: 'BETA',
      worthCents: null,
      currency: null,
      endsAt: null,
      keyRequired: true,
    });
  });

  it('écarte les offres inactives ou sans lien sûr', () => {
    expect(normalizeGiveaway({ ...KNIGHTICA, status: 'Expired' })).toBeNull();
    expect(
      normalizeGiveaway({
        ...KNIGHTICA,
        open_giveaway_url: 'javascript:alert(1)',
        gamerpower_url: 'http://x',
      }),
    ).toBeNull();
    expect(
      normalizeGiveaway({ ...KNIGHTICA, image: 'http://non-securise/a.png' })?.imageUrl,
    ).toBeNull();
  });

  it('lit valeurs, dates, plateformes et titres', () => {
    expect(parseWorth('$4.99')).toBe(499);
    expect(parseWorth('$384.00')).toBe(38400);
    expect(parseWorth('$5')).toBe(500);
    expect(parseWorth('$2.5')).toBe(250);
    expect(parseWorth('N/A')).toBeNull();
    expect(parseWorth('4.99 €')).toBeNull();
    expect(parseEndDate('2026-12-31 23:59:59')?.toISOString()).toBe('2026-12-31T23:59:59.000Z');
    expect(parseEndDate('2026-02-31 10:00:00')).toBeNull();
    expect(parseEndDate('N/A')).toBeNull();
    expect(
      parseStores('PC, Playstation 5, Xbox Series X|S, Nintendo Switch, GOG, Itch.io, DRM-Free'),
    ).toEqual(['pc', 'playstation', 'xbox', 'switch', 'gog', 'itch', 'drm-free']);
    expect(cleanTitle('Contractor: The Clean Up Part 2 (Epic Games) Giveaway')).toBe(
      'Contractor: The Clean Up Part 2',
    );
    expect(cleanTitle('Hunting Simulator 3 - Classic American Hunter Pack (Steam) Giveaway')).toBe(
      'Hunting Simulator 3 - Classic American Hunter Pack',
    );
    expect(cleanTitle('Everwind AW-51 Pack Steam Key Giveaway')).toBe('Everwind AW-51 Pack');
    expect(cleanTitle('Giveaway')).toBe('Giveaway');
  });

  describe('avec un serveur local', () => {
    let server: http.Server;
    let reply: { status: number; body: string } = { status: 200, body: '[]' };
    const client = new HttpClient({ isAddressAllowed: () => true, hostIntervalMs: 0 });

    beforeAll(async () => {
      server = http.createServer((_request, response) => {
        response.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.body);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const provider = () => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      // Le fournisseur appelle l'adresse officielle : le client de test la redirige vers le serveur local.
      return createGamerPowerProvider({
        get: (_url: string, options: Parameters<HttpClient['get']>[1]) =>
          client.get(`${base}/api/giveaways`, options),
      } as unknown as HttpClient);
    };

    it('ignore une entrée invalide sans perdre les autres', async () => {
      reply = { status: 200, body: JSON.stringify([KNIGHTICA, { id: 'abc' }, PLAYTEST]) };
      expect((await provider().fetchOffers()).map((offer) => offer.externalId)).toEqual([
        '3850',
        '3848',
      ]);
    });

    it('comprend « aucune offre » et signale les réponses anormales', async () => {
      reply = { status: 201, body: '{"status":0}' };
      expect(await provider().fetchOffers()).toEqual([]);
      reply = { status: 500, body: '' };
      await expect(provider().fetchOffers()).rejects.toThrow(/code 500/);
      reply = { status: 200, body: '<html>' };
      await expect(provider().fetchOffers()).rejects.toThrow(/JSON/);
      reply = { status: 200, body: JSON.stringify([{ nope: true }]) };
      await expect(provider().fetchOffers()).rejects.toThrow(/format/);
    });
  });
});

const offer = (overrides: Partial<GamingOffer> = {}): GamingOffer => ({
  id: 1,
  provider: 'gamerpower',
  externalId: '3850',
  title: 'Knightica',
  description: 'Score Knightica **for free**!',
  kind: 'GAME',
  stores: ['pc', 'epic'],
  worthCents: 1499,
  currency: 'USD',
  endsAt: new Date('2026-11-19T23:59:00Z'),
  imageUrl: 'https://www.gamerpower.com/offers/1b/a.jpg',
  url: 'https://www.gamerpower.com/open/knightica',
  keyRequired: false,
  baseline: false,
  active: true,
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  ...overrides,
});

const config = (overrides: Partial<GamingConfig> = {}): GamingConfig => ({
  guildId: '111',
  channelId: 'jeux',
  extrasChannelId: null,
  kinds: ['GAME'],
  stores: [],
  minWorthCents: 0,
  mentionRoleId: null,
  mentionMinCents: 0,
  paused: false,
  announceSince: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const PROVIDER = { name: 'GamerPower', website: 'https://www.gamerpower.com' };

describe('présentation des annonces', () => {
  it('reprend la mise en page de référence', () => {
    const message = buildOfferMessage(offer(), PROVIDER, null, config());
    const embed = message.embeds?.[0];
    const json = embed && 'toJSON' in embed ? embed.toJSON() : {};
    expect(json.title).toBe("Knightica gratuit sur l'Epic Games Store !");
    expect(json.url).toBe('https://www.gamerpower.com/open/knightica');
    expect(json.description).toContain('> Score Knightica \\*\\*for free\\*\\*!');
    expect(json.description).toContain('~~14,99');
    expect(json.description).toContain("**Gratuit** jusqu'au <t:");
    expect(json.description).toContain('🎁 Jeu à conserver · PC, Epic Games Store');
    // Attribution exigée par la source.
    expect(json.description).toContain('[GamerPower](https://www.gamerpower.com)');
    expect(json.image?.url).toBe('https://www.gamerpower.com/offers/1b/a.jpg');
    expect(message.content).toBeUndefined();
    expect(message.allowedMentions).toEqual({ parse: [], roles: [] });
  });

  it('ne barre aucun prix inconnu et n’invente pas de date', () => {
    expect(priceLine(offer({ worthCents: null, currency: null, endsAt: null }))).toBe(
      '**Gratuit**',
    );
    expect(priceLine(offer({ endsAt: null }))).toMatch(/^~~14,99\s\$US~~ \*\*Gratuit\*\*$/);
    expect(formatWorth(38400, 'USD')).toMatch(/^384,00\s\$US$/);
  });

  it('adapte le titre au type d’offre et signale les clés', () => {
    expect(offerTitle(offer({ kind: 'DLC', stores: ['pc', 'steam'] }))).toBe(
      'Knightica : contenu gratuit sur Steam !',
    );
    expect(offerTitle(offer({ kind: 'BETA', stores: [] }))).toBe(
      'Knightica : accès anticipé gratuit sur PC !',
    );
    const keyed = buildOfferMessage(offer({ keyRequired: true }), PROVIDER, null, config())
      .embeds?.[0];
    expect(keyed && 'toJSON' in keyed ? keyed.toJSON().description : '').toContain(
      '🔑 Clé à récupérer',
    );
    expect(primaryStore(['pc', 'gog'])).toBe('gog');
  });

  it('ne mentionne le rôle que pour un jeu de valeur suffisante', () => {
    const withRole = config({ mentionRoleId: '42', mentionMinCents: 1000 });
    expect(buildOfferMessage(offer(), PROVIDER, null, withRole)).toMatchObject({
      content: '<@&42>',
      allowedMentions: { parse: [], roles: ['42'] },
    });
    expect(
      buildOfferMessage(offer({ worthCents: 499 }), PROVIDER, null, withRole).content,
    ).toBeUndefined();
    expect(
      buildOfferMessage(offer({ worthCents: null }), PROVIDER, null, withRole).content,
    ).toBeUndefined();
    expect(
      buildOfferMessage(offer({ kind: 'DLC' }), PROVIDER, null, config({ mentionRoleId: '42' }))
        .content,
    ).toBeUndefined();
  });
});

describe('filtres et salons', () => {
  it('filtre par type, boutique et valeur', () => {
    expect(rejectReason(offer(), config())).toBeNull();
    expect(rejectReason(offer({ kind: 'DLC' }), config())).toBe('type non retenu');
    expect(rejectReason(offer(), config({ stores: ['steam'] }))).toBe('boutique non retenue');
    expect(rejectReason(offer(), config({ stores: ['steam', 'epic'] }))).toBeNull();
    expect(rejectReason(offer(), config({ minWorthCents: 2000 }))).toMatch(/valeur/);
    // Valeur inconnue : jamais supposée suffisante.
    expect(rejectReason(offer({ worthCents: null }), config({ minWorthCents: 100 }))).toMatch(
      /valeur/,
    );
    expect(toCents(4.99)).toBe(499);
    expect(toCents(-1)).toBeNull();
  });

  it('lit la liste des boutiques', () => {
    expect(parseStoreList('Epic, steam, epic')).toEqual({ values: ['epic', 'steam'] });
    expect(parseStoreList('toutes')).toEqual({ values: [] });
    expect(parseStoreList('epic, uplay')).toHaveProperty('error');
  });

  it('envoie les DLC et bêtas dans le salon secondaire s’il existe', () => {
    expect(channelFor(offer(), config({ extrasChannelId: 'extras' }))).toBe('jeux');
    expect(channelFor(offer({ kind: 'BETA' }), config({ extrasChannelId: 'extras' }))).toBe(
      'extras',
    );
    expect(channelFor(offer({ kind: 'DLC' }), config())).toBe('jeux');
  });
});
