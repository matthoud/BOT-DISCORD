import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler } from '../../../types';
import { describeVotes, STATUS_INFO, SUGGESTION_IDS } from '../services/presenter';
import { isSuggestionStaff, requireSuggestion } from '../services/suggestion.service';

/**
 * Bouton « Gérer » d'une suggestion : ouvre en privé les actions du staff.
 * Le bouton est visible de tous ; le droit de s'en servir est vérifié ici (« Gérer le serveur »
 * ou rôle de staff configuré), car il dépend de la configuration du serveur.
 */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.manage,

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const config = await getSuggestionConfig(interaction.guildId);
    if (!isSuggestionStaff(interaction.member, config)) {
      throw new BotError('Seul le staff peut traiter les suggestions.');
    }

    const suggestion = await requireSuggestion(interaction.guildId, args[0]);
    const id = String(suggestion.id);
    const status = STATUS_INFO[suggestion.status];
    const button = (action: string, label: string, emoji: string, style: ButtonStyle): ButtonBuilder =>
      new ButtonBuilder()
        .setCustomId(componentId(SUGGESTION_IDS.action, id, action))
        .setLabel(label)
        .setEmoji(emoji)
        .setStyle(style);

    const buttons = new ActionRowBuilder<ButtonBuilder>();
    if (suggestion.status !== 'ACCEPTED') buttons.addComponents(button('accept', 'Accepter', '✅', ButtonStyle.Success));
    if (suggestion.status !== 'REFUSED') buttons.addComponents(button('refuse', 'Refuser', '❌', ButtonStyle.Danger));
    buttons.addComponents(button('reply', 'Répondre', '💬', ButtonStyle.Primary));
    if (suggestion.status !== 'PENDING') {
      buttons.addComponents(button('reopen', 'Rouvrir les votes', '🔄', ButtonStyle.Secondary));
    }

    await interaction.reply({
      embeds: [
        baseEmbed(status.color)
          .setTitle(`⚙️ Suggestion n°${suggestion.number}`)
          .setDescription(
            `Statut : ${status.emoji} **${status.label}**\nVotes : ${describeVotes(suggestion)}\n\nAccepter ou refuser clôt les votes. Répondre ajoute un commentaire sans changer le statut.`,
          ),
      ],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default handler;
