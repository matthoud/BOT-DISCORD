import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from 'discord.js';
import type { Event } from '@prisma/client';
import type { Participation } from '../../../core/database/repositories/events.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { timestamp, truncate } from '../../../utils/format';

export const MODULE_ID = 'events';

export const EVENT_IDS = { rsvp: 'events:rsvp' } as const;

export const EVENT_LIMITS = {
  titleLength: 100,
  descriptionLength: 1500,
  capacity: { min: 1, max: 10_000 },
  /** Un événement se programme au plus un an à l'avance. */
  maxAheadMs: 366 * 24 * 60 * 60 * 1000,
  upcomingPerGuild: 25,
  /** Nombre de participants nommés dans l'annonce ; les suivants sont seulement comptés. */
  listedParticipants: 30,
  /** Nombre de participants mentionnés dans un rappel. */
  mentionedParticipants: 80,
} as const;

/** Délais de rappel proposés, en minutes avant le début. */
export const REMINDER_CHOICES = [
  { name: 'Aucun rappel', value: 0 },
  { name: '10 minutes avant', value: 10 },
  { name: '30 minutes avant', value: 30 },
  { name: '1 heure avant', value: 60 },
  { name: '1 jour avant', value: 1440 },
] as const;
export const DEFAULT_REMINDER_MINUTES = 30;

/** Moment du rappel, ou `null` s'il n'y en a pas ou s'il tomberait dans le passé. */
export function computeReminderAt(startsAt: Date, minutesBefore: number, now = Date.now()): Date | null {
  if (minutesBefore <= 0) return null;
  const at = startsAt.getTime() - minutesBefore * 60_000;
  return at > now ? new Date(at) : null;
}

/** Vrai si l'événement a commencé : les inscriptions sont closes. */
export function hasEventStarted(event: Pick<Event, 'startedAt' | 'startsAt'>, now = Date.now()): boolean {
  return event.startedAt !== null || event.startsAt.getTime() <= now;
}

export function eventUrl(event: Pick<Event, 'guildId' | 'channelId' | 'messageId'>): string | null {
  return event.messageId ? `https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId}` : null;
}

/** « 12 », ou « 12 / 20 » quand l'événement a une capacité. */
export function describeSeats(going: number, capacity: number | null): string {
  return capacity === null ? String(going) : `${going} / ${capacity}`;
}

/** Annonce d'un événement. */
export function buildEventEmbed(event: Event, participation: Participation): EmbedBuilder {
  const started = hasEventStarted(event);
  const going = participation.going;
  const full = event.capacity !== null && going.length >= event.capacity;

  const listed = going.slice(0, EVENT_LIMITS.listedParticipants).map((id) => `<@${id}>`);
  const others = going.length - listed.length;
  const names = listed.length > 0 ? `${listed.join(' ')}${others > 0 ? ` et ${others} autre(s)` : ''}` : '*Personne pour le moment*';

  const embed = baseEmbed(started ? Colors.neutral : Colors.primary)
    .setTitle(truncate(`📅 ${event.title}`, 256))
    .addFields(
      {
        name: started ? 'Événement commencé' : 'Date',
        value: `${timestamp(event.startsAt, 'F')}\n${timestamp(event.startsAt, 'R')}`,
        inline: true,
      },
      {
        name: 'Participants',
        value: `✅ **${describeSeats(going.length, event.capacity)}**${full ? ' — complet' : ''}\n❌ ${participation.declined} absent(s)`,
        inline: true,
      },
      { name: 'Inscrits', value: truncate(names, 1024) },
    )
    .setFooter({ text: started ? 'Les inscriptions sont closes.' : 'Répondez avec les boutons ci-dessous.' })
    .setTimestamp(event.createdAt);

  embed.setDescription(`${event.description ? `${event.description}\n\n` : ''}-# Organisé par <@${event.creatorId}>`);
  if (event.imageUrl) embed.setImage(event.imageUrl);
  return embed;
}

/** Boutons de réponse à un événement. Vide une fois l'événement commencé. */
export function buildEventButtons(event: Event, participation: Participation): ActionRowBuilder<ButtonBuilder>[] {
  if (hasEventStarted(event)) return [];
  const id = String(event.id);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(componentId(EVENT_IDS.rsvp, id, 'going'))
        .setEmoji('✅')
        .setLabel(`Je participe (${participation.going.length})`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(componentId(EVENT_IDS.rsvp, id, 'declined'))
        .setEmoji('❌')
        .setLabel(`Je ne participe pas (${participation.declined})`)
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Message de rappel avant le début, avec les participants à mentionner. */
export function buildEventReminder(event: Event, going: string[]): { content: string; mentioned: string[] } {
  const mentioned = going.slice(0, EVENT_LIMITS.mentionedParticipants);
  const others = going.length - mentioned.length;
  const url = eventUrl(event);
  const lines = [`⏰ **${event.title}** commence ${timestamp(event.startsAt, 'R')} (${timestamp(event.startsAt, 't')}).`];
  if (mentioned.length > 0) {
    lines.push(`${mentioned.map((id) => `<@${id}>`).join(' ')}${others > 0 ? ` et ${others} autre(s)` : ''}`);
  }
  if (url) lines.push(`[Voir l'événement](${url})`);
  return { content: lines.join('\n'), mentioned };
}
