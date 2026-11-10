import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import type { Command } from '../../../types';

const OPTION_NAMES = ['choix1', 'choix2', 'choix3', 'choix4', 'choix5'] as const;
/** Limites imposées par Discord pour les sondages natifs. */
const MAX_QUESTION_LENGTH = 300;
const MAX_ANSWER_LENGTH = 55;

const builder = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Crée un sondage.')
  .addStringOption((option) =>
    option
      .setName('question')
      .setDescription('Question du sondage')
      .setMaxLength(MAX_QUESTION_LENGTH)
      .setRequired(true),
  );

OPTION_NAMES.forEach((name, index) => {
  builder.addStringOption((option) =>
    option
      .setName(name)
      .setDescription(`Choix n°${index + 1}`)
      .setMaxLength(MAX_ANSWER_LENGTH)
      .setRequired(index < 2),
  );
});

builder
  .addIntegerOption((option) =>
    option
      .setName('duree')
      .setDescription('Durée du sondage en heures (24 par défaut, 168 maximum)')
      .setMinValue(1)
      .setMaxValue(168),
  )
  .addBooleanOption((option) =>
    option.setName('multiple').setDescription('Autoriser plusieurs réponses par personne'),
  );

const command: Command = {
  data: builder,
  botPermissions: [PermissionFlagsBits.SendPolls],
  cooldown: 15,

  async execute(interaction) {
    const answers = OPTION_NAMES.map((name) => interaction.options.getString(name)?.trim())
      .filter((answer): answer is string => Boolean(answer));
    if (new Set(answers.map((answer) => answer.toLowerCase())).size !== answers.length) {
      throw new BotError('Chaque choix du sondage doit être différent.');
    }

    // Sondage natif Discord : votes, résultats et clôture sont gérés par Discord lui-même.
    await interaction.reply({
      poll: {
        question: { text: interaction.options.getString('question', true) },
        answers: answers.map((text) => ({ text })),
        duration: interaction.options.getInteger('duree') ?? 24,
        allowMultiselect: interaction.options.getBoolean('multiple') ?? false,
      },
    });
  },
};

export default command;
