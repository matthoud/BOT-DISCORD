import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getEconomyConfig } from '../../../core/database/repositories/economy.repository';
import { componentId } from '../../../core/ui/customId';
import type { ComponentHandler } from '../../../types';
import { ECONOMY_LIMITS } from '../services/money';
import { ECONOMY_IDS, type EditKind } from '../services/panel';

/** Champ de formulaire sur une ligne. Le libellé ne doit pas dépasser 45 caractères. */
const input = (id: string, label: string, value: string, maxLength: number): ActionRowBuilder<TextInputBuilder> =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(maxLength)
      .setValue(value)
      .setRequired(true),
  );

/** Boutons « modifier » du panneau : ouvrent un formulaire pré-rempli avec les réglages actuels. */
const handler: ComponentHandler = {
  id: ECONOMY_IDS.edit,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const kind = args[0] as EditKind;
    const config = await getEconomyConfig(interaction.guildId);
    const modal = new ModalBuilder().setCustomId(componentId(ECONOMY_IDS.modal, kind));

    if (kind === 'currency') {
      modal.setTitle('Monnaie').addComponents(
        input('name', 'Nom de la monnaie (au pluriel)', config.currencyName, ECONOMY_LIMITS.currencyName),
        input('emoji', 'Symbole (émoji)', config.currencyEmoji, ECONOMY_LIMITS.currencyEmoji),
      );
    } else if (kind === 'rewards') {
      modal.setTitle('Récompenses').addComponents(
        input('daily', 'Récompense quotidienne (0 = désactivée)', String(config.dailyAmount), 7),
        input('weekly', 'Récompense hebdomadaire (0 = désactivée)', String(config.weeklyAmount), 7),
      );
    } else {
      const { messageCooldownSeconds: cooldown } = ECONOMY_LIMITS;
      modal.setTitle('Gains en discutant').addComponents(
        input('min', 'Gain minimum par message', String(config.messageMin), 4),
        input('max', 'Gain maximum par message (0 = désactivé)', String(config.messageMax), 4),
        input('cooldown', `Délai entre gains, en secondes (${cooldown.min} à ${cooldown.max})`, String(config.messageCooldownSeconds), 4),
      );
    }

    await interaction.showModal(modal);
  },
};

export default handler;
