import type { SanctionAction, SanctionRule } from '@prisma/client';
import type { Guild, GuildMember } from 'discord.js';
import {
  countActiveWarnings,
  findSanctionRule,
} from '../../../core/database/repositories/moderation.repository';
import { logger } from '../../../core/logger';
import { formatDuration } from '../../../utils/duration';
import { banUser, kickMember, timeoutMember, type ActionContext } from './moderation.service';

export const SANCTION_LABELS: Record<SanctionAction, string> = {
  TIMEOUT: 'Exclusion temporaire',
  KICK: 'Expulsion',
  BAN: 'Bannissement',
};

export function describeRule(rule: Pick<SanctionRule, 'action' | 'duration'>): string {
  const duration = rule.duration ? ` de ${formatDuration(rule.duration)}` : '';
  const permanent = rule.action === 'BAN' && !rule.duration ? ' définitif' : '';
  return `${SANCTION_LABELS[rule.action]}${duration}${permanent}`;
}

/**
 * Après un avertissement, applique la sanction configurée pour le nombre d'avertissements atteint.
 * Retourne une phrase décrivant le résultat, ou `null` si aucune règle ne correspond.
 */
export async function applyAutomaticSanction(
  guild: Guild,
  member: GuildMember,
): Promise<string | null> {
  const count = await countActiveWarnings(guild.id, member.id);
  const rule = await findSanctionRule(guild.id, count);
  if (!rule) return null;

  const description = describeRule(rule);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const context: ActionContext = {
    guild,
    moderator: me.user,
    target: member.user,
    reason: `Sanction automatique : ${count} avertissement(s) actif(s)`,
  };

  // `moderatable`, `kickable` et `bannable` tiennent compte des permissions et de la hiérarchie du bot.
  const feasible =
    rule.action === 'TIMEOUT' ? member.moderatable : rule.action === 'KICK' ? member.kickable : member.bannable;
  if (!feasible) {
    return `⚠️ Sanction automatique prévue (${description}) mais impossible : permission manquante ou rôle du membre trop élevé.`;
  }

  try {
    if (rule.action === 'TIMEOUT') {
      await timeoutMember(context, member, rule.duration ?? 3600);
    } else if (rule.action === 'KICK') {
      await kickMember(context, member);
    } else {
      await banUser(context, { durationSeconds: rule.duration ?? undefined });
    }
    return `⚖️ Sanction automatique appliquée : **${description}** (${count} avertissements).`;
  } catch (error) {
    logger.error({ err: error, guildId: guild.id, ruleId: rule.id }, 'Échec d’une sanction automatique');
    return `⚠️ La sanction automatique (${description}) a échoué.`;
  }
}
