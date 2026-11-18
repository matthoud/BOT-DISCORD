import {
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type PermissionOverwriteOptions,
  type Role,
} from 'discord.js';
import type { QuarantineRecord, SecurityConfig, SecurityIncident } from '@prisma/client';
import { getGuildConfig } from '../../../core/database/repositories/guild.repository';
import {
  addRemovedRoles,
  claimRelease,
  createQuarantine,
  deleteQuarantine,
  findExpiredQuarantines,
  getActiveQuarantine,
  getSecurityConfig,
} from '../../../core/database/repositories/security.repository';
import { acceptsDirectMessages } from '../../../core/database/repositories/user.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import { baseEmbed } from '../../../core/ui/embeds';
import { formatDuration } from '../../../utils/duration';
import { auditReason } from '../../../utils/interaction';
import { reportIncident } from './incidents.service';
import { MODULE_ID } from './labels';

/** Durée maximale d'une quarantaine : 90 jours. */
export const MAX_QUARANTINE_SECONDS = 90 * 86_400;
/** Délai avant de traiter un membre en quarantaine qui revient : laisse les rôles automatiques arriver. */
const REJOIN_DELAY_MS = 3000;

/** Ce qu'un membre en quarantaine ne peut plus faire dans un salon. */
export const QUARANTINE_DENY: PermissionOverwriteOptions = {
  ViewChannel: false,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  Connect: false,
  Speak: false,
};

/** Salon de quarantaine : le membre peut y lire et y écrire au staff. */
export const QUARANTINE_ALLOW: PermissionOverwriteOptions = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AddReactions: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
};

async function me(guild: Guild): Promise<GuildMember> {
  return guild.members.me ?? guild.members.fetchMe();
}

/** Rôle de quarantaine configuré et utilisable par le bot, ou une `BotError` claire. */
export async function requireQuarantineRole(
  guild: Guild,
  config: Pick<SecurityConfig, 'quarantineRoleId'>,
): Promise<Role> {
  if (!config.quarantineRoleId) {
    throw new BotError(
      'Aucun rôle de quarantaine configuré : utilisez `/security-admin quarantine-setup`.',
    );
  }
  const role = guild.roles.cache.get(config.quarantineRoleId);
  if (!role)
    throw new BotError(
      'Le rôle de quarantaine a été supprimé : relancez `/security-admin quarantine-setup`.',
    );
  const bot = await me(guild);
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new BotError('Il me manque la permission « Gérer les rôles ».');
  }
  if (role.managed || bot.roles.highest.position <= role.position) {
    throw new BotError(
      `Le rôle ${role} est au-dessus du mien : placez mon rôle plus haut dans la liste des rôles.`,
    );
  }
  return role;
}

/**
 * Sépare les rôles d'un membre : ceux que le bot peut retirer (et rendre plus tard) et ceux qu'il
 * doit laisser (rôles gérés par une intégration, ou supérieurs au sien).
 */
export function splitRoles(
  roles: Iterable<Pick<Role, 'id' | 'managed' | 'position'>>,
  options: { guildId: string; quarantineRoleId: string; botPosition: number },
): { removable: string[]; kept: string[] } {
  const removable: string[] = [];
  const kept: string[] = [];
  for (const role of roles) {
    if (role.id === options.guildId || role.id === options.quarantineRoleId) continue;
    if (role.managed || role.position >= options.botPosition) kept.push(role.id);
    else removable.push(role.id);
  }
  return { removable, kept };
}

/** Prévient le membre par message privé, si le serveur et le membre l'acceptent. N'échoue jamais. */
async function notifyMember(member: GuildMember, title: string, text: string): Promise<boolean> {
  try {
    const [guildConfig, accepts] = await Promise.all([
      getGuildConfig(member.guild.id),
      acceptsDirectMessages(member.id),
    ]);
    if (!guildConfig.dmOnSanction || !accepts) return false;
    await member.send({ embeds: [baseEmbed(0x95a5a6).setTitle(title).setDescription(text)] });
    return true;
  } catch {
    return false;
  }
}

