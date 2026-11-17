import {
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import {
  claimFeed,
  findDueFeeds,
  findKnownKeys,
  postponeFeed,
  recordCheckFailure,
  recordCheckSuccess,
  rememberKeys,
  type FeedWithCategory,
} from '../../../core/database/repositories/rss.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { BotError } from '../../../core/errors/BotError';
import type { HttpClient } from '../../../core/http/client';
import { logger } from '../../../core/logger';
import { permissionNames } from '../../../core/permissions/names';
import { categoryOf } from './categories';
import { fetchFeed, FeedFetchError } from './fetcher';
import { evaluateItem } from './filters';
import type { FeedItem } from './parser';
import { buildArticleMessage, MODULE_ID } from './presenter';

export const FEED_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/** Articles publiés au plus par vérification : un flux qui change ses identifiants n'inonde pas le salon. */
export const MAX_POSTS_PER_CHECK = 5;
/** Un article plus ancien n'est plus une nouveauté : il est mémorisé sans être publié. */
export const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Durée de réservation d'un flux pendant sa vérification. */
const LEASE_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
/** Flux vérifiés au plus par passage de la tâche, et en parallèle. */
const BATCH_SIZE = 20;
const CONCURRENCY = 4;

/**
 * Prochaine vérification : l'intervalle du flux après un succès ; après des échecs consécutifs,
 * un délai qui double à chaque fois (plafonné à 24 heures), ou celui demandé par le site s'il est plus long.
 */
export function nextCheckDelayMs(
  intervalMinutes: number,
  failures: number,
  retryAfterSeconds: number | null = null,
): number {
  const interval = intervalMinutes * 60_000;
  if (failures <= 0) return interval;
  const backoff = Math.min(interval * 2 ** Math.min(failures - 1, 10), MAX_BACKOFF_MS);
  return Math.min(Math.max(backoff, (retryAfterSeconds ?? 0) * 1000), MAX_BACKOFF_MS);
}

/** Salon de publication utilisable, ou une raison lisible. */
export async function resolveFeedChannel(
  guild: Guild,
  channelId: string,
): Promise<{ channel: GuildTextBasedChannel } | { error: string }> {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased())
    return { error: 'Le salon de publication est introuvable (supprimé ?).' };
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const missing = channel.permissionsFor(me).missing(FEED_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    const names = permissionNames(missing.map((name) => PermissionFlagsBits[name])).join(', ');
    return { error: `Permissions manquantes dans le salon de publication : ${names}.` };
  }
  return { channel };
}

export async function assertFeedChannel(
  guild: Guild,
  channel: GuildTextBasedChannel,
): Promise<void> {
  const resolved = await resolveFeedChannel(guild, channel.id);
  if ('error' in resolved)
    throw new BotError(`Je ne peux pas publier dans ${channel} : ${resolved.error}`);
}

/** Publie un article dans le salon d'un flux, en appliquant sa présentation. */
export async function publishItem(
  channel: GuildTextBasedChannel,
  feed: FeedWithCategory,
  item: FeedItem,
  priority = false,
): Promise<void> {
  await channel.send(buildArticleMessage(feed, categoryOf(feed), item, priority));
}

/**
 * Choisit les articles à publier parmi les nouveaux : récents, acceptés par les filtres,
 * les plus récents d'abord dans la limite prévue, puis remis dans l'ordre chronologique.
 */
export function selectNewItems(
  items: FeedItem[],
  feed: Parameters<typeof evaluateItem>[1],
  now = Date.now(),
): { item: FeedItem; priority: boolean }[] {
  const accepted: { item: FeedItem; priority: boolean }[] = [];
  for (const item of items) {
    if (item.publishedAt && now - item.publishedAt.getTime() > MAX_ITEM_AGE_MS) continue;
    const decision = evaluateItem(item, feed);
    if (decision.publish) accepted.push({ item, priority: decision.priority });
  }
  // Tri par date si tous les articles en ont une ; sinon l'ordre du document fait foi
  // (par convention, le premier article est le plus récent).
  if (accepted.every(({ item }) => item.publishedAt)) {
    accepted.sort(
      (a, b) => (b.item.publishedAt?.getTime() ?? 0) - (a.item.publishedAt?.getTime() ?? 0),
    );
  }
  return accepted.slice(0, MAX_POSTS_PER_CHECK).reverse();
}

export interface CheckReport {
  posted: number;
  newItems: number;
  notModified: boolean;
}

/**
 * Vérifie un flux réservé (`claimFeed`) et publie ses nouveaux articles.
 * Les empreintes sont enregistrées avant l'envoi : un article n'est jamais publié deux fois,
 * même si le bot s'arrête pendant la publication.
 */
