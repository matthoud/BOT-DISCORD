import { createHash } from 'node:crypto';
import { XMLParser, type ProcessEntitiesOptions } from 'fast-xml-parser';
import { firstImageSource, htmlToText, inlineText } from './html';

export type FeedFormat = 'RSS' | 'Atom' | 'RDF';

export interface FeedItem {
  /** Empreintes de l'article (GUID, lien, titre et date) : il est reconnu si l'une d'elles est déjà connue. */
  keys: string[];
  title: string;
  link: string | null;
  summary: string;
  imageUrl: string | null;
  /** Date de publication telle que donnée par la source ; jamais inventée. */
  publishedAt: Date | null;
  authors: string[];
  categories: string[];
}

export interface ParsedFeed {
  format: FeedFormat;
  title: string;
  siteUrl: string | null;
  iconUrl: string | null;
  /** Articles dans l'ordre du document. */
  items: FeedItem[];
}

/** Erreur de contenu : l'adresse répond, mais pas avec un flux exploitable. */
export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedParseError';
  }
}

/** Nombre maximal d'articles lus dans un flux (les plus anciens au-delà sont ignorés). */
export const MAX_ITEMS = 100;
const MAX_TEXT_INPUT = 20_000;
const MAX_URL_LENGTH = 2000;

const ARRAY_TAGS = new Set([
  'item',
  'entry',
  'link',
  'category',
  'enclosure',
  'author',
  'dc:creator',
  'media:content',
  'media:thumbnail',
  'media:group',
]);

/**
 * Entités XML. Les entités externes (SYSTEM) sont refusées par la bibliothèque, qui n'effectue
 * aucun accès réseau ou disque. Les entités déclarées dans le document (DOCTYPE), seules capables
 * d'amplifier un contenu, sont bornées en nombre, en taille et en expansion. Les entités standard
 * (`&amp;`, `&lt;`...) ne sont pas comptées : un flux contenant du HTML en compte des milliers.
 */
const ENTITY_OPTIONS: ProcessEntitiesOptions & { appliesTo: 'external' } = {
  enabled: true,
  maxEntityCount: 50,
  maxEntitySize: 2000,
  maxTotalExpansions: 2000,
  maxExpandedLength: 200_000,
  // Option de la bibliothèque absente de ses types : limites réservées aux entités déclarées.
  appliesTo: 'external',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: ENTITY_OPTIONS,
  maxNestedTags: 100,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** Texte d'un nœud : chaîne directe ou contenu `#text`. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isNode(value)) return textOf(value['#text']);
  if (Array.isArray(value)) return textOf(value[0]);
  return '';
}

const attr = (value: unknown, name: string): string =>
  isNode(value) ? textOf(value[`@_${name}`]) : '';
const limit = (text: string): string => text.slice(0, MAX_TEXT_INPUT);

/** Adresse absolue en http(s), ou `null`. Le bot ne télécharge jamais ces adresses : Discord les affiche. */
export function resolveUrl(raw: string, base: string | null): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const url = base ? new URL(trimmed, base) : new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const result = url.toString();
    return result.length <= MAX_URL_LENGTH ? result : null;
  } catch {
    return null;
  }
}

const EARLIEST_DATE = Date.UTC(1995, 0, 1);
const FUTURE_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;

/** Date d'un article : absente si elle est illisible ou invraisemblable (jamais remplacée par une autre). */
export function parseFeedDate(raw: string, now = Date.now()): Date | null {
  const text = raw.trim();
  if (!text) return null;
  const time = Date.parse(text);
  if (Number.isNaN(time) || time < EARLIEST_DATE || time > now + FUTURE_TOLERANCE_MS) return null;
  return new Date(time);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 40);
}

/** Lien normalisé pour la comparaison : sans fragment ni paramètres de suivi courants. */
function normalizeLink(link: string): string {
  try {
    const url = new URL(link);
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(name)) url.searchParams.delete(name);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return link;
  }
}

/** Empreintes d'un article, de la plus fiable à la moins fiable. */
export function itemKeys(
  guid: string,
  link: string | null,
  title: string,
  publishedAt: Date | null,
): string[] {
  const keys: string[] = [];
  if (guid.trim()) keys.push(`g:${digest(guid.trim())}`);
  if (link) keys.push(`l:${digest(normalizeLink(link))}`);
  if (keys.length === 0 && title)
    keys.push(`t:${digest(`${title}|${publishedAt?.toISOString() ?? ''}`)}`);
  return keys;
}

