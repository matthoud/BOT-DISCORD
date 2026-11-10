import type { WelcomeConfig } from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const cache = new TtlCache<string, WelcomeConfig>(CONFIG_CACHE_TTL_MS);

export type WelcomeConfigUpdate = Partial<
  Pick<
    WelcomeConfig,
    'enabled' | 'channelId' | 'welcomeMessage' | 'leaveEnabled' | 'leaveMessage' | 'autoRoleId'
  >
>;

/** Configuration de bienvenue du serveur (créée avec les valeurs par défaut si absente). */
export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
  return cache.getOrLoad(guildId, async () => {
    await ensureGuild(guildId);
    return prisma.welcomeConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  });
}

export async function updateWelcomeConfig(
  guildId: string,
  data: WelcomeConfigUpdate,
): Promise<WelcomeConfig> {
  await ensureGuild(guildId);
  const config = await prisma.welcomeConfig.upsert({
    where: { guildId },
    create: { ...data, guildId },
    update: data,
  });
  cache.set(guildId, config);
  return config;
}
