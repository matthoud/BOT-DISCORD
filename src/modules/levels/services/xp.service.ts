import { PermissionFlagsBits, type GuildMember, type Message, type Role } from 'discord.js';
import type { LevelConfig } from '@prisma/client';
import {
  addMessageXp,
  getLevelConfig,
  setStoredLevel,
} from '../../../core/database/repositories/levels.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { logger } from '../../../core/logger';
import { fillTemplate } from '../../../utils/template';
import { syncRewardRoles } from './rewards.service';
import { formatNumber, levelFromXp, rollXp } from './xp';

export const MODULE_ID = 'levels';

export const LEVEL_UP_VARIABLES = ['{user}', '{username}', '{level}', '{xp}', '{server}'] as const;

/** Dernier message récompensé de chaque membre (clé `serveur:membre`), pour le délai anti-spam. */
const lastGain = new Map<string, number>();
const MAX_COOLDOWN_MS = 3_600_000;

/** Oublie les délais écoulés depuis longtemps. Appelé périodiquement par le planificateur. */
export function sweepXpCooldowns(now = Date.now()): void {
  for (const [key, timestamp] of lastGain) {
    if (now - timestamp > MAX_COOLDOWN_MS) lastGain.delete(key);
  }
}

/** Vrai si le message a été envoyé dans un salon exclu (ou dans un fil d'un salon exclu). */
function isIgnoredChannel(message: Message<true>, config: LevelConfig): boolean {
  if (config.ignoredChannelIds.length === 0) return false;
  const channel = message.channel;
  if (config.ignoredChannelIds.includes(channel.id)) return true;
  return channel.isThread() && channel.parentId !== null && config.ignoredChannelIds.includes(channel.parentId);
}

export function renderLevelUpMessage(
  template: string,
  values: { member: GuildMember; level: number; xp: number },
): string {
  return fillTemplate(template, {
    user: `${values.member}`,
    username: values.member.user.username,
    level: String(values.level),
    xp: formatNumber(values.xp),
    server: values.member.guild.name,
  });
}

async function announceLevelUp(
  message: Message<true>,
  member: GuildMember,
  config: LevelConfig,
  level: number,
  xp: number,
  grantedRoles: Role[],
): Promise<void> {
  if (!config.announceEnabled) return;

  const configured = config.announceChannelId
    ? message.guild.channels.cache.get(config.announceChannelId)
    : undefined;
  // Salon d'annonces supprimé ou non défini : on répond là où le membre vient d'écrire.
  const channel = configured?.isTextBased() ? configured : message.channel;

  const me = message.guild.members.me;
  if (!me) return;
  const needed = channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, needed])) return;

  let content = renderLevelUpMessage(config.levelUpMessage, { member, level, xp });
  if (grantedRoles.length > 0) {
    content += `\n🎁 Rôle obtenu : ${grantedRoles.map((role) => `${role}`).join(', ')}`;
  }
  // Seul le membre concerné peut être mentionné, quel que soit le texte configuré.
  await channel.send({ content: content.slice(0, 2000), allowedMentions: { users: [member.id] } });
}

/** Attribue l'XP d'un message, puis gère le passage de niveau éventuel. */
export async function handleMessageXp(message: Message<true>): Promise<void> {
  if (message.author.bot || message.system || message.webhookId) return;
  const member = message.member;
  if (!member) return;

  const guildId = message.guildId;
  if (!(await isModuleEnabled(guildId, MODULE_ID))) return;

  const config = await getLevelConfig(guildId);
  if (isIgnoredChannel(message, config)) return;
  if (config.ignoredRoleIds.some((roleId) => member.roles.cache.has(roleId))) return;

  const key = `${guildId}:${member.id}`;
  const now = Date.now();
  const previous = lastGain.get(key);
  if (previous !== undefined && now - previous < config.cooldownSeconds * 1000) return;
  // Le délai est posé avant l'écriture en base : deux messages simultanés ne comptent qu'une fois.
  lastGain.set(key, now);

  const experience = await addMessageXp(guildId, member.id, rollXp(config.xpMin, config.xpMax));
  const level = levelFromXp(experience.xp, config);
  if (level === experience.level) return;

  await setStoredLevel(experience.id, level);
  // Niveau en baisse : la courbe a été modifiée par un administrateur, il n'y a rien à annoncer.
  if (level < experience.level) return;

  const grantedRoles = await syncRewardRoles(member, level, config.stackRewards);
  try {
    await announceLevelUp(message, member, config, level, experience.xp, grantedRoles);
  } catch (error) {
    logger.warn({ err: error, guildId }, "Échec de l'annonce d'un passage de niveau");
  }
}
