import type { BotModule } from '../../../types';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const cache = new TtlCache<string, Map<string, boolean>>(CONFIG_CACHE_TTL_MS);

/** État par défaut de chaque module chargé (renseigné une fois au démarrage). */
const defaults = new Map<string, boolean>();

export function registerModuleDefaults(modules: Pick<BotModule, 'id' | 'defaultEnabled'>[]): void {
  for (const botModule of modules) defaults.set(botModule.id, botModule.defaultEnabled ?? true);
}

/** Combine les états par défaut des modules avec les choix enregistrés pour un serveur. */
export function resolveModuleStates(
  moduleDefaults: ReadonlyMap<string, boolean>,
  rows: { moduleId: string; enabled: boolean }[],
): Map<string, boolean> {
  const states = new Map(moduleDefaults);
  for (const row of rows) states.set(row.moduleId, row.enabled);
  return states;
}

/** État effectif de chaque module pour le serveur (module → activé). */
export async function getModuleStates(guildId: string): Promise<Map<string, boolean>> {
  return cache.getOrLoad(guildId, async () => {
    const rows = await prisma.moduleConfig.findMany({
      where: { guildId },
      select: { moduleId: true, enabled: true },
    });
    return resolveModuleStates(defaults, rows);
  });
}

/** Sans choix enregistré, un module suit son état par défaut (`defaultEnabled`, activé sinon). */
export async function isModuleEnabled(guildId: string, moduleId: string): Promise<boolean> {
  const states = await getModuleStates(guildId);
  return states.get(moduleId) ?? true;
}

export async function setModuleEnabled(
  guildId: string,
  moduleId: string,
  enabled: boolean,
): Promise<void> {
  await ensureGuild(guildId);
  await prisma.moduleConfig.upsert({
    where: { guildId_moduleId: { guildId, moduleId } },
    create: { guildId, moduleId, enabled },
    update: { enabled },
  });
  cache.delete(guildId);
}
