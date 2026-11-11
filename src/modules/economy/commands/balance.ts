import { SlashCommandBuilder } from 'discord.js';
import {
  getAccount,
  getEconomyConfig,
  getWealthRank,
} from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { formatNumber, timestamp } from '../../../utils/format';
import { DAY_MS, formatMoney, WEEK_MS } from '../services/money';

/** « disponible » ou le moment où la récompense le redeviendra. */
function availability(last: Date | null, periodMs: number, amount: number): string {
  if (amount <= 0) return 'désactivée';
  if (!last || last.getTime() + periodMs <= Date.now()) return '✅ disponible';
  return `⏳ ${timestamp(last.getTime() + periodMs, 'R')}`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription("Affiche votre solde, ou celui d'un autre membre.")
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à consulter (vous par défaut)'),
    ),
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    if (user.bot) throw new BotError("Les bots n'ont pas de portefeuille.");

    const [config, account] = await Promise.all([
      getEconomyConfig(interaction.guildId),
      getAccount(interaction.guildId, user.id),
    ]);
    const rank = account.balance > 0 ? `#${formatNumber(await getWealthRank(interaction.guildId, account.balance))}` : 'non classé';

    const embed = baseEmbed()
      .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL({ size: 64 }) })
      .setTitle(`${config.currencyEmoji} Portefeuille`)
      .addFields(
        { name: 'Solde', value: `**${formatMoney(account.balance, config)}** ${config.currencyName}`, inline: true },
        { name: 'Classement', value: rank, inline: true },
      );

    // Les échéances des récompenses ne regardent que le titulaire du portefeuille.
    if (user.id === interaction.user.id) {
      embed.addFields({
        name: 'Récompenses',
        value: `\`/daily\` : ${availability(account.lastDailyAt, DAY_MS, config.dailyAmount)}\n\`/weekly\` : ${availability(account.lastWeeklyAt, WEEK_MS, config.weeklyAmount)}`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
