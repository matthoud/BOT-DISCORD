import type { Event } from '@prisma/client';
import { describe, expect, it } from 'vitest';

process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

import {
  buildEventButtons,
  buildEventEmbed,
  buildEventReminder,
  computeReminderAt,
  describeSeats,
  hasEventStarted,
} from '../src/modules/events/services/presenter';
import { buildReminderContent } from '../src/modules/events/services/reminder.service';
import { formatDateIn, parseDateTime } from '../src/utils/datetime';

const PARIS = 'Europe/Paris';
// Mercredi 11 novembre 2026, 14:00 à Paris (13:00 UTC, heure d'hiver).
const NOW = new Date('2026-11-11T13:00:00Z');
const iso = (input: string, zone = PARIS, now = NOW): string | null =>
  parseDateTime(input, zone, now)?.toISOString() ?? null;

describe('parseDateTime', () => {
  it('lit une date complète dans le fuseau du serveur', () => {
    expect(iso('25/12/2026 18:30')).toBe('2026-12-25T17:30:00.000Z');
    expect(iso('25/12/2026 18h30')).toBe('2026-12-25T17:30:00.000Z');
    expect(iso('25/12/2026 à 18h')).toBe('2026-12-25T17:00:00.000Z');
    expect(iso('5/1/2027 9:05')).toBe('2027-01-05T08:05:00.000Z');
    // Même saisie, autre fuseau : l'instant change.
    expect(iso('25/12/2026 18:30', 'America/Montreal')).toBe('2026-12-25T23:30:00.000Z');
    // Heure d'été : Paris est à UTC+2 en juillet.
    expect(iso('14/07/2027 21:00')).toBe('2027-07-14T19:00:00.000Z');
  });

  it('complète l’année manquante avec la prochaine occurrence', () => {
    expect(iso('25/12 18:30')).toBe('2026-12-25T17:30:00.000Z');
    expect(iso('10/11 18:30')).toBe('2027-11-10T17:30:00.000Z');
    expect(iso('11/11 15:00')).toBe('2026-11-11T14:00:00.000Z');
    expect(iso('11/11 13:00')).toBe('2027-11-11T12:00:00.000Z');
  });

  it('comprend les jours relatifs et l’heure seule', () => {
    expect(iso('demain 20h')).toBe('2026-11-12T19:00:00.000Z');
    expect(iso("aujourd'hui 21:30")).toBe('2026-11-11T20:30:00.000Z');
    expect(iso('Aujourd’hui 21:30')).toBe('2026-11-11T20:30:00.000Z');
    expect(iso('après-demain 9h')).toBe('2026-11-13T08:00:00.000Z');
    expect(iso('21:00')).toBe('2026-11-11T20:00:00.000Z');
    // 9 h est déjà passé aujourd'hui : c'est demain.
    expect(iso('9h')).toBe('2026-11-12T08:00:00.000Z');
  });

  it('comprend les délais', () => {
    expect(iso('dans 2h')).toBe('2026-11-11T15:00:00.000Z');
    expect(iso('dans 9h')).toBe('2026-11-11T22:00:00.000Z');
    expect(iso('45m')).toBe('2026-11-11T13:45:00.000Z');
    expect(iso('1j12h')).toBe('2026-11-13T01:00:00.000Z');
    expect(iso('2h30m')).toBe('2026-11-11T15:30:00.000Z');
    expect(iso('dans longtemps')).toBeNull();
  });

  it('lit une heure seule comme une heure de la journée, jamais comme un délai', () => {
    // « 2h » = 2 heures du matin (demain, puisque c'est passé), pas « dans 2 heures ».
    expect(iso('2h')).toBe('2026-11-12T01:00:00.000Z');
    expect(iso('20h30')).toBe('2026-11-11T19:30:00.000Z');
  });

  it('refuse les dates inexistantes ou incomprises', () => {
    for (const input of [
      '31/02/2027 10:00',
      '32/01/2027 10:00',
      '10/13/2027 10:00',
      '25/12/2026 25:00',
      '25/12/2026 18:61',
      '25/12/2026',
      'demain',
      'vendredi 18h',
      '25-12-2026 18:30',
      '25/12/26 18:30',
      '',
      'bientôt',
    ]) {
      expect(iso(input), input).toBeNull();
    }
  });

  it('refuse une heure supprimée par le passage à l’heure d’été', () => {
    // Le 28 mars 2027 à Paris, on passe directement de 2 h à 3 h.
    expect(iso('28/03/2027 2:30')).toBeNull();
    expect(iso('28/03/2027 3:30')).toBe('2027-03-28T01:30:00.000Z');
  });

  it('refuse un fuseau inconnu', () => {
    expect(iso('demain 20h', 'Mars/Olympus')).toBeNull();
  });

  it('formate une date dans un fuseau donné', () => {
    expect(formatDateIn(new Date('2026-12-25T17:30:00Z'), PARIS)).toBe('vendredi 25 décembre 2026 à 18:30');
  });
});

