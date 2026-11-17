import { createGamerPowerProvider } from './gamerpower';
import type { GamingProvider } from './types';

/**
 * Fournisseurs actifs. Pour ajouter une source : créer un fichier qui implémente `GamingProvider`
 * (après vérification de sa documentation et de ses conditions), puis l'ajouter ici.
 */
export const PROVIDERS: readonly GamingProvider[] = [createGamerPowerProvider()];

export function getProvider(id: string): GamingProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export type { GamingProvider, NormalizedOffer } from './types';
