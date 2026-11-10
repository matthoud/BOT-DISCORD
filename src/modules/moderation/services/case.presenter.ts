import type { CaseType, ModerationCase } from '@prisma/client';
import type { EmbedBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { formatDuration } from '../../../utils/duration';
import { fullTimestamp, timestamp, truncate } from '../../../utils/format';

interface CaseStyle {
  label: string;
  /** Participe utilisé dans les messages privés : « Vous avez été … ». */
  verb: string;
  emoji: string;
  color: number;
}

export const CASE_STYLES: Record<CaseType, CaseStyle> = {
  WARN: { label: 'Avertissement', verb: 'averti(e)', emoji: '⚠️', color: Colors.warning },
  TIMEOUT: { label: 'Exclusion temporaire', verb: 'exclu(e) temporairement', emoji: '🔇', color: Colors.moderation },
  UNTIMEOUT: { label: "Fin d'exclusion", verb: 'réintégré(e)', emoji: '🔊', color: Colors.success },
  KICK: { label: 'Expulsion', verb: 'expulsé(e)', emoji: '👢', color: Colors.moderation },
  BAN: { label: 'Bannissement', verb: 'banni(e)', emoji: '🔨', color: Colors.error },
  UNBAN: { label: 'Débannissement', verb: 'débanni(e)', emoji: '🕊️', color: Colors.success },
  CLEAR_WARNINGS: { label: 'Avertissements effacés', verb: 'blanchi(e)', emoji: '🧹', color: Colors.info },
};

/** Embed détaillé d'un cas, utilisé pour la réponse au modérateur et pour le salon de logs. */
export function buildCaseEmbed(moderationCase: ModerationCase): EmbedBuilder {
  const style = CASE_STYLES[moderationCase.type];
  const embed = baseEmbed(style.color)
    .setTitle(`${style.emoji} ${style.label} — Cas n°${moderationCase.caseNumber}`)
    .addFields(
      {
        name: 'Membre',
        value: `<@${moderationCase.targetId}>\n${moderationCase.targetTag} (\`${moderationCase.targetId}\`)`,
        inline: true,
      },
      { name: 'Modérateur', value: `<@${moderationCase.moderatorId}>`, inline: true },
      { name: 'Raison', value: truncate(moderationCase.reason, 1024) },
    )
    .setTimestamp(moderationCase.createdAt);

  if (moderationCase.duration) {
    embed.addFields({
      name: 'Durée',
      value: moderationCase.expiresAt
        ? `${formatDuration(moderationCase.duration)} — fin ${timestamp(moderationCase.expiresAt, 'R')}`
        : formatDuration(moderationCase.duration),
    });
  }
  return embed;
}

/** Ligne compacte pour l'historique paginé. */
export function formatCaseLine(moderationCase: ModerationCase): string {
  const style = CASE_STYLES[moderationCase.type];
  const duration = moderationCase.duration ? ` (${formatDuration(moderationCase.duration)})` : '';
  return [
    `${style.emoji} **Cas n°${moderationCase.caseNumber} — ${style.label}**${duration}`,
    `Par <@${moderationCase.moderatorId}> • ${fullTimestamp(moderationCase.createdAt)}`,
    `> ${truncate(moderationCase.reason, 300)}`,
  ].join('\n');
}
