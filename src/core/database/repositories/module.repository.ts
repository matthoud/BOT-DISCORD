import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const cache = new TtlCache<string, Map<string, boolean>>(CONFIG_CACHE_TTL_MS);

/** États explicitement enregistrés pour le serveur (module → activé). */
export async function getModuleStates(guildId: string): Promise<Map<string, boolean>> {
  return cache.getOrLoad(guildId, async () => {
    const rows = await prisma.moduleConfig.findMany({
      where: { guildId },
      select: { moduleId: true, enabled: true },
    });
    return new Map(rows.map((row) => [row.moduleId, row.enabled]));
  });
}

/** Un module sans ligne en base est considéré comme activé. */
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
