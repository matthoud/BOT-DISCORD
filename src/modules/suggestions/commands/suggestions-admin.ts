import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types';
import { buildSuggestionPanel } from '../services/panel';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('suggestions-admin')
    .setDescription('Configure le système de suggestions du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('config').setDescription('Ouvre le panneau de configuration des suggestions.'),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async execute(interaction) {
    await interaction.reply({ ...(await buildSuggestionPanel(interaction.guild)), flags: MessageFlags.Ephemeral });
  },
};

export default command;
