import { PermissionFlagsBits } from 'discord.js';
import type { IncidentStatus } from '@prisma/client';
import { setIncidentStatus } from '../../../core/database/repositories/security.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { buildIncidentButtons, buildIncidentEmbed } from '../services/alerts';

const STATUSES: IncidentStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED'];

/** Suivi d'un incident depuis son alerte ou sa fiche : traité, fausse alerte ou rouvert. */
const handler: ComponentHandler = {
  id: 'security:incident',
  userPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const number = Number(args[0]);
    const status = args[1] as IncidentStatus;
    if (!Number.isSafeInteger(number) || !STATUSES.includes(status))
      throw new BotError('Action inconnue.');
    const incident = await setIncidentStatus(
      interaction.guildId,
      number,
      status,
      interaction.user.id,
      null,
    );
    if (!incident) throw new BotError("Cet incident n'existe plus.");
    await interaction.update({
      embeds: [buildIncidentEmbed(incident)],
      components: buildIncidentButtons(incident),
      allowedMentions: { parse: [] },
    });
  },
};

export default handler;
