import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import type { ComponentHandler } from '../../../types';
import { WELCOME_IDS } from '../services/panel';
import { buildLeaveEmbed, buildWelcomeEmbed } from '../services/welcome.service';

/** Bouton « Aperçu » : montre en privé le rendu des deux messages avec le membre courant. */
const handler: ComponentHandler = {
  id: WELCOME_IDS.test,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isButton()) return;
    const config = await getWelcomeConfig(interaction.guildId);
    await interaction.reply({
      content: 'Aperçu des messages tels qu’ils apparaîtront dans le salon :',
      embeds: [
        buildWelcomeEmbed(config, interaction.member),
        buildLeaveEmbed(config, interaction.member),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default handler;
