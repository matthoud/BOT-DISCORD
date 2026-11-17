import {
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { GamingConfig, GamingOffer } from '@prisma/client';
import {
  claimAnnouncement,
  findOffersToAnnounce,
  listActiveGamingConfigs,
  setAnnouncementMessage,
  skipOffers,
  syncOffers,
} from '../../../core/database/repositories/gaming.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { permissionNames } from '../../../core/permissions/names';
import { getProvider, type GamingProvider } from '../providers';
import { rejectReason } from './filters';
import { buildOfferMessage, MODULE_ID, type ProviderInfo } from './presenter';

export const CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/** Annonces publiées au plus par serveur et par passage : pas d'avalanche dans un salon. */
export const MAX_ANNOUNCES_PER_RUN = 5;

const UNKNOWN_PROVIDER: ProviderInfo = {
  name: 'source inconnue',
  website: 'https://www.gamerpower.com',
};

export function providerInfo(id: string): ProviderInfo {
  const provider = getProvider(id);
  return provider ? { name: provider.name, website: provider.website } : UNKNOWN_PROVIDER;
}

/** Salon utilisable pour les annonces, ou une raison lisible. */
export async function resolveChannel(
  guild: Guild,
  channelId: string,
): Promise<{ channel: GuildTextBasedChannel } | { error: string }> {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return { error: 'salon introuvable (supprimé ?)' };
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const missing = channel.permissionsFor(me).missing(CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    return {
      error: `permissions manquantes : ${permissionNames(missing.map((name) => PermissionFlagsBits[name])).join(', ')}`,
    };
  }
  return { channel };
}

export async function assertChannel(guild: Guild, channel: GuildTextBasedChannel): Promise<void> {
  const resolved = await resolveChannel(guild, channel.id);
  if ('error' in resolved)
    throw new BotError(`Je ne peux pas publier dans ${channel} : ${resolved.error}.`);
}

/** Salon d'une offre : les jeux dans le salon principal, le reste dans le salon secondaire s'il existe. */
export function channelFor(
  offer: Pick<GamingOffer, 'kind'>,
  config: Pick<GamingConfig, 'channelId' | 'extrasChannelId'>,
): string | null {
  return offer.kind === 'GAME' ? config.channelId : (config.extrasChannelId ?? config.channelId);
}

/**
 * Publie des offres sur un serveur. Chaque annonce est réservée en base avant l'envoi :
 * une offre n'est jamais publiée deux fois sur le même serveur. Retourne le nombre de publications.
 */
export async function announceOffers(
  guild: Guild,
  config: GamingConfig,
  offers: GamingOffer[],
): Promise<number> {
  let posted = 0;
  const channels = new Map<string, GuildTextBasedChannel | null>();
  for (const offer of offers) {
    const channelId = channelFor(offer, config);
    if (!channelId) continue;
    if (!channels.has(channelId)) {
      const resolved = await resolveChannel(guild, channelId);
      if ('error' in resolved) {
        logger.warn(
          { guildId: guild.id, channelId, reason: resolved.error },
          'Annonce gaming non publiée',
        );
      }
      channels.set(channelId, 'channel' in resolved ? resolved.channel : null);
    }
    const channel = channels.get(channelId);
    // Salon inutilisable : l'offre reste en attente et sera publiée une fois le salon réparé.
    if (!channel) continue;
    const announcementId = await claimAnnouncement(guild.id, offer.id, channel.id);
    if (announcementId === null) continue;
    try {
      const message = await channel.send(
        buildOfferMessage(offer, providerInfo(offer.provider), guild, config),
      );
      await setAnnouncementMessage(announcementId, message.id);
      posted++;
    } catch (error) {
      logger.warn(
        { err: error, guildId: guild.id, offerId: offer.id },
        "Échec de la publication d'une offre gaming",
      );
    }
  }
  return posted;
}

/** Annonce les nouvelles offres sur tous les serveurs configurés. */
export async function announceNewOffers(client: Client, signal?: AbortSignal): Promise<void> {
  for (const config of await listActiveGamingConfigs()) {
    if (signal?.aborted) return;
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild?.available || !(await isModuleEnabled(guild.id, MODULE_ID))) continue;
    try {
      const candidates = await findOffersToAnnounce(config);
      const rejected = candidates.filter((offer) => rejectReason(offer, config) !== null);
      // Offres filtrées : marquées comme traitées, elles ne seront plus examinées.
      await skipOffers(
        guild.id,
        rejected.map((offer) => offer.id),
      );
      const accepted = candidates
        .filter((offer) => rejectReason(offer, config) === null)
        .slice(0, MAX_ANNOUNCES_PER_RUN);
      await announceOffers(guild, config, accepted);
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, 'Erreur pendant les annonces gaming');
    }
  }
}

/** Tâche périodique d'un fournisseur : synchronise ses offres puis annonce les nouvelles. */
export async function syncProvider(
  client: Client,
  provider: GamingProvider,
  signal?: AbortSignal,
): Promise<void> {
  // Aucune requête vers la source tant qu'aucun serveur n'a activé le module.
  const states = await Promise.all(
    [...client.guilds.cache.keys()].map((id) => isModuleEnabled(id, MODULE_ID)),
  );
  if (!states.some(Boolean)) return;
  const offers = await provider.fetchOffers(signal);
  const result = await syncOffers(provider.id, offers);
  if (result.created > 0 || result.expired > 0) {
    logger.info({ provider: provider.id, ...result }, 'Offres gaming synchronisées');
  }
  await announceNewOffers(client, signal);
}
