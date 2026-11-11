import { PermissionFlagsBits } from 'discord.js';
import type { Reminder } from '@prisma/client';
import type { BotClient } from '../../../core/client';
import {
  claimReminder,
  findDueReminders,
  releaseReminder,
} from '../../../core/database/repositories/events.repository';
import { logger } from '../../../core/logger';
import { timestamp } from '../../../utils/format';

export const REMINDER_LIMITS = {
  messageLength: 500,
  /** Rappels en attente par membre et par serveur. */
  pendingPerMember: 10,
  minDelayMs: 30_000,
  maxDelayMs: 366 * 24 * 60 * 60 * 1000,
  /** Nombre d'envois tentés avant d'abandonner un rappel. */
  maxAttempts: 3,
} as const;

export function buildReminderContent(reminder: Pick<Reminder, 'userId' | 'message' | 'createdAt'>): string {
  return `⏰ <@${reminder.userId}>, voici votre rappel (créé ${timestamp(reminder.createdAt, 'R')}) :\n>>> ${reminder.message}`;
}

/** Envoie un rappel dans son salon d'origine, ou en message privé si ce salon n'est plus utilisable. */
async function deliver(client: BotClient, reminder: Reminder): Promise<void> {
  const content = buildReminderContent(reminder);
  // Seul le destinataire peut être mentionné, quel que soit le texte du rappel.
  const allowedMentions = { users: [reminder.userId] };

  const guild = client.guilds.cache.get(reminder.guildId);
  const channel = guild?.channels.cache.get(reminder.channelId);
  const me = guild?.members.me;
  if (channel?.isTextBased() && me) {
    const needed = channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
    if (channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, needed])) {
      await channel.send({ content, allowedMentions });
      return;
    }
  }
  const user = await client.users.fetch(reminder.userId);
  await user.send({ content, allowedMentions });
}

/**
 * Envoie les rappels arrivés à échéance. Un rappel dû pendant un arrêt du bot part au redémarrage.
 * Chaque rappel est pris en charge avant l'envoi (jamais de doublon) et remis en attente en cas
 * d'échec, dans la limite de trois tentatives.
 */
export async function processReminders(client: BotClient): Promise<void> {
  for (const reminder of await findDueReminders(new Date())) {
    if (!(await claimReminder(reminder.id))) continue;
    try {
      await deliver(client, reminder);
    } catch (error) {
      const attempts = reminder.attempts + 1;
      const giveUp = attempts >= REMINDER_LIMITS.maxAttempts;
      logger.warn(
        { err: error, reminderId: reminder.id, attempts, abandoned: giveUp },
        "Échec de l'envoi d'un rappel",
      );
      if (!giveUp) await releaseReminder(reminder.id);
    }
  }
}
