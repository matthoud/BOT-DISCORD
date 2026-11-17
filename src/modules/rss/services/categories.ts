import type { RssCategory, RssFeed, RssStyle } from '@prisma/client';

export interface CategoryDisplay {
  name: string;
  emoji: string;
  color: number;
  style: RssStyle;
}

/** Catégories fournies par le bot, chacune avec sa présentation. */
export const BUILTIN_CATEGORIES = {
  news: { name: 'Actualités', emoji: '📰', color: 0x3498db, style: 'STANDARD' },
  gaming: { name: 'Gaming', emoji: '🎮', color: 0x9b59b6, style: 'LARGE' },
  tech: { name: 'Tech', emoji: '💻', color: 0x1abc9c, style: 'COMPACT' },
  dev: { name: 'Développement', emoji: '🛠️', color: 0x2ecc71, style: 'STANDARD' },
  minecraft: { name: 'Minecraft', emoji: '⛏️', color: 0x62a83a, style: 'LARGE' },
  other: { name: 'Autre', emoji: '🔗', color: 0x99aab5, style: 'STANDARD' },
} as const satisfies Record<string, CategoryDisplay>;

export type BuiltinCategory = keyof typeof BUILTIN_CATEGORIES;
export const DEFAULT_CATEGORY: BuiltinCategory = 'other';

export const STYLE_LABELS: Record<RssStyle, string> = {
  STANDARD: 'Standard (résumé et grande image)',
  COMPACT: 'Compact (résumé court et vignette)',
  LARGE: 'Grand format (grande image et résumé long)',
  MINIMAL: 'Minimal (titre et lien)',
};

export function isBuiltinCategory(key: string): key is BuiltinCategory {
  return Object.hasOwn(BUILTIN_CATEGORIES, key);
}

/** Présentation d'un flux : sa catégorie personnalisée si elle existe encore, sinon la catégorie du bot. */
export function categoryOf(
  feed: Pick<RssFeed, 'category'> & { customCategory?: RssCategory | null },
): CategoryDisplay {
  if (feed.customCategory) {
    const { name, emoji, color, style } = feed.customCategory;
    return { name, emoji, color, style };
  }
  return isBuiltinCategory(feed.category)
    ? BUILTIN_CATEGORIES[feed.category]
    : BUILTIN_CATEGORIES.other;
}

/** Valeur d'une catégorie dans les options de commande : `b:news` (bot) ou `c:12` (personnalisée). */
export type CategoryChoice =
  { kind: 'builtin'; key: BuiltinCategory } | { kind: 'custom'; id: number };

export function parseCategoryChoice(value: string): CategoryChoice | null {
  const builtin = /^b:([a-z]+)$/.exec(value);
  if (builtin?.[1] && isBuiltinCategory(builtin[1])) return { kind: 'builtin', key: builtin[1] };
  const custom = /^c:(\d{1,9})$/.exec(value);
  if (custom?.[1]) return { kind: 'custom', id: Number(custom[1]) };
  return null;
}

/** Couleur saisie en hexadécimal (`#ff8800` ou `ff8800`). */
export function parseColor(input: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return match?.[1] ? parseInt(match[1], 16) : null;
}

export function formatColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Emoji Unicode ou emoji personnalisé Discord (`<:nom:id>`), sans autre texte. */
export function parseEmoji(input: string): string | null {
  const text = input.trim();
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(text)) return text;
  const emojiOnly = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component})+$/u.test(text);
  if (
    text.length <= 16 &&
    emojiOnly &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text)
  ) {
    return text;
  }
  return null;
}
