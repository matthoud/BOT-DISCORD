import type { Client } from 'discord.js';
import { prisma } from '../../src/core/database/prisma';

/**
 * Vide toutes les tables. À appeler une fois par fichier (`beforeAll`) : les configurations sont
 * mises en cache en mémoire, chaque test utilise donc ses propres identifiants de serveur.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "GuildConfig", "UserConfig", "ScheduledTask", "GamingOffer" RESTART IDENTITY CASCADE',
  );
}

/** Résultats d'opérations lancées en parallèle : succès et erreurs. */
export async function settle<T>(promises: Promise<T>[]): Promise<{ ok: T[]; errors: Error[] }> {
  const results = await Promise.allSettled(promises);
  return {
    ok: results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    errors: results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as Error] : [],
    ),
  };
}

export interface SentMessage {
  guildId: string;
  channelId: string;
  payload: Record<string, unknown>;
}

/**
 * Faux client Discord : des serveurs dont les salons enregistrent les messages envoyés.
 * Le bot y a toutes les permissions ; `removeChannel` simule un salon supprimé.
 */
export function fakeClient(guildIds: string[], channelIds: string[] = ['c1']) {
  const sent: SentMessage[] = [];
  const guilds = new Map(
    guildIds.map((guildId) => {
      const channels = new Map(
        channelIds.map((channelId) => [
          channelId,
          {
            id: channelId,
            isTextBased: () => true,
            isThread: () => false,
            permissionsFor: () => ({ missing: () => [], has: () => true }),
            send: async (payload: Record<string, unknown>) => {
              sent.push({ guildId, channelId, payload });
              return {
                id: `m${sent.length}`,
                url: `https://discord.com/channels/${guildId}/${channelId}/m${sent.length}`,
              };
            },
            messages: {
              fetch: async () => ({ edit: async () => undefined }),
              delete: async () => undefined,
            },
          },
        ]),
      );
      const guild = {
        id: guildId,
        name: `Serveur ${guildId}`,
        available: true,
        iconURL: () => null,
        channels: { cache: channels },
        members: { me: {}, fetchMe: async () => ({}) },
      };
      return [guildId, guild];
    }),
  );
  const client = {
    guilds: { cache: guilds },
    users: { fetch: async () => ({ send: async () => undefined }) },
  } as unknown as Client;
  return {
    client,
    sent,
    removeChannel: (guildId: string, channelId: string) =>
      guilds.get(guildId)?.channels.cache.delete(channelId),
  };
}

/** Titre de l'embed d'un message envoyé. */
export function embedTitle(message: SentMessage): string | undefined {
  const embeds = message.payload.embeds as { toJSON(): { title?: string } }[] | undefined;
  return embeds?.[0]?.toJSON().title;
}
