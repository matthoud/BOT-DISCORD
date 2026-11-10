import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../../types';
import { buildLogsPanel } from '../services/panel';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure les logs du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Ouvre le panneau de configuration des salons de logs.'),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 5,

  async execute(interaction) {
    await interaction.reply({
      ...(await buildLogsPanel(interaction.guild)),
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
