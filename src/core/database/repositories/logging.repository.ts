import type { LoggingConfig } from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

/** Catégories de logs, chacune associée à une colonne de `LoggingConfig`. */
export const LOG_CATEGORIES = ['members', 'messages', 'channels', 'roles', 'moderation'] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

const COLUMN = {
  members: 'membersChannelId',
  messages: 'messagesChannelId',
  channels: 'channelsChannelId',
  roles: 'rolesChannelId',
  moderation: 'moderationChannelId',
} as const satisfies Record<LogCategory, keyof LoggingConfig>;

// `null` est mis en cache pour éviter une requête à chaque événement sur un serveur non configuré.
const cache = new TtlCache<string, LoggingConfig | null>(CONFIG_CACHE_TTL_MS);

export async function getLoggingConfig(guildId: string): Promise<LoggingConfig | null> {
  return cache.getOrLoad(guildId, () => prisma.loggingConfig.findUnique({ where: { guildId } }));
}

export function getLogChannelId(config: LoggingConfig | null, category: LogCategory): string | null {
  return config ? config[COLUMN[category]] : null;
}

export async function setLogChannel(
  guildId: string,
  category: LogCategory,
  channelId: string | null,
): Promise<LoggingConfig> {
  await ensureGuild(guildId);
  const data = { [COLUMN[category]]: channelId };
  const config = await prisma.loggingConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
  cache.set(guildId, config);
  return config;
}
