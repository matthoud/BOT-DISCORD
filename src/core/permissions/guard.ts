import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../../types';
import { getCommandPermissions } from '../database/repositories/permission.repository';
import { BotError } from '../errors/BotError';
import { decideAccess } from './access';
import { permissionNames } from './names';

function formatList(permissions: bigint[]): string {
  return permissionNames(permissions)
    .map((name) => `\`${name}\``)
    .join(', ');
}

/**
 * Vérifie, avant toute exécution, que l'utilisateur ET le bot ont le droit d'exécuter la commande.
 * Lève une `BotError` avec un message explicite dans le cas contraire.
 */
export async function assertCommandAccess(
  interaction: ChatInputCommandInteraction<'cached'>,
  command: Command,
): Promise<void> {
  const { member, guild } = interaction;
  const required = command.userPermissions ?? [];
  const rules = await getCommandPermissions(guild.id, command.data.name);

  const decision = decideAccess({
    isAdmin:
      member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator),
    hasRequiredPermissions: interaction.memberPermissions.has(required),
    commandIsRestricted: required.length > 0,
    memberRoleIds: new Set(member.roles.cache.keys()),
    rules,
  });

  switch (decision) {
    case 'allowed':
      break;
    case 'denied-by-role':
      throw new BotError("L'un de vos rôles n'est pas autorisé à utiliser cette commande.");
    case 'not-in-allowlist':
      throw new BotError('Cette commande est réservée à certains rôles sur ce serveur.');
    case 'missing-permissions': {
      const missing = required.filter(
        (permission) => !interaction.memberPermissions.has(permission),
      );
      throw new BotError(
        `Vous n'avez pas la permission d'utiliser cette commande.\nPermission(s) requise(s) : ${formatList(missing)}`,
      );
    }
  }

  const botRequired = command.botPermissions ?? [];
  const botMissing = botRequired.filter((permission) => !interaction.appPermissions.has(permission));
  if (botMissing.length > 0) {
    throw new BotError(
      `Il me manque des permissions pour exécuter cette commande dans ce salon : ${formatList(botMissing)}`,
    );
  }
}
