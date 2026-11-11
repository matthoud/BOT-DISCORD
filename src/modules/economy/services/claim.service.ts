import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import {
  claimReward,
  getEconomyConfig,
  type ClaimKind,
} from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors, warningEmbed } from '../../../core/ui/embeds';
import { timestamp } from '../../../utils/format';
import { DAY_MS, formatMoney, WEEK_MS } from './money';

const LABELS: Record<ClaimKind, { title: string; name: string; command: string }> = {
  daily: { title: '📅 Récompense quotidienne', name: 'quotidienne', command: '/daily' },
  weekly: { title: '🗓️ Récompense hebdomadaire', name: 'hebdomadaire', command: '/weekly' },
};

/** Traite `/daily` et `/weekly` : le droit est calculé à partir de la date de la dernière réclamation. */
export async function runClaim(interaction: ChatInputCommandInteraction<'cached'>, kind: ClaimKind): Promise<void> {
  const config = await getEconomyConfig(interaction.guildId);
  const amount = kind === 'daily' ? config.dailyAmount : config.weeklyAmount;
  const label = LABELS[kind];
  if (amount <= 0) throw new BotError(`La récompense ${label.name} est désactivée sur ce serveur.`);

  const periodMs = kind === 'daily' ? DAY_MS : WEEK_MS;
  const result = await claimReward(interaction.guildId, interaction.user.id, kind, amount, periodMs);

  if (!result.claimed) {
    await interaction.reply({
      embeds: [
        warningEmbed(
          `Vous avez déjà réclamé votre récompense ${label.name}. Prochaine disponible ${timestamp(result.availableAt, 'R')} (${timestamp(result.availableAt, 'f')}).`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [
      baseEmbed(Colors.success)
        .setTitle(label.title)
        .setDescription(
          `${interaction.user}, vous recevez **${formatMoney(amount, config)}**.\nNouveau solde : **${formatMoney(result.balance, config)}**`,
        )
        .setFooter({ text: `Revenez ${kind === 'daily' ? 'dans 24 heures' : 'dans 7 jours'} avec ${label.command}` }),
    ],
  });
}
