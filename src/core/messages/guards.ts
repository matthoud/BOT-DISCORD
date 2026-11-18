import type { Message } from 'discord.js';
import { logger } from '../logger';

/**
 * Point de contrôle unique des messages publiés sur un serveur.
 *
 * Un module de protection (anti-spam, anti-lien…) déclare une « garde » : elle examine le message
 * et indique s'il est retenu (supprimé ou sanctionné). Les modules qui récompensent l'activité
 * (niveaux, économie) demandent `isMessageRetained` avant d'agir : un message retenu ne rapporte
 * rien. Les gardes ne s'exécutent qu'une fois par message, quel que soit le nombre de modules qui
 * posent la question, et aucun module n'a besoin de connaître les autres.
 */
export type MessageGuard = (message: Message<true>) => Promise<boolean>;

const guards = new Map<string, MessageGuard>();
/** Résultat en cours ou récent pour chaque message, partagé entre les modules. */
const verdicts = new Map<string, { verdict: Promise<boolean>; at: number }>();
const VERDICT_TTL_MS = 60_000;
const SWEEP_THRESHOLD = 500;

/** Déclare une garde. À appeler une fois, depuis la fonction `init` d'un module. */
export function registerMessageGuard(id: string, guard: MessageGuard): void {
  if (guards.has(id)) throw new Error(`Garde de message en double : ${id}`);
  guards.set(id, guard);
}

async function runGuards(message: Message<true>): Promise<boolean> {
  let retained = false;
  for (const [id, guard] of guards) {
    try {
      // Toutes les gardes examinent le message : chacune peut enregistrer son propre incident.
      if (await guard(message)) retained = true;
    } catch (error) {
      // Une garde en erreur ne bloque jamais le message ni les autres gardes.
      logger.error(
        { err: error, guard: id, guildId: message.guildId },
        'Erreur dans une garde de message',
      );
    }
  }
  return retained;
}

function sweep(now: number): void {
  if (verdicts.size < SWEEP_THRESHOLD) return;
  for (const [id, entry] of verdicts) if (now - entry.at > VERDICT_TTL_MS) verdicts.delete(id);
}

/** Vrai si une garde a retenu ce message. Les messages de bots et de webhooks ne sont jamais examinés. */
export function isMessageRetained(message: Message<true>): Promise<boolean> {
  if (guards.size === 0 || message.author.bot || message.webhookId) return Promise.resolve(false);
  const now = Date.now();
  const known = verdicts.get(message.id);
  if (known) return known.verdict;
  sweep(now);
  const verdict = runGuards(message);
  verdicts.set(message.id, { verdict, at: now });
  return verdict;
}

/** Réservé aux tests : oublie les gardes et les résultats. */
export function resetMessageGuards(): void {
  guards.clear();
  verdicts.clear();
}
