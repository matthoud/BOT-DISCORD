import type { Prisma, RssCategory, RssFeed, RssStyle } from '@prisma/client';
import { BotError } from '../../errors/BotError';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

export type FeedWithCategory = RssFeed & { customCategory: RssCategory | null };

export interface FeedInput {
  guildId: string;
  channelId: string;
  url: string;
  name: string;
  siteUrl: string | null;
  iconUrl: string | null;
  category: string;
  customCategoryId: number | null;
  intervalMinutes: number;
  showSummary: boolean;
  showImage: boolean;
  mentionRoleId: string | null;
  creatorId: string;
  etag: string | null;
  lastModified: string | null;
}

export type FeedUpdate = Partial<
  Pick<
    RssFeed,
    | 'channelId'
    | 'name'
    | 'category'
    | 'customCategoryId'
    | 'intervalMinutes'
    | 'showSummary'
    | 'showImage'
    | 'mentionRoleId'
    | 'includeKeywords'
    | 'excludeKeywords'
    | 'priorityKeywords'
    | 'ignoredAuthors'
    | 'categoryFilter'
  >
>;

const withCategory = { customCategory: true } as const;

/* ----------------------------------------------------------------------- Flux */

/**
 * Enregistre un flux avec les empreintes des articles qu'il contient déjà (ils ne seront pas publiés).
 * Le serveur est verrouillé le temps de l'opération : la limite de flux ne peut pas être dépassée
 * par des ajouts simultanés.
 */
