import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import { componentId } from '../../../core/ui/customId';
import type { ComponentHandler } from '../../../types';
import { applyStaffAction, isStaffAction } from '../services/decision.service';
import { SUGGESTION_IDS, SUGGESTION_LIMITS } from '../services/presenter';
import { isSuggestionStaff, requireSuggestion } from '../services/suggestion.service';

const MODAL_TITLES = {
  accept: 'Accepter la suggestion',
  refuse: 'Refuser la suggestion',
  reply: 'Répondre à la suggestion',
} as const;

/** Actions du staff sur une suggestion. Le droit est vérifié ici, comme pour le bouton « Gérer ». */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.action,

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const config = await getSuggestionConfig(interaction.guildId);
    if (!isSuggestionStaff(interaction.member, config)) {
      throw new BotError('Seul le staff peut traiter les suggestions.');
    }
    const action = args[1];
    if (!isStaffAction(action)) throw new BotError('Action inconnue.');
    const suggestion = await requireSuggestion(interaction.guildId, args[0]);

    // Rouvrir ne demande aucun commentaire : l'action est appliquée directement.
    if (action === 'reopen') {
      await interaction.deferUpdate();
      const embed = await applyStaffAction(interaction.guild, suggestion.id, interaction.user.id, action, null);
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    const isReply = action === 'reply';
    const input = new TextInputBuilder()
      .setCustomId('response')
      .setLabel(isReply ? 'Votre réponse' : 'Commentaire (facultatif)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(SUGGESTION_LIMITS.responseLength)
      .setRequired(isReply);
    // Une réponse existante est proposée à la modification.
    if (isReply && suggestion.staffResponse) input.setValue(suggestion.staffResponse);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(componentId(SUGGESTION_IDS.decide, String(suggestion.id), action))
        .setTitle(MODAL_TITLES[action])
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
    );
  },
};

export default handler;
