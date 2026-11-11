import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  countTransactions,
  countWealthyMembers,
  getAccount,
  getEconomyConfig,
  getTransactionPage,
  getWealthPage,
  getWealthRank,
} from '../../../core/database/repositories/economy.repository';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { formatNumber, timestamp } from '../../../utils/format';
import { describeTransaction, formatMoney, formatSignedMoney } from '../services/money';

const PAGE_SIZE = 10;
/** Le classement et l'historique affichés s'arrêtent à 100 lignes. */
const MAX_ENTRIES = 100;
const MEDALS = ['🥇', '🥈', '🥉'];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription("Classement et historique de l'économie du serveur.")
    .addSubcommand((sub) =>
      sub.setName('leaderboard').setDescription('Affiche le classement des membres les plus riches.'),
    )
    .addSubcommand((sub) =>
      sub.setName('history').setDescription('Affiche vos derniers mouvements de monnaie.'),
    ),
  cooldown: 10,

  async execute(interaction) {
    const guildId = interaction.guildId;
    const config = await getEconomyConfig(guildId);

    if (interaction.options.getSubcommand() === 'history') {
      // L'historique est personnel : il n'est visible que de son titulaire.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const total = Math.min(await countTransactions(guildId, interaction.user.id), MAX_ENTRIES);
      const title = `${config.currencyEmoji} Vos derniers mouvements`;
      if (total === 0) {
        await interaction.editReply({
          embeds: [baseEmbed().setTitle(title).setDescription("Aucun mouvement enregistré pour le moment.")],
        });
        return;
      }
      await paginate(interaction, Math.ceil(total / PAGE_SIZE), async (page) => {
        const rows = await getTransactionPage(guildId, interaction.user.id, page * PAGE_SIZE, PAGE_SIZE);
        const lines = rows.map(
          (row) =>
            `**${formatSignedMoney(row.amount, config)}** · ${describeTransaction(row)}\n-# ${timestamp(row.createdAt, 'f')} · solde : ${formatMoney(row.balanceAfter, config)}`,
        );
        return baseEmbed()
          .setTitle(title)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Les gains obtenus en discutant ne sont pas détaillés ici.' });
      });
      return;
    }

    await interaction.deferReply();
    const title = `💰 Classement des fortunes — ${interaction.guild.name}`;
    const [total, own] = await Promise.all([countWealthyMembers(guildId), getAccount(guildId, interaction.user.id)]);
    if (total === 0) {
      await interaction.editReply({
        embeds: [baseEmbed().setTitle(title).setDescription("Personne ne possède encore de monnaie sur ce serveur.")],
      });
      return;
    }

    const ownLine =
      own.balance > 0
        ? `Votre rang : #${formatNumber(await getWealthRank(guildId, own.balance))} sur ${formatNumber(total)}`
        : `Vous n'êtes pas encore classé · ${formatNumber(total)} membre(s) classé(s)`;

    await paginate(interaction, Math.ceil(Math.min(total, MAX_ENTRIES) / PAGE_SIZE), async (page) => {
      const rows = await getWealthPage(guildId, page * PAGE_SIZE, PAGE_SIZE);
      const lines = rows.map((row, index) => {
        const position = page * PAGE_SIZE + index;
        return `${MEDALS[position] ?? `**${position + 1}.**`} <@${row.userId}> — **${formatMoney(row.balance, config)}**`;
      });
      return baseEmbed().setTitle(title).setDescription(lines.join('\n')).setFooter({ text: ownLine });
    });
  },
};

export default command;
