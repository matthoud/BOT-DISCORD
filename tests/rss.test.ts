import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import { HttpClient } from '../src/core/http/client';
import {
  BUILTIN_CATEGORIES,
  categoryOf,
  parseCategoryChoice,
  parseColor,
  parseEmoji,
} from '../src/modules/rss/services/categories';
import {
  MAX_POSTS_PER_CHECK,
  nextCheckDelayMs,
  selectNewItems,
} from '../src/modules/rss/services/feed.service';
import {
  decodeBody,
  FeedFetchError,
  fetchFeed,
  parseRetryAfter,
} from '../src/modules/rss/services/fetcher';
import { evaluateItem, parseList, type FeedFilters } from '../src/modules/rss/services/filters';
import { decodeEntities, discoverFeedLinks, htmlToText } from '../src/modules/rss/services/html';
import {
  FeedParseError,
  newestItem,
  parseFeed,
  parseFeedDate,
  type FeedItem,
} from '../src/modules/rss/services/parser';
import { buildArticleMessage, type FeedDisplay } from '../src/modules/rss/services/presenter';

const SOURCE = 'https://exemple.fr/flux.xml';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Le Site &amp; Co</title>
    <link>https://exemple.fr/</link>
    <image><url>/logo.png</url></image>
    <item>
      <title><![CDATA[Minecraft 1.22 : <b>les nouveautés</b>]]></title>
      <link>https://exemple.fr/articles/minecraft?utm_source=rss#haut</link>
      <guid isPermaLink="false">article-42</guid>
      <description>&lt;p&gt;Une mise à jour &lt;strong&gt;énorme&lt;/strong&gt;&amp;nbsp;!&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</description>
      <pubDate>Tue, 10 Nov 2026 08:00:00 GMT</pubDate>
      <dc:creator>Alice</dc:creator>
      <category>Jeux vidéo</category>
      <media:content url="/images/mc.jpg" medium="image"/>
    </item>
    <item>
      <title>Sans lien ni GUID mais daté</title>
      <description>Texte simple</description>
      <pubDate>date illisible</pubDate>
    </item>
    <item>
      <guid>https://exemple.fr/permalien</guid>
      <title>Lien donné par le GUID</title>
      <link>javascript:alert(1)</link>
      <content:encoded><![CDATA[<p>Contenu <img src="https://cdn.exemple.fr/a.png"> complet</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">Blog &lt;i&gt;dev&lt;/i&gt;</title>
  <link rel="self" href="https://blog.exemple.org/atom.xml"/>
  <link rel="alternate" href="https://blog.exemple.org/"/>
  <icon>https://blog.exemple.org/favicon.ico</icon>
  <entry>
    <id>tag:blog.exemple.org,2026:1</id>
    <title>Rust 2.0</title>
    <link rel="alternate" href="/posts/rust"/>
    <link rel="enclosure" type="image/png" href="https://blog.exemple.org/rust.png"/>
    <published>2026-11-09T10:00:00Z</published>
    <updated>2026-11-10T10:00:00Z</updated>
    <author><name>Bob</name></author>
    <category term="Programmation"/>
    <summary>Résumé de l’article</summary>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="https://rdf.exemple.net/"><title>Ancien format</title><link>https://rdf.exemple.net/</link></channel>
  <item rdf:about="https://rdf.exemple.net/1"><title>Premier</title><link>https://rdf.exemple.net/1</link></item>
</rdf:RDF>`;

describe('analyse des flux', () => {
  it('lit un flux RSS 2.0 et nettoie son contenu', () => {
    const feed = parseFeed(RSS, SOURCE);
    expect(feed.format).toBe('RSS');
    expect(feed.title).toBe('Le Site & Co');
    expect(feed.siteUrl).toBe('https://exemple.fr/');
    expect(feed.iconUrl).toBe('https://exemple.fr/logo.png');
    expect(feed.items).toHaveLength(3);

    const [first, second, third] = feed.items as [FeedItem, FeedItem, FeedItem];
    expect(first.title).toBe('Minecraft 1.22 : les nouveautés');
    expect(first.summary).toBe('Une mise à jour énorme !');
    expect(first.summary).not.toContain('alert');
    expect(first.imageUrl).toBe('https://exemple.fr/images/mc.jpg');
    expect(first.publishedAt?.toISOString()).toBe('2026-11-10T08:00:00.000Z');
    expect(first.authors).toEqual(['Alice']);
    expect(first.categories).toEqual(['Jeux vidéo']);

    // Date illisible : aucune date n'est inventée.
    expect(second.publishedAt).toBeNull();
    expect(second.link).toBeNull();
    expect(second.keys).toHaveLength(1);

    // Lien « javascript: » refusé ; le GUID permalien le remplace. Image trouvée dans le contenu.
    expect(third.link).toBe('https://exemple.fr/permalien');
    expect(third.imageUrl).toBe('https://cdn.exemple.fr/a.png');
  });

  it('lit un flux Atom et un flux RDF', () => {
    const atom = parseFeed(ATOM, 'https://blog.exemple.org/atom.xml');
    expect(atom.format).toBe('Atom');
    expect(atom.title).toBe('Blog dev');
    expect(atom.siteUrl).toBe('https://blog.exemple.org/');
    const [entry] = atom.items as [FeedItem];
    expect(entry.link).toBe('https://blog.exemple.org/posts/rust');
    expect(entry.imageUrl).toBe('https://blog.exemple.org/rust.png');
    expect(entry.publishedAt?.toISOString()).toBe('2026-11-09T10:00:00.000Z');
    expect(entry.authors).toEqual(['Bob']);
    expect(entry.categories).toEqual(['Programmation']);
    expect(entry.summary).toBe('Résumé de l’article');

    const rdf = parseFeed(RDF, 'https://rdf.exemple.net/rss');
    expect(rdf.format).toBe('RDF');
    expect(rdf.items.map((item) => item.link)).toEqual(['https://rdf.exemple.net/1']);
  });

  it('reconnaît un article malgré des paramètres de suivi ou un changement de GUID', () => {
    const variant = RSS.replace('utm_source=rss#haut', 'utm_campaign=autre').replace(
      'article-42',
      'nouveau-guid',
    );
    const before = parseFeed(RSS, SOURCE).items[0]!;
    const after = parseFeed(variant, SOURCE).items[0]!;
    expect(after.keys[0]).not.toBe(before.keys[0]);
    expect(after.keys[1]).toBe(before.keys[1]);
  });

  it('refuse les entités externes et borne les expansions', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><title>&x;</title></channel></rss>`;
    expect(() => parseFeed(xxe, SOURCE)).toThrow(FeedParseError);
    const bomb = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "${'x'.repeat(1900)}">]><rss><channel><title>${'&a;'.repeat(200)}</title></channel></rss>`;
    expect(() => parseFeed(bomb, SOURCE)).toThrow(FeedParseError);
    // Entités imbriquées : jamais développées.
    const nested = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><rss><channel><title>&b;</title></channel></rss>`;
    expect(parseFeed(nested, SOURCE).title.length).toBeLessThan(20);
    const repeated = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "x">]><rss><channel><title>${'&a;'.repeat(3000)}</title></channel></rss>`;
    expect(() => parseFeed(repeated, SOURCE)).toThrow(FeedParseError);
  });

  it('accepte les milliers d’entités standard d’un flux contenant du HTML', () => {
    const html = '&lt;p&gt;Texte &amp;amp; suite&lt;/p&gt;'.repeat(2000);
    const xml = `<rss><channel><title>T</title><item><title>A</title><guid>1</guid><description>${html}</description></item></channel></rss>`;
    expect(parseFeed(xml, SOURCE).items[0]?.summary).toMatch(/^Texte & suite/);
  });

  it('signale un contenu qui n’est pas un flux', () => {
    expect(() => parseFeed('<html><body>Bonjour</body></html>', SOURCE)).toThrow(/pas de flux/);
    expect(() => parseFeed('pas du XML', SOURCE)).toThrow(FeedParseError);
  });

  it('ignore les dates invraisemblables', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(parseFeedDate('2026-11-10T08:00:00+01:00', now)?.toISOString()).toBe(
      '2026-11-10T07:00:00.000Z',
    );
    expect(parseFeedDate('2031-01-01T00:00:00Z', now)).toBeNull();
    expect(parseFeedDate('1970-01-01T00:00:00Z', now)).toBeNull();
    expect(parseFeedDate('', now)).toBeNull();
  });

  it('choisit l’article le plus récent', () => {
    const items = parseFeed(RSS, SOURCE).items;
    expect(newestItem(items)?.title).toContain('Minecraft');
    expect(newestItem([])).toBeNull();
  });
});

describe('nettoyage du HTML', () => {
  it('ne garde que du texte', () => {
    expect(htmlToText('<p>Un</p><p>Deux<br>Trois</p><ul><li>a</li><li>b</li></ul>')).toBe(
      'Un\nDeux\nTrois\n\n• a\n• b',
    );
    expect(htmlToText('<style>p{}</style><script>x()</script>Visible')).toBe('Visible');
    expect(htmlToText('J’aime <3 les &eacute;t&#233;s &#x1F600;')).toBe('J’aime <3 les étés 😀');
    expect(htmlToText(`a${String.fromCharCode(0x200b)}b${String.fromCharCode(0x202e)}c`)).toBe(
      'abc',
    );
  });

  it('décode les entités une seule fois', () => {
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(decodeEntities('&#0;&#xD800;&inconnue;')).toBe('&inconnue;');
  });

  it('trouve un flux annoncé par une page web', () => {
    const page = `<head><link rel="stylesheet" href="/a.css"><link type="application/rss+xml" rel="alternate" href="/feed?x=1&amp;y=2"></head>`;
    expect(discoverFeedLinks(page)).toEqual(['/feed?x=1&y=2']);
  });
});

describe('téléchargement', () => {
  it('décode l’encodage annoncé', () => {
    const latin1 = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><t>été</t>', 'latin1');
    expect(decodeBody(latin1, null)).toContain('été');
    expect(
      decodeBody(Buffer.from('<t>été</t>', 'latin1'), 'text/xml; charset=windows-1252'),
    ).toContain('été');
    expect(
      decodeBody(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<t>é</t>')]), null),
    ).toBe('<t>é</t>');
    expect(decodeBody(Buffer.from('<t>é</t>'), 'text/xml; charset=inconnu')).toBe('<t>é</t>');
  });

  it('lit le délai Retry-After', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(parseRetryAfter('120', now)).toBe(120);
    expect(parseRetryAfter('Wed, 11 Nov 2026 12:10:00 GMT', now)).toBe(600);
    expect(parseRetryAfter('999999', now)).toBe(86_400);
    expect(parseRetryAfter('n/a', now)).toBeNull();
  });

  describe('avec un serveur local', () => {
    let server: http.Server;
    let base = '';
    const client = new HttpClient({ isAddressAllowed: () => true, hostIntervalMs: 0 });

    beforeAll(async () => {
      server = http.createServer((request, response) => {
        if (request.url === '/flux.xml') {
          if (request.headers['if-none-match'] === '"v1"') {
            response.writeHead(304).end();
            return;
          }
          response.writeHead(200, { 'content-type': 'application/rss+xml', etag: '"v1"' }).end(RSS);
          return;
        }
        if (request.url === '/page') {
          response
            .writeHead(200, { 'content-type': 'text/html' })
            .end(
              '<html><head><link rel="alternate" type="application/atom+xml" href="/atom"></head></html>',
            );
          return;
        }
        if (request.url === '/atom') {
          response.writeHead(200, { 'content-type': 'application/atom+xml' }).end(ATOM);
          return;
        }
        if (request.url === '/vide') {
          response
            .writeHead(200, { 'content-type': 'text/html' })
            .end('<html><body>rien</body></html>');
          return;
        }
        if (request.url === '/supprime') {
          response.writeHead(410).end();
          return;
        }
        if (request.url === '/limite') {
          response.writeHead(429, { 'retry-after': '900' }).end();
          return;
        }
        response.writeHead(404).end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it('utilise les validateurs HTTP', async () => {
      const first = await fetchFeed(`${base}/flux.xml`, { client });
      expect(first.status).toBe('ok');
      if (first.status !== 'ok') return;
      expect(first.validators.etag).toBe('"v1"');
      expect(first.feed.items).toHaveLength(3);
      const second = await fetchFeed(`${base}/flux.xml`, { client, validators: first.validators });
      expect(second.status).toBe('not-modified');
    });

    it('suit le flux annoncé par une page, seulement à la demande', async () => {
      const discovered = await fetchFeed(`${base}/page`, { client, discover: true });
      expect(discovered.status === 'ok' && discovered.url).toBe(`${base}/atom`);
      await expect(fetchFeed(`${base}/page`, { client })).rejects.toThrow(/page web/);
      await expect(fetchFeed(`${base}/vide`, { client, discover: true })).rejects.toThrow(
        /n'en annonce aucun/,
      );
    });

    it('traduit les erreurs du site', async () => {
      await expect(fetchFeed(`${base}/supprime`, { client })).rejects.toMatchObject({ gone: true });
      await expect(fetchFeed(`${base}/limite`, { client })).rejects.toMatchObject({
        retryAfterSeconds: 900,
      });
      await expect(fetchFeed(`${base}/absent`, { client })).rejects.toThrow(FeedFetchError);
    });

    it('refuse les adresses internes avec le client par défaut', async () => {
      await expect(fetchFeed(`${base}/flux.xml`)).rejects.toThrow(/réseau interne/);
    });
  });
});

const NO_FILTERS: FeedFilters = {
  includeKeywords: [],
  excludeKeywords: [],
  priorityKeywords: [],
  ignoredAuthors: [],
  categoryFilter: [],
};

const item = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  keys: ['g:1'],
  title: 'Nouvelle mise à jour de Minecraft',
  link: 'https://exemple.fr/a',
  summary: 'Les créatures arrivent.',
  imageUrl: 'https://exemple.fr/a.png',
  publishedAt: new Date(),
  authors: ['Alice'],
  categories: ['Jeux'],
  ...overrides,
});

describe('filtres', () => {
  it('compare des mots entiers, sans tenir compte de la casse ni des accents', () => {
    const rust = item({ title: 'Le jeu Rust reçoit une mise à jour' });
    const trust = item({ title: 'Trust and safety' });
    const filters = { ...NO_FILTERS, includeKeywords: ['rust', 'League of Legends'] };
    expect(evaluateItem(rust, filters).publish).toBe(true);
    expect(evaluateItem(trust, filters)).toMatchObject({
      publish: false,
      reason: 'aucun mot-clé demandé',
    });
    expect(evaluateItem(item({ title: 'Patch de LEAGUE OF LEGENDS' }), filters).publish).toBe(true);
    expect(
      evaluateItem(item({ title: 'Événement spécial' }), {
        ...NO_FILTERS,
        includeKeywords: ['evenement'],
      }).publish,
    ).toBe(true);
  });

  it('applique exclusions, auteurs, catégories et priorités', () => {
    expect(evaluateItem(item(), { ...NO_FILTERS, excludeKeywords: ['créatures'] })).toMatchObject({
      publish: false,
    });
    expect(
      evaluateItem(item({ link: 'https://exemple.fr/sponsorise/1' }), {
        ...NO_FILTERS,
        excludeKeywords: ['sponsorise'],
      }).publish,
    ).toBe(false);
    expect(evaluateItem(item(), { ...NO_FILTERS, ignoredAuthors: ['alice'] }).reason).toContain(
      'auteur',
    );
    expect(evaluateItem(item(), { ...NO_FILTERS, categoryFilter: ['jeux'] }).publish).toBe(true);
    expect(evaluateItem(item(), { ...NO_FILTERS, categoryFilter: ['Tech'] }).publish).toBe(false);
    // Un mot prioritaire vaut inclusion et met l'article en avant ; une exclusion reste plus forte.
    const priority = { ...NO_FILTERS, includeKeywords: ['ark'], priorityKeywords: ['minecraft'] };
    expect(evaluateItem(item(), priority)).toEqual({ publish: true, priority: true });
    expect(evaluateItem(item(), { ...priority, excludeKeywords: ['minecraft'] }).publish).toBe(
      false,
    );
  });

  it('lit les listes saisies', () => {
    expect(parseList(' Minecraft, rust ,, ARK, minecraft ')).toEqual({
      values: ['Minecraft', 'rust', 'ARK'],
    });
    expect(parseList('aucun')).toEqual({ values: [] });
    expect(parseList(Array.from({ length: 21 }, (_, i) => `m${i}`).join(','))).toHaveProperty(
      'error',
    );
    expect(parseList('x'.repeat(51))).toHaveProperty('error');
  });
});

describe('sélection des nouveaux articles', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);

  it('écarte les articles trop anciens et limite le nombre de publications', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ title: `A${i}`, publishedAt: at(i + 1) }),
    );
    items.push(item({ title: 'Vieux', publishedAt: at(24 * 8) }));
    const selected = selectNewItems(items, NO_FILTERS, now);
    expect(selected).toHaveLength(MAX_POSTS_PER_CHECK);
    // Les plus récents, publiés dans l'ordre chronologique.
    expect(selected.map(({ item: entry }) => entry.title)).toEqual(['A4', 'A3', 'A2', 'A1', 'A0']);
  });

  it('suit l’ordre du document quand des dates manquent', () => {
    const items = [
      item({ title: 'Premier', publishedAt: null }),
      item({ title: 'Second', publishedAt: at(1) }),
    ];
    expect(selectNewItems(items, NO_FILTERS, now).map(({ item: entry }) => entry.title)).toEqual([
      'Second',
      'Premier',
    ]);
  });

  it('respecte les filtres', () => {
    const items = [item({ title: 'Rust' }), item({ title: 'Autre chose' })];
    const selected = selectNewItems(
      items,
      { ...NO_FILTERS, priorityKeywords: ['rust'], includeKeywords: ['zzz'] },
      Date.now(),
    );
    expect(selected).toEqual([{ item: items[0], priority: true }]);
  });
});

describe('planification', () => {
  it('ralentit après des échecs, dans la limite de 24 heures', () => {
    expect(nextCheckDelayMs(30, 0)).toBe(30 * 60_000);
    expect(nextCheckDelayMs(30, 1)).toBe(30 * 60_000);
    expect(nextCheckDelayMs(30, 3)).toBe(120 * 60_000);
    expect(nextCheckDelayMs(30, 50)).toBe(24 * 3_600_000);
    expect(nextCheckDelayMs(10, 1, 3600)).toBe(3_600_000);
  });
});

describe('catégories', () => {
  it('lit les choix, couleurs et emojis', () => {
    expect(parseCategoryChoice('b:gaming')).toEqual({ kind: 'builtin', key: 'gaming' });
    expect(parseCategoryChoice('c:12')).toEqual({ kind: 'custom', id: 12 });
    expect(parseCategoryChoice('b:inconnue')).toBeNull();
    expect(parseCategoryChoice('b:constructor')).toBeNull();
    expect(parseColor('#FF8800')).toBe(0xff8800);
    expect(parseColor('ff88')).toBeNull();
    expect(parseEmoji('🎲')).toBe('🎲');
    expect(parseEmoji('👍🏽')).toBe('👍🏽');
    expect(parseEmoji('🇫🇷')).toBe('🇫🇷');
    expect(parseEmoji('<:pepe:123456789012345678>')).toBe('<:pepe:123456789012345678>');
    expect(parseEmoji('abc')).toBeNull();
    expect(parseEmoji('12')).toBeNull();
    expect(parseEmoji('🎲 texte')).toBeNull();
  });

  it('retombe sur la catégorie du bot', () => {
    expect(categoryOf({ category: 'gaming', customCategory: null })).toEqual(
      BUILTIN_CATEGORIES.gaming,
    );
    expect(categoryOf({ category: 'supprimee', customCategory: null })).toEqual(
      BUILTIN_CATEGORIES.other,
    );
  });
});

describe('publication', () => {
  const feed: FeedDisplay = {
    name: 'Le Site',
    siteUrl: 'https://exemple.fr/',
    iconUrl: null,
    showSummary: true,
    showImage: true,
    mentionRoleId: null,
    priorityKeywords: [],
  };

  it('présente l’article selon la catégorie, sans mise en forme injectée', () => {
    const message = buildArticleMessage(
      feed,
      BUILTIN_CATEGORIES.news,
      item({ title: '**Gras** @everyone', summary: '[Clique](https://piege.example) <@&1>' }),
    );
    const embed = message.embeds?.[0];
    const json = embed && 'toJSON' in embed ? embed.toJSON() : {};
    expect(json.title).toBe('\\*\\*Gras\\*\\* @everyone');
    expect(json.description).toContain('\\[Clique\\]');
    expect(json.image?.url).toBe('https://exemple.fr/a.png');
    expect(json.footer?.text).toBe('Actualités • par Alice');
    expect(message.allowedMentions).toEqual({ parse: [], roles: [] });
    expect(message.content).toBeUndefined();
    const row = message.components?.[0];
    const rowJson =
      row && 'toJSON' in row
        ? (row.toJSON() as { components?: { url?: string; label?: string }[] })
        : {};
    expect(rowJson.components?.[0]).toMatchObject({
      url: 'https://exemple.fr/a',
      label: "Lire l'article",
    });
  });

  it('n’invente pas de date et adapte la mise en page', () => {
    const compact = buildArticleMessage(feed, BUILTIN_CATEGORIES.tech, item({ publishedAt: null }))
      .embeds?.[0];
    const json = compact && 'toJSON' in compact ? compact.toJSON() : {};
    expect(json.timestamp).toBeUndefined();
    expect(json.thumbnail?.url).toBe('https://exemple.fr/a.png');
    expect(json.image).toBeUndefined();

    const minimal = buildArticleMessage(
      feed,
      { ...BUILTIN_CATEGORIES.news, style: 'MINIMAL' },
      item(),
    ).embeds?.[0];
    const minimalJson = minimal && 'toJSON' in minimal ? minimal.toJSON() : {};
    expect(minimalJson.description).toBeUndefined();
    expect(minimalJson.image).toBeUndefined();
  });

  it('mentionne le rôle choisi, ou seulement pour les articles prioritaires', () => {
    const withRole = { ...feed, mentionRoleId: '42' };
    expect(buildArticleMessage(withRole, BUILTIN_CATEGORIES.news, item())).toMatchObject({
      content: '<@&42>',
      allowedMentions: { parse: [], roles: ['42'] },
    });
    const priorityOnly = { ...withRole, priorityKeywords: ['minecraft'] };
    expect(
      buildArticleMessage(priorityOnly, BUILTIN_CATEGORIES.news, item(), false).content,
    ).toBeUndefined();
    expect(buildArticleMessage(priorityOnly, BUILTIN_CATEGORIES.news, item(), true).content).toBe(
      '<@&42>',
    );
  });
});
