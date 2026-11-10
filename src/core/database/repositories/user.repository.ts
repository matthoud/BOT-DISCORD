import type { UserConfig } from '@prisma/client';
import { prisma } from '../prisma';

/** Préférences de l'utilisateur, ou `null` s'il n'a jamais rien configuré (valeurs par défaut). */
export async function getUserConfig(userId: string): Promise<UserConfig | null> {
  return prisma.userConfig.findUnique({ where: { userId } });
}

export async function acceptsDirectMessages(userId: string): Promise<boolean> {
  const config = await getUserConfig(userId);
  return config?.dmNotifications ?? true;
}

export async function setDmNotifications(userId: string, enabled: boolean): Promise<UserConfig> {
  return prisma.userConfig.upsert({
    where: { userId },
    create: { userId, dmNotifications: enabled },
    update: { dmNotifications: enabled },
  });
}
