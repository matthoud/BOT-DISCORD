import {
  PermissionFlagsBits,
  type EmbedBuilder,
  type Guild,
  type GuildTextBasedChannel,
  type User,
} from 'discord.js';
import { permissionNames } from '../../../core/permissions/names';
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

export type LogTarget =
  | { ok: true; channel: GuildTextBasedChannel }
  /** `configured` est faux quand aucun salon n'est choisi : ce n'est pas une anomalie. */
  | { ok: false; configured: boolean; reason: string };

/** Détermine où publier les logs d'une catégorie, ou pourquoi c'est impossible. */
export async function resolveLogTarget(guild: Guild, category: LogCategory): Promise<LogTarget> {
  if (!(await isModuleEnabled(guild.id, MODULE_ID))) {
    return { ok: false, configured: false, reason: 'le module Logs est désactivé (`/module enable`)' };
  }

  const channelId = getLogChannelId(await getLoggingConfig(guild.id), category);
  if (!channelId) return { ok: false, configured: false, reason: 'aucun salon choisi' };

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) {
    return { ok: false, configured: true, reason: `le salon configuré (<#${channelId}>) n'existe plus` };
  }

  const me = guild.members.me ?? (await guild.members.fetchMe());
  const missing = channel.permissionsFor(me).missing(LOG_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    const names = permissionNames(missing.map((name) => PermissionFlagsBits[name]))
      .map((name) => `\`${name}\``)
      .join(', ');
    return { ok: false, configured: true, reason: `il me manque ${names} dans ${channel}` };
  }
  return { ok: true, channel };
}

/**
 * Publie un embed dans le salon de logs de la catégorie, si le module est activé et le salon configuré.
 * Ne lève jamais d'erreur : un log impossible ne doit pas perturber le reste du bot.
 */
export async function sendLog(guild: Guild, category: LogCategory, embed: EmbedBuilder): Promise<void> {
  try {
    const target = await resolveLogTarget(guild, category);
    if (!target.ok) {
      // Un salon configuré mais inutilisable est une anomalie que l'administrateur doit pouvoir voir.
      if (target.configured) {
        logger.warn({ guildId: guild.id, category, reason: target.reason }, 'Log non publié');
      }
      return;
    }
    await target.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
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
