import type { CaseType, ModerationCase, SanctionAction, SanctionRule, Warning } from '@prisma/client';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

export interface CreateCaseInput {
  guildId: string;
  type: CaseType;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  reason: string;
  /** Durée en secondes. */
  duration?: number | null;
  expiresAt?: Date | null;
  /** Faux pour un bannissement temporaire en attente de levée. */
  resolved?: boolean;
}

/** Crée un cas avec un numéro séquentiel propre au serveur (transaction atomique). */
export async function createCase(input: CreateCaseInput): Promise<ModerationCase> {
  await ensureGuild(input.guildId);
  return prisma.$transaction(async (tx) => {
    const guild = await tx.guildConfig.update({
      where: { guildId: input.guildId },
      data: { caseCounter: { increment: 1 } },
      select: { caseCounter: true },
    });
    return tx.moderationCase.create({
      data: {
        guildId: input.guildId,
        caseNumber: guild.caseCounter,
        type: input.type,
        targetId: input.targetId,
        targetTag: input.targetTag,
        moderatorId: input.moderatorId,
        reason: input.reason,
        duration: input.duration ?? null,
        expiresAt: input.expiresAt ?? null,
        resolved: input.resolved ?? true,
      },
    });
  });
}

export async function listCases(
  guildId: string,
  targetId: string,
  skip: number,
  take: number,
): Promise<ModerationCase[]> {
  return prisma.moderationCase.findMany({
    where: { guildId, targetId },
    orderBy: { caseNumber: 'desc' },
    skip,
    take,
  });
}

export async function countCases(guildId: string, targetId: string): Promise<number> {
  return prisma.moderationCase.count({ where: { guildId, targetId } });
}

// --- Avertissements ---

export async function createWarning(data: {
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  caseId: number;
}): Promise<Warning> {
  return prisma.warning.create({ data });
}

export async function listActiveWarnings(
  guildId: string,
  userId: string,
): Promise<WarningWithCase[]> {
  return prisma.warning.findMany({
    where: { guildId, userId, active: true },
    orderBy: { createdAt: 'desc' },
    include: { case: { select: { caseNumber: true } } },
  });
}

export type WarningWithCase = Warning & { case: { caseNumber: number } | null };

export async function countActiveWarnings(guildId: string, userId: string): Promise<number> {
  return prisma.warning.count({ where: { guildId, userId, active: true } });
}

/** Désactive tous les avertissements actifs du membre. Retourne le nombre concerné. */
export async function clearWarnings(guildId: string, userId: string): Promise<number> {
  const result = await prisma.warning.updateMany({
    where: { guildId, userId, active: true },
    data: { active: false },
  });
  return result.count;
}

// --- Bannissements temporaires ---

export async function findExpiredTempBans(now: Date): Promise<ModerationCase[]> {
  return prisma.moderationCase.findMany({
    where: { type: 'BAN', resolved: false, expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    take: 50,
  });
}

/** Marque comme levés les bannissements temporaires en attente d'un utilisateur. */
export async function resolvePendingBans(guildId: string, targetId: string): Promise<void> {
  await prisma.moderationCase.updateMany({
    where: { guildId, targetId, type: 'BAN', resolved: false },
    data: { resolved: true },
  });
}

// --- Sanctions automatiques ---

export async function listSanctionRules(guildId: string): Promise<SanctionRule[]> {
  return prisma.sanctionRule.findMany({ where: { guildId }, orderBy: { threshold: 'asc' } });
}

export async function findSanctionRule(
  guildId: string,
  threshold: number,
): Promise<SanctionRule | null> {
  return prisma.sanctionRule.findUnique({ where: { guildId_threshold: { guildId, threshold } } });
}

export async function upsertSanctionRule(
  guildId: string,
  threshold: number,
  action: SanctionAction,
  duration: number | null,
): Promise<SanctionRule> {
  await ensureGuild(guildId);
  return prisma.sanctionRule.upsert({
    where: { guildId_threshold: { guildId, threshold } },
    create: { guildId, threshold, action, duration },
    update: { action, duration },
  });
}

export async function deleteSanctionRule(guildId: string, threshold: number): Promise<boolean> {
  const result = await prisma.sanctionRule.deleteMany({ where: { guildId, threshold } });
  return result.count > 0;
}
