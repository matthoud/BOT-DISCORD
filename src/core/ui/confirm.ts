import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { warningEmbed } from './embeds';

const CONFIRM_TIMEOUT_MS = 30_000;

/**
 * Demande une confirmation privée par boutons.
 * Retourne l'interaction du bouton « Confirmer » (déjà différée), ou `null` si l'utilisateur
 * annule ou ne répond pas à temps. Le message de confirmation est mis à jour dans tous les cas.
 */
export async function confirm(
  interaction: ChatInputCommandInteraction<'cached'>,
  question: string,
  confirmLabel = 'Confirmer',
): Promise<ButtonInteraction<'cached'> | null> {
  // Les identifiants « tmp: » ne sont pas routés vers les gestionnaires persistants.
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('tmp:confirm')
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tmp:cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    embeds: [warningEmbed(question)],
    components: [row],
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });
  const message = response.resource?.message;
  if (!message) return null;

  try {
    const click = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: CONFIRM_TIMEOUT_MS,
    });
    if (click.customId === 'tmp:confirm') {
      await click.deferUpdate();
      return click as ButtonInteraction<'cached'>;
    }
    await click.update({ embeds: [warningEmbed('Action annulée.')], components: [] });
    return null;
  } catch {
    // Délai dépassé : l'interaction d'origine est encore valide pour modifier le message.
    await interaction
      .editReply({ embeds: [warningEmbed('Confirmation expirée.')], components: [] })
      .catch(() => undefined);
    return null;
  }
}
