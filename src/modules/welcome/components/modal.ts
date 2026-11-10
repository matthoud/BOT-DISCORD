import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { updateWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import { BotError } from '../../../core/errors/BotError';
import { successEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler } from '../../../types';
import { buildWelcomePanel, WELCOME_IDS } from '../services/panel';

/** Validation du modal de modification d'un message. */
const handler: ComponentHandler = {
  id: WELCOME_IDS.modal,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isModalSubmit()) return;
    const message = interaction.fields.getTextInputValue('message').trim();
    if (!message) throw new BotError('Le message ne peut pas être vide.');

    await updateWelcomeConfig(
      interaction.guildId,
      args[0] === 'leave' ? { leaveMessage: message } : { welcomeMessage: message },
    );

    // Ouvert depuis le panneau : on met le panneau à jour sur place.
    if (interaction.isFromMessage()) {
      await interaction.update(await buildWelcomePanel(interaction.guild));
    } else {
      await interaction.reply({
        embeds: [successEmbed('Message enregistré.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default handler;
