import { PermissionFlagsBits, type Guild, type GuildMember, type GuildTextBasedChannel, type User } from 'discord.js';
import type { SuggestionConfig } from '@prisma/client';
import {
  getSuggestionById,
  type SuggestionWithVotes,
} from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { permissionNames } from '../../../core/permissions/names';
import { buildSuggestionButtons, buildSuggestionEmbed } from './presenter';

export const SUGGESTION_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/** Vrai si le membre peut traiter les suggestions : « Gérer le serveur » ou rôle de staff configuré. */
export function isSuggestionStaff(member: GuildMember, config: Pick<SuggestionConfig, 'staffRoleId'>): boolean {
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return config.staffRoleId !== null && member.roles.cache.has(config.staffRoleId);
}

/** Salon de publication des suggestions, ou une `BotError` expliquant pourquoi il est inutilisable. */
export async function resolveSuggestionChannel(
  guild: Guild,
  config: Pick<SuggestionConfig, 'channelId'>,
): Promise<GuildTextBasedChannel> {
  if (!config.channelId) {
    throw new BotError(
      "Le salon des suggestions n'est pas encore configuré. Un administrateur peut le faire avec `/suggestions-admin config`.",
    );
  }
  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased()) {
    throw new BotError("Le salon des suggestions n'existe plus. Un administrateur doit en choisir un autre.");
  }
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const missing = channel.permissionsFor(me).missing(SUGGESTION_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    const names = permissionNames(missing.map((name) => PermissionFlagsBits[name]))
      .map((name) => `\`${name}\``)
      .join(', ');
    throw new BotError(`Je ne peux pas publier dans ${channel} : il me manque ${names}.`);
  }
  return channel;
}

export async function fetchAuthor(guild: Guild, authorId: string): Promise<User | null> {
  return guild.client.users.fetch(authorId).catch(() => null);
}

/** Suggestion publiée, ou une `BotError` si elle n'existe pas (ou plus). */
export async function requireSuggestion(guildId: string, rawId: string | undefined): Promise<SuggestionWithVotes> {
  const id = Number(rawId);
  const suggestion = Number.isSafeInteger(id) ? await getSuggestionById(guildId, id) : null;
  if (!suggestion) throw new BotError("Cette suggestion n'existe plus.");
  return suggestion;
}

/**
 * Met à jour le message public d'une suggestion d'après son état en base.
 * Retourne faux si le message est introuvable (supprimé à la main, salon supprimé...).
 */
export async function refreshSuggestionMessage(guild: Guild, suggestion: SuggestionWithVotes): Promise<boolean> {
  if (!suggestion.channelId || !suggestion.messageId) return false;
  const channel = guild.channels.cache.get(suggestion.channelId);
  if (!channel?.isTextBased()) return false;
  try {
    const message = await channel.messages.fetch(suggestion.messageId);
    await message.edit({
      embeds: [buildSuggestionEmbed(suggestion, await fetchAuthor(guild, suggestion.authorId))],
      components: [buildSuggestionButtons(suggestion)],
    });
    return true;
  } catch (error) {
    logger.debug({ err: error, guildId: guild.id, suggestionId: suggestion.id }, 'Message de suggestion introuvable');
    return false;
  }
}
