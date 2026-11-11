import { ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder, type Guild } from 'discord.js';
import { getStatusCounts, getSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed } from '../../../core/ui/embeds';
import { STATUS_INFO, SUGGESTION_IDS } from './presenter';

/** Panneau interactif de configuration des suggestions. */
export async function buildSuggestionPanel(guild: Guild) {
  const [config, counts] = await Promise.all([getSuggestionConfig(guild.id), getStatusCounts(guild.id)]);

  const embed = baseEmbed()
    .setTitle('💡 Configuration des suggestions')
    .setDescription(
      'Les membres proposent une idée avec `/suggest`. Elle est publiée dans le salon choisi, où chacun vote avec les boutons. Le staff la traite avec le bouton « Gérer » du message.',
    )
    .addFields(
      {
        name: 'Salon des suggestions',
        value: config.channelId ? `<#${config.channelId}>` : '*non défini — `/suggest` est indisponible*',
        inline: true,
      },
      {
        name: 'Staff',
        value: `Membres ayant \`Gérer le serveur\`${config.staffRoleId ? ` et <@&${config.staffRoleId}>` : ''}`,
        inline: true,
      },
      {
        name: 'Suggestions publiées',
        value: (['PENDING', 'ACCEPTED', 'REFUSED'] as const)
          .map((status) => `${STATUS_INFO[status].emoji} ${STATUS_INFO[status].label} : **${counts[status]}**`)
          .join(' · '),
      },
    );

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId(componentId(SUGGESTION_IDS.channel))
    .setPlaceholder('Salon des suggestions : aucun')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (config.channelId && guild.channels.cache.has(config.channelId)) channelMenu.setDefaultChannels(config.channelId);

  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId(componentId(SUGGESTION_IDS.staffRole))
    .setPlaceholder('Rôle de staff supplémentaire : aucun')
    .setMinValues(0)
    .setMaxValues(1);
  if (config.staffRoleId && guild.roles.cache.has(config.staffRoleId)) roleMenu.setDefaultRoles(config.staffRoleId);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelMenu),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleMenu),
    ],
  };
}
