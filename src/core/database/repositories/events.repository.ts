import type { Event, ParticipationStatus, Reminder } from '@prisma/client';
import { BotError } from '../../errors/BotError';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

export interface Participation {
  /** Identifiants des participants, dans l'ordre d'inscription. */
  going: string[];
  declined: number;
}

export interface EventInput {
  guildId: string;
  channelId: string;
  creatorId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: Date;
  capacity: number | null;
  reminderAt: Date | null;
}

export type EventUpdate = Partial<
  Pick<EventInput, 'title' | 'description' | 'imageUrl' | 'startsAt' | 'capacity' | 'reminderAt'>
>;

/* ----------------------------------------------------------------- Événements */

export async function createEvent(input: EventInput): Promise<Event> {
  await ensureGuild(input.guildId);
  return prisma.event.create({ data: input });
}

/** Associe à l'événement le message qui l'annonce. */
export async function setEventMessage(id: number, messageId: string): Promise<void> {
  await prisma.event.update({ where: { id }, data: { messageId } });
}

export async function getEvent(guildId: string, id: number): Promise<Event | null> {
  return prisma.event.findFirst({ where: { id, guildId } });
}

/**
 * Modifie un événement. Si la date ou le rappel changent, l'état du rappel et du début est remis
 * à zéro : un événement reporté rouvre ses inscriptions et sera de nouveau rappelé.
 */
export async function updateEvent(guildId: string, id: number, data: EventUpdate): Promise<Event> {
  const reschedule = data.startsAt !== undefined || data.reminderAt !== undefined;
  const { count } = await prisma.event.updateMany({
    where: { id, guildId },
    data: { ...data, ...(reschedule ? { reminderSentAt: null, startedAt: null } : {}) },
  });
  if (count === 0) throw new BotError("Cet événement n'existe plus.");
  return prisma.event.findUniqueOrThrow({ where: { id } });
}

/** Supprime un événement et ses participations. */
export async function deleteEvent(guildId: string, id: number): Promise<boolean> {
  const { count } = await prisma.event.deleteMany({ where: { id, guildId } });
  return count > 0;
}

export async function getParticipation(eventId: number): Promise<Participation> {
  const [going, declined] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: { eventId, status: 'GOING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { userId: true },
    }),
    prisma.eventParticipant.count({ where: { eventId, status: 'DECLINED' } }),
  ]);
  return { going: going.map((participant) => participant.userId), declined };
}

/**
 * Enregistre la réponse d'un membre et retourne son statut en vigueur (`null` = réponse retirée).
 * Recliquer sur la même réponse la retire. L'événement est verrouillé le temps de l'opération :
 * la capacité ne peut pas être dépassée par des inscriptions simultanées.
 */
export async function setParticipation(
  eventId: number,
  userId: string,
  status: ParticipationStatus,
): Promise<ParticipationStatus | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new BotError("Cet événement n'existe plus.");
    if (event.startedAt || event.startsAt.getTime() <= Date.now()) {
      throw new BotError('Les inscriptions sont closes : cet événement a commencé.');
    }

    const removed = await tx.eventParticipant.deleteMany({ where: { eventId, userId, status } });
    if (removed.count > 0) return null;

    if (status === 'GOING' && event.capacity !== null) {
      const taken = await tx.eventParticipant.count({ where: { eventId, status: 'GOING' } });
      if (taken >= event.capacity) throw new BotError('Cet événement est complet.');
    }
    await tx.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status },
      update: { status, createdAt: new Date() },
    });
    return status;
  });
}

/** Événements à venir du serveur, du plus proche au plus lointain. */
export async function listUpcomingEvents(guildId: string, now: Date, limit: number): Promise<Event[]> {
  return prisma.event.findMany({
    where: { guildId, messageId: { not: null }, startsAt: { gt: now } },
    orderBy: { startsAt: 'asc' },
    take: limit,
  });
}

/** Événements proposés à la modification : ceux à venir, puis les plus récents. */
export async function listEditableEvents(guildId: string, limit: number): Promise<Event[]> {
  return prisma.event.findMany({
    where: { guildId, messageId: { not: null } },
    orderBy: { startsAt: 'desc' },
    take: limit,
  });
}

export async function countUpcomingEvents(guildId: string, now: Date): Promise<number> {
  return prisma.event.count({ where: { guildId, startsAt: { gt: now } } });
}

