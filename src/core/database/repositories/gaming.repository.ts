import { Prisma, type GamingConfig, type GamingOffer, type GamingOfferKind } from '@prisma/client';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

/* -------------------------------------------------------------------- Offres */

/** Offre telle que fournie par une source, prête à être enregistrée. */
export interface OfferInput {
  externalId: string;
  title: string;
  description: string;
  kind: GamingOfferKind;
  stores: string[];
  worthCents: number | null;
  currency: string | null;
  endsAt: Date | null;
  imageUrl: string | null;
  url: string;
  keyRequired: boolean;
}

export interface SyncResult {
  total: number;
  created: number;
  expired: number;
  /** Vrai lors de la toute première synchronisation du fournisseur : ses offres ne seront pas annoncées. */
  baseline: boolean;
}

/**
 * Enregistre les offres actuelles d'un fournisseur : les nouvelles sont créées, les connues mises
 * à jour, celles qui ont disparu de la source sont marquées inactives.
 */
export async function syncOffers(
  provider: string,
  offers: OfferInput[],
  now = new Date(),
): Promise<SyncResult> {
  const baseline = (await prisma.gamingOffer.count({ where: { provider } })) === 0;
  const existing = new Set(
    (
      await prisma.gamingOffer.findMany({
        where: { provider, externalId: { in: offers.map((offer) => offer.externalId) } },
        select: { externalId: true },
      })
    ).map((offer) => offer.externalId),
  );

  await prisma.$transaction(
    offers.map((offer) => {
      const data = {
        title: offer.title,
        description: offer.description,
        kind: offer.kind,
        stores: offer.stores,
        worthCents: offer.worthCents,
        currency: offer.currency,
        endsAt: offer.endsAt,
        imageUrl: offer.imageUrl,
        url: offer.url,
        keyRequired: offer.keyRequired,
      };
      return prisma.gamingOffer.upsert({
        where: { provider_externalId: { provider, externalId: offer.externalId } },
        create: {
          provider,
          externalId: offer.externalId,
          ...data,
          baseline,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: { ...data, active: true, lastSeenAt: now },
      });
    }),
  );

  const { count: expired } = await prisma.gamingOffer.updateMany({
    where: {
      provider,
      active: true,
      externalId: { notIn: offers.map((offer) => offer.externalId) },
    },
    data: { active: false },
  });
  return {
    total: offers.length,
    created: offers.filter((offer) => !existing.has(offer.externalId)).length,
    expired,
    baseline,
  };
}

export interface OfferQuery {
  kinds?: GamingOfferKind[];
  now?: Date;
  take?: number;
}

/** Offres disponibles : actives et non expirées, les plus récentes d'abord. */
export async function listAvailableOffers(query: OfferQuery = {}): Promise<GamingOffer[]> {
  const now = query.now ?? new Date();
  return prisma.gamingOffer.findMany({
    where: {
      active: true,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      ...(query.kinds ? { kind: { in: query.kinds } } : {}),
    },
    orderBy: [{ firstSeenAt: 'desc' }, { id: 'desc' }],
    take: query.take ?? 100,
  });
}

/**
 * Offres à annoncer sur un serveur : apparues après sa configuration, hors première
 * synchronisation, disponibles, d'un type retenu, et jamais annoncées sur ce serveur.
 */
export async function findOffersToAnnounce(
  config: GamingConfig,
  now = new Date(),
  take = 30,
): Promise<GamingOffer[]> {
  return prisma.gamingOffer.findMany({
    where: {
      active: true,
      baseline: false,
      firstSeenAt: { gte: config.announceSince },
      kind: { in: config.kinds },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      announcements: { none: { guildId: config.guildId } },
    },
    orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
    take,
  });
}

/** Supprime les offres disparues depuis longtemps (une offre qui revient ensuite pourra être annoncée). */
export async function pruneOffers(before: Date): Promise<number> {
  const { count } = await prisma.gamingOffer.deleteMany({
    where: { active: false, lastSeenAt: { lt: before } },
  });
  return count;
}

/** Nombre d'offres disponibles par fournisseur. */
export async function countAvailableOffers(provider: string, now = new Date()): Promise<number> {
  return prisma.gamingOffer.count({
    where: { provider, active: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  });
}

/** État de la tâche de synchronisation d'un fournisseur (dernier succès, dernière erreur). */
export async function getSyncState(taskName: string) {
  return prisma.scheduledTask.findUnique({
    where: { name: taskName },
    select: {
      lastSuccessAt: true,
      lastRunAt: true,
      nextRunAt: true,
      consecutiveFailures: true,
      lastError: true,
    },
  });
}

/* ------------------------------------------------------------------- Annonces */

/**
 * Réserve l'annonce d'une offre sur un serveur, avant l'envoi : faux si elle l'est déjà.
 * Une offre n'est ainsi jamais publiée deux fois sur un même serveur.
 */
export async function claimAnnouncement(
  guildId: string,
  offerId: number,
  channelId: string | null,
): Promise<number | null> {
  try {
    const announcement = await prisma.gamingAnnouncement.create({
      data: { guildId, offerId, channelId },
    });
    return announcement.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return null;
    throw error;
  }
}

export async function setAnnouncementMessage(id: number, messageId: string): Promise<void> {
  await prisma.gamingAnnouncement.updateMany({ where: { id }, data: { messageId } });
}

/** Marque des offres comme traitées sur un serveur sans les publier (filtrées). */
export async function skipOffers(guildId: string, offerIds: number[]): Promise<void> {
  if (offerIds.length === 0) return;
  await prisma.gamingAnnouncement.createMany({
    data: offerIds.map((offerId) => ({ guildId, offerId })),
    skipDuplicates: true,
  });
}

export async function countAnnouncements(guildId: string): Promise<number> {
  return prisma.gamingAnnouncement.count({ where: { guildId, messageId: { not: null } } });
}

/* ------------------------------------------------------------- Configuration */

export type GamingConfigUpdate = Partial<
  Pick<
    GamingConfig,
    | 'channelId'
    | 'extrasChannelId'
    | 'kinds'
    | 'stores'
    | 'minWorthCents'
    | 'mentionRoleId'
    | 'mentionMinCents'
    | 'paused'
    | 'announceSince'
  >
>;

export async function getGamingConfig(guildId: string): Promise<GamingConfig | null> {
  return prisma.gamingConfig.findUnique({ where: { guildId } });
}

export async function saveGamingConfig(
  guildId: string,
  data: GamingConfigUpdate,
): Promise<GamingConfig> {
  await ensureGuild(guildId);
  return prisma.gamingConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
}

/** Serveurs prêts à recevoir des annonces : salon configuré et publications non suspendues. */
export async function listActiveGamingConfigs(): Promise<GamingConfig[]> {
  return prisma.gamingConfig.findMany({ where: { paused: false, channelId: { not: null } } });
}
