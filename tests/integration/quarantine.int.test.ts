import type { Client, Guild, GuildMember } from 'discord.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/database/prisma';
import * as moduleRepo from '../../src/core/database/repositories/module.repository';
import * as repo from '../../src/core/database/repositories/security.repository';
import {
  quarantineMember,
  reapplyOnRejoin,
  releaseExpiredQuarantines,
  releaseMember,
  splitRoles,
} from '../../src/modules/security/services/quarantine.service';
import { resetDatabase, settle } from './helpers';

interface FakeRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
}

/** Faux serveur : rôles, bot placé en position 50, membres dont les rôles sont modifiables. */
function fakeGuild(guildId: string) {
  const roles = new Map<string, FakeRole>(
    [
      { id: guildId, name: '@everyone', position: 0, managed: false },
      { id: 'quarantaine', name: 'Quarantaine', position: 1, managed: false },
      { id: 'membre', name: 'Membre', position: 5, managed: false },
      { id: 'vip', name: 'VIP', position: 10, managed: false },
      { id: 'booster', name: 'Booster', position: 3, managed: true },
      { id: 'staff', name: 'Staff', position: 60, managed: false },
      { id: 'bot', name: 'Bot', position: 50, managed: true },
    ].map((role) => [role.id, role]),
  );
  const members = new Map<string, GuildMember>();
  const guild = {
    id: guildId,
    name: 'Test',
    ownerId: 'proprio',
    available: true,
    roles: { cache: roles },
    channels: { cache: new Map() },
    members: {
      me: null as unknown as GuildMember,
      fetchMe: async () => guild.members.me,
      fetch: async (id: string) => {
        const member = members.get(id);
        if (!member) throw new Error('absent');
        return member;
      },
    },
  };
  const makeMember = (
    id: string,
    roleIds: string[],
    options: { admin?: boolean; failSet?: boolean } = {},
  ) => {
    const state = { roleIds: [...roleIds] };
    const cache = () => new Map(state.roleIds.map((roleId) => [roleId, roles.get(roleId)!]));
    const member = {
      id,
      guild,
      user: { tag: `${id}#0001`, bot: false },
      permissions: { has: () => options.admin ?? false },
      get roles() {
        const current = cache();
        return {
          cache: Object.assign(current, {
            filter: (fn: (role: FakeRole) => boolean) =>
              new Map([...current].filter(([, role]) => fn(role))),
          }),
          highest: {
            position: Math.max(
              0,
              ...state.roleIds.map((roleId) => roles.get(roleId)?.position ?? 0),
            ),
          },
          set: async (ids: string[]) => {
            if (options.failSet) throw new Error('Missing Permissions');
            state.roleIds = [...ids];
          },
        };
      },
      fetch: async () => member,
      send: async () => undefined,
      state,
    } as unknown as GuildMember & { state: { roleIds: string[] } };
    members.set(id, member);
    return member;
  };
  // Le bot a toutes les permissions (dont « Gérer les rôles »).
  guild.members.me = makeMember('bot', ['bot'], { admin: true });
  return { guild: guild as unknown as Guild, makeMember, members, roles };
}

const G = '710000000000000001';
const world = fakeGuild(G);

beforeAll(async () => {
  await resetDatabase();
  moduleRepo.registerModuleDefaults([{ id: 'security', defaultEnabled: false }]);
  await moduleRepo.setModuleEnabled(G, 'security', true);
  await repo.updateSecurityConfig(G, { quarantineRoleId: 'quarantaine' });
});
afterAll(() => prisma.$disconnect());

