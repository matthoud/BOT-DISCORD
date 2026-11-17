import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
  type MessageCreateOptions,
} from 'discord.js';
import type { RssFeed } from '@prisma/client';
import { truncate } from '../../../utils/format';
import type { CategoryDisplay } from './categories';
import type { FeedItem } from './parser';

export const MODULE_ID = 'rss';
const PRIORITY_COLOR = 0xf1c40f;
const MAX_BUTTON_URL = 512;

/** Longueur du résumé selon la mise en page (0 = pas de résumé). */
const SUMMARY_LENGTH = { STANDARD: 350, COMPACT: 180, LARGE: 600, MINIMAL: 0 } as const;

export type FeedDisplay = Pick<
  RssFeed,
  | 'name'
  | 'siteUrl'
  | 'iconUrl'
  | 'showSummary'
  | 'showImage'
  | 'mentionRoleId'
  | 'priorityKeywords'
>;

/** Texte de flux prêt pour Discord : mise en forme neutralisée, longueur bornée. */
export function safeText(text: string, maxLength: number): string {
  const escaped = escapeMarkdown(text)
    // Liens masqués [texte](adresse) : un flux ne doit pas pouvoir déguiser une adresse.
    .replace(/[[\]]/g, '\\$&')
    // Mentions, salons, emojis et horodatages Discord affichés tels quels.
    .replace(/<(?=[@#:]|a:|t:)/g, '\\<');
  return truncate(escaped, maxLength);
}

function sameText(a: string, b: string): boolean {
  return a.replace(/\W+/g, '').toLowerCase() === b.replace(/\W+/g, '').toLowerCase();
}

/** Le rôle est mentionné pour chaque article, ou seulement pour les prioritaires s'il existe des mots-clés prioritaires. */
export function shouldMention(feed: FeedDisplay, priority: boolean): boolean {
  return feed.mentionRoleId !== null && (feed.priorityKeywords.length === 0 || priority);
}

export function buildArticleEmbed(
  feed: FeedDisplay,
  category: CategoryDisplay,
  item: FeedItem,
  priority = false,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(priority ? PRIORITY_COLOR : category.color)
    .setAuthor({
      name: truncate(
        `${category.emoji.startsWith('<') ? '' : `${category.emoji} `}${feed.name}`,
        256,
      ),
      url: feed.siteUrl ?? undefined,
      iconURL: feed.iconUrl ?? undefined,
    })
    .setTitle(safeText(`${priority ? '⭐ ' : ''}${item.title || 'Sans titre'}`, 256));
  if (item.link) embed.setURL(item.link);

  const summaryLength = feed.showSummary ? SUMMARY_LENGTH[category.style] : 0;
  if (summaryLength > 0 && item.summary && !sameText(item.summary, item.title)) {
    embed.setDescription(safeText(item.summary, summaryLength));
  }

  if (feed.showImage && item.imageUrl && category.style !== 'MINIMAL') {
    if (category.style === 'COMPACT') embed.setThumbnail(item.imageUrl);
    else embed.setImage(item.imageUrl);
  }

  const footer = [category.name, item.authors[0] ? `par ${item.authors[0]}` : null]
    .filter(Boolean)
    .join(' • ');
  embed.setFooter({ text: truncate(footer, 2048) });
  // Aucune date n'est inventée : sans date de publication, l'embed n'en affiche pas.
  if (item.publishedAt) embed.setTimestamp(item.publishedAt);
  return embed;
}

export function buildArticleMessage(
  feed: FeedDisplay,
  category: CategoryDisplay,
  item: FeedItem,
  priority = false,
): MessageCreateOptions {
  const components =
    item.link && item.link.length <= MAX_BUTTON_URL
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Lire l'article")
              .setEmoji('🔗')
              .setURL(item.link),
          ),
        ]
      : [];
  const mention = shouldMention(feed, priority) ? feed.mentionRoleId : null;
  return {
    content: mention ? `<@&${mention}>` : undefined,
    embeds: [buildArticleEmbed(feed, category, item, priority)],
    components,
    // Seul le rôle choisi par les administrateurs peut être mentionné ; jamais le contenu du flux.
    allowedMentions: { parse: [], roles: mention ? [mention] : [] },
  };
}

/** Intervalles proposés à l'ajout d'un flux, en minutes. */
export const INTERVAL_CHOICES = [
  { name: '10 minutes', value: 10 },
  { name: '15 minutes', value: 15 },
  { name: '30 minutes', value: 30 },
  { name: '1 heure', value: 60 },
  { name: '2 heures', value: 120 },
  { name: '6 heures', value: 360 },
  { name: '12 heures', value: 720 },
  { name: '24 heures', value: 1440 },
] as const;

export const RSS_LIMITS = {
  feedsPerGuild: 25,
  customCategories: 15,
  minIntervalMinutes: 10,
  defaultIntervalMinutes: 30,
  nameLength: 80,
  categoryNameLength: 32,
} as const;

export function formatInterval(minutes: number): string {
  if (minutes % 60 === 0) return minutes === 60 ? '1 heure' : `${minutes / 60} heures`;
  return `${minutes} minutes`;
}
