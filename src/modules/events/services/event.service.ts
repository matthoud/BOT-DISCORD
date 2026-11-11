import { PermissionFlagsBits, type Guild, type GuildTextBasedChannel } from 'discord.js';
import type { Event } from '@prisma/client';
import type { BotClient } from '../../../core/client';
import {
  claimEventReminder,
  findDueEventReminders,
  findStartedEvents,
  getEvent,
  getParticipation,
  markEventStarted,
} from '../../../core/database/repositories/events.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { permissionNames } from '../../../core/permissions/names';
import { buildEventButtons, buildEventEmbed, buildEventReminder, MODULE_ID } from './presenter';

export const EVENT_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
];

/** Événement du serveur, ou une `BotError` s'il n'existe pas (ou plus). */
export async function requireEvent(guildId: string, rawId: string | undefined): Promise<Event> {
  const id = Number(rawId);
  const event = Number.isSafeInteger(id) && /^\d{1,9}$/.test(rawId ?? '') ? await getEvent(guildId, id) : null;
  if (!event) throw new BotError('Événement introuvable. Choisissez-le dans la liste proposée.');
  return event;
}

/** Vérifie que le bot peut publier et tenir à jour une annonce dans ce salon. */
export async function assertEventChannel(guild: Guild, channel: GuildTextBasedChannel): Promise<void> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const missing = channel.permissionsFor(me).missing(EVENT_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    const names = permissionNames(missing.map((name) => PermissionFlagsBits[name]))
      .map((name) => `\`${name}\``)
      .join(', ');
    throw new BotError(`Je ne peux pas publier dans ${channel} : il me manque ${names}.`);
  }
}

function eventChannel(guild: Guild, event: Event): GuildTextBasedChannel | null {
  const channel = guild.channels.cache.get(event.channelId);
  return channel?.isTextBased() ? channel : null;
}

/**
 * Met l'annonce d'un événement en accord avec son état en base.
 * Retourne faux si le message est introuvable ou inaccessible.
 */
export async function refreshEventMessage(guild: Guild, event: Event): Promise<boolean> {
  const channel = eventChannel(guild, event);
  if (!channel || !event.messageId) return false;
  try {
    const participation = await getParticipation(event.id);
    const message = await channel.messages.fetch(event.messageId);
    await message.edit({
      embeds: [buildEventEmbed(event, participation)],
      components: buildEventButtons(event, participation),
    });
    return true;
  } catch (error) {
    logger.debug({ err: error, guildId: guild.id, eventId: event.id }, "Annonce d'événement introuvable");
    return false;
  }
}

/** Supprime l'annonce d'un événement, si elle existe encore. */
export async function deleteEventMessage(guild: Guild, event: Event): Promise<void> {
  const channel = eventChannel(guild, event);
  if (!channel || !event.messageId) return;
  await channel.messages.delete(event.messageId).catch(() => undefined);
}

/**
 * Envoie les rappels dus et clôt les inscriptions des événements commencés.
 * Les échéances sont en base : rien n'est perdu si le bot est arrêté au moment prévu.
 */
export async function processEvents(client: BotClient): Promise<void> {
  const now = new Date();

  for (const due of await findDueEventReminders(now)) {
    // Pris en charge avant l'envoi : un rappel n'est jamais publié deux fois.
    if (!(await claimEventReminder(due.id))) continue;
    // Un rappel resté en attente au-delà du début (bot arrêté) n'a plus d'intérêt.
    if (due.startsAt.getTime() <= now.getTime()) continue;
    const guild = client.guilds.cache.get(due.guildId);
    if (!guild?.available || !(await isModuleEnabled(guild.id, MODULE_ID))) continue;
    const channel = eventChannel(guild, due);
    if (!channel) continue;
    try {
      const { going } = await getParticipation(due.id);
      const reminder = buildEventReminder(due, going);
      // Seuls les participants inscrits peuvent être mentionnés.
      await channel.send({ content: reminder.content, allowedMentions: { users: reminder.mentioned } });
    } catch (error) {
      logger.warn({ err: error, guildId: guild.id, eventId: due.id }, "Échec de l'envoi d'un rappel d'événement");
    }
  }

  for (const started of await findStartedEvents(now)) {
    if (!(await markEventStarted(started.id))) continue;
    const guild = client.guilds.cache.get(started.guildId);
    if (!guild?.available) continue;
    const event = await getEvent(started.guildId, started.id);
    if (event) await refreshEventMessage(guild, event);
  }
}
