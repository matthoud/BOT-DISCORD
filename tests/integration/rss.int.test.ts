import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import * as repo from '../../src/core/database/repositories/rss.repository';
import { HttpClient } from '../../src/core/http/client';
import { claimAndCheck, processDueFeeds } from '../../src/modules/rss/services/feed.service';
import { fetchFeed } from '../../src/modules/rss/services/fetcher';
import { embedTitle, fakeClient, resetDatabase, settle } from './helpers';

const HOUR = 3_600_000;
const now = Date.now();

interface Item {
  guid: string;
  title: string;
  link?: string;
  date?: number;
}

/** Serveur de flux local dont le contenu et la réponse sont modifiables par les tests. */
const site = {
  items: [] as Item[],
  status: 200,
  etag: '"v1"',
  requests: 0,
};
const rss = (items: Item[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Local</title><link>https://local.example/</link>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title><guid isPermaLink="false">${i.guid}</guid><link>https://local.example/${i.link ?? i.guid}</link>${i.date ? `<pubDate>${new Date(i.date).toUTCString()}</pubDate>` : ''}</item>`,
    )
    .join('')}</channel></rss>`;

let server: http.Server;
let url = '';
const httpClient = new HttpClient({ isAddressAllowed: () => true, hostIntervalMs: 0 });

beforeAll(async () => {
  await resetDatabase();
  server = http.createServer((request, response) => {
    site.requests++;
    if (site.status !== 200) return void response.writeHead(site.status).end();
    if (request.headers['if-none-match'] === site.etag) return void response.writeHead(304).end();
    response
      .writeHead(200, { 'content-type': 'application/rss+xml', etag: site.etag })
      .end(rss(site.items));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/flux.xml`;
  moduleRepo.registerModuleDefaults([{ id: 'rss', defaultEnabled: false }]);
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

const input = (guildId: string, channelId: string, feedUrl: string) => ({
  guildId,
  channelId,
  url: feedUrl,
  name: 'Flux',
  siteUrl: null,
  iconUrl: null,
  category: 'other',
  customCategoryId: null,
  intervalMinutes: 30,
  showSummary: true,
  showImage: true,
  mentionRoleId: null,
  creatorId: 'admin',
  etag: null,
  lastModified: null,
});

/** Enregistre un flux comme `/rss add` : les articles présents sont mémorisés sans être publiés. */
async function subscribe(guildId: string) {
  const first = await fetchFeed(url, { client: httpClient });
  if (first.status !== 'ok') throw new Error('flux indisponible');
  return repo.createFeed(
    { ...input(guildId, 'c1', url), etag: first.validators.etag },
    [...new Set(first.feed.items.flatMap((item) => item.keys))],
    25,
  );
}

