import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { setDmNotifications } from '../../../core/database/repositories/user.repository';
import { successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('preferences')
    .setDescription('Gère vos préférences personnelles (valables sur tous les serveurs).')
    .addSubcommand((sub) =>
      sub
        .setName('mp')
        .setDescription('Accepter ou refuser les messages privés du bot.')
        .addBooleanOption((option) =>
          option.setName('actif').setDescription('Recevoir les messages privés').setRequired(true),
        ),
    ),
  cooldown: 5,

  async execute(interaction) {
    const enabled = interaction.options.getBoolean('actif', true);
    await setDmNotifications(interaction.user.id, enabled);
    await interaction.reply({
      embeds: [
        successEmbed(
          enabled
            ? 'Vous recevrez à nouveau les messages privés du bot (par exemple en cas de sanction).'
            : 'Vous ne recevrez plus de messages privés du bot.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
