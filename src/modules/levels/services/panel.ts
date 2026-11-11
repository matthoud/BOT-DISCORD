import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  type Guild,
} from 'discord.js';
import { getLevelConfig, listLevelRewards } from '../../../core/database/repositories/levels.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed } from '../../../core/ui/embeds';
import { formatDuration } from '../../../utils/duration';
import { truncate } from '../../../utils/format';
import { formatNumber, totalXpForLevel, xpToNextLevel } from './xp';
import { LEVEL_UP_VARIABLES } from './xp.service';

export const LEVEL_IDS = {
  edit: 'levels:edit',
  modal: 'levels:modal',
  toggle: 'levels:toggle',
  announceChannel: 'levels:announce-channel',
  ignoredChannels: 'levels:ignored-channels',
  ignoredRoles: 'levels:ignored-roles',
} as const;

/** Réglages modifiables par un formulaire. */
export type EditKind = 'xp' | 'curve' | 'message';
export type ToggleKind = 'announce' | 'stack';

const mentions = (ids: string[], prefix: '#' | '@&'): string =>
  ids.length > 0 ? truncate(ids.map((id) => `<${prefix}${id}>`).join(' '), 1024) : '*aucun*';

/** Panneau interactif de configuration du système de niveaux. */
export async function buildLevelPanel(guild: Guild) {
  const [config, rewards] = await Promise.all([getLevelConfig(guild.id), listLevelRewards(guild.id)]);

  const curveExamples = [1, 5, 10, 20]
    .map((level) => `niveau ${level} : ${formatNumber(totalXpForLevel(level, config))} XP`)
    .join(' · ');

  const embed = baseEmbed()
    .setTitle('⭐ Configuration des niveaux')
    .setDescription(
      `Les membres gagnent de l'XP en envoyant des messages. Les rôles de récompense se gèrent avec \`/level rewards\` (${rewards.length} défini(s)).`,
    )
    .addFields(
      {
        name: "Gains d'XP",
        value: `Entre **${config.xpMin}** et **${config.xpMax}** XP par message\nDélai entre deux gains : **${config.cooldownSeconds === 0 ? 'aucun' : formatDuration(config.cooldownSeconds)}**`,
        inline: true,
      },
      {
        name: 'Niveaux',
        value: `Niveau suivant : **${config.levelBase}** XP, puis **+${config.levelStep}** par niveau\n(niveau 1 → 2 : ${formatNumber(xpToNextLevel(1, config))} XP)`,
        inline: true,
      },
      { name: 'XP total nécessaire', value: curveExamples },
      {
        name: `Annonces de niveau (${config.announceEnabled ? 'activées' : 'désactivées'})`,
        value: `Salon : ${config.announceChannelId ? `<#${config.announceChannelId}>` : '*celui où le membre écrit*'}\nMessage : ${truncate(config.levelUpMessage, 600)}\nVariables : ${LEVEL_UP_VARIABLES.map((name) => `\`${name}\``).join(' ')}`,
      },
      {
        name: 'Rôles de récompense',
        value: config.stackRewards
          ? 'Cumulés : le membre garde les rôles des paliers précédents.'
          : 'Remplacés : seul le rôle du palier le plus élevé est conservé.',
      },
      { name: 'Salons sans XP', value: mentions(config.ignoredChannelIds, '#'), inline: true },
      { name: 'Rôles sans XP', value: mentions(config.ignoredRoleIds, '@&'), inline: true },
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId(LEVEL_IDS.edit, 'xp'))
      .setLabel("Gains d'XP")
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(LEVEL_IDS.edit, 'curve'))
      .setLabel('Niveaux')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(LEVEL_IDS.edit, 'message'))
      .setLabel('Message')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(LEVEL_IDS.toggle, 'announce'))
      .setLabel(config.announceEnabled ? 'Couper les annonces' : 'Activer les annonces')
      .setStyle(config.announceEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(componentId(LEVEL_IDS.toggle, 'stack'))
      .setLabel(config.stackRewards ? 'Remplacer les rôles' : 'Cumuler les rôles')
      .setStyle(ButtonStyle.Secondary),
  );

  const announceMenu = new ChannelSelectMenuBuilder()
    .setCustomId(componentId(LEVEL_IDS.announceChannel))
    .setPlaceholder('Salon des annonces : celui où le membre écrit')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);
  if (config.announceChannelId && guild.channels.cache.has(config.announceChannelId)) {
    announceMenu.setDefaultChannels(config.announceChannelId);
  }

  const ignoredChannelsMenu = new ChannelSelectMenuBuilder()
    .setCustomId(componentId(LEVEL_IDS.ignoredChannels))
    .setPlaceholder('Salons sans XP : aucun')
    .setChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildForum,
    )
    .setMinValues(0)
    .setMaxValues(25);
  const knownChannels = config.ignoredChannelIds.filter((id) => guild.channels.cache.has(id));
  if (knownChannels.length > 0) ignoredChannelsMenu.setDefaultChannels(...knownChannels);

  const ignoredRolesMenu = new RoleSelectMenuBuilder()
    .setCustomId(componentId(LEVEL_IDS.ignoredRoles))
    .setPlaceholder('Rôles sans XP : aucun')
    .setMinValues(0)
    .setMaxValues(25);
  const knownRoles = config.ignoredRoleIds.filter((id) => guild.roles.cache.has(id));
  if (knownRoles.length > 0) ignoredRolesMenu.setDefaultRoles(...knownRoles);

  return {
    embeds: [embed],
    components: [
      buttons,
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(announceMenu),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(ignoredChannelsMenu),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(ignoredRolesMenu),
    ],
  };
}
