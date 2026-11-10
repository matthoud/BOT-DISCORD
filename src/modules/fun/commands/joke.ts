import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { pickRandom } from '../../../utils/format';
import { JOKES } from '../data/jokes';

const command: Command = {
  data: new SlashCommandBuilder().setName('joke').setDescription('Raconte une blague.'),
  cooldown: 3,

  async execute(interaction) {
    const joke = pickRandom(JOKES);
    await interaction.reply({
      embeds: [
        baseEmbed(Colors.fun)
          .setTitle('😄 Blague')
          // La chute est masquée : il faut cliquer pour la révéler.
          .setDescription(`${joke.setup}\n\n||${joke.punchline}||`),
      ],
    });
  },
};

export default command;
