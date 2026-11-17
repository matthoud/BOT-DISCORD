import type { GamingOfferKind } from '@prisma/client';
import { z } from 'zod';
import { httpClient, type HttpClient } from '../../../core/http/client';
import { HttpError } from '../../../core/http/errors';
import type { StoreKey } from '../services/stores';
import type { GamingProvider, NormalizedOffer } from './types';

/**
 * GamerPower — https://www.gamerpower.com/api-read
 * Conditions vérifiées : sans clé, usage gratuit (personnel et commercial), 10 requêtes par seconde
 * au plus, attribution obligatoire par un lien actif vers GamerPower.com.
 */
const API_URL = 'https://www.gamerpower.com/api/giveaways';
const MAX_DESCRIPTION = 2000;

const text = z.union([z.string(), z.number()]).transform(String);

const giveawaySchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().min(1).max(500),
  worth: text.optional(),
  image: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  open_giveaway_url: z.string().optional(),
  gamerpower_url: z.string().optional(),
  type: z.string().optional(),
  platforms: z.string().optional(),
  end_date: z.string().optional(),
  status: z.string().optional(),
});

export type GamerPowerGiveaway = z.infer<typeof giveawaySchema>;

const KIND_BY_TYPE: Record<string, GamingOfferKind> = {
  game: 'GAME',
  dlc: 'DLC',
  loot: 'DLC',
  'early access': 'BETA',
  beta: 'BETA',
};

const PLATFORMS: [RegExp, StoreKey][] = [
  [/^epic games( store)?$/i, 'epic'],
  [/^steam$/i, 'steam'],
  [/^gog$/i, 'gog'],
  [/^itch\.?io$/i, 'itch'],
  [/^drm-free$/i, 'drm-free'],
  [/^playstation/i, 'playstation'],
  [/^xbox/i, 'xbox'],
  [/^nintendo switch/i, 'switch'],
  [/^android$/i, 'android'],
  [/^ios$/i, 'ios'],
  [/^vr$/i, 'vr'],
  [/^pc$/i, 'pc'],
];

export function parseStores(platforms: string | undefined): StoreKey[] {
  const stores: StoreKey[] = [];
  for (const raw of (platforms ?? '').split(',')) {
    const store = PLATFORMS.find(([pattern]) => pattern.test(raw.trim()))?.[1];
    if (store && !stores.includes(store)) stores.push(store);
  }
  return stores;
}

/** « 14,99 $ » saisi par GamerPower sous la forme `$14.99` ; `N/A` ou autre = inconnu. */
export function parseWorth(worth: string | undefined): number | null {
  const match = /^\$(\d{1,6})(?:\.(\d{1,2}))?$/.exec(worth?.trim() ?? '');
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

/** Date de fin `AAAA-MM-JJ HH:MM[:SS]` (UTC) ; `N/A` ou autre = inconnue. */
export function parseEndDate(value: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number) as number[];
  const date = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s ?? 0));
  return Number.isNaN(date.getTime()) || date.getUTCMonth() !== mo! - 1 ? null : date;
}

/** Titre sans les mentions techniques de la source (« (Epic Games) Giveaway », « Steam Key »...). */
export function cleanTitle(title: string): string {
  const cleaned = title
    .replace(
      /\s*\((?:epic games(?: store)?|steam|gog|itch\.io|pc|prime gaming|indiegala|xbox[^)]*|playstation[^)]*)\)/gi,
      '',
    )
    .replace(/\s+(?:steam\s+)?(?:keys?\s+)?giveaway$/i, '')
    .replace(/\s+steam\s+keys?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || title.trim();
}

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeGiveaway(giveaway: GamerPowerGiveaway): NormalizedOffer | null {
  if (giveaway.status && giveaway.status.toLowerCase() !== 'active') return null;
  const url = httpsUrl(giveaway.open_giveaway_url) ?? httpsUrl(giveaway.gamerpower_url);
  if (!url) return null;
  const instructions = giveaway.instructions ?? '';
  return {
    externalId: String(giveaway.id),
    title: cleanTitle(giveaway.title),
    description: (giveaway.description ?? '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, MAX_DESCRIPTION),
    kind: KIND_BY_TYPE[(giveaway.type ?? '').trim().toLowerCase()] ?? 'OTHER',
    stores: parseStores(giveaway.platforms),
    worthCents: parseWorth(giveaway.worth),
    currency: parseWorth(giveaway.worth) === null ? null : 'USD',
    endsAt: parseEndDate(giveaway.end_date),
    imageUrl: httpsUrl(giveaway.image),
    url,
    // Clé à obtenir sur un site partenaire (inscription nécessaire), et non ajout direct à la bibliothèque.
    keyRequired:
      /\bkeys?\b/i.test(giveaway.title) || /unlock your key|redeem[^.]*key/i.test(instructions),
  };
}

export function createGamerPowerProvider(client: HttpClient = httpClient): GamingProvider {
  return {
    id: 'gamerpower',
    name: 'GamerPower',
    website: 'https://www.gamerpower.com',
    intervalSeconds: 30 * 60,
    async fetchOffers(signal) {
      const response = await client.get(API_URL, {
        headers: { accept: 'application/json' },
        maxBytes: 5 * 1024 * 1024,
        timeoutMs: 20_000,
        signal,
      });
      // 201 : aucune offre active en ce moment.
      if (response.status === 201) return [];
      if (response.status !== 200) {
        throw new HttpError(
          'STATUS',
          `GamerPower a répondu avec une erreur (code ${response.status}).`,
          response.status,
        );
      }
      let data: unknown;
      try {
        data = JSON.parse(response.body.toString('utf8'));
      } catch {
        throw new HttpError(
          'INVALID_RESPONSE',
          "La réponse de GamerPower n'est pas du JSON valide.",
        );
      }
      if (!Array.isArray(data))
        throw new HttpError(
          'INVALID_RESPONSE',
          "La réponse de GamerPower n'a pas le format attendu.",
        );
      const offers: NormalizedOffer[] = [];
      for (const entry of data) {
        // Une entrée invalide est ignorée sans faire échouer les autres.
        const parsed = giveawaySchema.safeParse(entry);
        const offer = parsed.success ? normalizeGiveaway(parsed.data) : null;
        if (offer) offers.push(offer);
      }
      if (data.length > 0 && offers.length === 0) {
        throw new HttpError(
          'INVALID_RESPONSE',
          "La réponse de GamerPower n'a pas le format attendu.",
        );
      }
      return offers;
    },
  };
}
