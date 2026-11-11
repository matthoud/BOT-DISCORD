import { SlashCommandBuilder } from 'discord.js';
import {
  getAccount,
  getEconomyConfig,
  purchaseItem,
  refundPurchase,
} from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { confirm } from '../../../core/ui/confirm';
import { errorEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { getBotMember } from '../../../utils/interaction';
import { formatMoney } from '../services/money';
import { assertRoleGrantable, resolveItem, respondWithItems } from '../services/shop.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Achète un article de la boutique.')
    .addStringOption((option) =>
      option.setName('article').setDescription('Article à acheter').setRequired(true).setAutocomplete(true),
    ),
  cooldown: 5,

  async autocomplete(interaction) {
    await respondWithItems(interaction, await getEconomyConfig(interaction.guildId), true);
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const [config, item, account] = await Promise.all([
      getEconomyConfig(guildId),
      resolveItem(guildId, interaction.options.getString('article', true), true),
      getAccount(guildId, interaction.user.id),
    ]);

    // Contrôles faits avant tout débit, pour ne jamais encaisser un achat impossible à honorer.
    const role = item.roleId
      ? assertRoleGrantable(interaction.guild, await getBotMember(interaction), item.roleId)
      : null;
    if (role && interaction.member.roles.cache.has(role.id)) {
      throw new BotError(`Vous avez déjà le rôle **${role.name}**.`);
    }
    if (item.stock === 0) throw new BotError('Cet article est en rupture de stock.');
    if (account.balance < item.price) {
      throw new BotError(
        `Il vous manque **${formatMoney(item.price - account.balance, config)}** pour acheter **${item.name}** (solde : ${formatMoney(account.balance, config)}).`,
      );
    }

    const click = await confirm(
      interaction,
      `Acheter **${item.name}** pour **${item.price === 0 ? 'rien (gratuit)' : formatMoney(item.price, config)}** ?${role ? `\nVous recevrez le rôle ${role}.` : ''}`,
      'Acheter',
    );
    if (!click) return;

    // Solde, stock et limite par membre sont revérifiés ici, de façon atomique.
    let purchase;
    try {
      purchase = await purchaseItem(guildId, interaction.user.id, item.id);
    } catch (error) {
      if (!(error instanceof BotError)) throw error;
      await click.editReply({ embeds: [errorEmbed(error.message)], components: [] });
      return;
    }

    if (role) {
      try {
        await interaction.member.roles.add(role, `Achat de l'article « ${item.name} »`);
      } catch (error) {
        logger.warn({ err: error, guildId, itemId: item.id }, "Rôle d'un article impossible à attribuer : achat remboursé");
        await refundPurchase(guildId, interaction.user.id, purchase.item);
        await click.editReply({
          embeds: [errorEmbed(`Je n'ai pas pu vous attribuer le rôle **${role.name}** : l'achat a été annulé et remboursé.`)],
          components: [],
        });
        return;
      }
    }

    await click.editReply({
      embeds: [
        successEmbed(
          `Vous avez acheté **${item.name}**${role ? ` et reçu le rôle ${role}` : ''}.\nNouveau solde : **${formatMoney(purchase.balance, config)}**`,
        ),
      ],
      components: [],
    });
  },
};

export default command;
