import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  Prisma,
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
    'alertChannelId' | 'alertMinSeverity' | 'exemptUserIds' | 'exemptRoleIds' | 'ignoredChannelIds'
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
