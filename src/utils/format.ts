/** Coupe un texte trop long en ajoutant des points de suspension. */
export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Horodatage Discord (affiché dans le fuseau de chaque utilisateur). `style` : f, F, R, D... */
export function timestamp(date: Date | number, style: 'f' | 'F' | 'R' | 'D' | 'd' | 't' = 'f'): string {
  const ms = typeof date === 'number' ? date : date.getTime();
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/** Date complète suivie du temps relatif : « 12 mars 2025 14:00 (il y a 3 jours) ». */
export function fullTimestamp(date: Date | number): string {
  return `${timestamp(date, 'f')} (${timestamp(date, 'R')})`;
}

/** Nombre entier au format français avec des espaces ordinaires (« 12 345 »). */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('fr-FR').replace(/\s/g, ' ');
}

/** Tire un élément au hasard dans une liste non vide. */
export function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickRandom : liste vide');
  return items[Math.floor(Math.random() * items.length)] as T;
}
