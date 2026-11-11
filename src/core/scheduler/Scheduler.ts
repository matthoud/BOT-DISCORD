import type { BotClient } from '../client';
import { logger } from '../logger';

const DEFAULT_TICK_MS = 5000;
const DEFAULT_TIMEOUT_SECONDS = 300;
const MAX_ERROR_LENGTH = 500;
const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;

export interface TaskContext {
  client: BotClient;
  /** Annulé si la tâche dépasse sa durée maximale ou si le bot s'arrête. */
  signal: AbortSignal;
}

export interface ScheduledTaskDefinition {
  /** Identifiant unique, par convention `module:tache`. */
  name: string;
  /** Intervalle entre deux exécutions réussies. */
  intervalSeconds: number;
  /** Durée maximale d'une exécution (5 minutes par défaut). */
  timeoutSeconds?: number;
  /**
   * Faux pour les tâches purement internes : leur état n'est pas enregistré en base
   * et elles repartent de zéro à chaque démarrage.
   */
  persist?: boolean;
  run(context: TaskContext): Promise<void>;
}

/** État d'une tâche, conservé en base pour survivre aux redémarrages. */
export interface TaskState {
  name: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  nextRunAt: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface TaskStore {
  load(names: string[]): Promise<TaskState[]>;
  save(state: TaskState): Promise<void>;
}

export interface SchedulerOptions {
  /** Fréquence à laquelle le planificateur regarde si une tâche est due. */
  tickMs?: number;
}

interface TaskEntry {
  definition: ScheduledTaskDefinition;
  state: TaskState;
  running: boolean;
  controller: AbortController | null;
}

/**
 * Délai avant une nouvelle tentative après un échec : il double à chaque échec consécutif,
 * en partant d'une minute au plus, et plafonne à une heure (ou à l'intervalle s'il est plus long).
 */
export function retryDelayMs(intervalMs: number, consecutiveFailures: number): number {
  const base = Math.min(intervalMs, ONE_MINUTE_MS);
  const ceiling = Math.max(intervalMs, ONE_HOUR_MS);
  const exponent = Math.min(Math.max(consecutiveFailures, 1) - 1, 20);
  return Math.min(base * 2 ** exponent, ceiling);
}

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Gestionnaire unique des tâches périodiques du bot.
 * - une tâche ne s'exécute jamais deux fois en même temps ;
 * - une tâche en échec est retentée avec un délai croissant, sans gêner les autres ;
 * - les échéances sont enregistrées : après un redémarrage, une tâche en retard repart aussitôt.
 */
export class Scheduler {
  private readonly tasks = new Map<string, TaskEntry>();
  private readonly tickMs: number;
  private timer: NodeJS.Timeout | null = null;
  private client: BotClient | null = null;

  constructor(
    private readonly store: TaskStore,
    options: SchedulerOptions = {},
  ) {
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  }

  /** Déclare une tâche. À appeler au démarrage, depuis la fonction `init` d'un module. */
  register(definition: ScheduledTaskDefinition): void {
    if (this.timer) throw new Error(`Tâche « ${definition.name} » déclarée après le démarrage du planificateur.`);
    if (this.tasks.has(definition.name)) throw new Error(`Nom de tâche en double : ${definition.name}`);
    if (!(definition.intervalSeconds >= 1)) {
      throw new Error(`Intervalle invalide pour la tâche « ${definition.name} ».`);
    }
    this.tasks.set(definition.name, {
      definition,
      state: {
        name: definition.name,
        lastRunAt: null,
        lastSuccessAt: null,
        nextRunAt: null,
        consecutiveFailures: 0,
        lastError: null,
      },
      running: false,
      controller: null,
    });
  }

  /** Recharge l'état enregistré puis lance la surveillance des échéances. */
  async start(client: BotClient): Promise<void> {
    if (this.timer) return;
    this.client = client;

    const persisted = [...this.tasks.values()]
      .filter((entry) => entry.definition.persist !== false)
      .map((entry) => entry.definition.name);
    try {
      for (const state of await this.store.load(persisted)) {
        const entry = this.tasks.get(state.name);
        if (entry) entry.state = state;
      }
    } catch (error) {
      // Sans état enregistré, les tâches repartent simplement comme au premier démarrage.
      logger.error({ err: error }, "Impossible de charger l'état des tâches planifiées");
    }

    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref();
    logger.info({ tasks: [...this.tasks.keys()] }, 'Planificateur démarré');
    this.tick();
  }

  /** Arrête la surveillance et demande l'annulation des tâches en cours. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const entry of this.tasks.values()) entry.controller?.abort();
  }

  /** État courant de chaque tâche, pour le diagnostic. */
  snapshot(): (TaskState & { running: boolean; intervalSeconds: number })[] {
    return [...this.tasks.values()].map((entry) => ({
      ...entry.state,
      running: entry.running,
      intervalSeconds: entry.definition.intervalSeconds,
    }));
  }

  private tick(): void {
    const now = Date.now();
    for (const entry of this.tasks.values()) {
      if (entry.running) continue;
      // Une tâche jamais exécutée (ou dont l'échéance est passée pendant un arrêt) part immédiatement.
      if (entry.state.nextRunAt && entry.state.nextRunAt.getTime() > now) continue;
      void this.execute(entry);
    }
  }

  private async execute(entry: TaskEntry): Promise<void> {
    const { definition } = entry;
    const client = this.client;
    if (!client) return;

    entry.running = true;
    const controller = new AbortController();
    entry.controller = controller;
    const startedAt = Date.now();
    const intervalMs = definition.intervalSeconds * 1000;
    const timeoutMs = (definition.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Durée maximale dépassée (${timeoutMs / 1000} s)`));
      }, timeoutMs);
      timeout.unref();
    });

    // La tâche reste marquée « en cours » tant que son exécution n'est pas réellement terminée,
    // même après un dépassement de durée : deux exécutions ne se chevauchent donc jamais.
    const run = Promise.resolve().then(() => definition.run({ client, signal: controller.signal }));
    void run
      .catch(() => undefined)
      .finally(() => {
        entry.running = false;
        entry.controller = null;
      });

    let failure: unknown;
    let failed = false;
    try {
      await Promise.race([run, timedOut]);
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      clearTimeout(timeout);
    }

    const finishedAt = Date.now();
    const state = entry.state;
    state.lastRunAt = new Date(startedAt);
    if (failed) {
      state.consecutiveFailures += 1;
      state.lastError = describeError(failure);
      const delay = retryDelayMs(intervalMs, state.consecutiveFailures);
      state.nextRunAt = new Date(finishedAt + delay);
      logger.warn(
        {
          err: failure,
          task: definition.name,
          consecutiveFailures: state.consecutiveFailures,
          retryInSeconds: Math.round(delay / 1000),
        },
        "Échec d'une tâche planifiée",
      );
    } else {
      state.consecutiveFailures = 0;
      state.lastError = null;
      state.lastSuccessAt = new Date(finishedAt);
      state.nextRunAt = new Date(startedAt + intervalMs);
      logger.debug({ task: definition.name, durationMs: finishedAt - startedAt }, 'Tâche planifiée terminée');
    }

    if (definition.persist === false) return;
    try {
      await this.store.save({ ...state });
    } catch (error) {
      logger.error({ err: error, task: definition.name }, "Impossible d'enregistrer l'état d'une tâche planifiée");
    }
  }
}