function mediaImage(node: Node, base: string | null): string | null {
  const groups = asArray(node['media:group']).filter(isNode);
  for (const holder of [node, ...groups]) {
    for (const media of asArray(holder['media:content'])) {
      const type = attr(media, 'type');
      const medium = attr(media, 'medium');
      const url = attr(media, 'url');
      if (
        url &&
        (medium === 'image' ||
          type.startsWith('image/') ||
          (!medium && !type && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)))
      ) {
        const resolved = resolveUrl(url, base);
        if (resolved) return resolved;
      }
    }
    for (const thumbnail of asArray(holder['media:thumbnail'])) {
      const resolved = resolveUrl(attr(thumbnail, 'url'), base);
      if (resolved) return resolved;
    }
  }
  for (const enclosure of asArray(node.enclosure)) {
    if (attr(enclosure, 'type').startsWith('image/')) {
      const resolved = resolveUrl(attr(enclosure, 'url'), base);
      if (resolved) return resolved;
    }
  }
  const itunes = attr(node['itunes:image'], 'href');
  if (itunes) return resolveUrl(itunes, base);
  return null;
}

function categoriesOf(node: Node): string[] {
  const names = asArray(node.category).map((category) =>
    inlineText(limit(attr(category, 'term') || textOf(category))),
  );
  for (const subject of asArray(node['dc:subject'])) names.push(inlineText(limit(textOf(subject))));
  return [...new Set(names.filter(Boolean))].slice(0, 20);
}

function authorsOf(node: Node): string[] {
  const names: string[] = [];
  for (const author of asArray(node.author)) {
    names.push(isNode(author) && author.name !== undefined ? textOf(author.name) : textOf(author));
  }
  for (const creator of asArray(node['dc:creator'])) names.push(textOf(creator));
  return [...new Set(names.map((name) => inlineText(limit(name))).filter(Boolean))].slice(0, 10);
}

function buildItem(
  input: {
    guid: string;
    title: string;
    link: string | null;
    html: string;
    image: string | null;
    date: string;
    authors: string[];
    categories: string[];
  },
  base: string | null,
): FeedItem | null {
  const title = inlineText(limit(input.title));
  const summary = htmlToText(limit(input.html));
  if (!title && !summary && !input.link) return null;
  const publishedAt = parseFeedDate(input.date);
  const keys = itemKeys(input.guid, input.link, title || summary.slice(0, 200), publishedAt);
  if (keys.length === 0) return null;
  const fromHtml = firstImageSource(limit(input.html));
  return {
    keys,
    title,
    link: input.link,
    summary,
    imageUrl: input.image ?? (fromHtml ? resolveUrl(fromHtml, input.link ?? base) : null),
    publishedAt,
    authors: input.authors,
    categories: input.categories,
  };
}

function parseRssItem(node: Node, base: string | null): FeedItem | null {
  // À défaut de <link>, un GUID permalien (le cas par défaut en RSS 2.0) est l'adresse de l'article.
  const guid = textOf(node.guid);
  const permalink =
    attr(node.guid, 'isPermaLink') !== 'false' && /^https?:\/\//i.test(guid.trim()) ? guid : '';
  // Première adresse valide : un lien refusé (« javascript: », par exemple) laisse place à la suivante.
  const link =
    [textOf(node.link), atomLink(node, base) ?? '', permalink]
      .map((candidate) => (candidate ? resolveUrl(candidate, base) : null))
      .find((candidate) => candidate !== null) ?? null;
  const encoded = textOf(node['content:encoded']);
  const description = textOf(node.description);
  return buildItem(
    {
      guid: guid || attr(node, 'rdf:about'),
      title: textOf(node.title),
      link,
      // Le résumé prime ; le contenu complet sert à défaut (et pour trouver une image).
      html: description || encoded,
      image:
        mediaImage(node, link ?? base) ??
        (encoded ? resolveFirstImage(encoded, link ?? base) : null),
      date: textOf(node.pubDate) || textOf(node['dc:date']) || textOf(node['a10:updated']),
      authors: authorsOf(node),
      categories: categoriesOf(node),
    },
    base,
  );
}

function resolveFirstImage(html: string, base: string | null): string | null {
  const source = firstImageSource(limit(html));
  return source ? resolveUrl(source, base) : null;
}