export async function createFeed(
  input: FeedInput,
  seenKeys: string[],
  maxFeeds: number,
): Promise<FeedWithCategory> {
  await ensureGuild(input.guildId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "guildId" FROM "GuildConfig" WHERE "guildId" = ${input.guildId} FOR UPDATE`;
    if ((await tx.rssFeed.count({ where: { guildId: input.guildId } })) >= maxFeeds) {
      throw new BotError(`Un serveur ne peut pas suivre plus de ${maxFeeds} flux.`);
    }
    const duplicate = await tx.rssFeed.findFirst({
      where: { guildId: input.guildId, channelId: input.channelId, url: input.url },
      select: { name: true },
    });
    if (duplicate)
      throw new BotError(`Ce flux est déjà publié dans ce salon (**${duplicate.name}**).`);
    const now = new Date();
    const feed = await tx.rssFeed.create({
      data: {
        ...input,
        lastCheckAt: now,
        lastSuccessAt: now,
        lastFetchedAt: now,
        nextCheckAt: new Date(now.getTime() + input.intervalMinutes * 60_000),
      },
      include: withCategory,
    });
    if (seenKeys.length > 0) {
      await tx.rssItem.createMany({
        data: seenKeys.map((key) => ({ feedId: feed.id, key, lastSeenAt: now })),
        skipDuplicates: true,
      });
    }
    return feed;
  });
}

export async function getFeed(guildId: string, id: number): Promise<FeedWithCategory | null> {
  return prisma.rssFeed.findFirst({ where: { id, guildId }, include: withCategory });
}

export async function listFeeds(guildId: string): Promise<FeedWithCategory[]> {
  return prisma.rssFeed.findMany({
    where: { guildId },
    include: withCategory,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export async function countFeeds(guildId: string): Promise<number> {
  return prisma.rssFeed.count({ where: { guildId } });
}

export async function updateFeed(
  guildId: string,
  id: number,
  data: FeedUpdate,
): Promise<FeedWithCategory> {
  const { count } = await prisma.rssFeed.updateMany({ where: { id, guildId }, data });
  if (count === 0) throw new BotError("Ce flux n'existe plus.");
  return prisma.rssFeed.findUniqueOrThrow({ where: { id }, include: withCategory });
}

/** Suspend ou reprend un flux. Une reprise relance une vérification immédiate et efface l'erreur. */
export async function setFeedPaused(
  guildId: string,
  id: number,
  paused: boolean,
): Promise<boolean> {
  const { count } = await prisma.rssFeed.updateMany({
    where: { id, guildId, paused: !paused },
    data: paused
      ? { paused: true }
      : {
          paused: false,
          pausedReason: null,
          consecutiveFailures: 0,
          lastError: null,
          nextCheckAt: new Date(),
        },
  });
  return count > 0;
}

export async function deleteFeed(guildId: string, id: number): Promise<boolean> {
  const { count } = await prisma.rssFeed.deleteMany({ where: { id, guildId } });
  return count > 0;
}

/* --------------------------------------------------------------- Vérification */

/** Flux dont la vérification est due, du plus en retard au moins en retard. */
export async function findDueFeeds(now: Date, take: number): Promise<RssFeed[]> {
  return prisma.rssFeed.findMany({
    where: {
      paused: false,
      nextCheckAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { nextCheckAt: 'asc' },
    take,
  });
}

/**
 * Réserve un flux pour une vérification. Faux si une autre vérification est en cours :
 * un flux n'est jamais traité deux fois en même temps (tâche périodique et `/rss refresh`).
 */
export async function claimFeed(
  id: number,
  leaseMs: number,
  now = new Date(),
): Promise<FeedWithCategory | null> {
  const { count } = await prisma.rssFeed.updateMany({
    where: { id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + leaseMs) },
  });
  if (count === 0) return null;
  return prisma.rssFeed.findUnique({ where: { id }, include: withCategory });
}

/** Reporte un flux sans le vérifier (module désactivé), et libère sa réservation. */
export async function postponeFeed(id: number, nextCheckAt: Date): Promise<void> {
  await prisma.rssFeed.updateMany({ where: { id }, data: { nextCheckAt, leaseUntil: null } });
}

export interface CheckSuccess {
  nextCheckAt: Date;
  etag?: string | null;
  lastModified?: string | null;
  siteUrl?: string | null;
  iconUrl?: string | null;
  /** Renseigné si le flux a été entièrement téléchargé (pas de réponse « non modifié »). */
  fetchedAt?: Date;
  posted: number;
}

export async function recordCheckSuccess(
  id: number,
  result: CheckSuccess,
  now = new Date(),
): Promise<void> {
  const data: Prisma.RssFeedUpdateManyMutationInput = {
    leaseUntil: null,
    lastCheckAt: now,
    lastSuccessAt: now,
    nextCheckAt: result.nextCheckAt,
    consecutiveFailures: 0,
    lastError: null,
  };
  if (result.fetchedAt) {
    data.lastFetchedAt = result.fetchedAt;
    data.etag = result.etag ?? null;
    data.lastModified = result.lastModified ?? null;
    if (result.siteUrl !== undefined) data.siteUrl = result.siteUrl;
    if (result.iconUrl !== undefined) data.iconUrl = result.iconUrl;
  }
  if (result.posted > 0) {
    data.postCount = { increment: result.posted };
    data.lastPostAt = now;
  }
  await prisma.rssFeed.updateMany({ where: { id }, data });
}

/** Enregistre un échec. `pause` suspend le flux (il n'existe plus côté site, par exemple). */
export async function recordCheckFailure(
  id: number,
  error: string,
  nextCheckAt: Date,
  pause = false,
  now = new Date(),
): Promise<void> {
  await prisma.rssFeed.updateMany({
    where: { id },
    data: {
      leaseUntil: null,
      lastCheckAt: now,
      nextCheckAt,
      consecutiveFailures: { increment: 1 },
      lastError: error.slice(0, 300),
      ...(pause ? { paused: true, pausedReason: error.slice(0, 300) } : {}),
    },
  });
}

/* ------------------------------------------------------------ Articles connus */

/** Parmi ces empreintes, celles déjà connues pour ce flux. */
export async function findKnownKeys(feedId: number, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await prisma.rssItem.findMany({
    where: { feedId, key: { in: keys } },
    select: { key: true },
  });
  return new Set(rows.map((row) => row.key));
}

/**
 * Enregistre les empreintes vues lors d'un téléchargement complet : les nouvelles sont ajoutées,
 * les connues sont marquées comme encore présentes dans le flux (elles ne seront pas purgées).
 */
export async function rememberKeys(feedId: number, keys: string[], seenAt: Date): Promise<void> {
  if (keys.length === 0) return;
  await prisma.$transaction([
    prisma.rssItem.updateMany({
      where: { feedId, key: { in: keys } },
      data: { lastSeenAt: seenAt },
    }),
    prisma.rssItem.createMany({
      data: keys.map((key) => ({ feedId, key, lastSeenAt: seenAt })),
      skipDuplicates: true,
    }),
  ]);
}

/**
 * Supprime les empreintes d'articles disparus des flux depuis longtemps. Celles du dernier
 * téléchargement complet sont toujours conservées, même si le flux répond « non modifié » depuis.
 */
export async function pruneItems(before: Date): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "RssItem" AS i USING "RssFeed" AS f
    WHERE i."feedId" = f."id"
      AND i."lastSeenAt" < ${before}
      AND (f."lastFetchedAt" IS NULL OR i."lastSeenAt" < f."lastFetchedAt")`;
}

/* ---------------------------------------------------------------- Catégories */

export async function listCategories(guildId: string): Promise<RssCategory[]> {
  return prisma.rssCategory.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
}

export async function getCategory(guildId: string, id: number): Promise<RssCategory | null> {
  return prisma.rssCategory.findFirst({ where: { id, guildId } });
}

export async function createCategory(
  guildId: string,
  data: { name: string; emoji: string; color: number; style: RssStyle },
  max: number,
): Promise<RssCategory> {
  await ensureGuild(guildId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "guildId" FROM "GuildConfig" WHERE "guildId" = ${guildId} FOR UPDATE`;
    if ((await tx.rssCategory.count({ where: { guildId } })) >= max) {
      throw new BotError(`Un serveur ne peut pas avoir plus de ${max} catégories personnalisées.`);
    }
    const existing = await tx.rssCategory.findFirst({
      where: { guildId, name: { equals: data.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new BotError(`La catégorie **${data.name}** existe déjà.`);
    return tx.rssCategory.create({ data: { guildId, ...data } });
  });
}

export async function updateCategory(
  guildId: string,
  id: number,
  data: Partial<{ name: string; emoji: string; color: number; style: RssStyle }>,
): Promise<RssCategory> {
  if (data.name) {
    const existing = await prisma.rssCategory.findFirst({
      where: { guildId, id: { not: id }, name: { equals: data.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new BotError(`La catégorie **${data.name}** existe déjà.`);
  }
  const { count } = await prisma.rssCategory.updateMany({ where: { id, guildId }, data });
  if (count === 0) throw new BotError("Cette catégorie n'existe plus.");
  return prisma.rssCategory.findUniqueOrThrow({ where: { id } });
}

/** Supprime une catégorie ; ses flux reprennent la catégorie « Autre ». Retourne le nombre de flux concernés. */
export async function deleteCategory(guildId: string, id: number): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const { count: moved } = await tx.rssFeed.updateMany({
      where: { guildId, customCategoryId: id },
      data: { customCategoryId: null, category: 'other' },
    });
    const { count } = await tx.rssCategory.deleteMany({ where: { id, guildId } });
    return count > 0 ? moved : null;
  });
}

export async function countFeedsInCategory(guildId: string, id: number): Promise<number> {
  return prisma.rssFeed.count({ where: { guildId, customCategoryId: id } });
}
