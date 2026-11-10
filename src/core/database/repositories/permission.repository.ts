import type { CustomPermission } from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const cache = new TtlCache<string, CustomPermission[]>(CONFIG_CACHE_TTL_MS);

export async function listCustomPermissions(guildId: string): Promise<CustomPermission[]> {
  return cache.getOrLoad(guildId, () =>
    prisma.customPermission.findMany({
      where: { guildId },
      orderBy: [{ commandName: 'asc' }, { createdAt: 'asc' }],
    }),
  );
}

export async function getCommandPermissions(
  guildId: string,
  commandName: string,
): Promise<CustomPermission[]> {
  const all = await listCustomPermissions(guildId);
  return all.filter((permission) => permission.commandName === commandName);
}

export async function setCustomPermission(
  guildId: string,
  commandName: string,
  roleId: string,
  allow: boolean,
): Promise<void> {
  await ensureGuild(guildId);
  await prisma.customPermission.upsert({
    where: { guildId_commandName_roleId: { guildId, commandName, roleId } },
    create: { guildId, commandName, roleId, allow },
    update: { allow },
  });
  cache.delete(guildId);
}

/** Supprime les règles d'une commande (pour un rôle précis ou toutes). Retourne le nombre supprimé. */
export async function removeCustomPermissions(
  guildId: string,
  commandName: string,
  roleId?: string,
): Promise<number> {
  const result = await prisma.customPermission.deleteMany({
    where: { guildId, commandName, ...(roleId ? { roleId } : {}) },
  });
  cache.delete(guildId);
  return result.count;
}
