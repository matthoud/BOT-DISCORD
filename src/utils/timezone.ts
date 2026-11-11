export const DEFAULT_TIMEZONE = 'Europe/Paris';

/** Fuseaux horaires IANA connus du système (« Europe/Paris », « America/Montreal »...). */
const TIMEZONES: readonly string[] = ['UTC', ...Intl.supportedValuesOf('timeZone')];

/** Vrai si l'identifiant désigne un fuseau horaire utilisable. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Recherche de fuseaux pour l'autocomplétion : ceux qui commencent par la saisie d'abord. */
export function searchTimezones(query: string, limit = 25): string[] {
  const typed = query.trim().toLowerCase().replace(/\s+/g, '_');
  if (!typed) return [DEFAULT_TIMEZONE, ...TIMEZONES.filter((zone) => zone !== DEFAULT_TIMEZONE)].slice(0, limit);
  const matches = TIMEZONES.filter((zone) => zone.toLowerCase().includes(typed));
  const cityStartsWith = (zone: string) => (zone.split('/').pop() ?? zone).toLowerCase().startsWith(typed);
  return [...matches.filter(cityStartsWith), ...matches.filter((zone) => !cityStartsWith(zone))].slice(0, limit);
}

/** Heure actuelle dans un fuseau, au format « mardi 11 novembre 2026 à 14:05 ». */
export function formatNowIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(now);
}
