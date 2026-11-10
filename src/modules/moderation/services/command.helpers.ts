import type { ChatInputCommandInteraction, SlashCommandStringOption } from 'discord.js';
import { buildCaseEmbed } from './case.presenter';
import type { ActionContext, ActionResult } from './moderation.service';

/** Option « raison » obligatoire, commune à toutes les actions de modération. */
export const reasonOption = (option: SlashCommandStringOption) =>
  option
    .setName('raison')
    .setDescription("Raison de l'action (enregistrée dans l'historique)")
    .setMinLength(3)
    .setMaxLength(500)
    .setRequired(true);

export function buildContext(
  interaction: ChatInputCommandInteraction<'cached'>,
  target: ActionContext['target'],
): ActionContext {
  return {
    guild: interaction.guild,
    moderator: interaction.user,
    target,
    reason: interaction.options.getString('raison', true).trim(),
  };
}

/** Complète la réponse différée avec l'embed du cas et d'éventuelles notes. */
export async function replyWithCase(
  interaction: ChatInputCommandInteraction<'cached'>,
  result: ActionResult,
  options: { showNotification?: boolean; notes?: string[] } = {},
): Promise<void> {
  const embed = buildCaseEmbed(result.moderationCase);
  const notes = [...(options.notes ?? [])];
  if (options.showNotification ?? true) {
    notes.unshift(
      result.notified ? '📨 Membre prévenu par message privé.' : '📭 Membre non prévenu par message privé.',
    );
  }
  if (notes.length > 0) embed.addFields({ name: 'Informations', value: notes.join('\n') });
  await interaction.editReply({ embeds: [embed] });
}
