import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types';
import { buildWelcomePanel } from '../services/panel';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure le système de bienvenue.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Ouvre le panneau de configuration de la bienvenue.'),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 5,

  async execute(interaction) {
    await interaction.reply({
      ...(await buildWelcomePanel(interaction.guild)),
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
