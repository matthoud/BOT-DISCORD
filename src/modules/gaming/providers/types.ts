import type { GamingOfferKind } from '@prisma/client';
import type { StoreKey } from '../services/stores';

/** Offre gratuite normalisée, quelle que soit sa source. Aucun champ absent de la source n'est inventé. */
export interface NormalizedOffer {
  externalId: string;
  title: string;
  description: string;
  kind: GamingOfferKind;
  stores: StoreKey[];
  /** Valeur annoncée par la source, en centimes ; `null` si inconnue. */
  worthCents: number | null;
  currency: string | null;
  endsAt: Date | null;
  imageUrl: string | null;
  url: string;
  keyRequired: boolean;
}

/**
 * Source d'offres. Chaque fournisseur est indépendant : il peut être ajouté, retiré ou remplacé
 * sans toucher au reste du module. Sa documentation et ses conditions doivent avoir été vérifiées.
 */
export interface GamingProvider {
  /** Identifiant technique, enregistré avec chaque offre. */
  id: string;
  name: string;
  /** Site de la source : un lien vers lui accompagne chaque annonce (attribution). */
  website: string;
  /** Délai entre deux synchronisations, en secondes. */
  intervalSeconds: number;
  /** Offres actuellement disponibles. */
  fetchOffers(signal?: AbortSignal): Promise<NormalizedOffer[]>;
}
