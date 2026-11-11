import { PermissionFlagsBits, type GuildMember, type Role } from 'discord.js';
import { listLevelRewards } from '../../../core/database/repositories/levels.repository';
import { logger } from '../../../core/logger';
import { rewardRolesForLevel } from './xp';

/** Vrai si le bot peut attribuer ou retirer ce rôle. */
function canManage(me: GuildMember, role: Role): boolean {
  return (
    me.permissions.has(PermissionFlagsBits.ManageRoles) &&
    !role.managed &&
    role.id !== role.guild.id &&
    me.roles.highest.position > role.position
  );
}

/**
 * Met les rôles de récompense d'un membre en accord avec son niveau.
 * Retourne les rôles nouvellement attribués. Un rôle que le bot ne peut pas gérer est ignoré
 * (et signalé dans les logs) : l'attribution d'XP ne doit jamais échouer à cause d'une récompense.
 */
export async function syncRewardRoles(member: GuildMember, level: number, stack: boolean): Promise<Role[]> {
  const rewards = await listLevelRewards(member.guild.id);
  if (rewards.length === 0) return [];

  const { grant, revoke } = rewardRolesForLevel(level, rewards, stack);
  const me = member.guild.members.me ?? (await member.guild.members.fetchMe());
  const granted: Role[] = [];

  const apply = async (roleId: string, add: boolean): Promise<void> => {
    if (member.roles.cache.has(roleId) === add) return;
    const role = member.guild.roles.cache.get(roleId);
    if (!role) return;
    if (!canManage(me, role)) {
      logger.warn(
        { guildId: member.guild.id, roleId },
        'Récompense de niveau non appliquée : rôle hors de portée du bot',
      );
      return;
    }
    try {
      if (add) {
        await member.roles.add(role, `Récompense du niveau ${level}`);
        granted.push(role);
      } else {
        await member.roles.remove(role, 'Récompense remplacée par celle d’un niveau supérieur');
      }
    } catch (error) {
      logger.warn({ err: error, guildId: member.guild.id, roleId }, "Échec de l'application d'une récompense de niveau");
    }
  };

  for (const roleId of grant) await apply(roleId, true);
  for (const roleId of revoke) await apply(roleId, false);
  return granted;
}
