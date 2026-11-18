import { Prisma } from '@prisma/client';
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  QuarantineRecord,
  SecurityConfig,
  SecurityIncident,
} from '@prisma/client';
import { BotError } from '../../errors/BotError';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

const configCache = new TtlCache<string, SecurityConfig>(CONFIG_CACHE_TTL_MS);

/* ------------------------------------------------------------- Configuration */

export type SecurityConfigUpdate = Partial<
  Pick<
    SecurityConfig,
    | 'alertChannelId'
    | 'alertMinSeverity'
    | 'quarantineRoleId'
    | 'quarantineChannelId'
    | 'exemptUserIds'
    | 'exemptRoleIds'
    | 'ignoredChannelIds'
  >
>;

export async function getSecurityConfig(guildId: string): Promise<SecurityConfig> {
  return configCache.getOrLoad(guildId, async () => {
    await ensureGuild(guildId);
    await prisma.securityConfig.createMany({ data: [{ guildId }], skipDuplicates: true });
    return prisma.securityConfig.findUniqueOrThrow({ where: { guildId } });
  });
}

export async function updateSecurityConfig(
  guildId: string,
  data: SecurityConfigUpdate,
): Promise<SecurityConfig> {
  await ensureGuild(guildId);
  const config = await prisma.securityConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
  configCache.set(guildId, config);
  return config;
}

