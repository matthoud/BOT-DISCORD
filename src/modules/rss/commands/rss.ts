import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { listCategories, listFeeds } from '../../../core/database/repositories/rss.repository';
import type { Command } from '../../../types';
import { truncate } from '../../../utils/format';
import { BUILTIN_CATEGORIES, STYLE_LABELS } from '../services/categories';
import {
  handleAdd,
  handleCategoryAdd,
  handleCategoryEdit,
  handleCategoryRemove,
  handleConfigView,
  handleEdit,
  handleFilters,
  handleInfo,
  handleList,
  handlePause,
  handleRefresh,
  handleRemove,
  handleTest,
} from '../services/handlers';
import { INTERVAL_CHOICES, RSS_LIMITS } from '../services/presenter';

const STYLE_CHOICES = Object.entries(STYLE_LABELS).map(([value, name]) => ({ name, value }));

const feedOption = (sub: SlashCommandSubcommandBuilder, description: string) =>
  sub.addStringOption((option) =>
    option.setName('flux').setDescription(description).setRequired(true).setAutocomplete(true),
  );

/** Options communes à l'ajout et à la modification d'un flux. */
function presentationOptions(
  sub: SlashCommandSubcommandBuilder,
  editing: boolean,
): SlashCommandSubcommandBuilder {
  return sub
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription(
          editing
            ? 'Nouveau salon de publication'
            : 'Salon de publication (salon actuel par défaut)',
        )
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option
        .setName('nom')
        .setDescription(editing ? 'Nouveau nom affiché' : 'Nom affiché (titre du flux par défaut)')
        .setMaxLength(RSS_LIMITS.nameLength),
    )
    .addStringOption((option) =>
      option
        .setName('categorie')
        .setDescription('Catégorie, qui détermine la présentation')
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('intervalle')
        .setDescription(
          editing
            ? 'Nouvel intervalle de vérification'
            : 'Intervalle de vérification (30 minutes par défaut)',
        )
        .addChoices(...INTERVAL_CHOICES),
    )
    .addBooleanOption((option) =>
      option.setName('resume').setDescription("Afficher le résumé de l'article"),
    )
    .addBooleanOption((option) =>
      option.setName('image').setDescription("Afficher l'image de l'article"),
    )
    .addRoleOption((option) =>
      option.setName('mention').setDescription('Rôle mentionné à chaque nouvel article'),
    );
}

