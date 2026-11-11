import { MessageFlags } from 'discord.js';
import { getParticipation, setParticipation } from '../../../core/database/repositories/events.repository';
import { infoEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler } from '../../../types';
import { requireEvent } from '../services/event.service';
import { buildEventButtons, buildEventEmbed, EVENT_IDS } from '../services/presenter';

/** Boutons « Je participe » / « Je ne participe pas » d'un événement. Ouverts à tous les membres. */
const handler: ComponentHandler = {
  id: EVENT_IDS.rsvp,

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const event = await requireEvent(interaction.guildId, args[0]);
    const wanted = args[1] === 'declined' ? 'DECLINED' : 'GOING';

    // Refuse la réponse si l'événement a commencé ou s'il est complet.
    const status = await setParticipation(event.id, interaction.user.id, wanted);

    const participation = await getParticipation(event.id);
    await interaction.update({
      embeds: [buildEventEmbed(event, participation)],
      components: buildEventButtons(event, participation),
    });

    const summary =
      status === 'GOING'
        ? `Vous participez à **${event.title}**.${event.reminderAt ? ' Vous serez mentionné lors du rappel.' : ''}`
        : status === 'DECLINED'
          ? `Vous avez indiqué ne pas participer à **${event.title}**.`
          : `Votre réponse à **${event.title}** a été retirée.`;
    await interaction.followUp({ embeds: [infoEmbed('📅 Réponse enregistrée', summary)], flags: MessageFlags.Ephemeral });
  },
};

export default handler;
