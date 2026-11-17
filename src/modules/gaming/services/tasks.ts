import type { GamingProvider } from '../providers/types';

/** Nom de la tâche périodique qui synchronise un fournisseur. */
export function syncTaskName(provider: Pick<GamingProvider, 'id'>): string {
  return `gaming:sync:${provider.id}`;
}
