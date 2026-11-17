import type { GamingConfig, GamingOffer } from '@prisma/client';

export type OfferFilters = Pick<GamingConfig, 'kinds' | 'stores' | 'minWorthCents'>;

/** Raison pour laquelle une offre n'est pas annoncée, ou `null` si elle passe les filtres. */
export function rejectReason(
  offer: Pick<GamingOffer, 'kind' | 'stores' | 'worthCents'>,
  filters: OfferFilters,
): string | null {
  if (!filters.kinds.includes(offer.kind)) return 'type non retenu';
  if (filters.stores.length > 0 && !offer.stores.some((store) => filters.stores.includes(store))) {
    return 'boutique non retenue';
  }
  // Avec un seuil, une offre sans valeur connue n'est pas annoncée : sa valeur n'est jamais supposée.
  if (
    filters.minWorthCents > 0 &&
    (offer.worthCents === null || offer.worthCents < filters.minWorthCents)
  ) {
    return 'valeur inférieure au minimum (ou inconnue)';
  }
  return null;
}

/** Montant saisi en unités (`4.99`, `5`) converti en centimes ; `null` si invalide. */
export function toCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) return null;
  return Math.round(value * 100);
}
