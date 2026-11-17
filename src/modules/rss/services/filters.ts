import type { RssFeed } from '@prisma/client';
import type { FeedItem } from './parser';

export const FILTER_LIMITS = { entries: 20, length: 50 } as const;

export type FeedFilters = Pick<
  RssFeed,
  'includeKeywords' | 'excludeKeywords' | 'priorityKeywords' | 'ignoredAuthors' | 'categoryFilter'
>;

export interface FilterDecision {
  publish: boolean;
  priority: boolean;
  /** Raison d'un refus, pour `/rss test`. */
  reason?: string;
}

/** Texte comparable : minuscules, sans accents, espaces normalisés. */
export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Le mot-clé apparaît comme mot (ou groupe de mots) entier : « rust » ne correspond pas à « trust ». */
function containsKeyword(haystack: string, keyword: string): boolean {
  const needle = normalize(keyword);
  if (!needle) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(needle)}(?:$|[^\\p{L}\\p{N}])`, 'u').test(
    haystack,
  );
}

const findKeyword = (haystack: string, keywords: string[]): string | undefined =>
  keywords.find((keyword) => containsKeyword(haystack, keyword));

/**
 * Décide si un article est publié. Ordre : auteurs ignorés, mots exclus, catégories exigées,
 * puis mots-clés à inclure (un mot-clé prioritaire vaut inclusion).
 */
export function evaluateItem(item: FeedItem, filters: FeedFilters): FilterDecision {
  const text = normalize([item.title, item.summary, item.categories.join(' ')].join('\n'));

  const authors = item.authors.map(normalize);
  const ignored = filters.ignoredAuthors.find((author) => authors.includes(normalize(author)));
  if (ignored) return { publish: false, priority: false, reason: `auteur ignoré (${ignored})` };

  const excluded = findKeyword(`${text}\n${normalize(item.link ?? '')}`, filters.excludeKeywords);
  if (excluded) return { publish: false, priority: false, reason: `mot exclu (${excluded})` };

  if (filters.categoryFilter.length > 0) {
    const categories = normalize(item.categories.join('\n'));
    if (!findKeyword(categories, filters.categoryFilter)) {
      return { publish: false, priority: false, reason: 'aucune des catégories demandées' };
    }
  }

  const priority = findKeyword(text, filters.priorityKeywords) !== undefined;
  if (
    filters.includeKeywords.length > 0 &&
    !priority &&
    !findKeyword(text, filters.includeKeywords)
  ) {
    return { publish: false, priority: false, reason: 'aucun mot-clé demandé' };
  }
  return { publish: true, priority };
}

/**
 * Lit une liste saisie dans une commande : éléments séparés par des virgules.
 * « aucun » vide la liste. Retourne une erreur lisible si la saisie dépasse les limites.
 */
export function parseList(input: string): { values: string[] } | { error: string } {
  const text = input.trim();
  if (/^aucune?$/i.test(text)) return { values: [] };
  // Doublons (casse et accents ignorés) : la première saisie est conservée.
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of text.split(',')) {
    const value = raw.replace(/\s+/g, ' ').trim();
    const key = normalize(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  if (values.length > FILTER_LIMITS.entries)
    return { error: `${FILTER_LIMITS.entries} éléments au maximum par liste.` };
  const tooLong = values.find((value) => value.length > FILTER_LIMITS.length);
  if (tooLong)
    return { error: `« ${tooLong.slice(0, 60)} » dépasse ${FILTER_LIMITS.length} caractères.` };
  return { values };
}

export function hasFilters(filters: FeedFilters): boolean {
  return (
    filters.includeKeywords.length +
      filters.excludeKeywords.length +
      filters.priorityKeywords.length +
      filters.ignoredAuthors.length +
      filters.categoryFilter.length >
    0
  );
}
