import type { Poll, PollOption } from '@prisma/client';
import { BotError } from '../../errors/BotError';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

export type PollWithOptions = Poll & { options: PollOption[] };

export interface PollResults {
  /** Nombre de votes par identifiant de réponse. */
  counts: Map<number, number>;
  /** Nombre de membres ayant voté (un membre compte une fois, même en choix multiple). */
  voters: number;
}

export interface PollInput {
  guildId: string;
  channelId: string;
  authorId: string;
  question: string;
  options: string[];
  multiple: boolean;
  hideResults: boolean;
  endsAt: Date;
}

const withOptions = { options: { orderBy: { position: 'asc' as const } } };

export async function createPoll(input: PollInput): Promise<PollWithOptions> {
  await ensureGuild(input.guildId);
  const { options, ...data } = input;
  return prisma.poll.create({
    data: { ...data, options: { create: options.map((label, position) => ({ label, position })) } },
    include: withOptions,
  });
}

/** Associe au sondage le message qui le présente. */
export async function setPollMessage(id: number, messageId: string): Promise<void> {
  await prisma.poll.update({ where: { id }, data: { messageId } });
}

/** Supprime un sondage (publication échouée), avec ses réponses et ses votes. */
export async function deletePoll(id: number): Promise<void> {
  await prisma.poll.deleteMany({ where: { id } });
}

export async function getPoll(guildId: string, id: number): Promise<PollWithOptions | null> {
  return prisma.poll.findFirst({ where: { id, guildId }, include: withOptions });
}

export async function getPollResults(pollId: number): Promise<PollResults> {
  const [groups, voters] = await Promise.all([
    prisma.pollVote.groupBy({ by: ['optionId'], where: { pollId }, _count: { _all: true } }),
    prisma.pollVote.findMany({ where: { pollId }, distinct: ['userId'], select: { userId: true } }),
  ]);
  return {
    counts: new Map(groups.map((group) => [group.optionId, group._count._all])),
    voters: voters.length,
  };
}

/** Réponses actuellement choisies par un membre. */
export async function getUserVotes(pollId: number, userId: string): Promise<number[]> {
  const votes = await prisma.pollVote.findMany({ where: { pollId, userId }, select: { optionId: true } });
  return votes.map((vote) => vote.optionId);
}

/**
 * Enregistre le clic d'un membre sur une réponse et retourne ses choix en vigueur.
 * Recliquer sur une réponse la retire ; en choix unique, cliquer sur une autre remplace la précédente.
 * Le sondage est verrouillé le temps de l'opération : deux clics simultanés d'un même membre ne
 * peuvent pas laisser deux votes sur un sondage à choix unique, ni un vote après la clôture.
 */
export async function togglePollVote(pollId: number, optionId: number, userId: string): Promise<number[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Poll" WHERE "id" = ${pollId} FOR UPDATE`;
    const poll = await tx.poll.findUnique({ where: { id: pollId }, include: { options: { select: { id: true } } } });
    if (!poll) throw new BotError("Ce sondage n'existe plus.");
    if (poll.closedAt || poll.endsAt.getTime() <= Date.now()) throw new BotError('Ce sondage est terminé.');
    if (!poll.options.some((option) => option.id === optionId)) throw new BotError('Réponse inconnue.');

    const removed = await tx.pollVote.deleteMany({ where: { pollId, optionId, userId } });
    if (removed.count === 0) {
      if (!poll.multiple) await tx.pollVote.deleteMany({ where: { pollId, userId } });
      await tx.pollVote.create({ data: { pollId, optionId, userId } });
    }
    const votes = await tx.pollVote.findMany({ where: { pollId, userId }, select: { optionId: true } });
    return votes.map((vote) => vote.optionId);
  });
}

/** Clôt un sondage. Retourne faux s'il l'était déjà : la clôture n'est donc traitée qu'une fois. */
export async function closePoll(id: number, now = new Date()): Promise<boolean> {
  const { count } = await prisma.poll.updateMany({ where: { id, closedAt: null }, data: { closedAt: now } });
  return count > 0;
}

/** Sondages ouverts dont l'échéance est passée. */
export async function findExpiredPolls(now: Date, limit = 50): Promise<PollWithOptions[]> {
  return prisma.poll.findMany({
    where: { closedAt: null, endsAt: { lte: now } },
    include: withOptions,
    orderBy: { endsAt: 'asc' },
    take: limit,
  });
}

/** Sondages publiés les plus récents du serveur. */
export async function listRecentPolls(guildId: string, limit: number): Promise<Poll[]> {
  return prisma.poll.findMany({
    where: { guildId, messageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Nombre de sondages encore ouverts lancés par un membre. */
export async function countOpenPollsBy(guildId: string, authorId: string): Promise<number> {
  return prisma.poll.count({ where: { guildId, authorId, closedAt: null } });
}

/** Supprime les sondages clos avant `before`, ainsi que ceux dont la publication n'a jamais abouti. */
export async function prunePolls(before: Date): Promise<number> {
  const { count } = await prisma.poll.deleteMany({
    where: { OR: [{ closedAt: { lt: before } }, { messageId: null, createdAt: { lt: before } }] },
  });
  return count;
}
