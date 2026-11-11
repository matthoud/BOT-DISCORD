import type { GuildConfig } from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';

const cache = new TtlCache<string, GuildConfig>(CONFIG_CACHE_TTL_MS);

/** Retourne la configuration du serveur, en la créant si elle n'existe pas encore. */
export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  return cache.getOrLoad(guildId, () =>
    prisma.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} }),
  );
}

/** Garantit l'existence de la ligne racine du serveur (requise par les clés étrangères). */
export async function ensureGuild(guildId: string): Promise<void> {
  await getGuildConfig(guildId);
}

export async function updateGuildConfig(
  guildId: string,
  data: { dmOnSanction?: boolean; timezone?: string },
): Promise<GuildConfig> {
  const config = await prisma.guildConfig.upsert({
    where: { guildId },
    create: { ...data, guildId },
    update: data,
  });
  cache.set(guildId, config);
  return config;
}
