import { DateTime } from 'luxon';
import { parseDuration } from './duration';

/** Exemples de saisies acceptées, à montrer dans les messages d'erreur. */
export const DATE_EXAMPLES = '`25/12/2026 18:30`, `25/12 18h`, `demain 20h`, `21:00`, `dans 2h`';

const DATE_PART = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
const TIME_PART = /^(\d{1,2})(?:[:h](\d{2})?)$/;
const DAY_WORDS: Record<string, number> = {
  "aujourd'hui": 0,
  aujourdhui: 0,
  demain: 1,
  'apres-demain': 2,
  'après-demain': 2,
};

function parseTime(text: string): { hour: number; minute: number } | null {
  const match = TIME_PART.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * Interprète une date saisie par un membre, dans le fuseau horaire du serveur.
 * Formats acceptés :
 * - date et heure : `25/12/2026 18:30`, `25/12 18h` (année en cours, ou suivante si la date est passée) ;
 * - jour relatif : `demain 20h`, `aujourd'hui 21:30`, `après-demain 9h` ;
 * - heure seule : `21:00`, `9h`, `20h30` (aujourd'hui, ou demain si l'heure est passée) ;
 * - délai : `dans 2h`, `dans 45m`, ou sans « dans » quand aucune confusion avec une heure n'est
 *   possible : `45m`, `3j`, `2h30m`. Attention : `2h` seul désigne 2 heures du matin.
 * Retourne `null` si la saisie n'est pas comprise ou désigne une date qui n'existe pas (31/02,
 * heure supprimée par un changement d'heure). La date retournée peut être passée : à l'appelant de trancher.
 */
export function parseDateTime(input: string, timezone: string, now: Date = new Date()): Date | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/’/g, "'");
  if (!text) return null;
  const current = DateTime.fromJSDate(now, { zone: timezone });
  if (!current.isValid) return null;

  // Délai explicite : « dans 2h », « dans 3j ».
  if (text.startsWith('dans ')) {
    const delay = parseDuration(text.slice('dans '.length));
    return delay === null ? null : new Date(now.getTime() + delay * 1000);
  }

  const parts = text.replace(/ à /g, ' ').split(' ');
  if (parts.length > 2) return null;
  const [first = '', second] = parts;

  if (second === undefined) {
    // Heure seule : aujourd'hui, ou demain si elle est déjà passée. « 9h » et « 20h30 » sont des
    // heures de la journée, pas des délais : un délai en heures s'écrit « dans 2h ».
    const time = parseTime(first);
    if (time) {
      let candidate = current.set({ ...time, second: 0, millisecond: 0 });
      if (candidate.toMillis() <= now.getTime()) candidate = candidate.plus({ days: 1 });
      return candidate.isValid && candidate.hour === time.hour ? candidate.toJSDate() : null;
    }
    // Autres délais, sans ambiguïté possible avec une heure : « 45m », « 3j », « 1j12h », « 2h30m ».
    const delay = parseDuration(first);
    return delay === null ? null : new Date(now.getTime() + delay * 1000);
  }

  const time = parseTime(second);
  if (!time) return null;

  let day: DateTime;
  const offset = DAY_WORDS[first];
  const date = DATE_PART.exec(first);
  if (offset !== undefined) {
    day = current.plus({ days: offset });
  } else if (date) {
    const fields = { day: Number(date[1]), month: Number(date[2]) };
    day = DateTime.fromObject({ year: date[3] ? Number(date[3]) : current.year, ...fields }, { zone: timezone });
    if (!day.isValid) return null;
    // Sans année, une date déjà passée désigne l'année suivante.
    if (!date[3] && day.set(time).toMillis() <= now.getTime()) {
      day = DateTime.fromObject({ year: current.year + 1, ...fields }, { zone: timezone });
    }
  } else {
    return null;
  }

  const result = day.set({ ...time, second: 0, millisecond: 0 });
  // Une heure inexistante (passage à l'heure d'été) serait décalée en silence : elle est refusée.
  if (!result.isValid || result.hour !== time.hour || result.minute !== time.minute) return null;
  return result.toJSDate();
}

/** Date complète dans un fuseau donné : « vendredi 25 décembre 2026 à 18:30 ». */
export function formatDateIn(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(date);
}
