import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotClient } from '../../../core/client';
import type { Command } from '../../../types';
import { buildHelpMenu, buildHelpOverview } from '../services/help.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche la liste des modules et de leurs commandes.'),
  cooldown: 3,

  async execute(interaction) {
    const client = interaction.client as BotClient;
    await interaction.reply({
      embeds: [await buildHelpOverview(client, interaction.guildId)],
      components: [await buildHelpMenu(client, interaction.guildId)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
