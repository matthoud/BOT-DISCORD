import type { GuildMember, Message } from 'discord.js';
import type { SecurityIncident } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import {
  isMessageRetained,
  registerMessageGuard,
  resetMessageGuards,
} from '../src/core/messages/guards';
import {
  ALERTS_PER_MINUTE,
  buildAlertMessage,
  buildIncidentButtons,
  buildIncidentEmbed,
  resetAlertWindows,
  takeAlertSlot,
} from '../src/modules/security/services/alerts';
import { isExempt } from '../src/modules/security/services/exemptions';
import { isAtLeast, severitiesFrom } from '../src/modules/security/services/labels';

const message = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    guildId: '1',
    author: { bot: false },
    webhookId: null,
    ...overrides,
  }) as unknown as Message<true>;

describe('point de contrôle des messages', () => {
  afterEach(resetMessageGuards);

  it('laisse passer tout message sans garde', async () => {
    expect(await isMessageRetained(message('a'))).toBe(false);
  });

  it('n’exécute les gardes qu’une fois par message, même demandées par plusieurs modules', async () => {
    let calls = 0;
    registerMessageGuard('compteur', async () => {
      calls++;
      return true;
    });
    const results = await Promise.all([
      isMessageRetained(message('m1')),
      isMessageRetained(message('m1')),
      isMessageRetained(message('m1')),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(calls).toBe(1);
    expect(await isMessageRetained(message('m2'))).toBe(true);
    expect(calls).toBe(2);
  });

  it('isole une garde en erreur et ignore bots et webhooks', async () => {
    const seen: string[] = [];
    registerMessageGuard('panne', async () => {
      throw new Error('panne');
    });
    registerMessageGuard('suivante', async (m) => {
      seen.push(m.id);
      return false;
    });
    expect(await isMessageRetained(message('x'))).toBe(false);
    expect(seen).toEqual(['x']);
    expect(await isMessageRetained(message('bot', { author: { bot: true } }))).toBe(false);
    expect(await isMessageRetained(message('hook', { webhookId: '9' }))).toBe(false);
    expect(seen).toEqual(['x']);
    expect(() => registerMessageGuard('panne', async () => false)).toThrow(/double/);
  });
});

describe('exemptions', () => {
  const config = {
    exemptUserIds: ['vip'],
    exemptRoleIds: ['modo'],
    ignoredChannelIds: ['bac-a-sable'],
  };
  const member = (id: string, options: { admin?: boolean; roles?: string[]; bot?: boolean } = {}) =>
    ({
      id,
      user: { bot: options.bot ?? false },
      guild: { ownerId: 'proprio' },
      permissions: { has: () => options.admin ?? false },
      roles: {
        cache: {
          some: (fn: (role: { id: string }) => boolean) =>
            (options.roles ?? []).some((roleId) => fn({ id: roleId })),
        },
      },
    }) as unknown as GuildMember;

  it('exempte salons ignorés (et leurs fils), bots, propriétaire, administrateurs, membres et rôles choisis', () => {
    expect(isExempt(member('u'), { id: 'bac-a-sable' }, config)).toBe(true);
    expect(isExempt(member('u'), { id: 'fil', parentId: 'bac-a-sable' }, config)).toBe(true);
    expect(isExempt(member('u', { bot: true }), { id: 'g' }, config)).toBe(true);
    expect(isExempt(member('proprio'), { id: 'g' }, config)).toBe(true);
    expect(isExempt(member('u', { admin: true }), { id: 'g' }, config)).toBe(true);
    expect(isExempt(member('vip'), { id: 'g' }, config)).toBe(true);
    expect(isExempt(member('u', { roles: ['modo'] }), { id: 'g' }, config)).toBe(true);
  });

  it('n’exempte pas un membre ordinaire', () => {
    expect(isExempt(member('u', { roles: ['autre'] }), { id: 'general' }, config)).toBe(false);
    expect(isExempt(null, { id: 'general' }, config)).toBe(false);
  });
});

describe('alertes', () => {
  afterEach(resetAlertWindows);

  it('limite le nombre d’alertes par minute et signale celles retenues', () => {
    const start = 1_000_000;
    for (let i = 0; i < ALERTS_PER_MINUTE; i++) expect(takeAlertSlot('g', start + i)).toBe(0);
    expect(takeAlertSlot('g', start + 100)).toBeNull();
    expect(takeAlertSlot('g', start + 200)).toBeNull();
    expect(takeAlertSlot('autre', start + 200)).toBe(0);
    // Minute suivante : l'alerte publiée signale les 2 retenues.
    expect(takeAlertSlot('g', start + 60_001)).toBe(2);
    expect(takeAlertSlot('g', start + 60_002)).toBe(0);
  });

  const incident = (overrides: Partial<SecurityIncident> = {}): SecurityIncident => ({
    id: 1,
    guildId: '1',
    number: 7,
    type: 'SPAM',
    severity: 'IMPORTANT',
    userId: '42',
    rule: 'Anti-spam : 8 messages en 5 s',
    action: 'Messages supprimés',
    observed: false,
    details: '',
    channelId: '99',
    status: 'OPEN',
    handledById: null,
    handledAt: null,
    note: null,
    createdAt: new Date('2026-11-18T10:00:00Z'),
    ...overrides,
  });

  it('présente l’incident sans jamais notifier personne', () => {
    const message = buildAlertMessage(incident(), 3);
    expect(message.allowedMentions).toEqual({ parse: [] });
    expect(message.content).toContain('3 alerte(s) précédente(s)');
    const json = buildIncidentEmbed(incident()).toJSON();
    expect(json.title).toBe('🟠 Incident n°7 — Spam');
    expect(json.fields?.find((field) => field.name === 'Membre')?.value).toBe('<@42> (42)');
    const observed = buildIncidentEmbed(incident({ observed: true, action: 'Aucune' })).toJSON();
    expect(observed.fields?.find((field) => field.name === 'Action')?.value).toContain(
      'mode observation',
    );
  });

  it('propose les boutons de suivi selon le statut', () => {
    const ids = (status: SecurityIncident['status']) =>
      buildIncidentButtons(incident({ status }))[0]!
        .toJSON()
        .components.map((button) => ('custom_id' in button ? button.custom_id : ''));
    expect(ids('OPEN')).toEqual(['security:incident|7|RESOLVED', 'security:incident|7|DISMISSED']);
    expect(ids('RESOLVED')).toEqual(['security:incident|7|OPEN']);
  });

  it('compare les gravités', () => {
    expect(severitiesFrom('IMPORTANT')).toEqual(['IMPORTANT', 'CRITICAL']);
    expect(isAtLeast('CRITICAL', 'WARNING')).toBe(true);
    expect(isAtLeast('INFO', 'WARNING')).toBe(false);
  });
});
