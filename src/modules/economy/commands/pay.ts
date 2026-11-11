import { SlashCommandBuilder } from 'discord.js';
import { getEconomyConfig, transfer } from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { requireMember } from '../../../utils/interaction';
import { ECONOMY_LIMITS, formatMoney } from '../services/money';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Donne une partie de votre monnaie à un autre membre.')
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à payer').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('montant')
        .setDescription('Montant à donner')
        .setMinValue(ECONOMY_LIMITS.amount.min)
        .setMaxValue(ECONOMY_LIMITS.amount.max)
        .setRequired(true),
    ),
  cooldown: 10,

  async execute(interaction) {
    const target = requireMember(interaction);
    const amount = interaction.options.getInteger('montant', true);
    if (target.user.bot) throw new BotError("Les bots n'ont pas de portefeuille.");
    if (target.id === interaction.user.id) throw new BotError('Vous ne pouvez pas vous payer vous-même.');

    const config = await getEconomyConfig(interaction.guildId);
    // Le solde est vérifié et débité dans la même opération : un solde insuffisant est refusé ici.
    const { fromBalance } = await transfer(interaction.guildId, interaction.user.id, target.id, amount);

    await interaction.reply({
      embeds: [
        baseEmbed(Colors.success)
          .setTitle('💸 Paiement effectué')
          .setDescription(`${interaction.user} a donné **${formatMoney(amount, config)}** à ${target}.`)
          .setFooter({ text: `Votre nouveau solde : ${formatMoney(fromBalance, { ...config, currencyEmoji: config.currencyName })}` }),
      ],
    });
  },
};

export default command;
