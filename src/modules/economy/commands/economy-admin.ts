import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { credit, debit, getEconomyConfig } from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { ECONOMY_LIMITS, formatMoney } from '../services/money';
import { buildEconomyPanel } from '../services/panel';

const builder = new SlashCommandBuilder()
  .setName('economy-admin')
  .setDescription("Configure l'économie du serveur et ajuste les soldes.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName('config').setDescription("Ouvre le panneau de configuration de l'économie."),
  );

for (const [name, description] of [
  ['give', "Ajoute de la monnaie au portefeuille d'un membre."],
  ['take', "Retire de la monnaie du portefeuille d'un membre."],
] as const) {
  builder.addSubcommand((sub) =>
    sub
      .setName(name)
      .setDescription(description)
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addIntegerOption((option) =>
        option
          .setName('montant')
          .setDescription('Montant')
          .setMinValue(ECONOMY_LIMITS.amount.min)
          .setMaxValue(ECONOMY_LIMITS.amount.max)
          .setRequired(true),
      ),
  );
}

const command: Command = {
  data: builder,
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'config') {
      await interaction.reply({ ...(await buildEconomyPanel(interaction.guild)), flags: MessageFlags.Ephemeral });
      return;
    }

    const user = interaction.options.getUser('membre', true);
    const amount = interaction.options.getInteger('montant', true);
    if (user.bot) throw new BotError("Les bots n'ont pas de portefeuille.");

    const config = await getEconomyConfig(guildId);
    const give = subcommand === 'give';
    // Chaque ajustement est enregistré dans l'historique du membre, avec l'administrateur à l'origine.
    const balance = give
      ? await credit(guildId, user.id, amount, { type: 'ADMIN_GIVE', counterpartyId: interaction.user.id })
      : await debit(guildId, user.id, amount, { type: 'ADMIN_TAKE', counterpartyId: interaction.user.id });

    logger.info(
      { guildId, adminId: interaction.user.id, userId: user.id, amount: give ? amount : -amount },
      'Ajustement manuel de solde',
    );
    await interaction.reply({
      embeds: [
        successEmbed(
          `**${formatMoney(amount, config)}** ${give ? 'ajouté(s) à' : 'retiré(s) de'} ${user}. Nouveau solde : **${formatMoney(balance, config)}**`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
