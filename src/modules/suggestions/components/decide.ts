import { MessageFlags } from 'discord.js';
import { getSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { applyStaffAction, isStaffAction } from '../services/decision.service';
import { SUGGESTION_IDS } from '../services/presenter';
import { isSuggestionStaff, requireSuggestion } from '../services/suggestion.service';

/** Validation du formulaire de décision ou de réponse du staff. */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.decide,

  async execute(interaction, args) {
    if (!interaction.isModalSubmit()) return;
    const config = await getSuggestionConfig(interaction.guildId);
    if (!isSuggestionStaff(interaction.member, config)) {
      throw new BotError('Seul le staff peut traiter les suggestions.');
    }
    const action = args[1];
    if (!isStaffAction(action) || action === 'reopen') throw new BotError('Action inconnue.');
    const suggestion = await requireSuggestion(interaction.guildId, args[0]);

    const response = interaction.fields.getTextInputValue('response').trim() || null;
    if (action === 'reply' && !response) throw new BotError('La réponse ne peut pas être vide.');

    // Ouvert depuis le message privé de gestion : il est remplacé par le compte rendu.
    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = await applyStaffAction(interaction.guild, suggestion.id, interaction.user.id, action, response);
    await interaction.editReply({ embeds: [embed], components: [] });
  },
};

export default handler;
