import type { Message } from 'discord.js';
import { CooldownManager } from '../../../core/cooldowns/CooldownManager';
import { creditActivity, getEconomyConfig } from '../../../core/database/repositories/economy.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { messageGainDisabled, MODULE_ID, rollGain } from './money';

/** Délai entre deux messages rémunérés d'un même membre, par serveur. */
export const activityCooldowns = new CooldownManager();

/** Rémunère un message, si les gains d'activité sont activés et que le délai du membre est écoulé. */
export async function handleMessageIncome(message: Message<true>): Promise<void> {
  if (message.author.bot || message.system || message.webhookId) return;
  const guildId = message.guildId;
  if (!(await isModuleEnabled(guildId, MODULE_ID))) return;

  const config = await getEconomyConfig(guildId);
  if (messageGainDisabled(config)) return;

  // Le délai est consommé avant l'écriture en base : deux messages simultanés ne comptent qu'une fois.
  const key = `${guildId}:${message.author.id}`;
  if (activityCooldowns.consume(key, config.messageCooldownSeconds) > 0) return;

  const gain = rollGain(config.messageMin, config.messageMax);
  if (gain > 0) await creditActivity(guildId, message.author.id, gain);
}
