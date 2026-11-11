import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild } from 'discord.js';
import { countShopItems, getEconomyConfig } from '../../../core/database/repositories/economy.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed } from '../../../core/ui/embeds';
import { formatDuration } from '../../../utils/duration';
import { formatMoney, messageGainDisabled } from './money';

export const ECONOMY_IDS = {
  edit: 'economy:edit',
  modal: 'economy:modal',
} as const;

/** Réglages modifiables par un formulaire. */
export type EditKind = 'currency' | 'rewards' | 'activity';

/** Panneau interactif de configuration de l'économie. */
export async function buildEconomyPanel(guild: Guild) {
  const [config, itemCount] = await Promise.all([getEconomyConfig(guild.id), countShopItems(guild.id)]);
  const reward = (amount: number): string => (amount > 0 ? `**${formatMoney(amount, config)}**` : '*désactivée*');

  const embed = baseEmbed()
    .setTitle('🪙 Configuration de l’économie')
    .setDescription(
      `La boutique se gère avec \`/shop-admin\` (${itemCount} article(s)). Les soldes s'ajustent avec \`/economy-admin give\` et \`/economy-admin take\`.`,
    )
    .addFields(
      { name: 'Monnaie', value: `${config.currencyEmoji} ${config.currencyName}`, inline: true },
      {
        name: 'Récompenses',
        value: `Quotidienne : ${reward(config.dailyAmount)}\nHebdomadaire : ${reward(config.weeklyAmount)}`,
        inline: true,
      },
      {
        name: 'Gains en discutant',
        value: messageGainDisabled(config)
          ? '*désactivés*'
          : `Entre **${config.messageMin}** et **${config.messageMax}** ${config.currencyEmoji} par message\nUn gain toutes les **${formatDuration(config.messageCooldownSeconds)}** au plus`,
      },
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId(ECONOMY_IDS.edit, 'currency'))
      .setLabel('Monnaie')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(ECONOMY_IDS.edit, 'rewards'))
      .setLabel('Récompenses')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(componentId(ECONOMY_IDS.edit, 'activity'))
      .setLabel('Gains en discutant')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [buttons] };
}
