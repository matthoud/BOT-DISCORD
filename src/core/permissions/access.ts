/** Règle personnalisée : un rôle autorisé (`allow: true`) ou refusé (`allow: false`). */
export interface AccessRule {
  roleId: string;
  allow: boolean;
}

export interface AccessInput {
  /** Administrateur ou propriétaire du serveur : toujours autorisé. */
  isAdmin: boolean;
  /** Le membre possède-t-il les permissions Discord exigées par la commande ? */
  hasRequiredPermissions: boolean;
  /** La commande exige-t-elle des permissions Discord ? */
  commandIsRestricted: boolean;
  memberRoleIds: ReadonlySet<string>;
  rules: readonly AccessRule[];
}

export type AccessDecision = 'allowed' | 'denied-by-role' | 'missing-permissions' | 'not-in-allowlist';

/**
 * Décide si un membre peut utiliser une commande. Fonction pure, sans accès à Discord.
 *
 * 1. Un administrateur passe toujours.
 * 2. Un rôle refusé bloque, même si un autre rôle autorise.
 * 3. Un rôle autorisé donne accès, même sans les permissions Discord.
 * 4. Sinon, commande restreinte : il faut les permissions Discord.
 * 5. Sinon, commande publique : libre, sauf si une liste de rôles autorisés existe.
 */
export function decideAccess(input: AccessInput): AccessDecision {
  if (input.isAdmin) return 'allowed';

  const matching = input.rules.filter((rule) => input.memberRoleIds.has(rule.roleId));
  if (matching.some((rule) => !rule.allow)) return 'denied-by-role';
  if (matching.some((rule) => rule.allow)) return 'allowed';

  if (input.commandIsRestricted) {
    return input.hasRequiredPermissions ? 'allowed' : 'missing-permissions';
  }
  return input.rules.some((rule) => rule.allow) ? 'not-in-allowlist' : 'allowed';
}
