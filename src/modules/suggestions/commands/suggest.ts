import { ActionRowBuilder, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import { componentId } from '../../../core/ui/customId';
import type { Command } from '../../../types';
import { SUGGESTION_IDS, SUGGESTION_LIMITS } from '../services/presenter';
import { resolveSuggestionChannel } from '../services/suggestion.service';

const command: Command = {
  data: new SlashCommandBuilder().setName('suggest').setDescription('Propose une suggestion pour le serveur.'),
  // Limite le nombre de suggestions qu'un même membre peut publier à la suite.
  cooldown: 120,

  async execute(interaction) {
    // Vérifié avant d'ouvrir le formulaire, pour ne pas faire rédiger un texte qui ne pourra pas être publié.
    await resolveSuggestionChannel(interaction.guild, await getSuggestionConfig(interaction.guildId));

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(componentId(SUGGESTION_IDS.submit))
        .setTitle('Nouvelle suggestion')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('content')
              .setLabel('Votre suggestion')
              .setPlaceholder('Décrivez votre idée et ce qu’elle apporterait au serveur.')
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(SUGGESTION_LIMITS.minLength)
              .setMaxLength(SUGGESTION_LIMITS.maxLength)
              .setRequired(true),
          ),
        ),
    );
  },
};

export default command;
