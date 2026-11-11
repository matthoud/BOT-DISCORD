import { PermissionFlagsBits, PermissionsBitField, type GuildMember } from 'discord.js';
import { describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import type { PollWithOptions } from '../src/core/database/repositories/polls.repository';
import { canManagePoll } from '../src/modules/polls/services/poll.service';
import {
  buildPollButtons,
  buildPollEmbed,
  describeChoices,
  isPollClosed,
  progressBar,
  share,
} from '../src/modules/polls/services/presenter';

const HOUR = 3_600_000;

const poll = (overrides: Partial<PollWithOptions> = {}, optionCount = 3): PollWithOptions => ({
  id: 9,
  guildId: '111',
  channelId: '222',
  messageId: '333',
  authorId: 'auteur',
  question: 'Quel jeu pour la soirée ?',
  multiple: false,
  hideResults: false,
  endsAt: new Date(Date.now() + HOUR),
  closedAt: null,
  createdAt: new Date(),
  options: Array.from({ length: optionCount }, (_, position) => ({
    id: 100 + position,
    pollId: 9,
    position,
    label: `Jeu ${position + 1}`,
  })),
  ...overrides,
});

const results = (counts: Record<number, number>, voters: number) => ({
  counts: new Map(Object.entries(counts).map(([id, count]) => [Number(id), count])),
  voters,
});

const member = (id: string, permissions: bigint[] = []): GuildMember =>
  ({ id, guild: { ownerId: 'proprio' }, permissions: new PermissionsBitField(permissions) }) as unknown as GuildMember;

describe('état d’un sondage', () => {
  it('est clos une fois l’échéance passée ou la clôture enregistrée', () => {
    expect(isPollClosed(poll())).toBe(false);
    expect(isPollClosed(poll({ endsAt: new Date(Date.now() - 1) }))).toBe(true);
    expect(isPollClosed(poll({ closedAt: new Date() }))).toBe(true);
  });

  it('réserve la clôture à l’auteur, au propriétaire et aux modérateurs', () => {
    expect(canManagePoll(member('auteur'), poll())).toBe(true);
    expect(canManagePoll(member('proprio'), poll())).toBe(true);
    expect(canManagePoll(member('modo', [PermissionFlagsBits.ManageMessages]), poll())).toBe(true);
    expect(canManagePoll(member('quelquun'), poll())).toBe(false);
  });
});

describe('résultats', () => {
  it('calcule la part de chaque réponse sur les votes exprimés', () => {
    expect(share(3, 4)).toBe(0.75);
    expect(share(0, 0)).toBe(0);
    expect(progressBar(0)).toBe('▱▱▱▱▱▱▱▱▱▱');
    expect(progressBar(0.5)).toBe('▰▰▰▰▰▱▱▱▱▱');
    expect(progressBar(2)).toBe('▰▰▰▰▰▰▰▰▰▰');
  });

  it('affiche les résultats en direct par défaut', () => {
    const embed = buildPollEmbed(poll(), results({ 100: 3, 101: 1 }, 4)).toJSON();
    expect(embed.title).toBe('📊 Quel jeu pour la soirée ?');
    expect(embed.description).toContain('**75 %** · 3 votes');
    expect(embed.description).toContain('**25 %** · 1 vote');
    expect(embed.description).toContain('**0 %** · 0 vote');
    expect(embed.description).toContain('<@auteur>');
    expect(embed.footer?.text).toBe('Une seule réponse possible · 4 votants');
    expect(embed.description).not.toContain('🏆');
  });

  it('masque les résultats jusqu’à la clôture quand c’est demandé', () => {
    const hidden = poll({ hideResults: true });
    const open = buildPollEmbed(hidden, results({ 100: 3 }, 3)).toJSON();
    expect(open.description).not.toContain('%');
    expect(open.footer?.text).toContain('résultats affichés à la clôture');
    // L'auteur et le staff peuvent les consulter avant, et tout le monde après la clôture.
    expect(buildPollEmbed(hidden, results({ 100: 3 }, 3), true).toJSON().description).toContain('100 %');
    expect(buildPollEmbed({ ...hidden, closedAt: new Date() }, results({ 100: 3 }, 3)).toJSON().description).toContain('100 %');
  });

  it('désigne la ou les réponses gagnantes à la clôture', () => {
    const closed = poll({ closedAt: new Date() });
    const single = buildPollEmbed(closed, results({ 100: 1, 101: 4 }, 5)).toJSON().description ?? '';
    expect(single.match(/🏆/g)).toHaveLength(1);
    expect(single).toContain('**2️⃣ Jeu 2** 🏆');
    const tie = buildPollEmbed(closed, results({ 100: 2, 101: 2 }, 4)).toJSON().description ?? '';
    expect(tie.match(/🏆/g)).toHaveLength(2);
    expect(buildPollEmbed(closed, results({}, 0)).toJSON().description).not.toContain('🏆');
  });
});

describe('boutons', () => {
  it('répartit dix réponses sur deux rangées, plus la rangée de clôture', () => {
    const rows = buildPollButtons(poll({}, 10)).map((row) => row.toJSON().components);
    expect(rows.map((row) => row.length)).toEqual([5, 5, 1]);
    const ids = rows.flat().map((button) => ('custom_id' in button ? button.custom_id : ''));
    expect(ids[0]).toBe('polls:vote|9|100');
    expect(ids[9]).toBe('polls:vote|9|109');
    expect(ids[10]).toBe('polls:close|9');
    expect(new Set(ids).size).toBe(11);
  });

  it('retire tous les boutons d’un sondage clos', () => {
    expect(buildPollButtons(poll({ closedAt: new Date() }))).toEqual([]);
    expect(buildPollButtons(poll({ endsAt: new Date(Date.now() - 1) }))).toEqual([]);
  });

  it('rappelle au membre ses choix', () => {
    expect(describeChoices(poll(), [])).toBe('Votre vote a été retiré.');
    expect(describeChoices(poll(), [101])).toContain('2️⃣ **Jeu 2**');
    expect(describeChoices(poll({ multiple: true }), [100, 102])).toContain('1️⃣ **Jeu 1**, 3️⃣ **Jeu 3**');
  });
});
