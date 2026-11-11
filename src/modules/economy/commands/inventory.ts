import { SlashCommandBuilder } from 'discord.js';
import { getInventory } from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { timestamp, truncate } from '../../../utils/format';

const PAGE_SIZE = 10;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription("Affiche vos articles, ou ceux d'un autre membre.")
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à consulter (vous par défaut)'),
    ),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    if (user.bot) throw new BotError("Les bots n'ont pas d'inventaire.");

    await interaction.deferReply();
    const entries = await getInventory(interaction.guildId, user.id);
    const author = { name: `Inventaire de ${user.displayName}`, iconURL: user.displayAvatarURL({ size: 64 }) };

    if (entries.length === 0) {
      await interaction.editReply({
        embeds: [
          baseEmbed()
            .setAuthor(author)
            .setDescription(
              user.id === interaction.user.id
                ? 'Votre inventaire est vide. Découvrez la boutique avec `/shop`.'
                : "Ce membre ne possède aucun article.",
            ),
        ],
      });
      return;
    }

    await paginate(interaction, Math.ceil(entries.length / PAGE_SIZE), async (page) => {
      const lines = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry) => {
        const quantity = entry.quantity > 1 ? ` ×${entry.quantity}` : '';
        const description = entry.item.description ? ` — ${truncate(entry.item.description, 80)}` : '';
        return `🎒 **${entry.item.name}**${quantity}${description}\n-# Obtenu le ${timestamp(entry.createdAt, 'D')}`;
      });
      return baseEmbed().setAuthor(author).setDescription(lines.join('\n'));
    });
  },
};

export default command;
