import { prisma } from '../database/prisma';
import { Scheduler, type TaskState, type TaskStore } from './Scheduler';

/** Conserve l'état des tâches dans la table `ScheduledTask`. */
const prismaTaskStore: TaskStore = {
  async load(names: string[]): Promise<TaskState[]> {
    if (names.length === 0) return [];
    return prisma.scheduledTask.findMany({
      where: { name: { in: names } },
      select: {
        name: true,
        lastRunAt: true,
        lastSuccessAt: true,
        nextRunAt: true,
        consecutiveFailures: true,
        lastError: true,
      },
    });
  },

  async save(state: TaskState): Promise<void> {
    const { name, ...data } = state;
    await prisma.scheduledTask.upsert({ where: { name }, create: { name, ...data }, update: data });
  },
};

/** Planificateur unique du bot : toutes les tâches périodiques y sont déclarées. */
export const scheduler = new Scheduler(prismaTaskStore);

export type { ScheduledTaskDefinition, TaskContext } from './Scheduler';