const HOUR = 3_600_000;
const event = (overrides: Partial<Event> = {}): Event => ({
  id: 4,
  guildId: '111',
  channelId: '222',
  messageId: '333',
  creatorId: 'orga',
  title: 'Tournoi Rocket League',
  description: 'Inscriptions par équipes de 3.',
  imageUrl: null,
  startsAt: new Date(Date.now() + 2 * HOUR),
  capacity: null,
  reminderAt: null,
  reminderSentAt: null,
  startedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('rappel automatique', () => {
  const start = new Date('2026-12-25T17:30:00Z');
  const now = new Date('2026-12-25T10:00:00Z').getTime();

  it('est placé avant le début', () => {
    expect(computeReminderAt(start, 30, now)?.toISOString()).toBe('2026-12-25T17:00:00.000Z');
    expect(computeReminderAt(start, 1440, new Date('2026-12-20T00:00:00Z').getTime())?.toISOString()).toBe(
      '2026-12-24T17:30:00.000Z',
    );
  });

  it('est abandonné s’il est désactivé ou s’il tomberait dans le passé', () => {
    expect(computeReminderAt(start, 0, now)).toBeNull();
    expect(computeReminderAt(start, 1440, now)).toBeNull();
  });

  it('mentionne les participants, dans la limite prévue', () => {
    const few = buildEventReminder(event(), ['a', 'b']);
    expect(few.content).toContain('**Tournoi Rocket League** commence');
    expect(few.content).toContain('<@a> <@b>');
    expect(few.mentioned).toEqual(['a', 'b']);
    expect(few.content).toContain('https://discord.com/channels/111/222/333');

    const many = buildEventReminder(event(), Array.from({ length: 100 }, (_, i) => `u${i}`));
    expect(many.mentioned).toHaveLength(80);
    expect(many.content).toContain('et 20 autre(s)');
    expect(many.content.length).toBeLessThanOrEqual(2000);
    expect(buildEventReminder(event(), []).mentioned).toEqual([]);
  });
});

describe('annonce d’un événement', () => {
  it('indique les places et les inscrits', () => {
    expect(describeSeats(3, null)).toBe('3');
    expect(describeSeats(3, 20)).toBe('3 / 20');
    const embed = buildEventEmbed(event({ capacity: 2 }), { going: ['a', 'b'], declined: 1 }).toJSON();
    expect(embed.title).toBe('📅 Tournoi Rocket League');
    expect(embed.description).toContain('Inscriptions par équipes de 3.');
    expect(embed.description).toContain('<@orga>');
    const participants = embed.fields?.find((field) => field.name === 'Participants')?.value ?? '';
    expect(participants).toContain('**2 / 2** — complet');
    expect(participants).toContain('1 absent(s)');
    expect(embed.fields?.find((field) => field.name === 'Inscrits')?.value).toBe('<@a> <@b>');
  });

  it('ne nomme qu’une partie des inscrits quand ils sont nombreux', () => {
    const going = Array.from({ length: 45 }, (_, i) => `u${i}`);
    const listed = buildEventEmbed(event(), { going, declined: 0 }).toJSON().fields?.find((field) => field.name === 'Inscrits');
    expect(listed?.value).toContain('et 15 autre(s)');
    expect(listed?.value.length).toBeLessThanOrEqual(1024);
  });

  it('propose les deux réponses avec leur décompte', () => {
    const [row] = buildEventButtons(event(), { going: ['a'], declined: 2 });
    const buttons = row?.toJSON().components ?? [];
    expect(buttons.map((button) => ('custom_id' in button ? button.custom_id : ''))).toEqual([
      'events:rsvp|4|going',
      'events:rsvp|4|declined',
    ]);
    expect(buttons.map((button) => ('label' in button ? button.label : ''))).toEqual([
      'Je participe (1)',
      'Je ne participe pas (2)',
    ]);
  });

  it('clôt les inscriptions une fois l’événement commencé', () => {
    const past = event({ startsAt: new Date(Date.now() - 1000) });
    expect(hasEventStarted(event())).toBe(false);
    expect(hasEventStarted(past)).toBe(true);
    expect(hasEventStarted(event({ startedAt: new Date() }))).toBe(true);
    expect(buildEventButtons(past, { going: [], declined: 0 })).toEqual([]);
    expect(buildEventEmbed(past, { going: [], declined: 0 }).toJSON().footer?.text).toBe('Les inscriptions sont closes.');
  });
});

describe('rappel personnel', () => {
  it('mentionne son destinataire et cite le message', () => {
    const content = buildReminderContent({ userId: '42', message: 'Sortir le gâteau du four', createdAt: new Date() });
    expect(content).toContain('<@42>');
    expect(content).toContain('>>> Sortir le gâteau du four');
  });
});
