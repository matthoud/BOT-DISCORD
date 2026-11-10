import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Lance un ou plusieurs dés.')
    .addIntegerOption((option) =>
      option.setName('faces').setDescription('Nombre de faces (6 par défaut)').setMinValue(2).setMaxValue(1000),
    )
    .addIntegerOption((option) =>
      option.setName('nombre').setDescription('Nombre de dés (1 par défaut)').setMinValue(1).setMaxValue(10),
    ),
  cooldown: 2,

  async execute(interaction) {
    const faces = interaction.options.getInteger('faces') ?? 6;
    const count = interaction.options.getInteger('nombre') ?? 1;
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * faces));
    const total = rolls.reduce((sum, roll) => sum + roll, 0);

    const embed = baseEmbed(Colors.fun)
      .setTitle(`🎲 ${count}d${faces}`)
      .setDescription(rolls.map((roll) => `**${roll}**`).join(' + '));
    if (count > 1) embed.addFields({ name: 'Total', value: String(total) });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