describe('quarantaine', () => {
  const moderator = world.makeMember('modo', ['staff']);

  it('sépare les rôles retirables de ceux que le bot doit laisser', () => {
    expect(
      splitRoles([...world.roles.values()], {
        guildId: G,
        quarantineRoleId: 'quarantaine',
        botPosition: 50,
      }),
    ).toEqual({ removable: ['membre', 'vip'], kept: ['booster', 'staff', 'bot'] });
  });

  it('isole le membre, mémorise ses rôles et enregistre un incident', async () => {
    const member = world.makeMember('u1', ['membre', 'vip', 'booster']);
    const result = await quarantineMember({
      member,
      moderator,
      reason: 'Comportement à vérifier',
      durationSeconds: 3600,
    });
    expect((member as unknown as { state: { roleIds: string[] } }).state.roleIds.sort()).toEqual([
      'booster',
      'quarantaine',
    ]);
    expect(result.record.removedRoleIds.sort()).toEqual(['membre', 'vip']);
    expect(result.keptRoles).toBe(1);
    expect(result.incident.type).toBe('QUARANTINE');
    await expect(
      quarantineMember({ member, moderator, reason: 'Encore', durationSeconds: null }),
    ).rejects.toThrow(/déjà en quarantaine/);
  });

  it('n’accepte qu’une quarantaine active par membre, même en demandes simultanées', async () => {
    const results = await settle(
      Array.from({ length: 5 }, () =>
        repo.createQuarantine({
          guildId: G,
          userId: 'u2',
          moderatorId: 'modo',
          reason: 'x',
          removedRoleIds: [],
          expiresAt: null,
        }),
      ),
    );
    expect(results.ok).toHaveLength(1);
    expect(results.errors.every((error) => /déjà en quarantaine/.test(error.message))).toBe(true);
  });

  it('refuse les administrateurs et annule tout si Discord refuse le changement de rôles', async () => {
    const admin = world.makeMember('admin', ['membre'], { admin: true });
    await expect(
      quarantineMember({ member: admin, moderator, reason: 'x', durationSeconds: null }),
    ).rejects.toThrow(/administrateur/);
    const stubborn = world.makeMember('u3', ['membre'], { failSet: true });
    await expect(
      quarantineMember({ member: stubborn, moderator, reason: 'x', durationSeconds: null }),
    ).rejects.toThrow(/rôles/);
    expect(await repo.getActiveQuarantine(G, 'u3')).toBeNull();
  });

  it('rend les rôles à la levée, une seule fois, sans le rôle supprimé entre-temps', async () => {
    world.roles.delete('vip');
    const results = await Promise.all(
      Array.from({ length: 3 }, () => releaseMember(world.guild, 'u1', moderator, 'Réglé')),
    );
    const done = results.filter(Boolean);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ restored: 1, lost: 1, memberPresent: true });
    const member = world.members.get('u1') as unknown as { state: { roleIds: string[] } };
    expect(member.state.roleIds.sort()).toEqual(['booster', 'membre']);
    world.roles.set('vip', { id: 'vip', name: 'VIP', position: 10, managed: false });
  });

  it('lève automatiquement une quarantaine échue, même après un arrêt du bot', async () => {
    const member = world.makeMember('u4', ['membre']);
    await quarantineMember({ member, moderator, reason: 'Courte', durationSeconds: 60 });
    await prisma.quarantineRecord.updateMany({
      where: { userId: 'u4' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const client = { guilds: { cache: new Map([[G, world.guild]]) } } as unknown as Client;
    await releaseExpiredQuarantines(client);
    expect(await repo.getActiveQuarantine(G, 'u4')).toBeNull();
    expect((member as unknown as { state: { roleIds: string[] } }).state.roleIds).toEqual([
      'membre',
    ]);
  });

  it('réapplique la quarantaine à un membre qui revient et prévient le staff', async () => {
    const member = world.makeMember('u5', ['membre']);
    await quarantineMember({ member, moderator, reason: 'Avant départ', durationSeconds: null });
    // Retour sur le serveur : le rôle automatique de bienvenue a été attribué.
    const back = world.makeMember('u5', ['vip']);
    expect(await reapplyOnRejoin(back)).toBe(true);
    expect((back as unknown as { state: { roleIds: string[] } }).state.roleIds).toEqual([
      'quarantaine',
    ]);
    expect((await repo.getActiveQuarantine(G, 'u5'))?.removedRoleIds.sort()).toEqual([
      'membre',
      'vip',
    ]);
    expect(await repo.countIncidents(G, { severities: ['IMPORTANT'] })).toBe(1);
  }, 15_000);
});
