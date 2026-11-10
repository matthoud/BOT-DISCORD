import { SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { progressBar, shipComment, shipScore } from '../services/ship';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcule la compatibilité entre deux membres.')
    .addUserOption((option) =>
      option.setName('membre1').setDescription('Premier membre').setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('membre2').setDescription('Second membre (vous par défaut)'),
    ),
  cooldown: 3,

  async execute(interaction) {
    const first = interaction.options.getUser('membre1', true);
    const second = interaction.options.getUser('membre2') ?? interaction.user;
    if (first.id === second.id) {
      throw new BotError("Il faut deux personnes différentes pour calculer une compatibilité.");
    }

    const score = shipScore(first.id, second.id);
    await interaction.reply({
      embeds: [
        baseEmbed(Colors.fun)
          .setTitle('💘 Compatibilité')
          .setDescription(
            `${first} ❤️ ${second}\n\n${progressBar(score)} **${score} %**\n\n${shipComment(score)}`,
          ),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
