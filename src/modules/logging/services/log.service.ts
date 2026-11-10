import { PermissionFlagsBits, type EmbedBuilder, type Guild, type User } from 'discord.js';
import {
  getLogChannelId,
  getLoggingConfig,
  type LogCategory,
} from '../../../core/database/repositories/logging.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { logger } from '../../../core/logger';
import { baseEmbed } from '../../../core/ui/embeds';

export const MODULE_ID = 'logging';

export const LOG_CATEGORY_INFO: Record<LogCategory, { label: string; emoji: string; description: string }> = {
  members: {
    label: 'Membres',
    emoji: '👥',
    description: 'Arrivées, départs, pseudos et rôles des membres',
  },
  messages: { label: 'Messages', emoji: '💬', description: 'Messages modifiés et supprimés' },
  channels: { label: 'Salons', emoji: '📁', description: 'Création, suppression et modification de salons' },
  roles: { label: 'Rôles', emoji: '🏷️', description: 'Création, suppression et permissions des rôles' },
  moderation: {
    label: 'Modération',
    emoji: '🛡️',
    description: 'Bannissements, débannissements et sanctions du bot',
  },
};

export const LOG_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/**
 * Publie un embed dans le salon de logs de la catégorie, si le module est activé et le salon configuré.
 * Ne lève jamais d'erreur : un log impossible ne doit pas perturber le reste du bot.
 */
export async function sendLog(guild: Guild, category: LogCategory, embed: EmbedBuilder): Promise<void> {
  try {
    if (!(await isModuleEnabled(guild.id, MODULE_ID))) return;

    const channelId = getLogChannelId(await getLoggingConfig(guild.id), category);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    const me = guild.members.me;
    if (!channel?.isTextBased() || !me) return;
    if (!channel.permissionsFor(me).has(LOG_CHANNEL_PERMISSIONS)) {
      logger.debug({ guildId: guild.id, channelId, category }, 'Permissions insuffisantes dans le salon de logs');
      return;
    }

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn({ err: error, guildId: guild.id, category }, "Échec de l'envoi d'un log");
  }
}

/** Embed de log standard : titre, couleur, auteur et identifiant en pied de page. */
export function logEmbed(title: string, color: number, user?: User | null): EmbedBuilder {
  const embed = baseEmbed(color).setTitle(title);
  if (user) {
    embed
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 64 }) })
      .setFooter({ text: `ID utilisateur : ${user.id}` });
  }
  return embed;
}
