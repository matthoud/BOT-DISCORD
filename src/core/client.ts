import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import type { BotModule, LoadedCommand, LoadedComponent } from '../types';

/** Client Discord enrichi des registres de modules, commandes et composants. */
export class BotClient extends Client {
  readonly modules = new Collection<string, BotModule>();
  readonly commands = new Collection<string, LoadedCommand>();
  readonly components = new Collection<string, LoadedComponent>();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      // Permet de recevoir les événements concernant des éléments absents du cache.
      partials: [Partials.Message, Partials.GuildMember, Partials.User],
      // Par défaut, aucun message du bot ne peut mentionner @everyone ou un rôle.
      allowedMentions: { parse: ['users'], repliedUser: false },
    });
  }
}
