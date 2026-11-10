import type { WelcomeConfig } from '@prisma/client';
import {
  PermissionFlagsBits,
  type EmbedBuilder,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { getWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import { logger } from '../../../core/logger';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { renderTemplate } from './template';

export const MODULE_ID = 'welcome';

type AnyMember = GuildMember | PartialGuildMember;

function render(template: string, member: AnyMember): string {
  return renderTemplate(template, {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  }).slice(0, 4096);
}

export function buildWelcomeEmbed(config: WelcomeConfig, member: AnyMember): EmbedBuilder {
  return baseEmbed(Colors.success)
    .setTitle('👋 Bienvenue !')
    .setDescription(render(config.welcomeMessage, member))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

export function buildLeaveEmbed(config: WelcomeConfig, member: AnyMember): EmbedBuilder {
  return baseEmbed(Colors.neutral)
    .setTitle('👋 Au revoir')
    .setDescription(render(config.leaveMessage, member))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

/** Configuration active du serveur, ou `null` si le module ou le système est désactivé. */
async function getActiveConfig(guild: Guild): Promise<WelcomeConfig | null> {
  if (!(await isModuleEnabled(guild.id, MODULE_ID))) return null;
  const config = await getWelcomeConfig(guild.id);
  return config.enabled ? config : null;
}

async function sendToWelcomeChannel(
  guild: Guild,
  config: WelcomeConfig,
  embed: EmbedBuilder,
  mention?: string,
): Promise<void> {
  if (!config.channelId) return;
  const channel = guild.channels.cache.get(config.channelId);
  const me = guild.members.me;
  if (!channel?.isTextBased() || !me) return;

  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  if (!channel.permissionsFor(me).has(required)) {
    logger.debug({ guildId: guild.id, channelId: channel.id }, 'Permissions insuffisantes dans le salon de bienvenue');
    return;
  }
  await channel.send({ content: mention, embeds: [embed] });
}

/** Attribue le rôle automatique, si le bot en a la possibilité. */
async function assignAutoRole(member: GuildMember, config: WelcomeConfig): Promise<void> {
  if (!config.autoRoleId || member.user.bot) return;
  const role = member.guild.roles.cache.get(config.autoRoleId);
  const me = member.guild.members.me;
  if (!role || !me) return;

  const canAssign =
    !role.managed &&
    me.permissions.has(PermissionFlagsBits.ManageRoles) &&
    me.roles.highest.comparePositionTo(role) > 0;
  if (!canAssign) {
    logger.debug({ guildId: member.guild.id, roleId: role.id }, 'Rôle automatique non attribuable par le bot');
    return;
  }
  await member.roles.add(role, 'Rôle automatique à l’arrivée');
}

export async function handleMemberJoin(member: GuildMember): Promise<void> {
  const config = await getActiveConfig(member.guild);
  if (!config) return;

  // Les deux actions sont indépendantes : l'échec de l'une ne doit pas empêcher l'autre.
  const results = await Promise.allSettled([
    sendToWelcomeChannel(
      member.guild,
      config,
      buildWelcomeEmbed(config, member),
      config.welcomeMessage.includes('{user}') ? `${member}` : undefined,
    ),
    assignAutoRole(member, config),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason, guildId: member.guild.id }, "Échec d'une action de bienvenue");
    }
  }
}

export async function handleMemberLeave(member: AnyMember): Promise<void> {
  if (member.id === member.client.user.id) return;
  const config = await getActiveConfig(member.guild);
  if (!config?.leaveEnabled) return;
  await sendToWelcomeChannel(member.guild, config, buildLeaveEmbed(config, member));
}
