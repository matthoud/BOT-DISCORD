import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { SecurityConfig } from '@prisma/client';

export type ExemptionConfig = Pick<
  SecurityConfig,
  'exemptUserIds' | 'exemptRoleIds' | 'ignoredChannelIds'
>;

/** Salon examiné : un fil hérite de l'exemption de son salon parent. */
export interface ChannelRef {
  id: string;
  parentId?: string | null;
}

/**
 * Vrai si les protections automatiques ne doivent pas viser ce membre dans ce salon :
 * salon ignoré, bot, propriétaire du serveur, administrateur, membre ou rôle exempté.
 */
export function isExempt(
  member: GuildMember | null,
  channel: ChannelRef | null,
  config: ExemptionConfig,
): boolean {
  if (
    channel &&
    [channel.id, channel.parentId].some((id) => id && config.ignoredChannelIds.includes(id))
  ) {
    return true;
  }
  if (!member) return false;
  if (member.user.bot || member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.exemptUserIds.includes(member.id)) return true;
  return member.roles.cache.some((role) => config.exemptRoleIds.includes(role.id));
}
