import { describe, expect, it } from 'vitest';
import { BotError } from '../src/core/errors/BotError';
import { decideAccess, type AccessInput } from '../src/core/permissions/access';
import {
  assertCanActOn,
  assertCanManageRole,
  type HierarchyMember,
  type HierarchyRole,
} from '../src/core/permissions/hierarchy';

const OWNER_ID = 'owner';
const GUILD_ID = 'guild';

const member = (id: string, position: number): HierarchyMember => ({
  id,
  guild: { ownerId: OWNER_ID },
  roles: { highest: { position } },
});

const role = (position: number, overrides: Partial<HierarchyRole> = {}): HierarchyRole => ({
  id: 'role',
  name: 'Rôle',
  position,
  managed: false,
  guild: { id: GUILD_ID, ownerId: OWNER_ID },
  ...overrides,
});

describe('assertCanActOn', () => {
  const bot = member('bot', 10);

  it('autorise quand le modérateur et le bot sont au-dessus de la cible', () => {
    expect(() => assertCanActOn(member('mod', 5), member('cible', 1), bot)).not.toThrow();
  });

  it('refuse sur soi-même, sur le bot et sur le propriétaire', () => {
    const mod = member('mod', 5);
    expect(() => assertCanActOn(mod, mod, bot)).toThrow(BotError);
    expect(() => assertCanActOn(mod, bot, bot)).toThrow(BotError);
    expect(() => assertCanActOn(mod, member(OWNER_ID, 0), bot)).toThrow(BotError);
  });

  it('refuse si la cible a un rôle supérieur ou égal à celui du modérateur', () => {
    expect(() => assertCanActOn(member('mod', 5), member('cible', 5), bot)).toThrow(/supérieur ou égal au vôtre/);
    expect(() => assertCanActOn(member('mod', 5), member('cible', 7), bot)).toThrow(BotError);
  });

  it('refuse si la cible a un rôle supérieur ou égal à celui du bot', () => {
    expect(() => assertCanActOn(member('mod', 50), member('cible', 10), bot)).toThrow(/au mien/);
  });

  it('le propriétaire passe la hiérarchie du modérateur, pas celle du bot', () => {
    const owner = member(OWNER_ID, 0);
    expect(() => assertCanActOn(owner, member('cible', 5), bot)).not.toThrow();
    expect(() => assertCanActOn(owner, member('cible', 10), bot)).toThrow(/au mien/);
  });
});

describe('assertCanManageRole', () => {
  const bot = member('bot', 10);
  const mod = member('mod', 5);

  it('autorise un rôle inférieur aux deux', () => {
    expect(() => assertCanManageRole(mod, role(3), bot)).not.toThrow();
  });

  it('refuse @everyone et les rôles gérés', () => {
    expect(() => assertCanManageRole(mod, role(0, { id: GUILD_ID }), bot)).toThrow(/@everyone/);
    expect(() => assertCanManageRole(mod, role(3, { managed: true }), bot)).toThrow(/intégration/);
  });

  it('refuse un rôle trop élevé pour le modérateur ou pour le bot', () => {
    expect(() => assertCanManageRole(mod, role(5), bot)).toThrow(/votre rôle/);
    expect(() => assertCanManageRole(member(OWNER_ID, 0), role(10), bot)).toThrow(/au mien/);
    expect(() => assertCanManageRole(member(OWNER_ID, 0), role(9), bot)).not.toThrow();
  });
});

describe('decideAccess', () => {
  const base: AccessInput = {
    isAdmin: false,
    hasRequiredPermissions: false,
    commandIsRestricted: true,
    memberRoleIds: new Set(['r1']),
    rules: [],
  };

  it('une commande restreinte exige les permissions Discord', () => {
    expect(decideAccess(base)).toBe('missing-permissions');
    expect(decideAccess({ ...base, hasRequiredPermissions: true })).toBe('allowed');
  });

  it('un rôle autorisé donne accès sans les permissions Discord', () => {
    expect(decideAccess({ ...base, rules: [{ roleId: 'r1', allow: true }] })).toBe('allowed');
    // Une règle visant un rôle que le membre ne possède pas ne change rien.
    expect(decideAccess({ ...base, rules: [{ roleId: 'autre', allow: true }] })).toBe('missing-permissions');
  });

  it('un rôle refusé est prioritaire sur tout le reste', () => {
    const input: AccessInput = {
      ...base,
      hasRequiredPermissions: true,
      memberRoleIds: new Set(['r1', 'r2']),
      rules: [
        { roleId: 'r1', allow: true },
        { roleId: 'r2', allow: false },
      ],
    };
    expect(decideAccess(input)).toBe('denied-by-role');
  });

  it("un administrateur n'est jamais bloqué", () => {
    expect(decideAccess({ ...base, isAdmin: true, rules: [{ roleId: 'r1', allow: false }] })).toBe('allowed');
  });

  it('une commande publique devient réservée dès qu’une liste de rôles autorisés existe', () => {
    const open: AccessInput = { ...base, commandIsRestricted: false, hasRequiredPermissions: true };
    expect(decideAccess(open)).toBe('allowed');
    expect(decideAccess({ ...open, rules: [{ roleId: 'autre', allow: true }] })).toBe('not-in-allowlist');
    expect(decideAccess({ ...open, rules: [{ roleId: 'r1', allow: true }] })).toBe('allowed');
    // Une règle de refus seule ne crée pas de liste blanche.
    expect(decideAccess({ ...open, rules: [{ roleId: 'autre', allow: false }] })).toBe('allowed');
  });
});
