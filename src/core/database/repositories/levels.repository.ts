import { Prisma, type LevelConfig, type LevelReward, type UserExperience } from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { BotError } from '../../errors/BotError';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const configCache = new TtlCache<string, LevelConfig>(CONFIG_CACHE_TTL_MS);
const rewardCache = new TtlCache<string, LevelReward[]>(CONFIG_CACHE_TTL_MS);

export type LevelConfigUpdate = Partial<
  Pick<
    LevelConfig,
    | 'xpMin'
    | 'xpMax'
    | 'cooldownSeconds'
    | 'levelBase'
    | 'levelStep'
    | 'announceEnabled'
    | 'announceChannelId'
    | 'levelUpMessage'
    | 'stackRewards'
    | 'ignoredChannelIds'
    | 'ignoredRoleIds'
  >
>;

/** Réglages du système de niveaux (créés avec les valeurs par défaut s'ils n'existent pas). */
export async function getLevelConfig(guildId: string): Promise<LevelConfig> {
  return configCache.getOrLoad(guildId, async () => {
    await ensureGuild(guildId);
    return prisma.levelConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  });
}

export async function updateLevelConfig(guildId: string, data: LevelConfigUpdate): Promise<LevelConfig> {
  await ensureGuild(guildId);
  const config = await prisma.levelConfig.upsert({
    where: { guildId },
    create: { ...data, guildId },
    update: data,
  });
  configCache.set(guildId, config);
  return config;
}

/** Ajoute l'XP d'un message à un membre et retourne son nouvel état. L'incrément est atomique. */
export async function addMessageXp(guildId: string, userId: string, amount: number): Promise<UserExperience> {
  await ensureGuild(guildId);
  const now = new Date();
  return prisma.userExperience.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, xp: amount, messageCount: 1, lastXpAt: now },
    update: { xp: { increment: amount }, messageCount: { increment: 1 }, lastXpAt: now },
  });
}

/** Mémorise le dernier niveau constaté d'un membre. */
export async function setStoredLevel(id: number, level: number): Promise<void> {
  await prisma.userExperience.update({ where: { id }, data: { level } });
}

export async function getUserExperience(guildId: string, userId: string): Promise<UserExperience | null> {
  return prisma.userExperience.findUnique({ where: { guildId_userId: { guildId, userId } } });
}

/** Rang d'un membre dans le classement du serveur (1 = premier). */
export async function getRank(guildId: string, xp: number): Promise<number> {
  return (await prisma.userExperience.count({ where: { guildId, xp: { gt: xp } } })) + 1;
}

export async function countRankedMembers(guildId: string): Promise<number> {
  return prisma.userExperience.count({ where: { guildId, xp: { gt: 0 } } });
}

export async function getLeaderboardPage(
  guildId: string,
  skip: number,
  take: number,
): Promise<Pick<UserExperience, 'userId' | 'xp' | 'messageCount'>[]> {
  return prisma.userExperience.findMany({
    where: { guildId, xp: { gt: 0 } },
    orderBy: [{ xp: 'desc' }, { id: 'asc' }],
    skip,
    take,
    select: { userId: true, xp: true, messageCount: true },
  });
}

/** Récompenses du serveur, triées par niveau croissant. */
export async function listLevelRewards(guildId: string): Promise<LevelReward[]> {
  return rewardCache.getOrLoad(guildId, () =>
    prisma.levelReward.findMany({ where: { guildId }, orderBy: { level: 'asc' } }),
  );
}

/** Associe un rôle à un niveau (remplace la récompense existante de ce niveau). */
export async function setLevelReward(guildId: string, level: number, roleId: string): Promise<void> {
  await ensureGuild(guildId);
  const sameRole = await prisma.levelReward.findUnique({ where: { guildId_roleId: { guildId, roleId } } });
  if (sameRole && sameRole.level !== level) {
    throw new BotError(`Ce rôle est déjà la récompense du niveau ${sameRole.level}.`);
  }
  try {
    await prisma.levelReward.upsert({
      where: { guildId_level: { guildId, level } },
      create: { guildId, level, roleId },
      update: { roleId },
    });
  } catch (error) {
    // Deux ajouts simultanés du même rôle : la contrainte d'unicité de la base tranche.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BotError('Ce rôle est déjà la récompense d’un autre niveau.');
    }
    throw error;
  } finally {
    rewardCache.delete(guildId);
  }
}

/** Supprime la récompense d'un niveau. Retourne faux s'il n'y en avait pas. */
export async function removeLevelReward(guildId: string, level: number): Promise<boolean> {
  const result = await prisma.levelReward.deleteMany({ where: { guildId, level } });
  rewardCache.delete(guildId);
  return result.count > 0;
}