function categoryFields(
  sub: SlashCommandSubcommandBuilder,
  required: boolean,
): SlashCommandSubcommandBuilder {
  return sub
    .addStringOption((option) =>
      option
        .setName('nom')
        .setDescription('Nom de la catégorie')
        .setMaxLength(RSS_LIMITS.categoryNameLength)
        .setRequired(required),
    )
    .addStringOption((option) =>
      option
        .setName('emoji')
        .setDescription('Emoji de la catégorie (🎲, ou un emoji du serveur)')
        .setMaxLength(64)
        .setRequired(required),
    )
    .addStringOption((option) =>
      option
        .setName('couleur')
        .setDescription('Couleur hexadécimale, par exemple #ff8800')
        .setMaxLength(7),
    )
    .addStringOption((option) =>
      option
        .setName('style')
        .setDescription('Mise en page des articles')
        .addChoices(...STYLE_CHOICES),
    );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rss')
    .setDescription('Gère les flux RSS et Atom publiés sur le serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      presentationOptions(
        sub
          .setName('add')
          .setDescription('Ajoute un flux RSS ou Atom à publier dans un salon.')
          .addStringOption((option) =>
            option
              .setName('url')
              .setDescription('Adresse du flux (ou d’une page qui en annonce un)')
              .setMaxLength(2000)
              .setRequired(true),
          ),
        false,
      ),
    )
    .addSubcommand((sub) =>
      feedOption(sub.setName('remove').setDescription('Supprime un flux.'), 'Flux à supprimer'),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Affiche les flux du serveur et leur état.'),
    )
    .addSubcommand((sub) =>
      feedOption(
        sub.setName('info').setDescription("Affiche le détail d'un flux."),
        'Flux à afficher',
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Teste une adresse ou un flux enregistré, sans rien publier.')
        .addStringOption((option) =>
          option.setName('url').setDescription('Adresse à tester').setMaxLength(2000),
        )
        .addStringOption((option) =>
          option
            .setName('flux')
            .setDescription('Flux enregistré à tester (avec ses filtres)')
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      feedOption(sub.setName('pause').setDescription('Suspend un flux.'), 'Flux à suspendre'),
    )
    .addSubcommand((sub) =>
      feedOption(
        sub.setName('resume').setDescription('Reprend un flux suspendu.'),
        'Flux à reprendre',
      ),
    )
    .addSubcommand((sub) =>
      feedOption(
        sub.setName('refresh').setDescription('Vérifie un flux immédiatement.'),
        'Flux à vérifier',
      ),
    )
    .addSubcommand((sub) =>
      presentationOptions(
        feedOption(sub.setName('edit').setDescription('Modifie un flux.'), 'Flux à modifier'),
        true,
      ).addBooleanOption((option) =>
        option.setName('sans-mention').setDescription('Ne plus mentionner de rôle'),
      ),
    )
    .addSubcommand((sub) =>
      feedOption(
        sub
          .setName('filters')
          .setDescription(
            "Affiche ou modifie les filtres d'un flux (mots séparés par des virgules).",
          ),
        'Flux à filtrer',
      )
        .addStringOption((option) =>
          option
            .setName('inclure')
            .setDescription(
              'Publier uniquement les articles contenant un de ces mots (« aucun » pour vider)',
            )
            .setMaxLength(1000),
        )
        .addStringOption((option) =>
          option
            .setName('exclure')
            .setDescription('Ne jamais publier les articles contenant un de ces mots')
            .setMaxLength(1000),
        )
        .addStringOption((option) =>
          option
            .setName('prioritaires')
            .setDescription('Mots mis en avant (⭐) ; seuls ces articles mentionnent le rôle')
            .setMaxLength(1000),
        )
        .addStringOption((option) =>
          option.setName('auteurs').setDescription('Auteurs à ignorer').setMaxLength(1000),
        )
        .addStringOption((option) =>
          option
            .setName('categories')
            .setDescription('Publier uniquement ces catégories du site')
            .setMaxLength(1000),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Paramètres RSS du serveur et catégories personnalisées.')
        .addSubcommand((sub) =>
          sub.setName('view').setDescription('Affiche les paramètres, limites et catégories.'),
        )
        .addSubcommand((sub) =>
          categoryFields(
            sub.setName('category-add').setDescription('Crée une catégorie personnalisée.'),
            true,
          ),
        )
        .addSubcommand((sub) =>
          categoryFields(
            sub
              .setName('category-edit')
              .setDescription('Modifie une catégorie personnalisée.')
              .addStringOption((option) =>
                option
                  .setName('categorie')
                  .setDescription('Catégorie à modifier')
                  .setRequired(true)
                  .setAutocomplete(true),
              ),
            false,
          ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('category-remove')
            .setDescription('Supprime une catégorie personnalisée.')
            .addStringOption((option) =>
              option
                .setName('categorie')
                .setDescription('Catégorie à supprimer')
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const typed = focused.value.toLowerCase();

    if (focused.name === 'flux') {
      const feeds = await listFeeds(interaction.guildId);
      await interaction.respond(
        feeds
          .filter(
            (feed) =>
              feed.name.toLowerCase().includes(typed) || feed.url.toLowerCase().includes(typed),
          )
          .slice(0, 25)
          .map((feed) => ({
            name: truncate(`${feed.paused ? '⏸️' : '🟢'} ${feed.name}`, 100),
            value: String(feed.id),
          })),
      );
      return;
    }

    if (focused.name === 'categorie') {
      const customOnly = interaction.options.getSubcommandGroup(false) === 'config';
      const custom = (await listCategories(interaction.guildId)).map((category) => ({
        name: truncate(
          `${category.emoji.startsWith('<') ? '' : `${category.emoji} `}${category.name} (personnalisée)`,
          100,
        ),
        value: `c:${category.id}`,
      }));
      const builtin = Object.entries(BUILTIN_CATEGORIES).map(([key, category]) => ({
        name: `${category.emoji} ${category.name}`,
        value: `b:${key}`,
      }));
      await interaction.respond(
        [...(customOnly ? [] : builtin), ...custom]
          .filter((choice) => choice.name.toLowerCase().includes(typed))
          .slice(0, 25),
      );
      return;
    }
    await interaction.respond([]);
  },

  async execute(interaction) {
    if (interaction.options.getSubcommandGroup(false) === 'config') {
      switch (interaction.options.getSubcommand()) {
        case 'category-add':
          return handleCategoryAdd(interaction);
        case 'category-edit':
          return handleCategoryEdit(interaction);
        case 'category-remove':
          return handleCategoryRemove(interaction);
        default:
          return handleConfigView(interaction);
      }
    }

    switch (interaction.options.getSubcommand()) {
      case 'add':
        return handleAdd(interaction);
      case 'remove':
        return handleRemove(interaction);
      case 'list':
        return handleList(interaction);
      case 'info':
        return handleInfo(interaction);
      case 'test':
        return handleTest(interaction);
      case 'pause':
        return handlePause(interaction, true);
      case 'resume':
        return handlePause(interaction, false);
      case 'refresh':
        return handleRefresh(interaction);
      case 'edit':
        return handleEdit(interaction);
      case 'filters':
        return handleFilters(interaction);
    }
  },
};

export default command;
