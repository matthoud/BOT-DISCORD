import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { SuggestionStatus } from '@prisma/client';
import {
  countSuggestions,
  getStatusCounts,
  getSuggestionByNumber,
  getSuggestionPage,
  type SuggestionFilter,
} from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import {
  buildSuggestionEmbed,
  describeSuggestionLine,
  STATUS_INFO,
  suggestionUrl,
} from '../services/presenter';
import { fetchAuthor } from '../services/suggestion.service';

const PAGE_SIZE = 5;
const STATUSES = ['PENDING', 'ACCEPTED', 'REFUSED'] as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('suggestions')
    .setDescription('Consulte les suggestions du serveur.')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription("Affiche l'historique des suggestions, avec leurs votes.")
        .addStringOption((option) =>
          option
            .setName('statut')
            .setDescription('Ne montrer que les suggestions ayant ce statut')
            .addChoices(...STATUSES.map((status) => ({ name: STATUS_INFO[status].label, value: status }))),
        )
        .addUserOption((option) =>
          option.setName('membre').setDescription('Ne montrer que les suggestions de ce membre'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Affiche une suggestion à partir de son numéro.')
        .addIntegerOption((option) =>
          option.setName('numero').setDescription('Numéro de la suggestion').setMinValue(1).setRequired(true),
        ),
    ),
  cooldown: 5,

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (interaction.options.getSubcommand() === 'view') {
      const number = interaction.options.getInteger('numero', true);
      const suggestion = await getSuggestionByNumber(guildId, number);
      if (!suggestion?.messageId) throw new BotError(`La suggestion n°${number} n'existe pas.`);
      const embed = buildSuggestionEmbed(suggestion, await fetchAuthor(interaction.guild, suggestion.authorId));
      const url = suggestionUrl(suggestion);
      if (url) embed.setURL(url);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const filter: SuggestionFilter = {};
    const status = interaction.options.getString('statut') as SuggestionStatus | null;
    const author = interaction.options.getUser('membre');
    if (status) filter.status = status;
    if (author) filter.authorId = author.id;

    const [total, counts] = await Promise.all([countSuggestions(guildId, filter), getStatusCounts(guildId)]);
    const title = `💡 Suggestions — ${interaction.guild.name}`;
    // Statistiques du serveur entier, quel que soit le filtre appliqué.
    const footer = STATUSES.map((key) => `${STATUS_INFO[key].label} : ${counts[key]}`).join(' · ');

    if (total === 0) {
      await interaction.editReply({
        embeds: [
          baseEmbed()
            .setTitle(title)
            .setDescription(
              status || author
                ? 'Aucune suggestion ne correspond à ces critères.'
                : "Aucune suggestion n'a encore été publiée. Proposez-en une avec `/suggest`.",
            )
            .setFooter({ text: footer }),
        ],
      });
      return;
    }

    await paginate(interaction, Math.ceil(total / PAGE_SIZE), async (page) => {
      const suggestions = await getSuggestionPage(guildId, filter, page * PAGE_SIZE, PAGE_SIZE);
      return baseEmbed()
        .setTitle(title)
        .setDescription(suggestions.map(describeSuggestionLine).join('\n\n'))
        .setFooter({ text: footer });
    });
  },
};

export default command;