function atomLink(node: Node, base: string | null, rel = 'alternate'): string | null {
  const links = asArray(node.link);
  const match =
    links.find((link) => attr(link, 'rel') === rel) ??
    (rel === 'alternate' ? links.find((link) => !attr(link, 'rel')) : undefined);
  const href = match ? attr(match, 'href') || textOf(match) : '';
  return href ? resolveUrl(href, base) : null;
}

function parseAtomEntry(node: Node, base: string | null): FeedItem | null {
  const link = atomLink(node, base);
  const content = textOf(node.content);
  const summary = textOf(node.summary);
  const enclosure = asArray(node.link).find(
    (entry) => attr(entry, 'rel') === 'enclosure' && attr(entry, 'type').startsWith('image/'),
  );
  return buildItem(
    {
      guid: textOf(node.id),
      title: textOf(node.title),
      link,
      html: summary || content,
      image:
        mediaImage(node, link ?? base) ??
        (enclosure ? resolveUrl(attr(enclosure, 'href'), link ?? base) : null) ??
        (content ? resolveFirstImage(content, link ?? base) : null),
      date:
        textOf(node.published) ||
        textOf(node.updated) ||
        textOf(node.issued) ||
        textOf(node.modified),
      authors: authorsOf(node),
      categories: categoriesOf(node),
    },
    base,
  );
}

function collectItems(nodes: unknown[], parse: (node: Node) => FeedItem | null): FeedItem[] {
  const items: FeedItem[] = [];
  for (const node of nodes.slice(0, MAX_ITEMS)) {
    if (!isNode(node)) continue;
    const item = parse(node);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Analyse un document RSS 2.0, RSS 1.0 (RDF) ou Atom.
 * `sourceUrl` sert à résoudre les adresses relatives.
 */
export function parseFeed(xml: string, sourceUrl: string): ParsedFeed {
  let document: Node;
  try {
    const parsed: unknown = parser.parse(xml);
    document = isNode(parsed) ? parsed : {};
  } catch {
    throw new FeedParseError("Le contenu n'est pas un document XML valide.");
  }

  const rss = document.rss;
  if (isNode(rss) && isNode(rss.channel)) {
    const channel = rss.channel;
    const siteUrl = resolveUrl(
      textOf(channel.link) || atomLink(channel, sourceUrl) || '',
      sourceUrl,
    );
    const base = siteUrl ?? sourceUrl;
    return {
      format: 'RSS',
      title: inlineText(limit(textOf(channel.title))),
      siteUrl,
      iconUrl: isNode(channel.image) ? resolveUrl(textOf(channel.image.url), base) : null,
      items: collectItems(asArray(channel.item), (node) => parseRssItem(node, base)),
    };
  }

  const feed = document.feed;
  if (isNode(feed)) {
    const siteUrl = atomLink(feed, sourceUrl);
    return {
      format: 'Atom',
      title: inlineText(limit(textOf(feed.title))),
      siteUrl,
      iconUrl: resolveUrl(textOf(feed.icon) || textOf(feed.logo), sourceUrl),
      items: collectItems(asArray(feed.entry), (node) =>
        parseAtomEntry(node, siteUrl ?? sourceUrl),
      ),
    };
  }

  const rdf = document['rdf:RDF'];
  if (isNode(rdf) && isNode(rdf.channel)) {
    const channel = rdf.channel;
    const siteUrl = resolveUrl(textOf(channel.link), sourceUrl);
    const base = siteUrl ?? sourceUrl;
    return {
      format: 'RDF',
      title: inlineText(limit(textOf(channel.title))),
      siteUrl,
      iconUrl: isNode(rdf.image) ? resolveUrl(textOf(rdf.image.url), base) : null,
      items: collectItems(asArray(rdf.item), (node) => parseRssItem(node, base)),
    };
  }

  throw new FeedParseError('Cette adresse ne contient pas de flux RSS ou Atom.');
}

/** L'article le plus récent : celui à la date la plus récente, sinon le premier du document. */
export function newestItem(items: FeedItem[]): FeedItem | null {
  let newest: FeedItem | null = null;
  for (const item of items) {
    if (!newest) newest = item;
    else if (item.publishedAt && (!newest.publishedAt || item.publishedAt > newest.publishedAt))
      newest = item;
  }
  return newest;
}
