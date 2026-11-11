import { MessageFlags } from 'discord.js';
import {
  createSuggestion,
  deleteSuggestion,
  getSuggestionConfig,
  setSuggestionMessage,
} from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import { successEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler } from '../../../types';
import {
  buildSuggestionButtons,
  buildSuggestionEmbed,
  SUGGESTION_IDS,
  SUGGESTION_LIMITS,
} from '../services/presenter';
import { resolveSuggestionChannel } from '../services/suggestion.service';

/** Validation du formulaire de `/suggest` : enregistre la suggestion et la publie. Ouvert à tous. */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.submit,

  async execute(interaction) {
    if (!interaction.isModalSubmit()) return;
    const content = interaction.fields.getTextInputValue('content').trim();
    if (content.length < SUGGESTION_LIMITS.minLength) {
      throw new BotError(`Votre suggestion doit contenir au moins ${SUGGESTION_LIMITS.minLength} caractères.`);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await resolveSuggestionChannel(interaction.guild, await getSuggestionConfig(interaction.guildId));
    const suggestion = { ...(await createSuggestion(interaction.guildId, interaction.user.id, content)), up: 0, down: 0 };

    let message;
    try {
      message = await channel.send({
        embeds: [buildSuggestionEmbed(suggestion, interaction.user)],
        components: [buildSuggestionButtons(suggestion)],
        // Le texte d'une suggestion ne doit jamais pouvoir mentionner qui que ce soit.
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      // Rien n'a été publié : la suggestion n'est pas conservée.
      await deleteSuggestion(suggestion.id);
      throw error;
    }
    await setSuggestionMessage(suggestion.id, channel.id, message.id);

    await interaction.editReply({
      embeds: [successEmbed(`Votre suggestion n°${suggestion.number} est publiée dans ${channel}. [Voir le message](${message.url})`)],
    });
  },
};

export default handler;
