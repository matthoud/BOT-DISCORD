/** Séparateur entre l'identifiant d'un composant et ses arguments dans un `customId`. */
export const COMPONENT_SEPARATOR = '|';

/** Construit le `customId` d'un composant persistant : `id|arg1|arg2`. */
export function componentId(id: string, ...args: string[]): string {
  return [id, ...args].join(COMPONENT_SEPARATOR);
}

/** Décompose un `customId` en identifiant de gestionnaire et arguments. */
export function parseComponentId(customId: string): { id: string; args: string[] } {
  const [id = '', ...args] = customId.split(COMPONENT_SEPARATOR);
  return { id, args };
}
