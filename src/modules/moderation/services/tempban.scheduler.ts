import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import type { BotClient } from '../../../core/client';
import {
  findExpiredTempBans,
  resolvePendingBans,
} from '../../../core/database/repositories/moderation.repository';
import { logger } from '../../../core/logger';
import { recordCase } from './moderation.service';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Lève les bannissements temporaires arrivés à échéance.
 * L'échéance est stockée en base : un redémarrage du bot ne fait perdre aucun bannissement en attente.
 */
async function liftExpiredBans(client: BotClient): Promise<void> {
  if (!client.isReady()) return;

  for (const expired of await findExpiredTempBans(new Date())) {
    const guild = client.guilds.cache.get(expired.guildId);
    if (!guild) {
      // Le bot n'est plus sur ce serveur : il ne peut plus rien y faire.
      await resolvePendingBans(expired.guildId, expired.targetId);
      continue;
    }
    if (!guild.available) continue; // Panne temporaire côté Discord : nouvel essai au prochain passage.

    try {
      await guild.bans.remove(
        expired.targetId,
        `Fin du bannissement temporaire (cas n°${expired.caseNumber})`,
      );
    } catch (error) {
      const alreadyUnbanned =
        error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan;
      await resolvePendingBans(expired.guildId, expired.targetId);
      if (!alreadyUnbanned) {
        logger.warn(
          { err: error, guildId: guild.id, caseNumber: expired.caseNumber },
          'Impossible de lever un bannissement temporaire (permission manquante ?)',
        );
      }
      continue;
    }

    await resolvePendingBans(expired.guildId, expired.targetId);
    const target = await client.users.fetch(expired.targetId).catch(() => null);
    if (target) {
      await recordCase(
        {
          guild,
          moderator: client.user,
          target,
          reason: `Fin automatique du bannissement temporaire (cas n°${expired.caseNumber})`,
        },
        'UNBAN',
      );
    }
  }
}

export function startTempBanScheduler(client: BotClient): void {
  const timer = setInterval(() => {
    liftExpiredBans(client).catch((error) =>
      logger.error({ err: error }, 'Erreur du planificateur de bannissements temporaires'),
    );
  }, CHECK_INTERVAL_MS);
  timer.unref();
}