/** Ajoute ou retire un identifiant d'une liste d'exemptions, sans écraser une modification simultanée. */
export async function toggleListEntry(
  guildId: string,
  field: 'exemptUserIds' | 'exemptRoleIds' | 'ignoredChannelIds',
  id: string,
  add: boolean,
  max: number,
): Promise<SecurityConfig> {
  await getSecurityConfig(guildId);
  const config = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "guildId" FROM "SecurityConfig" WHERE "guildId" = ${guildId} FOR UPDATE`;
    const current = await tx.securityConfig.findUniqueOrThrow({ where: { guildId } });
    const list = current[field];
    if (add && !list.includes(id) && list.length >= max) {
      throw new BotError(`Cette liste est limitée à ${max} éléments.`);
    }
    const next = add ? [...new Set([...list, id])] : list.filter((entry) => entry !== id);
    return tx.securityConfig.update({ where: { guildId }, data: { [field]: next } });
  });
  configCache.set(guildId, config);
  return config;
}

/* ----------------------------------------------------------------- Incidents */

export interface IncidentInput {
  guildId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  userId: string | null;
  rule: string;
  action: string;
  observed: boolean;
  details: string;
  channelId: string | null;
}

/** Enregistre un incident avec le numéro suivant du serveur (attribution atomique). */
export async function createIncident(input: IncidentInput): Promise<SecurityIncident> {
  await ensureGuild(input.guildId);
  return prisma.$transaction(async (tx) => {
    await tx.securityConfig.createMany({
      data: [{ guildId: input.guildId }],
      skipDuplicates: true,
    });
    const { incidentCounter } = await tx.securityConfig.update({
      where: { guildId: input.guildId },
      data: { incidentCounter: { increment: 1 } },
      select: { incidentCounter: true },
    });
    return tx.securityIncident.create({
      data: {
        ...input,
        number: incidentCounter,
        rule: input.rule.slice(0, 100),
        action: input.action.slice(0, 200),
        details: input.details.slice(0, 1000),
      },
    });
  });
}

export async function getIncident(
  guildId: string,
  number: number,
): Promise<SecurityIncident | null> {
  return prisma.securityIncident.findUnique({ where: { guildId_number: { guildId, number } } });
}

export interface IncidentFilters {
  severities?: IncidentSeverity[];
  userId?: string;
  since?: Date;
  status?: IncidentStatus;
}

function incidentWhere(
  guildId: string,
  filters: IncidentFilters,
): Prisma.SecurityIncidentWhereInput {
  return {
    guildId,
    ...(filters.severities ? { severity: { in: filters.severities } } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

export async function listIncidents(
  guildId: string,
  filters: IncidentFilters,
  page: number,
  pageSize: number,
): Promise<SecurityIncident[]> {
  return prisma.securityIncident.findMany({
    where: incidentWhere(guildId, filters),
    orderBy: { number: 'desc' },
    skip: page * pageSize,
    take: pageSize,
  });
}

export async function countIncidents(
  guildId: string,
  filters: IncidentFilters = {},
): Promise<number> {
  return prisma.securityIncident.count({ where: incidentWhere(guildId, filters) });
}

/** Nombre d'incidents par gravité depuis une date. */
export async function countIncidentsBySeverity(
  guildId: string,
  since: Date,
): Promise<Record<IncidentSeverity, number>> {
  const rows = await prisma.securityIncident.groupBy({
    by: ['severity'],
    where: { guildId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const counts: Record<IncidentSeverity, number> = {
    INFO: 0,
    WARNING: 0,
    IMPORTANT: 0,
    CRITICAL: 0,
  };
  for (const row of rows) counts[row.severity] = row._count._all;
  return counts;
}

/** Change le statut d'un incident. Faux si l'incident n'existe pas sur ce serveur. */
export async function setIncidentStatus(
  guildId: string,
  number: number,
  status: IncidentStatus,
  handledById: string,
  note: string | null,
): Promise<SecurityIncident | null> {
  const { count } = await prisma.securityIncident.updateMany({
    where: { guildId, number },
    data:
      status === 'OPEN'
        ? { status, handledById: null, handledAt: null, note }
        : { status, handledById, handledAt: new Date(), note },
  });
  return count > 0 ? getIncident(guildId, number) : null;
}

/** Supprime les incidents plus anciens qu'une date. */
export async function pruneIncidents(before: Date): Promise<number> {
  const { count } = await prisma.securityIncident.deleteMany({
    where: { createdAt: { lt: before } },
  });
  return count;
}

/* ---------------------------------------------------------------- Quarantaine */

export interface QuarantineInput {
  guildId: string;
  userId: string;
  moderatorId: string | null;
  reason: string;
  removedRoleIds: string[];
  expiresAt: Date | null;
}

/**
 * Enregistre une quarantaine. La base garantit une seule quarantaine active par membre :
 * deux mises en quarantaine simultanées du même membre ne peuvent pas aboutir toutes les deux.
 */
export async function createQuarantine(input: QuarantineInput): Promise<QuarantineRecord> {
  await ensureGuild(input.guildId);
  try {
    return await prisma.quarantineRecord.create({
      data: { ...input, reason: input.reason.slice(0, 500) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BotError('Ce membre est déjà en quarantaine.');
    }
    throw error;
  }
}

/** Annule l'enregistrement d'une quarantaine qui n'a pas pu être appliquée sur Discord. */
export async function deleteQuarantine(id: number): Promise<void> {
  await prisma.quarantineRecord.deleteMany({ where: { id } });
}

export async function getActiveQuarantine(
  guildId: string,
  userId: string,
): Promise<QuarantineRecord | null> {
  return prisma.quarantineRecord.findFirst({ where: { guildId, userId, releasedAt: null } });
}

export async function listActiveQuarantines(
  guildId: string,
  take = 100,
): Promise<QuarantineRecord[]> {
  return prisma.quarantineRecord.findMany({
    where: { guildId, releasedAt: null },
    orderBy: { createdAt: 'asc' },
    take,
  });
}

export async function listQuarantineHistory(
  guildId: string,
  userId: string,
  take = 5,
): Promise<QuarantineRecord[]> {
  return prisma.quarantineRecord.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export async function countQuarantines(guildId: string, userId: string): Promise<number> {
  return prisma.quarantineRecord.count({ where: { guildId, userId } });
}

/**
 * Lève la quarantaine active d'un membre et retourne son enregistrement, ou `null` s'il n'y en
 * avait pas (ou si elle vient d'être levée par ailleurs) : une levée n'est jamais traitée deux fois.
 */
export async function claimRelease(
  guildId: string,
  userId: string,
  releasedById: string | null,
  releaseReason: string,
): Promise<QuarantineRecord | null> {
  const active = await getActiveQuarantine(guildId, userId);
  if (!active) return null;
  const { count } = await prisma.quarantineRecord.updateMany({
    where: { id: active.id, releasedAt: null },
    data: { releasedAt: new Date(), releasedById, releaseReason: releaseReason.slice(0, 500) },
  });
  return count > 0 ? prisma.quarantineRecord.findUnique({ where: { id: active.id } }) : null;
}

/** Quarantaines arrivées à échéance, y compris pendant un arrêt du bot. */
export async function findExpiredQuarantines(now: Date, take = 50): Promise<QuarantineRecord[]> {
  return prisma.quarantineRecord.findMany({
    where: { releasedAt: null, expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    take,
  });
}

/** Ajoute des rôles à rendre à la levée (rôles reçus pendant la quarantaine, au retour sur le serveur). */
export async function addRemovedRoles(id: number, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const record = await prisma.quarantineRecord.findUnique({
    where: { id },
    select: { removedRoleIds: true },
  });
  if (!record) return;
  await prisma.quarantineRecord.update({
    where: { id },
    data: { removedRoleIds: [...new Set([...record.removedRoleIds, ...roleIds])] },
  });
}
