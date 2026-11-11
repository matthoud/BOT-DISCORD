import { getGuildConfig } from '../../../core/database/repositories/guild.repository';
import { BotError } from '../../../core/errors/BotError';
import { DATE_EXAMPLES, parseDateTime } from '../../../utils/datetime';

/**
 * Interprète une date saisie dans le fuseau horaire du serveur et vérifie qu'elle est dans le futur,
 * au moins `minDelayMs` et au plus `maxDelayMs` après maintenant.
 */
export async function resolveFutureDate(
  guildId: string,
  input: string,
  limits: { minDelayMs: number; maxDelayMs: number },
): Promise<{ date: Date; timezone: string }> {
  const { timezone } = await getGuildConfig(guildId);
  const now = Date.now();
  const date = parseDateTime(input, timezone, new Date(now));
  if (!date) {
    throw new BotError(
      `Date non comprise. Exemples : ${DATE_EXAMPLES}.\nLes dates sont lues dans le fuseau du serveur (**${timezone}**, réglable avec \`/config timezone\`).`,
    );
  }
  if (date.getTime() - now < limits.minDelayMs) {
    throw new BotError('Cette date est déjà passée, ou trop proche. Choisissez un moment dans le futur.');
  }
  if (date.getTime() - now > limits.maxDelayMs) {
    throw new BotError("Cette date est trop lointaine : la limite est d'un an.");
  }
  return { date, timezone };
}