export async function checkFeed(
  client: Client,
  feed: FeedWithCategory,
  options: { signal?: AbortSignal; httpClient?: HttpClient } = {},
): Promise<CheckReport> {
  const failure = async (
    message: string,
    retryAfter: number | null = null,
    pause = false,
  ): Promise<never> => {
    const delay = nextCheckDelayMs(feed.intervalMinutes, feed.consecutiveFailures + 1, retryAfter);
    await recordCheckFailure(feed.id, message, new Date(Date.now() + delay), pause);
    throw new BotError(message);
  };

  const guild = client.guilds.cache.get(feed.guildId);
  if (!guild?.available) return failure('Serveur indisponible.');
  const resolved = await resolveFeedChannel(guild, feed.channelId);
  if ('error' in resolved) return failure(resolved.error);

  let result;
  try {
    result = await fetchFeed(feed.url, {
      validators: { etag: feed.etag, lastModified: feed.lastModified },
      signal: options.signal,
      client: options.httpClient,
    });
  } catch (error) {
    if (error instanceof FeedFetchError)
      return failure(error.message, error.retryAfterSeconds, error.gone);
    return failure('Erreur inattendue pendant la récupération du flux.');
  }

  const nextCheckAt = new Date(Date.now() + nextCheckDelayMs(feed.intervalMinutes, 0));
  if (result.status === 'not-modified') {
    await recordCheckSuccess(feed.id, { nextCheckAt, posted: 0 });
    return { posted: 0, newItems: 0, notModified: true };
  }

  const items = result.feed.items;
  const allKeys = [...new Set(items.flatMap((item) => item.keys))];
  const known = await findKnownKeys(feed.id, allKeys);
  // Un article est nouveau si aucune de ses empreintes n'est connue.
  const fresh = items.filter((item) => item.keys.every((key) => !known.has(key)));
  const fetchedAt = new Date();
  await rememberKeys(feed.id, allKeys, fetchedAt);

  let posted = 0;
  for (const { item, priority } of selectNewItems(fresh, feed)) {
    if (options.signal?.aborted) break;
    try {
      await publishItem(resolved.channel, feed, item, priority);
      posted++;
    } catch (error) {
      logger.warn(
        { err: error, guildId: feed.guildId, feedId: feed.id },
        "Échec de la publication d'un article RSS",
      );
    }
  }

  await recordCheckSuccess(feed.id, {
    nextCheckAt,
    fetchedAt,
    etag: result.validators.etag,
    lastModified: result.validators.lastModified,
    siteUrl: result.feed.siteUrl,
    iconUrl: result.feed.iconUrl,
    posted,
  });
  return { posted, newItems: fresh.length, notModified: false };
}

/** Réserve puis vérifie un flux ; `null` s'il est déjà en cours de vérification. */
export async function claimAndCheck(
  client: Client,
  feedId: number,
  options: { signal?: AbortSignal; httpClient?: HttpClient } = {},
): Promise<CheckReport | null> {
  const feed = await claimFeed(feedId, LEASE_MS);
  if (!feed) return null;
  return checkFeed(client, feed, options);
}

/** Tâche périodique : vérifie les flux dont l'échéance est passée. */
export async function processDueFeeds(
  client: Client,
  options: { signal?: AbortSignal; httpClient?: HttpClient } = {},
): Promise<void> {
  const due = await findDueFeeds(new Date(), BATCH_SIZE);
  const enabled = new Map<string, boolean>();
  const queue = [...due];

  const worker = async (): Promise<void> => {
    for (let feed = queue.shift(); feed; feed = queue.shift()) {
      if (options.signal?.aborted) return;
      if (!enabled.has(feed.guildId))
        enabled.set(feed.guildId, await isModuleEnabled(feed.guildId, MODULE_ID));
      if (!enabled.get(feed.guildId)) {
        // Module désactivé : aucun accès au site ; le flux sera regardé de nouveau plus tard.
        await postponeFeed(
          feed.id,
          new Date(Date.now() + nextCheckDelayMs(feed.intervalMinutes, 0)),
        );
        continue;
      }
      try {
        await claimAndCheck(client, feed.id, options);
      } catch (error) {
        if (!(error instanceof BotError)) {
          logger.error(
            { err: error, guildId: feed.guildId, feedId: feed.id },
            'Erreur pendant la vérification d’un flux RSS',
          );
        } else {
          logger.debug(
            { guildId: feed.guildId, feedId: feed.id, reason: error.message },
            'Flux RSS en échec',
          );
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
