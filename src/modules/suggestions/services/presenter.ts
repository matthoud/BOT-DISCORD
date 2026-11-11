import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder, type User } from 'discord.js';
import type { SuggestionStatus } from '@prisma/client';
import type { SuggestionWithVotes, VoteCounts } from '../../../core/database/repositories/suggestions.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { truncate } from '../../../utils/format';

export const MODULE_ID = 'suggestions';

export const SUGGESTION_IDS = {
  submit: 'suggestions:submit',
  vote: 'suggestions:vote',
  manage: 'suggestions:manage',
  action: 'suggestions:action',
  decide: 'suggestions:decide',
  channel: 'suggestions:channel',
  staffRole: 'suggestions:staff-role',
} as const;

export const SUGGESTION_LIMITS = { minLength: 10, maxLength: 1500, responseLength: 1000 } as const;

export const STATUS_INFO: Record<SuggestionStatus, { label: string; emoji: string; color: number }> = {
  PENDING: { label: 'En attente', emoji: '🕓', color: Colors.primary },
  ACCEPTED: { label: 'Acceptée', emoji: '✅', color: Colors.success },
  REFUSED: { label: 'Refusée', emoji: '❌', color: Colors.error },
};

/** Résumé des votes : « 👍 5 · 👎 2 — 71 % favorables ». */
export function describeVotes(votes: VoteCounts): string {
  const total = votes.up + votes.down;
  const summary = `👍 ${votes.up} · 👎 ${votes.down}`;
  if (total === 0) return `${summary} — aucun vote`;
  return `${summary} — ${Math.round((votes.up / total) * 100)} % favorables`;
}

/** Lien direct vers le message public d'une suggestion, s'il existe. */
export function suggestionUrl(suggestion: { guildId: string; channelId: string | null; messageId: string | null }): string | null {
  if (!suggestion.channelId || !suggestion.messageId) return null;
  return `https://discord.com/channels/${suggestion.guildId}/${suggestion.channelId}/${suggestion.messageId}`;
}

/** Embed public d'une suggestion. `author` est absent si le membre a quitté Discord. */
export function buildSuggestionEmbed(suggestion: SuggestionWithVotes, author: User | null): EmbedBuilder {
  const status = STATUS_INFO[suggestion.status];
  const embed = baseEmbed(status.color)
    .setTitle(`💡 Suggestion n°${suggestion.number}`)
    .setDescription(suggestion.content)
    .setTimestamp(suggestion.createdAt)
    .addFields(
      { name: 'Statut', value: `${status.emoji} ${status.label}`, inline: true },
      { name: 'Votes', value: describeVotes(suggestion), inline: true },
    );

  if (author) {
    embed.setAuthor({ name: author.displayName, iconURL: author.displayAvatarURL({ size: 64 }) });
  }
  embed.setFooter({ text: `Proposée par ${author?.username ?? 'un ancien membre'}` });

  if (suggestion.staffId && (suggestion.staffResponse || suggestion.status !== 'PENDING')) {
    const heading =
      suggestion.status === 'ACCEPTED'
        ? 'Acceptée par le staff'
        : suggestion.status === 'REFUSED'
          ? 'Refusée par le staff'
          : 'Réponse du staff';
    embed.addFields({
      name: heading,
      value: truncate(`${suggestion.staffResponse ?? '*Aucun commentaire.*'}\n— <@${suggestion.staffId}>`, 1024),
    });
  }
  return embed;
}

/** Boutons du message public : votes (fermés une fois la décision rendue) et gestion par le staff. */
export function buildSuggestionButtons(suggestion: SuggestionWithVotes): ActionRowBuilder<ButtonBuilder> {
  const closed = suggestion.status !== 'PENDING';
  const id = String(suggestion.id);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId(SUGGESTION_IDS.vote, id, 'up'))
      .setEmoji('👍')
      .setLabel(String(suggestion.up))
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(componentId(SUGGESTION_IDS.vote, id, 'down'))
      .setEmoji('👎')
      .setLabel(String(suggestion.down))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(componentId(SUGGESTION_IDS.manage, id))
      .setEmoji('⚙️')
      .setLabel('Gérer')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Ligne de liste : numéro, statut, votes, auteur, extrait et lien. */
export function describeSuggestionLine(suggestion: SuggestionWithVotes): string {
  const status = STATUS_INFO[suggestion.status];
  const url = suggestionUrl(suggestion);
  const excerpt = truncate(suggestion.content.replace(/\s+/g, ' '), 110);
  return `**n°${suggestion.number}** · ${status.emoji} ${status.label} · 👍 ${suggestion.up} 👎 ${suggestion.down} · <@${suggestion.authorId}>\n> ${excerpt}${url ? ` [Voir](${url})` : ''}`;
}
