const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  m: 60,
  min: 60,
  h: 3600,
  j: 86_400,
  d: 86_400,
  sem: 604_800,
  w: 604_800,
};

const TOKEN = /(\d+)\s*([a-z]+)/gy;

/**
 * Convertit une durée saisie par un utilisateur en secondes.
 * Formats acceptés : `30s`, `10m`, `2h`, `7j` (ou `7d`), `1sem` (ou `1w`), combinables : `1h30m`.
 * Retourne `null` si la saisie est invalide ou nulle.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;

  let total = 0;
  let position = 0;
  TOKEN.lastIndex = 0;

  while (position < text.length) {
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(text);
    if (!match) return null;
    const unit = UNIT_SECONDS[match[2] ?? ''];
    if (unit === undefined) return null;
    total += Number(match[1]) * unit;
    position = TOKEN.lastIndex;
  }

  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

const PARTS: Array<[seconds: number, singular: string, plural: string]> = [
  [86_400, 'jour', 'jours'],
  [3600, 'heure', 'heures'],
  [60, 'minute', 'minutes'],
  [1, 'seconde', 'secondes'],
];

/** Formate une durée en secondes : `90061` → « 1 jour 1 heure 1 minute 1 seconde ». */
export function formatDuration(totalSeconds: number): string {
  let remaining = Math.max(0, Math.floor(totalSeconds));
  if (remaining === 0) return '0 seconde';

  const parts: string[] = [];
  for (const [size, singular, plural] of PARTS) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(`${count} ${count > 1 ? plural : singular}`);
      remaining -= count * size;
    }
  }
  return parts.join(' ');
}
