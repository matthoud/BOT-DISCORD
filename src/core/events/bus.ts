import { EventEmitter } from 'node:events';
import type { ModerationCase } from '@prisma/client';
import type { EmbedBuilder, Guild } from 'discord.js';
import { logger } from '../logger';

/**
 * Événements internes à l'application.
 * Ils permettent aux modules de communiquer sans dépendre directement les uns des autres
 * (ex. : la modération publie un cas, le module de logs l'affiche s'il est activé).
 */
export interface AppEvents {
  /** Un cas de modération vient d'être enregistré. `embed` en est la présentation prête à publier. */
  moderationCase: [payload: { guild: Guild; moderationCase: ModerationCase; embed: EmbedBuilder }];
}

class AppEventBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof AppEvents>(
    event: K,
    listener: (...args: AppEvents[K]) => Promise<void> | void,
  ): void {
    this.emitter.on(event, (...args: unknown[]) => {
      Promise.resolve()
        .then(() => listener(...(args as AppEvents[K])))
        .catch((error) => logger.error({ err: error, event }, "Erreur dans un écouteur d'événement interne"));
    });
  }

  emit<K extends keyof AppEvents>(event: K, ...args: AppEvents[K]): void {
    this.emitter.emit(event, ...args);
  }
}

export const appEvents = new AppEventBus();
