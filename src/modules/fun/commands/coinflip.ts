import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Lance une pièce : pile ou face ?'),
  cooldown: 2,

  async execute(interaction) {
    const heads = Math.random() < 0.5;
    await interaction.reply({
      embeds: [
        baseEmbed(Colors.fun)
          .setTitle('🪙 Pile ou face')
          .setDescription(`La pièce retombe sur… **${heads ? 'Face' : 'Pile'}** !`),
      ],
    });
  },
};

export default command;
