import { SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { pickRandom, truncate } from '../../../utils/format';

/** Découpe « a, b | c » en propositions distinctes et non vides. */
export function parseChoices(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(/[,|;\n]/)
    .map((choice) => choice.trim())
    .filter((choice) => {
      const key = choice.toLowerCase();
      if (!choice || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Choisit au hasard parmi plusieurs propositions.')
    .addStringOption((option) =>
      option
        .setName('propositions')
        .setDescription('Propositions séparées par des virgules : pizza, sushi, burger')
        .setMaxLength(1000)
        .setRequired(true),
    ),
  cooldown: 2,

  async execute(interaction) {
    const choices = parseChoices(interaction.options.getString('propositions', true));
    if (choices.length < 2) {
      throw new BotError('Donnez au moins deux propositions différentes, séparées par des virgules.');
    }

    await interaction.reply({
      embeds: [
        baseEmbed(Colors.fun)
          .setTitle('🤔 Mon choix')
          .setDescription(`**${truncate(pickRandom(choices), 1000)}**`)
          .setFooter({ text: `Parmi ${choices.length} propositions` }),
      ],
    });
  },
};

export default command;
