import { SlashCommandBuilder } from 'discord.js';
import { getEconomyConfig, listShopItems } from '../../../core/database/repositories/economy.repository';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { formatMoney } from '../services/money';
import { describeAvailability } from '../services/shop.service';

const PAGE_SIZE = 6;

const command: Command = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Affiche les articles de la boutique du serveur.'),
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();
    const [config, items] = await Promise.all([
      getEconomyConfig(interaction.guildId),
      listShopItems(interaction.guildId, true),
    ]);

    const title = `🛒 Boutique — ${interaction.guild.name}`;
    if (items.length === 0) {
      await interaction.editReply({
        embeds: [baseEmbed().setTitle(title).setDescription("La boutique est vide pour le moment.")],
      });
      return;
    }

    await paginate(interaction, Math.ceil(items.length / PAGE_SIZE), async (page) => {
      const embed = baseEmbed().setTitle(title).setFooter({ text: 'Achetez un article avec /buy' });
      for (const item of items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
        const details = [
          item.description,
          item.roleId ? `Donne le rôle <@&${item.roleId}>` : '',
          describeAvailability(item),
        ].filter(Boolean);
        embed.addFields({
          name: `${item.name} — ${item.price === 0 ? 'gratuit' : formatMoney(item.price, config)}`,
          value: details.join('\n') || '*Aucune description*',
        });
      }
      return embed;
    });
  },
};

export default command;
