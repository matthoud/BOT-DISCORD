import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ClientEvents,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { BotClient } from '../core/client';

/** Définition d'une commande slash. Les vérifications déclarées sont appliquées par le cœur. */
export interface Command {
  /** Constructeur de la commande (SlashCommandBuilder). */
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  /** Permissions Discord exigées de l'utilisateur (dans le salon courant). */
  userPermissions?: bigint[];
  /** Permissions Discord dont le bot a besoin pour exécuter la commande. */
  botPermissions?: bigint[];
  /** Délai minimal, en secondes, entre deux utilisations par le même membre. */
  cooldown?: number;
  execute(interaction: ChatInputCommandInteraction<'cached'>): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction<'cached'>): Promise<void>;
}

export interface LoadedCommand extends Command {
  moduleId: string;
}

/** Écouteur d'un événement du client Discord. */
export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void> | void;
}

export interface LoadedEvent extends BotEvent {
  moduleId: string;
}

/** Aide au typage : `export default defineEvent({ name: Events.X, execute(...) {} })`. */
export function defineEvent<K extends keyof ClientEvents>(event: BotEvent<K>): BotEvent<K> {
  return event;
}

export type ComponentInteraction =
  | MessageComponentInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>;

/**
 * Gestionnaire persistant de composant (bouton, menu, modal).
 * Le `customId` du composant a la forme `id|arg1|arg2` ; il fonctionne encore après un redémarrage.
 */
export interface ComponentHandler {
  /** Identifiant unique, par convention `module:action`. */
  id: string;
  userPermissions?: bigint[];
  execute(interaction: ComponentInteraction, args: string[]): Promise<void>;
}

export interface LoadedComponent extends ComponentHandler {
  moduleId: string;
}

/** Manifeste d'un module (fichier `module.ts` à la racine du dossier du module). */
export interface BotModule {
  /** Identifiant technique, identique au nom du dossier. */
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Faux pour les modules indispensables, qui ne peuvent pas être désactivés. */
  canDisable: boolean;
  /**
   * État du module sur un serveur qui ne l'a jamais configuré (activé par défaut).
   * À mettre à `false` pour un module qui ne doit rien faire sans décision d'un administrateur.
   */
  defaultEnabled?: boolean;
  /**
   * Appelé une fois au démarrage, après le chargement de tous les modules et avant la connexion
   * à Discord. C'est ici qu'un module déclare ses tâches périodiques (`scheduler.register`).
   */
  init?(client: BotClient): void | Promise<void>;
}
