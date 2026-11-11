import { PermissionFlagsBits, PermissionsBitField, type GuildMember } from 'discord.js';
import { describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import type { SuggestionWithVotes } from '../src/core/database/repositories/suggestions.repository';
import { ACTION_STATUS, isStaffAction } from '../src/modules/suggestions/services/decision.service';
import {
  buildSuggestionButtons,
  buildSuggestionEmbed,
  describeSuggestionLine,
  describeVotes,
  suggestionUrl,
} from '../src/modules/suggestions/services/presenter';
import { isSuggestionStaff } from '../src/modules/suggestions/services/suggestion.service';

const suggestion = (overrides: Partial<SuggestionWithVotes> = {}): SuggestionWithVotes => ({
  id: 7,
  guildId: '111',
  number: 12,
  authorId: '222',
  content: 'Ajouter un salon dédié aux\nannonces de tournois @everyone',
  status: 'PENDING',
  channelId: '333',
  messageId: '444',
  staffId: null,
  staffResponse: null,
  decidedAt: null,
  createdAt: new Date('2026-11-12T10:00:00Z'),
  up: 5,
  down: 2,
  ...overrides,
});

const member = (options: { id?: string; ownerId?: string; permissions?: bigint[]; roles?: string[] }): GuildMember =>
  ({
    id: options.id ?? 'membre',
    guild: { ownerId: options.ownerId ?? 'proprio' },
    permissions: new PermissionsBitField(options.permissions ?? []),
    roles: { cache: new Map((options.roles ?? []).map((role) => [role, {}])) },
  }) as unknown as GuildMember;

describe('votes', () => {
  it('résume les votes avec le pourcentage favorable', () => {
    expect(describeVotes({ up: 5, down: 2 })).toBe('👍 5 · 👎 2 — 71 % favorables');
    expect(describeVotes({ up: 0, down: 3 })).toBe('👍 0 · 👎 3 — 0 % favorables');
    expect(describeVotes({ up: 0, down: 0 })).toBe('👍 0 · 👎 0 — aucun vote');
  });

  it('ferme les boutons de vote une fois la décision rendue, mais pas la gestion', () => {
    const open = buildSuggestionButtons(suggestion()).toJSON().components;
    expect(open.map((button) => button.disabled ?? false)).toEqual([false, false, false]);
    const closed = buildSuggestionButtons(suggestion({ status: 'ACCEPTED' })).toJSON().components;
    expect(closed.map((button) => button.disabled ?? false)).toEqual([true, true, false]);
  });

  it('porte l’identifiant de la suggestion dans chaque bouton', () => {
    const ids = buildSuggestionButtons(suggestion())
      .toJSON()
      .components.map((button) => ('custom_id' in button ? button.custom_id : ''));
    expect(ids).toEqual(['suggestions:vote|7|up', 'suggestions:vote|7|down', 'suggestions:manage|7']);
  });
});

describe('présentation', () => {
  it('construit le lien vers le message public', () => {
    expect(suggestionUrl(suggestion())).toBe('https://discord.com/channels/111/333/444');
    expect(suggestionUrl(suggestion({ messageId: null }))).toBeNull();
  });

  it('résume une suggestion sur une ligne, sans saut de ligne dans l’extrait', () => {
    const line = describeSuggestionLine(suggestion());
    expect(line).toContain('**n°12**');
    expect(line).toContain('👍 5 👎 2');
    expect(line).toContain('Ajouter un salon dédié aux annonces de tournois');
    expect(line).toContain('[Voir](https://discord.com/channels/111/333/444)');
  });

  it('affiche le statut, et la réponse du staff quand il y en a une', () => {
    const pending = buildSuggestionEmbed(suggestion(), null).toJSON();
    expect(pending.title).toBe('💡 Suggestion n°12');
    expect(pending.fields?.map((field) => field.name)).toEqual(['Statut', 'Votes']);

    const refused = buildSuggestionEmbed(
      suggestion({ status: 'REFUSED', staffId: '999', staffResponse: 'Déjà prévu autrement.' }),
      null,
    ).toJSON();
    const response = refused.fields?.find((field) => field.name === 'Refusée par le staff');
    expect(response?.value).toContain('Déjà prévu autrement.');
    expect(response?.value).toContain('<@999>');

    const replied = buildSuggestionEmbed(suggestion({ staffId: '999', staffResponse: 'On étudie.' }), null).toJSON();
    expect(replied.fields?.some((field) => field.name === 'Réponse du staff')).toBe(true);
  });
});

describe('droits du staff', () => {
  const config = { staffRoleId: 'role-staff' };

  it('accepte le propriétaire, « Gérer le serveur » et le rôle de staff', () => {
    expect(isSuggestionStaff(member({ id: 'proprio' }), config)).toBe(true);
    expect(isSuggestionStaff(member({ permissions: [PermissionFlagsBits.ManageGuild] }), config)).toBe(true);
    expect(isSuggestionStaff(member({ permissions: [PermissionFlagsBits.Administrator] }), config)).toBe(true);
    expect(isSuggestionStaff(member({ roles: ['role-staff'] }), config)).toBe(true);
  });

  it('refuse les autres membres', () => {
    expect(isSuggestionStaff(member({ roles: ['autre-role'] }), config)).toBe(false);
    expect(isSuggestionStaff(member({ permissions: [PermissionFlagsBits.ManageMessages] }), config)).toBe(false);
    expect(isSuggestionStaff(member({ roles: ['role-staff'] }), { staffRoleId: null })).toBe(false);
  });
});

describe('actions du staff', () => {
  it('associe chaque action à son statut', () => {
    expect(ACTION_STATUS).toEqual({ accept: 'ACCEPTED', refuse: 'REFUSED', reopen: 'PENDING', reply: undefined });
  });

  it('ne reconnaît que les actions prévues', () => {
    expect(['accept', 'refuse', 'reply', 'reopen'].every(isStaffAction)).toBe(true);
    for (const value of ['delete', '', 'constructor', 'toString', undefined]) {
      expect(isStaffAction(value), String(value)).toBe(false);
    }
  });
});
