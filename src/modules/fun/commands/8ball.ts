import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { pickRandom } from '../../../utils/format';

const ANSWERS = [
  'Oui, sans aucun doute.',
  "C'est certain.",
  'Absolument !',
  'Tu peux compter dessus.',
  'Les signes disent que oui.',
  'Très probablement.',
  'Ça me paraît bien parti.',
  'Oui.',
  'Difficile à dire, repose ta question.',
  'Concentre-toi et redemande.',
  'Mieux vaut ne pas te le dire maintenant.',
  'Impossible de prédire ça pour le moment.',
  "N'y compte pas.",
  'Ma réponse est non.',
  'Mes sources disent que non.',
  'Les perspectives ne sont pas bonnes.',
  "J'en doute fortement.",
  'Certainement pas.',
] as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Pose une question à la boule magique.')
    .addStringOption((option) =>
      option.setName('question').setDescription('Ta question').setMaxLength(300).setRequired(true),
    ),
  cooldown: 3,

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    await interaction.reply({
      embeds: [
        baseEmbed(Colors.fun)
          .setTitle('🎱 Boule magique')
          .addFields(
            { name: 'Question', value: question },
            { name: 'Réponse', value: pickRandom(ANSWERS) },
          ),
      ],
    });
  },
};

export default command;
