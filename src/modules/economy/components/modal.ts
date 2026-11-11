import { MessageFlags, PermissionFlagsBits, type ModalSubmitInteraction } from 'discord.js';
import {
  updateEconomyConfig,
  type EconomyConfigUpdate,
} from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { successEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler } from '../../../types';
import { ECONOMY_LIMITS, parseBoundedInteger } from '../services/money';
import { buildEconomyPanel, ECONOMY_IDS, type EditKind } from '../services/panel';

function readInteger(
  interaction: ModalSubmitInteraction<'cached'>,
  field: string,
  label: string,
  limits: { min: number; max: number },
): number {
  const value = parseBoundedInteger(interaction.fields.getTextInputValue(field), limits);
  if (value === null) {
    throw new BotError(`${label} doit être un nombre entier entre ${limits.min} et ${limits.max}.`);
  }
  return value;
}

/** Validation des formulaires du panneau d'économie. */
const handler: ComponentHandler = {
  id: ECONOMY_IDS.modal,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isModalSubmit()) return;
    const kind = args[0] as EditKind;
    let update: EconomyConfigUpdate;

    if (kind === 'currency') {
      const currencyName = interaction.fields.getTextInputValue('name').replace(/\s+/g, ' ').trim();
      const currencyEmoji = interaction.fields.getTextInputValue('emoji').trim();
      if (!currencyName || !currencyEmoji) throw new BotError('Le nom et le symbole de la monnaie sont obligatoires.');
      // Le symbole apparaît dans tous les messages : pas de mention ni de saut de ligne.
      if (/[@\n`]/.test(currencyName) || /[@\n`\s]/.test(currencyEmoji)) {
        throw new BotError('Le nom et le symbole ne peuvent pas contenir de mention, d’accent grave ou de saut de ligne.');
      }
      update = { currencyName, currencyEmoji };
    } else if (kind === 'rewards') {
      update = {
        dailyAmount: readInteger(interaction, 'daily', 'La récompense quotidienne', ECONOMY_LIMITS.reward),
        weeklyAmount: readInteger(interaction, 'weekly', 'La récompense hebdomadaire', ECONOMY_LIMITS.reward),
      };
    } else {
      const messageMin = readInteger(interaction, 'min', 'Le gain minimum', ECONOMY_LIMITS.messageGain);
      const messageMax = readInteger(interaction, 'max', 'Le gain maximum', ECONOMY_LIMITS.messageGain);
      if (messageMax < messageMin) throw new BotError('Le gain maximum doit être supérieur ou égal au gain minimum.');
      update = {
        messageMin,
        messageMax,
        messageCooldownSeconds: readInteger(interaction, 'cooldown', 'Le délai', ECONOMY_LIMITS.messageCooldownSeconds),
      };
    }

    await updateEconomyConfig(interaction.guildId, update);

    // Ouvert depuis le panneau : on le met à jour sur place.
    if (interaction.isFromMessage()) {
      await interaction.update(await buildEconomyPanel(interaction.guild));
    } else {
      await interaction.reply({ embeds: [successEmbed('Réglages enregistrés.')], flags: MessageFlags.Ephemeral });
    }
  },
};

export default handler;
