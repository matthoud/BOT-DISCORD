import type { CaseType, ModerationCase } from '@prisma/client';
import type { Guild, GuildMember, User } from 'discord.js';
import { getGuildConfig } from '../../../core/database/repositories/guild.repository';
import {
  createCase,
  resolvePendingBans,
} from '../../../core/database/repositories/moderation.repository';
import { acceptsDirectMessages } from '../../../core/database/repositories/user.repository';
import { appEvents } from '../../../core/events/bus';
import { logger } from '../../../core/logger';
import { baseEmbed } from '../../../core/ui/embeds';
import { formatDuration } from '../../../utils/duration';
import { auditReason } from '../../../utils/interaction';
import { buildCaseEmbed, CASE_STYLES } from './case.presenter';

/** Durée maximale d'un timeout imposée par Discord : 28 jours. */
export const MAX_TIMEOUT_SECONDS = 28 * 86_400;
/** Durée maximale d'un bannissement temporaire : 1 an. */
export const MAX_TEMPBAN_SECONDS = 365 * 86_400;

export interface ActionContext {
  guild: Guild;
  /** Auteur de l'action (un modérateur, ou le bot pour une sanction automatique). */
  moderator: User;
  target: User;
  reason: string;
}

export interface ActionResult {
  moderationCase: ModerationCase;
  /** Le membre a-t-il été prévenu par message privé ? */
  notified: boolean;
}

/** Enregistre le cas en base, le journalise et le publie aux autres modules. */
export async function recordCase(
  context: ActionContext,
  type: CaseType,
  extra: { duration?: number; expiresAt?: Date; resolved?: boolean } = {},
): Promise<ModerationCase> {
  const moderationCase = await createCase({
    guildId: context.guild.id,
    type,
    targetId: context.target.id,
    targetTag: context.target.tag,
    moderatorId: context.moderator.id,
    reason: context.reason,
    ...extra,
  });

  logger.info(
    {
      guildId: context.guild.id,
      caseNumber: moderationCase.caseNumber,
      type,
      targetId: context.target.id,
      moderatorId: context.moderator.id,
    },
    'Action de modération enregistrée',
  );

  appEvents.emit('moderationCase', {
    guild: context.guild,
    moderationCase,
    embed: buildCaseEmbed(moderationCase),
  });
  return moderationCase;
}

/**
 * Prévient le membre par message privé, si le serveur et le membre l'acceptent.
 * N'échoue jamais : un MP impossible (MP fermés) retourne simplement `false`.
 */
export async function notifyTarget(
  context: ActionContext,
  type: CaseType,
  durationSeconds?: number,
): Promise<boolean> {
  if (context.target.bot) return false;
  try {
    const [guildConfig, accepts] = await Promise.all([
      getGuildConfig(context.guild.id),
      acceptsDirectMessages(context.target.id),
    ]);
    if (!guildConfig.dmOnSanction || !accepts) return false;

    const style = CASE_STYLES[type];
    const embed = baseEmbed(style.color)
      .setTitle(`${style.emoji} ${style.label}`)
      .setDescription(`Vous avez été **${style.verb}** sur le serveur **${context.guild.name}**.`)
      .addFields({ name: 'Raison', value: context.reason.slice(0, 1024) });
    if (durationSeconds) {
      embed.addFields({ name: 'Durée', value: formatDuration(durationSeconds) });
    }

    await context.target.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

export async function banUser(
  context: ActionContext,
  options: { durationSeconds?: number; deleteMessageSeconds?: number } = {},
): Promise<ActionResult> {
  // Le MP doit partir avant le bannissement : ensuite, le bot ne partage plus de serveur avec le membre.
  const notified = await notifyTarget(context, 'BAN', options.durationSeconds);
  await context.guild.bans.create(context.target.id, {
    reason: auditReason(context.moderator.tag, context.reason),
    deleteMessageSeconds: options.deleteMessageSeconds ?? 0,
  });

  // Un nouveau bannissement remplace tout bannissement temporaire encore en attente.
  await resolvePendingBans(context.guild.id, context.target.id);
  const moderationCase = await recordCase(
    context,
    'BAN',
    options.durationSeconds
      ? {
          duration: options.durationSeconds,
          expiresAt: new Date(Date.now() + options.durationSeconds * 1000),
          resolved: false,
        }
      : {},
  );
  return { moderationCase, notified };
}

export async function unbanUser(context: ActionContext): Promise<ActionResult> {
  await context.guild.bans.remove(
    context.target.id,
    auditReason(context.moderator.tag, context.reason),
  );
  await resolvePendingBans(context.guild.id, context.target.id);
  const moderationCase = await recordCase(context, 'UNBAN');
  return { moderationCase, notified: false };
}

export async function kickMember(
  context: ActionContext,
  member: GuildMember,
): Promise<ActionResult> {
  const notified = await notifyTarget(context, 'KICK');
  await member.kick(auditReason(context.moderator.tag, context.reason));
  const moderationCase = await recordCase(context, 'KICK');
  return { moderationCase, notified };
}

export async function timeoutMember(
  context: ActionContext,
  member: GuildMember,
  durationSeconds: number,
): Promise<ActionResult> {
  await member.timeout(durationSeconds * 1000, auditReason(context.moderator.tag, context.reason));
  const moderationCase = await recordCase(context, 'TIMEOUT', {
    duration: durationSeconds,
    expiresAt: new Date(Date.now() + durationSeconds * 1000),
  });
  const notified = await notifyTarget(context, 'TIMEOUT', durationSeconds);
  return { moderationCase, notified };
}

export async function removeTimeout(
  context: ActionContext,
  member: GuildMember,
): Promise<ActionResult> {
  await member.timeout(null, auditReason(context.moderator.tag, context.reason));
  const moderationCase = await recordCase(context, 'UNTIMEOUT');
  return { moderationCase, notified: false };
}
