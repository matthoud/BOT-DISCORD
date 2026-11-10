import { ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, type Guild } from 'discord.js';
import {
  getLogChannelId,
  getLoggingConfig,
  LOG_CATEGORIES,
} from '../../../core/database/repositories/logging.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed } from '../../../core/ui/embeds';
import { LOG_CATEGORY_INFO } from './log.service';

export const LOG_CHANNEL_SELECT_ID = 'logging:channel';

/** Panneau de configuration des logs : un menu de sélection de salon par catégorie. */
export async function buildLogsPanel(guild: Guild) {
  const config = await getLoggingConfig(guild.id);

  const lines = LOG_CATEGORIES.map((category) => {
    const info = LOG_CATEGORY_INFO[category];
    const channelId = getLogChannelId(config, category);
    return `${info.emoji} **${info.label}** — ${channelId ? `<#${channelId}>` : '*désactivé*'}\n${info.description}`;
  });

  const embed = baseEmbed()
    .setTitle('📜 Configuration des logs')
    .setDescription(
      `Choisissez un salon pour chaque catégorie avec les menus ci-dessous. Videz un menu pour désactiver la catégorie.\n\n${lines.join('\n\n')}`,
    );

  const components = LOG_CATEGORIES.map((category) => {
    const info = LOG_CATEGORY_INFO[category];
    const channelId = getLogChannelId(config, category);
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(componentId(LOG_CHANNEL_SELECT_ID, category))
      .setPlaceholder(`${info.emoji} ${info.label} : aucun salon`)
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(0)
      .setMaxValues(1);
    // Un salon supprimé depuis ne peut pas être présélectionné.
    if (channelId && guild.channels.cache.has(channelId)) menu.setDefaultChannels(channelId);
    return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
  });

  return { embeds: [embed], components };
}
