import { MessageFlags } from 'discord.js';
import { getPollResults, togglePollVote } from '../../../core/database/repositories/polls.repository';
import { BotError } from '../../../core/errors/BotError';
import { infoEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler } from '../../../types';
import { requirePoll } from '../services/poll.service';
import { buildPollButtons, buildPollEmbed, describeChoices, POLL_IDS } from '../services/presenter';

/** Boutons de réponse d'un sondage. Ouverts à tous les membres. */
const handler: ComponentHandler = {
  id: POLL_IDS.vote,

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const poll = await requirePoll(interaction.guildId, args[0]);
    const optionId = Number(args[1]);
    if (!Number.isSafeInteger(optionId)) throw new BotError('Réponse inconnue.');

    // Refuse le vote si le sondage vient de se terminer, et applique la règle du choix unique.
    const choices = await togglePollVote(poll.id, optionId, interaction.user.id);

    await interaction.update({
      embeds: [buildPollEmbed(poll, await getPollResults(poll.id))],
      components: buildPollButtons(poll),
    });
    // Le message est commun à tous : chacun reçoit en privé le rappel de son propre vote.
    await interaction.followUp({
      embeds: [infoEmbed('🗳️ Vote enregistré', describeChoices(poll, choices))],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default handler;
