import { BotError } from '../errors/BotError';

/** Sous-ensemble d'un membre nécessaire aux contrôles de hiérarchie (facilite les tests). */
export interface HierarchyMember {
  id: string;
  guild: { ownerId: string };
  roles: { highest: { position: number } };
}

export interface HierarchyRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
  guild: { id: string; ownerId: string };
}

/**
 * Vérifie que `moderator` et le bot (`me`) peuvent tous deux agir sur `target`.
 * Lève une `BotError` explicite dans le cas contraire.
 */
export function assertCanActOn(
  moderator: HierarchyMember,
  target: HierarchyMember,
  me: HierarchyMember,
): void {
  const ownerId = target.guild.ownerId;

  if (target.id === moderator.id) {
    throw new BotError('Vous ne pouvez pas effectuer cette action sur vous-même.');
  }
  if (target.id === me.id) {
    throw new BotError('Je ne peux pas effectuer cette action sur moi-même.');
  }
  if (target.id === ownerId) {
    throw new BotError('Cette action est impossible sur le propriétaire du serveur.');
  }
  if (moderator.id !== ownerId && moderator.roles.highest.position <= target.roles.highest.position) {
    throw new BotError(
      'Ce membre possède un rôle supérieur ou égal au vôtre : vous ne pouvez pas agir sur lui.',
    );
  }
  if (me.roles.highest.position <= target.roles.highest.position) {
    throw new BotError(
      'Ce membre possède un rôle supérieur ou égal au mien. Placez mon rôle plus haut dans la liste des rôles.',
    );
  }
}

/** Vérifie que `moderator` et le bot peuvent attribuer ou retirer `role`. */
export function assertCanManageRole(
  moderator: HierarchyMember,
  role: HierarchyRole,
  me: HierarchyMember,
): void {
  if (role.id === role.guild.id) {
    throw new BotError('Le rôle @everyone ne peut pas être attribué ou retiré.');
  }
  if (role.managed) {
    throw new BotError(
      `Le rôle **${role.name}** est géré par une intégration et ne peut pas être attribué manuellement.`,
    );
  }
  if (moderator.id !== role.guild.ownerId && moderator.roles.highest.position <= role.position) {
    throw new BotError(`Le rôle **${role.name}** est supérieur ou égal à votre rôle le plus élevé.`);
  }
  if (me.roles.highest.position <= role.position) {
    throw new BotError(
      `Le rôle **${role.name}** est supérieur ou égal au mien. Placez mon rôle plus haut dans la liste des rôles.`,
    );
  }
}