/** Nombre de participants par événement, pour une liste. */
export async function countGoing(eventIds: number[]): Promise<Map<number, number>> {
  if (eventIds.length === 0) return new Map();
  const groups = await prisma.eventParticipant.groupBy({
    by: ['eventId'],
    where: { eventId: { in: eventIds }, status: 'GOING' },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.eventId, group._count._all]));
}

/** Événements dont le rappel est dû et n'a pas encore été pris en charge. */
export async function findDueEventReminders(now: Date, limit = 25): Promise<Event[]> {
  return prisma.event.findMany({
    where: { reminderAt: { lte: now }, reminderSentAt: null, startedAt: null, messageId: { not: null } },
    orderBy: { reminderAt: 'asc' },
    take: limit,
  });
}

/** Prend en charge le rappel d'un événement. Retourne faux s'il l'était déjà (jamais deux rappels). */
export async function claimEventReminder(id: number, now = new Date()): Promise<boolean> {
  const { count } = await prisma.event.updateMany({ where: { id, reminderSentAt: null }, data: { reminderSentAt: now } });
  return count > 0;
}

/** Événements dont l'heure de début est passée et qui n'ont pas encore été marqués comme commencés. */
export async function findStartedEvents(now: Date, limit = 25): Promise<Event[]> {
  return prisma.event.findMany({
    where: { startsAt: { lte: now }, startedAt: null, messageId: { not: null } },
    orderBy: { startsAt: 'asc' },
    take: limit,
  });
}

/** Marque un événement comme commencé. Retourne faux s'il l'était déjà. */
export async function markEventStarted(id: number, now = new Date()): Promise<boolean> {
  const { count } = await prisma.event.updateMany({ where: { id, startedAt: null }, data: { startedAt: now } });
  return count > 0;
}

/** Supprime les événements commencés avant `before` et ceux dont la publication n'a jamais abouti. */
export async function pruneEvents(before: Date): Promise<number> {
  const { count } = await prisma.event.deleteMany({
    where: { OR: [{ startsAt: { lt: before } }, { messageId: null, createdAt: { lt: before } }] },
  });
  return count;
}

/* -------------------------------------------------------------------- Rappels */

export async function createReminder(data: {
  guildId: string;
  channelId: string;
  userId: string;
  message: string;
  remindAt: Date;
}): Promise<Reminder> {
  await ensureGuild(data.guildId);
  return prisma.reminder.create({ data });
}

/** Rappels en attente d'un membre sur un serveur, du plus proche au plus lointain. */
export async function listPendingReminders(guildId: string, userId: string): Promise<Reminder[]> {
  return prisma.reminder.findMany({ where: { guildId, userId, sentAt: null }, orderBy: { remindAt: 'asc' } });
}

export async function countPendingReminders(guildId: string, userId: string): Promise<number> {
  return prisma.reminder.count({ where: { guildId, userId, sentAt: null } });
}

/** Supprime un rappel en attente appartenant au membre. Retourne faux s'il n'existe pas. */
export async function deleteReminder(guildId: string, userId: string, id: number): Promise<boolean> {
  const { count } = await prisma.reminder.deleteMany({ where: { id, guildId, userId, sentAt: null } });
  return count > 0;
}

export async function findDueReminders(now: Date, limit = 50): Promise<Reminder[]> {
  return prisma.reminder.findMany({
    where: { sentAt: null, remindAt: { lte: now } },
    orderBy: { remindAt: 'asc' },
    take: limit,
  });
}

/** Prend en charge l'envoi d'un rappel. Retourne faux s'il l'était déjà (jamais deux envois). */
export async function claimReminder(id: number, now = new Date()): Promise<boolean> {
  const { count } = await prisma.reminder.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: now, attempts: { increment: 1 } },
  });
  return count > 0;
}

/** Remet en attente un rappel dont l'envoi a échoué, pour un nouvel essai au prochain passage. */
export async function releaseReminder(id: number): Promise<void> {
  await prisma.reminder.updateMany({ where: { id }, data: { sentAt: null } });
}

/** Supprime les rappels envoyés avant `before`. */
export async function pruneReminders(before: Date): Promise<number> {
  const { count } = await prisma.reminder.deleteMany({ where: { sentAt: { lt: before } } });
  return count;
}
