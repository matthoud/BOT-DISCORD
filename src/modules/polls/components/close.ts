import { closePoll, getPollResults } from '../../../core/database/repositories/polls.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { canManagePoll, requirePoll } from '../services/poll.service';
import { buildPollButtons, buildPollEmbed, POLL_IDS } from '../services/presenter';

/**
 * Clôture anticipée d'un sondage. Le bouton est visible de tous ; seuls l'auteur du sondage
 * et les modérateurs (« Gérer les messages ») peuvent s'en servir, ce qui est vérifié ici.
 */
const handler: ComponentHandler = {
  id: POLL_IDS.close,

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const poll = await requirePoll(interaction.guildId, args[0]);
    if (!canManagePoll(interaction.member, poll)) {
      throw new BotError('Seuls l’auteur du sondage et les modérateurs peuvent le clore.');
    }

    await closePoll(poll.id);
    const closed = await requirePoll(interaction.guildId, args[0]);
    await interaction.update({
      embeds: [buildPollEmbed(closed, await getPollResults(closed.id))],
      components: buildPollButtons(closed),
    });
  },
};

export default handler;
