import type { Suggestion, SuggestionConfig, SuggestionStatus } from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const configCache = new TtlCache<string, SuggestionConfig>(CONFIG_CACHE_TTL_MS);

export interface VoteCounts {
  up: number;
  down: number;
}

export type SuggestionWithVotes = Suggestion & VoteCounts;

export async function getSuggestionConfig(guildId: string): Promise<SuggestionConfig> {
  return configCache.getOrLoad(guildId, async () => {
    await ensureGuild(guildId);
    return prisma.suggestionConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  });
}

export async function updateSuggestionConfig(
  guildId: string,
  data: Partial<Pick<SuggestionConfig, 'channelId' | 'staffRoleId'>>,
): Promise<SuggestionConfig> {
  await ensureGuild(guildId);
  const config = await prisma.suggestionConfig.upsert({
    where: { guildId },
    create: { ...data, guildId },
    update: data,
  });
  configCache.set(guildId, config);
  return config;
}

/** Enregistre une suggestion avec le numéro suivant du serveur (attribution atomique). */
export async function createSuggestion(guildId: string, authorId: string, content: string): Promise<Suggestion> {
  await ensureGuild(guildId);
  return prisma.$transaction(async (tx) => {
    await tx.suggestionConfig.createMany({ data: [{ guildId }], skipDuplicates: true });
    const { counter } = await tx.suggestionConfig.update({
      where: { guildId },
      data: { counter: { increment: 1 } },
      select: { counter: true },
    });
    return tx.suggestion.create({ data: { guildId, number: counter, authorId, content } });
  });
}

/** Associe à la suggestion le message public qui la présente. */
export async function setSuggestionMessage(id: number, channelId: string, messageId: string): Promise<void> {
  await prisma.suggestion.update({ where: { id }, data: { channelId, messageId } });
}

/** Supprime une suggestion dont la publication a échoué. */
export async function deleteSuggestion(id: number): Promise<void> {
  await prisma.suggestion.deleteMany({ where: { id } });
}

async function countVotes(suggestionId: number): Promise<VoteCounts> {
  const groups = await prisma.suggestionVote.groupBy({
    by: ['value'],
    where: { suggestionId },
    _count: { _all: true },
  });
  const count = (value: number): number => groups.find((group) => group.value === value)?._count._all ?? 0;
  return { up: count(1), down: count(-1) };
}

async function withVotes(suggestion: Suggestion | null): Promise<SuggestionWithVotes | null> {
  return suggestion ? { ...suggestion, ...(await countVotes(suggestion.id)) } : null;
}

export async function getSuggestionById(guildId: string, id: number): Promise<SuggestionWithVotes | null> {
  return withVotes(await prisma.suggestion.findFirst({ where: { id, guildId } }));
}

export async function getSuggestionByNumber(guildId: string, number: number): Promise<SuggestionWithVotes | null> {
  return withVotes(await prisma.suggestion.findUnique({ where: { guildId_number: { guildId, number } } }));
}

/**
 * Enregistre le vote d'un membre : voter une seconde fois dans le même sens retire le vote,
 * voter dans l'autre sens le remplace. Retourne le vote désormais en vigueur (0 = aucun).
 */
export async function castVote(suggestionId: number, userId: string, value: 1 | -1): Promise<1 | -1 | 0> {
  const removed = await prisma.suggestionVote.deleteMany({ where: { suggestionId, userId, value } });
  if (removed.count > 0) return 0;
  await prisma.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    create: { suggestionId, userId, value },
    update: { value },
  });
  return value;
}

/** Enregistre la décision ou la réponse du staff. `status` absent : simple réponse, statut inchangé. */
export async function respondToSuggestion(
  id: number,
  staffId: string,
  response: string | null,
  status?: SuggestionStatus,
): Promise<void> {
  await prisma.suggestion.update({
    where: { id },
    data: {
      staffId,
      staffResponse: response,
      ...(status ? { status, decidedAt: status === 'PENDING' ? null : new Date() } : {}),
    },
  });
}

export interface SuggestionFilter {
  status?: SuggestionStatus;
  authorId?: string;
}

export async function countSuggestions(guildId: string, filter: SuggestionFilter = {}): Promise<number> {
  return prisma.suggestion.count({ where: { guildId, messageId: { not: null }, ...filter } });
}

/** Page de suggestions, de la plus récente à la plus ancienne, avec leurs votes. */
export async function getSuggestionPage(
  guildId: string,
  filter: SuggestionFilter,
  skip: number,
  take: number,
): Promise<SuggestionWithVotes[]> {
  const suggestions = await prisma.suggestion.findMany({
    where: { guildId, messageId: { not: null }, ...filter },
    orderBy: { number: 'desc' },
    skip,
    take,
  });
  if (suggestions.length === 0) return [];

  const groups = await prisma.suggestionVote.groupBy({
    by: ['suggestionId', 'value'],
    where: { suggestionId: { in: suggestions.map((suggestion) => suggestion.id) } },
    _count: { _all: true },
  });
  const count = (id: number, value: number): number =>
    groups.find((group) => group.suggestionId === id && group.value === value)?._count._all ?? 0;
  return suggestions.map((suggestion) => ({
    ...suggestion,
    up: count(suggestion.id, 1),
    down: count(suggestion.id, -1),
  }));
}

/** Nombre de suggestions publiées par statut. */
export async function getStatusCounts(guildId: string): Promise<Record<SuggestionStatus, number>> {
  const groups = await prisma.suggestion.groupBy({
    by: ['status'],
    where: { guildId, messageId: { not: null } },
    _count: { _all: true },
  });
  const count = (status: SuggestionStatus): number =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  return { PENDING: count('PENDING'), ACCEPTED: count('ACCEPTED'), REFUSED: count('REFUSED') };
}
