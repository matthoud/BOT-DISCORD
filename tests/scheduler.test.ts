import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotClient } from '../src/core/client';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import { retryDelayMs, Scheduler, type TaskState, type TaskStore } from '../src/core/scheduler/Scheduler';
import { resolveModuleStates } from '../src/core/database/repositories/module.repository';
import { isValidTimezone, searchTimezones } from '../src/utils/timezone';

const client = {} as BotClient;

class MemoryStore implements TaskStore {
  readonly states = new Map<string, TaskState>();
  failOnSave = false;

  async load(names: string[]): Promise<TaskState[]> {
    return names.flatMap((name) => {
      const state = this.states.get(name);
      return state ? [{ ...state }] : [];
    });
  }

  async save(state: TaskState): Promise<void> {
    if (this.failOnSave) throw new Error('base indisponible');
    this.states.set(state.name, { ...state });
  }
}

describe('retryDelayMs', () => {
  it('double à chaque échec en partant d’une minute au plus', () => {
    expect(retryDelayMs(600_000, 1)).toBe(60_000);
    expect(retryDelayMs(600_000, 2)).toBe(120_000);
    expect(retryDelayMs(600_000, 3)).toBe(240_000);
    expect(retryDelayMs(10_000, 1)).toBe(10_000);
  });

  it('plafonne à une heure, ou à l’intervalle s’il est plus long', () => {
    expect(retryDelayMs(600_000, 50)).toBe(3_600_000);
    expect(retryDelayMs(6 * 3_600_000, 50)).toBe(6 * 3_600_000);
  });
});

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-11T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exécute une tâche au démarrage puis à chaque intervalle', async () => {
    const store = new MemoryStore();
    const scheduler = new Scheduler(store, { tickMs: 1000 });
    const run = vi.fn(async () => undefined);
    scheduler.register({ name: 'test:simple', intervalSeconds: 60, run });

    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(2);

    expect(store.states.get('test:simple')?.consecutiveFailures).toBe(0);
    expect(store.states.get('test:simple')?.lastSuccessAt).toBeInstanceOf(Date);
    scheduler.stop();
  });

  it('n’exécute jamais deux fois la même tâche en même temps', async () => {
    const scheduler = new Scheduler(new MemoryStore(), { tickMs: 1000 });
    let concurrent = 0;
    let maxConcurrent = 0;
    const run = vi.fn(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      concurrent--;
    });
    scheduler.register({ name: 'test:lente', intervalSeconds: 1, run });

    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(35_000);
    expect(maxConcurrent).toBe(1);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(3);
    scheduler.stop();
  });

  it('retente une tâche en échec avec un délai croissant, sans bloquer les autres', async () => {
    const store = new MemoryStore();
    const scheduler = new Scheduler(store, { tickMs: 1000 });
    const failing = vi.fn(async () => {
      throw new Error('source indisponible');
    });
    const healthy = vi.fn(async () => undefined);
    scheduler.register({ name: 'test:panne', intervalSeconds: 600, run: failing });
    scheduler.register({ name: 'test:saine', intervalSeconds: 60, run: healthy });

    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(0);
    expect(failing).toHaveBeenCalledTimes(1);

    // 1er nouvel essai après 60 s, 2e après 120 s de plus.
    await vi.advanceTimersByTimeAsync(61_000);
    expect(failing).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(failing).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(failing).toHaveBeenCalledTimes(3);

    expect(store.states.get('test:panne')?.consecutiveFailures).toBe(3);
    expect(store.states.get('test:panne')?.lastError).toContain('source indisponible');
    expect(healthy.mock.calls.length).toBeGreaterThanOrEqual(3);
    scheduler.stop();
  });

  it('considère en échec une tâche qui dépasse sa durée maximale et annule son signal', async () => {
    const store = new MemoryStore();
    const scheduler = new Scheduler(store, { tickMs: 1000 });
    let aborted = false;
    scheduler.register({
      name: 'test:bloquee',
      intervalSeconds: 60,
      timeoutSeconds: 5,
      run: ({ signal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    });

    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(aborted).toBe(true);
    expect(store.states.get('test:bloquee')?.consecutiveFailures).toBe(1);
    scheduler.stop();
  });

  it('reprend les échéances enregistrées après un redémarrage', async () => {
    const store = new MemoryStore();
    const now = Date.now();
    store.states.set('test:future', {
      name: 'test:future',
      lastRunAt: new Date(now - 60_000),
      lastSuccessAt: new Date(now - 60_000),
      nextRunAt: new Date(now + 300_000),
      consecutiveFailures: 0,
      lastError: null,
    });
    store.states.set('test:retard', {
      name: 'test:retard',
      lastRunAt: new Date(now - 7_200_000),
      lastSuccessAt: new Date(now - 7_200_000),
      nextRunAt: new Date(now - 3_600_000),
      consecutiveFailures: 0,
      lastError: null,
    });

    const scheduler = new Scheduler(store, { tickMs: 1000 });
    const future = vi.fn(async () => undefined);
    const late = vi.fn(async () => undefined);
    scheduler.register({ name: 'test:future', intervalSeconds: 3600, run: future });
    scheduler.register({ name: 'test:retard', intervalSeconds: 3600, run: late });

    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(late).toHaveBeenCalledTimes(1);
    expect(future).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300_000);
    expect(future).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('continue de fonctionner si l’état ne peut pas être enregistré', async () => {
    const store = new MemoryStore();
    store.failOnSave = true;
    const scheduler = new Scheduler(store, { tickMs: 1000 });
    const run = vi.fn(async () => undefined);
    scheduler.register({ name: 'test:sans-base', intervalSeconds: 10, run });

    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(run).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('n’enregistre pas l’état des tâches internes', async () => {
    const store = new MemoryStore();
    const scheduler = new Scheduler(store, { tickMs: 1000 });
    scheduler.register({ name: 'test:interne', intervalSeconds: 10, persist: false, run: async () => undefined });
    await scheduler.start(client);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.states.size).toBe(0);
    scheduler.stop();
  });

  it('refuse les déclarations invalides', async () => {
    const scheduler = new Scheduler(new MemoryStore(), { tickMs: 1000 });
    const run = async () => undefined;
    scheduler.register({ name: 'test:a', intervalSeconds: 10, run });
    expect(() => scheduler.register({ name: 'test:a', intervalSeconds: 10, run })).toThrowError(/double/);
    expect(() => scheduler.register({ name: 'test:b', intervalSeconds: 0, run })).toThrowError(/Intervalle/);
    await scheduler.start(client);
    expect(() => scheduler.register({ name: 'test:c', intervalSeconds: 10, run })).toThrowError(/après le démarrage/);
    scheduler.stop();
  });
});

describe('resolveModuleStates', () => {
  const defaults = new Map([
    ['fun', true],
    ['levels', false],
  ]);

  it('applique l’état par défaut de chaque module', () => {
    const states = resolveModuleStates(defaults, []);
    expect(states.get('fun')).toBe(true);
    expect(states.get('levels')).toBe(false);
  });

  it('donne la priorité au choix enregistré pour le serveur', () => {
    const states = resolveModuleStates(defaults, [
      { moduleId: 'fun', enabled: false },
      { moduleId: 'levels', enabled: true },
    ]);
    expect(states.get('fun')).toBe(false);
    expect(states.get('levels')).toBe(true);
  });
});

describe('fuseaux horaires', () => {
  it('reconnaît les fuseaux valides', () => {
    expect(isValidTimezone('Europe/Paris')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });

  it('propose des fuseaux à partir d’une saisie partielle', () => {
    expect(searchTimezones('')[0]).toBe('Europe/Paris');
    expect(searchTimezones('paris')[0]).toBe('Europe/Paris');
    expect(searchTimezones('new york')).toContain('America/New_York');
    expect(searchTimezones('europe').length).toBeLessThanOrEqual(25);
  });
});