export interface QuarantineRequest {
  member: GuildMember;
  /** Modérateur à l'origine de la mesure ; `null` pour une protection automatique. */
  moderator: GuildMember | null;
  reason: string;
  durationSeconds: number | null;
  /** Règle à l'origine d'une mise en quarantaine automatique. */
  rule?: string;
}

export interface QuarantineResult {
  record: QuarantineRecord;
  incident: SecurityIncident;
  keptRoles: number;
  notified: boolean;
}

/** Met un membre en quarantaine : ses rôles retirables sont mémorisés puis remplacés par le rôle de quarantaine. */
export async function quarantineMember(request: QuarantineRequest): Promise<QuarantineResult> {
  const { member, moderator } = request;
  const guild = member.guild;
  const config = await getSecurityConfig(guild.id);
  const role = await requireQuarantineRole(guild, config);
  const bot = await me(guild);

  if (moderator) {
    assertCanActOn(moderator, member, bot);
  } else if (
    member.id === guild.ownerId ||
    bot.roles.highest.position <= member.roles.highest.position
  ) {
    throw new BotError('Ce membre est hors de portée du bot.');
  }
  // Un administrateur passe outre toutes les restrictions de salon : la quarantaine serait sans effet.
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new BotError(
      'Un administrateur ne peut pas être mis en quarantaine : ses permissions passent outre.',
    );
  }
  if (
    request.durationSeconds !== null &&
    (request.durationSeconds < 60 || request.durationSeconds > MAX_QUARANTINE_SECONDS)
  ) {
    throw new BotError('La durée doit être comprise entre 1 minute et 90 jours.');
  }

  const { removable, kept } = splitRoles(member.roles.cache.values(), {
    guildId: guild.id,
    quarantineRoleId: role.id,
    botPosition: bot.roles.highest.position,
  });
  const record = await createQuarantine({
    guildId: guild.id,
    userId: member.id,
    moderatorId: moderator?.id ?? null,
    reason: request.reason,
    removedRoleIds: removable,
    expiresAt: request.durationSeconds
      ? new Date(Date.now() + request.durationSeconds * 1000)
      : null,
  });

  try {
    await member.roles.set(
      [...kept, role.id],
      auditReason(moderator?.user.tag ?? 'Sécurité automatique', request.reason),
    );
  } catch (error) {
    // Rien n'a été appliqué sur Discord : l'enregistrement est annulé.
    await deleteQuarantine(record.id);
    logger.warn(
      { err: error, guildId: guild.id, userId: member.id },
      'Quarantaine impossible à appliquer',
    );
    throw new BotError(
      'Impossible de modifier les rôles de ce membre. Vérifiez la position de mon rôle.',
    );
  }

  const duration = request.durationSeconds
    ? `pour ${formatDuration(request.durationSeconds)}`
    : 'sans limite de durée';
  const incident = await reportIncident(guild, {
    type: 'QUARANTINE',
    severity: 'WARNING',
    userId: member.id,
    rule: request.rule ?? 'Quarantaine manuelle',
    action: `Quarantaine ${duration}${moderator ? ` par ${moderator.user.tag}` : ''}`,
    details: request.reason,
  });
  const notified = await notifyMember(
    member,
    '🔒 Mise en quarantaine',
    `Vous avez été placé en quarantaine sur **${guild.name}** ${duration}.\n**Raison** : ${request.reason.slice(0, 900)}${
      config.quarantineChannelId
        ? `\nVous pouvez écrire au staff dans <#${config.quarantineChannelId}>.`
        : ''
    }`,
  );
  return { record, incident, keptRoles: kept.length, notified };
}

export interface ReleaseResult {
  record: QuarantineRecord;
  memberPresent: boolean;
  restored: number;
  /** Rôles supprimés depuis, ou devenus impossibles à attribuer. */
  lost: number;
}

/** Lève la quarantaine d'un membre et lui rend ses rôles. `null` s'il n'était pas en quarantaine. */
export async function releaseMember(
  guild: Guild,
  userId: string,
  releasedBy: GuildMember | null,
  reason: string,
): Promise<ReleaseResult | null> {
  const record = await claimRelease(guild.id, userId, releasedBy?.id ?? null, reason);
  if (!record) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member)
    return { record, memberPresent: false, restored: 0, lost: record.removedRoleIds.length };

  const config = await getSecurityConfig(guild.id);
  const bot = await me(guild);
  const restorable = record.removedRoleIds.filter((id) => {
    const role = guild.roles.cache.get(id);
    return role && !role.managed && role.position < bot.roles.highest.position;
  });
  const current = member.roles.cache.filter(
    (role) => role.id !== guild.id && role.id !== config.quarantineRoleId,
  );
  try {
    await member.roles.set(
      [...new Set([...current.keys(), ...restorable])],
      auditReason(releasedBy?.user.tag ?? 'Sécurité automatique', reason),
    );
  } catch (error) {
    logger.warn(
      { err: error, guildId: guild.id, userId },
      'Rôles impossibles à rendre après une quarantaine',
    );
    throw new BotError(
      'La quarantaine est levée, mais je n’ai pas pu modifier les rôles de ce membre : vérifiez la position de mon rôle.',
    );
  }
  await notifyMember(
    member,
    '🔓 Fin de quarantaine',
    `Votre quarantaine sur **${guild.name}** est levée.`,
  );
  return {
    record,
    memberPresent: true,
    restored: restorable.length,
    lost: record.removedRoleIds.length - restorable.length,
  };
}

/** Tâche périodique : lève les quarantaines arrivées à échéance, y compris pendant un arrêt du bot. */
export async function releaseExpiredQuarantines(client: Client): Promise<void> {
  for (const record of await findExpiredQuarantines(new Date())) {
    const guild = client.guilds.cache.get(record.guildId);
    // Serveur momentanément indisponible : la levée sera retentée au prochain passage.
    if (!guild?.available) continue;
    try {
      await releaseMember(guild, record.userId, null, 'Durée écoulée');
    } catch (error) {
      logger.warn(
        { err: error, guildId: record.guildId, userId: record.userId },
        'Levée automatique de quarantaine incomplète',
      );
    }
  }
}

/**
 * Un membre en quarantaine quitte puis rejoint le serveur : la quarantaine est réappliquée et le
 * staff prévenu (tentative de contournement).
 */
export async function reapplyOnRejoin(member: GuildMember): Promise<boolean> {
  if (!(await isModuleEnabled(member.guild.id, MODULE_ID))) return false;
  const record = await getActiveQuarantine(member.guild.id, member.id);
  if (!record) return false;
  await new Promise((resolve) => setTimeout(resolve, REJOIN_DELAY_MS));
  const config = await getSecurityConfig(member.guild.id);
  let action = 'Quarantaine réappliquée';
  try {
    const role = await requireQuarantineRole(member.guild, config);
    const fresh = await member.fetch(true);
    const bot = await me(member.guild);
    const { removable, kept } = splitRoles(fresh.roles.cache.values(), {
      guildId: member.guild.id,
      quarantineRoleId: role.id,
      botPosition: bot.roles.highest.position,
    });
    await fresh.roles.set(
      [...kept, role.id],
      auditReason('Sécurité automatique', 'Retour d’un membre en quarantaine'),
    );
    await addRemovedRoles(record.id, removable);
  } catch (error) {
    action = 'Quarantaine impossible à réappliquer : intervention du staff nécessaire';
    logger.warn(
      { err: error, guildId: member.guild.id, userId: member.id },
      'Quarantaine non réappliquée',
    );
  }
  await reportIncident(member.guild, {
    type: 'RULE_EVASION',
    severity: 'IMPORTANT',
    userId: member.id,
    rule: 'Retour d’un membre en quarantaine',
    action,
    details: 'Le membre a quitté puis rejoint le serveur pendant sa quarantaine.',
  });
  return true;
}
