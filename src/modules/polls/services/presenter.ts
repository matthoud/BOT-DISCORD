import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from 'discord.js';
import type { PollResults, PollWithOptions } from '../../../core/database/repositories/polls.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { timestamp, truncate } from '../../../utils/format';

export const MODULE_ID = 'polls';

export const POLL_IDS = { vote: 'polls:vote', close: 'polls:close' } as const;

export const POLL_LIMITS = {
  questionLength: 250,
  optionLength: 80,
  minOptions: 2,
  maxOptions: 10,
  minDurationSeconds: 60,
  maxDurationSeconds: 30 * 86_400,
  defaultDurationSeconds: 86_400,
  /** Nombre de sondages ouverts en même temps par membre et par serveur. */
  openPerMember: 5,
} as const;

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const BAR_SIZE = 10;
const BUTTONS_PER_ROW = 5;

export const optionEmoji = (position: number): string => NUMBER_EMOJIS[position] ?? '▫️';

/** Vrai si le sondage n'accepte plus de votes. */
export function isPollClosed(poll: Pick<PollWithOptions, 'closedAt' | 'endsAt'>, now = Date.now()): boolean {
  return poll.closedAt !== null || poll.endsAt.getTime() <= now;
}

export function progressBar(ratio: number): string {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * BAR_SIZE);
  return '▰'.repeat(filled) + '▱'.repeat(BAR_SIZE - filled);
}

/**
 * Part d'une réponse dans les votes exprimés. En choix multiple, la somme des parts vaut 100 % :
 * elle se calcule sur le nombre de votes, pas sur le nombre de votants.
 */
export function share(count: number, totalVotes: number): number {
  return totalVotes > 0 ? count / totalVotes : 0;
}

/**
 * Embed d'un sondage. `reveal` force l'affichage des résultats même s'ils sont masqués
 * jusqu'à la clôture (consultation par l'auteur ou le staff).
 */
export function buildPollEmbed(poll: PollWithOptions, results: PollResults, reveal = false): EmbedBuilder {
  const closed = isPollClosed(poll);
  const showResults = closed || reveal || !poll.hideResults;
  const totalVotes = [...results.counts.values()].reduce((sum, count) => sum + count, 0);
  const best = Math.max(0, ...results.counts.values());

  const lines = poll.options.map((option) => {
    const label = `${optionEmoji(option.position)} ${option.label}`;
    if (!showResults) return label;
    const count = results.counts.get(option.id) ?? 0;
    const ratio = share(count, totalVotes);
    const winner = closed && count > 0 && count === best;
    return `${winner ? `**${label}** 🏆` : label}\n${progressBar(ratio)} **${Math.round(ratio * 100)} %** · ${count} vote${count > 1 ? 's' : ''}`;
  });

  const details = [
    poll.multiple ? 'Plusieurs réponses possibles' : 'Une seule réponse possible',
    `${results.voters} votant${results.voters > 1 ? 's' : ''}`,
  ];
  if (!showResults) details.push('résultats affichés à la clôture');

  return baseEmbed(closed ? Colors.neutral : Colors.primary)
    .setTitle(truncate(`📊 ${poll.question}`, 256))
    .setDescription(`${lines.join('\n\n')}\n\n-# Sondage proposé par <@${poll.authorId}>`)
    .addFields({
      name: closed ? 'Sondage terminé' : 'Fin du sondage',
      value: closed
        ? `Clos ${timestamp(poll.closedAt ?? poll.endsAt, 'R')}`
        : `${timestamp(poll.endsAt, 'R')} (${timestamp(poll.endsAt, 'f')})`,
    })
    .setFooter({ text: details.join(' · ') })
    .setTimestamp(poll.createdAt);
}

/** Boutons d'un sondage : un par réponse, puis le bouton de clôture anticipée. Vide une fois clos. */
export function buildPollButtons(poll: PollWithOptions): ActionRowBuilder<ButtonBuilder>[] {
  if (isPollClosed(poll)) return [];
  const id = String(poll.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let start = 0; start < poll.options.length; start += BUTTONS_PER_ROW) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        poll.options.slice(start, start + BUTTONS_PER_ROW).map((option) =>
          new ButtonBuilder()
            .setCustomId(componentId(POLL_IDS.vote, id, String(option.id)))
            .setEmoji(optionEmoji(option.position))
            .setLabel(truncate(option.label, 30))
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(componentId(POLL_IDS.close, id))
        .setEmoji('🔒')
        .setLabel('Clore le sondage')
        .setStyle(ButtonStyle.Danger),
    ),
  );
  return rows;
}

/** Résumé des choix d'un membre, pour la confirmation privée après un clic. */
export function describeChoices(poll: PollWithOptions, optionIds: number[]): string {
  const chosen = poll.options.filter((option) => optionIds.includes(option.id));
  if (chosen.length === 0) return 'Votre vote a été retiré.';
  const labels = chosen.map((option) => `${optionEmoji(option.position)} **${option.label}**`).join(', ');
  return `Votre vote : ${labels}. Recliquez sur une réponse pour la retirer.`;
}