describe('flux RSS', () => {
  it('limite à 25 flux par serveur, même avec 30 ajouts simultanés', async () => {
    const G = '210000000000000001';
    const adds = await settle(
      Array.from({ length: 30 }, (_, i) =>
        repo.createFeed(input(G, `c${i}`, `${url}?n=${i}`), ['k'], 25),
      ),
    );
    expect(adds.ok).toHaveLength(25);
    expect(adds.errors.every((error) => /plus de 25 flux/.test(error.message))).toBe(true);
    const kept = adds.ok[0]!;
    await expect(repo.createFeed(input(G, kept.channelId, kept.url), [], 26)).rejects.toThrow(
      /déjà publié/,
    );
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "RssFeed" ("guildId","channelId","url","name","creatorId","updatedAt","intervalMinutes") VALUES ('${G}','x','y','z','w',now(),5)`,
      ),
    ).rejects.toThrow();
  });

  it('ne publie jamais deux fois le même article', async () => {
    const G = '210000000000000002';
    await moduleRepo.setModuleEnabled(G, 'rss', true);
    const { client, sent } = fakeClient([G]);
    site.items = [
      { guid: 'a1', title: 'Article 1', date: now - 3 * HOUR },
      { guid: 'a2', title: 'Article 2', date: now - 2 * HOUR },
    ];
    const feed = await subscribe(G);

    // Vérifications simultanées : une seule a lieu.
    site.items = [{ guid: 'a3', title: 'Article 3', date: now - HOUR }, ...site.items];
    site.etag = '"v2"';
    const reports = await Promise.all(
      Array.from({ length: 5 }, () => claimAndCheck(client, feed.id, { httpClient })),
    );
    expect(reports.filter(Boolean)).toHaveLength(1);
    expect(sent.map(embedTitle)).toEqual(['Article 3']);

    // GUID changé mais même lien : pas de republication ; article trop ancien : ignoré.
    site.items = [
      ...site.items.map((i) => ({ ...i, link: i.guid, guid: `nouveau-${i.guid}` })),
      { guid: 'vieux', title: 'Vieux', date: now - 10 * 24 * HOUR },
    ];
    site.etag = '"v3"';
    expect((await claimAndCheck(client, feed.id, { httpClient }))?.posted).toBe(0);

    // Avalanche : 5 publications au plus, dans l'ordre chronologique.
    site.items = [
      ...Array.from({ length: 12 }, (_, i) => ({
        guid: `n${i}`,
        title: `Nouveau ${i}`,
        date: now - (i + 1) * 60_000,
      })),
      ...site.items,
    ];
    site.etag = '"v4"';
    expect((await claimAndCheck(client, feed.id, { httpClient }))?.posted).toBe(5);
    expect(sent.slice(1).map(embedTitle)).toEqual([
      'Nouveau 4',
      'Nouveau 3',
      'Nouveau 2',
      'Nouveau 1',
      'Nouveau 0',
    ]);
    site.etag = '"v5"';
    expect((await claimAndCheck(client, feed.id, { httpClient }))?.newItems).toBe(0);
    expect(sent).toHaveLength(6);
  });

  it('ralentit après une erreur et suspend un flux supprimé', async () => {
    const G = '210000000000000003';
    await moduleRepo.setModuleEnabled(G, 'rss', true);
    const { client } = fakeClient([G]);
    site.status = 200;
    const feed = await subscribe(G);
    site.status = 500;
    await expect(claimAndCheck(client, feed.id, { httpClient })).rejects.toThrow(/code 500/);
    expect((await repo.getFeed(G, feed.id))?.nextCheckAt.getTime()).toBeGreaterThan(
      Date.now() + 29 * 60_000,
    );
    site.status = 410;
    await expect(claimAndCheck(client, feed.id, { httpClient })).rejects.toThrow(/n'existe plus/);
    expect((await repo.getFeed(G, feed.id))?.paused).toBe(true);
    site.status = 200;
    expect(await repo.setFeedPaused(G, feed.id, false)).toBe(true);
  });

  it('ne contacte aucun site si le module est désactivé ou le salon supprimé', async () => {
    const G = '210000000000000004';
    const { client, removeChannel } = fakeClient([G]);
    await moduleRepo.setModuleEnabled(G, 'rss', true);
    const feed = await subscribe(G);
    await moduleRepo.setModuleEnabled(G, 'rss', false);
    await prisma.rssFeed.updateMany({ where: { guildId: { not: G } }, data: { paused: true } });
    await prisma.rssFeed.update({ where: { id: feed.id }, data: { nextCheckAt: new Date(0) } });
    const before = site.requests;
    await processDueFeeds(client, { httpClient });
    expect(site.requests).toBe(before);

    await moduleRepo.setModuleEnabled(G, 'rss', true);
    removeChannel(G, 'c1');
    await expect(claimAndCheck(client, feed.id, { httpClient })).rejects.toThrow(/introuvable/);
    expect(site.requests).toBe(before);
  });

  it('garde les empreintes du dernier téléchargement lors de la purge', async () => {
    const old = new Date(now - 60 * 24 * HOUR);
    await prisma.rssItem.updateMany({ data: { lastSeenAt: old } });
    await prisma.rssFeed.updateMany({ data: { lastFetchedAt: old } });
    expect(await repo.pruneItems(new Date(now - 30 * 24 * HOUR))).toBe(0);
    await prisma.rssFeed.updateMany({ data: { lastFetchedAt: new Date() } });
    expect(await repo.pruneItems(new Date(now - 30 * 24 * HOUR))).toBeGreaterThan(0);
  });

  it('gère les catégories personnalisées sans perdre de flux', async () => {
    const G = '210000000000000002';
    const [feed] = await repo.listFeeds(G);
    const category = await repo.createCategory(
      G,
      { name: 'Serveurs', emoji: '🎲', color: 0xff0000, style: 'COMPACT' },
      15,
    );
    await expect(
      repo.createCategory(G, { name: 'serveurs', emoji: '🎲', color: 1, style: 'STANDARD' }, 15),
    ).rejects.toThrow(/existe déjà/);
    await repo.updateFeed(G, feed!.id, { customCategoryId: category.id });
    expect(await repo.deleteCategory('210000000000000009', category.id)).toBeNull();
    expect(await repo.deleteCategory(G, category.id)).toBe(1);
    expect((await repo.getFeed(G, feed!.id))?.category).toBe('other');
    const many = await settle(
      Array.from({ length: 20 }, (_, i) =>
        repo.createCategory(G, { name: `C${i}`, emoji: '🎲', color: 1, style: 'STANDARD' }, 15),
      ),
    );
    expect(many.ok).toHaveLength(15);
  });
});
