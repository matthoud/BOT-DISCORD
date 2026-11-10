import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  type Guild,
} from 'discord.js';
import { getWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { truncate } from '../../../utils/format';
import { TEMPLATE_VARIABLES } from './template';

export const WELCOME_IDS = {
  channel: 'welcome:channel',
  role: 'welcome:role',
  toggle: 'welcome:toggle',
  edit: 'welcome:edit',
  modal: 'welcome:modal',
  test: 'welcome:test',
} as const;

/** Les deux messages configurables. */
export type MessageKind = 'welcome' | 'leave';

/** Panneau interactif de configuration du système de bienvenue. */
export async function buildWelcomePanel(guild: Guild) {
  const config = await getWelcomeConfig(guild.id);

  const embed = baseEmbed(config.enabled ? Colors.success : Colors.neutral)
    .setTitle('👋 Configuration de la bienvenue')
    .setDescription(
      `Variables utilisables dans les messages : ${TEMPLATE_VARIABLES.map((name) => `\`${name}\``).join(' ')}`,
    )
    .addFields(
      { name: 'Système', value: config.enabled ? '🟢 Activé' : '🔴 Désactivé', inline: true },
      { name: 'Salon', value: config.channelId ? `<#${config.channelId}>` : '*non défini*', inline: true },
      {
        name: 'Rôle automatique',
        value: config.autoRoleId ? `<@&${config.autoRoleId}>` : '*aucun*',
        inline: true,
      },
      { name: 'Message de bienvenue', value: truncate(config.welcomeMessage, 1024) },
      {
        name: `Message de départ (${config.leaveEnabled ? 'activé' : 'désactivé'})`,
        value: truncate(config.leaveMessage, 1024),
      },
    );

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId(componentId(WELCOME_IDS.channel))
    .setPlaceholder('Salon de bienvenue')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (config.channelId && guild.channels.cache.has(config.channelId)) {
    channelMenu.setDefaultChannels(config.channelId);
  }

  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId(componentId(WELCOME_IDS.role))
    .setPlaceholder('Rôle automatique : aucun')
    .setMinValues(0)
    .setMaxValues(1);
  if (config.autoRoleId && guild.roles.cache.has(config.autoRoleId)) {
    roleMenu.setDefaultRoles(config.autoRoleId);
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId(WELCOME_IDS.toggle, 'welcome'))
      .setLabel(config.enabled ? 'Désactiver' : 'Activer')
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(componentId(WELCOME_IDS.edit, 'welcome'))
      .setLabel('Message de bienvenue')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(WELCOME_IDS.edit, 'leave'))
      .setLabel('Message de départ')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(WELCOME_IDS.toggle, 'leave'))
      .setLabel(config.leaveEnabled ? 'Couper les départs' : 'Activer les départs')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(componentId(WELCOME_IDS.test))
      .setLabel('Aperçu')
      .setEmoji('👀')
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelMenu),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleMenu),
      buttons,
    ],
  };
}
