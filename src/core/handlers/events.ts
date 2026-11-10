import { ActivityType, Events } from 'discord.js';
import type { LoadedEvent } from '../../types';
import type { BotClient } from '../client';
import { ensureGuild } from '../database/repositories/guild.repository';
import { logger } from '../logger';
import { handleInteraction } from './interactions';

/** Enregistre les écouteurs des modules. Une erreur dans un écouteur ne fait jamais tomber le bot. */
export function registerModuleEvents(client: BotClient, events: LoadedEvent[]): void {
  for (const event of events) {
    const listener = (...args: unknown[]) => {
      Promise.resolve()
        .then(() => (event.execute as (...eventArgs: unknown[]) => unknown)(...args))
        .catch((error) =>
          logger.error(
            { err: error, event: event.name, module: event.moduleId },
            "Erreur dans un écouteur d'événement",
          ),
        );
    };
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }
}

/** Écouteurs du cœur : cycle de vie du client, interactions et diagnostics. */
export function registerCoreEvents(client: BotClient): void {
  client.once(Events.ClientReady, (readyClient) => {
    readyClient.user.setActivity('/help', { type: ActivityType.Listening });
    logger.info(
      { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
      'Bot connecté et prêt',
    );
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(client, interaction);
  });

  client.on(Events.GuildCreate, (guild) => {
    logger.info({ guildId: guild.id, members: guild.memberCount }, 'Bot ajouté à un serveur');
    ensureGuild(guild.id).catch((error) =>
      logger.error({ err: error, guildId: guild.id }, "Impossible d'initialiser le serveur en base"),
    );
  });

  client.on(Events.GuildDelete, (guild) => {
    // Les données sont conservées : elles seront retrouvées si le bot est réinvité.
    logger.info({ guildId: guild.id }, "Bot retiré d'un serveur");
  });

  client.on(Events.Error, (error) => logger.error({ err: error }, 'Erreur du client Discord'));
  client.on(Events.Warn, (message) => logger.warn(message));
  client.on(Events.ShardDisconnect, (event, shardId) =>
    logger.warn({ shardId, code: event.code }, 'Connexion à Discord interrompue'),
  );
  client.on(Events.ShardResume, (shardId) =>
    logger.info({ shardId }, 'Connexion à Discord rétablie'),
  );
  client.rest.on('rateLimited', (info) =>
    logger.warn({ route: info.route, retryAfter: info.timeToReset }, 'Limite de débit Discord atteinte'),
  );
}
