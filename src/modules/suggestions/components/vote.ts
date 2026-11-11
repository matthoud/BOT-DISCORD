import { castVote } from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { buildSuggestionButtons, buildSuggestionEmbed, SUGGESTION_IDS } from '../services/presenter';
import { fetchAuthor, requireSuggestion } from '../services/suggestion.service';

/** Boutons 👍 / 👎 : un vote par membre, modifiable tant que la suggestion est en attente. Ouvert à tous. */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.vote,

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const suggestion = await requireSuggestion(interaction.guildId, args[0]);
    if (suggestion.status !== 'PENDING') {
      throw new BotError('Les votes sont clos : cette suggestion a déjà reçu une décision.');
    }

    await castVote(suggestion.id, interaction.user.id, args[1] === 'down' ? -1 : 1);
    const updated = await requireSuggestion(interaction.guildId, args[0]);
    await interaction.update({
      embeds: [buildSuggestionEmbed(updated, await fetchAuthor(interaction.guild, updated.authorId))],
      components: [buildSuggestionButtons(updated)],
    });
  },
};

export default handler;
