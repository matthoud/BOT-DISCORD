import { EmbedBuilder, escapeMarkdown, type Guild, type MessageCreateOptions } from 'discord.js';
import type { GamingConfig, GamingOffer, GamingOfferKind } from '@prisma/client';
import { timestamp, truncate } from '../../../utils/format';
import { primaryStore, STORES, type StoreKey } from './stores';

export const MODULE_ID = 'gaming';
const DESCRIPTION_LENGTH = 400;

export const KIND_LABELS: Record<GamingOfferKind, string> = {
  GAME: '🎁 Jeu à conserver',
  DLC: '🧩 DLC ou contenu en jeu',
  BETA: '🧪 Accès anticipé ou bêta',
  OTHER: '🎉 Offre gratuite',
};

export const KIND_COLORS: Record<GamingOfferKind, number> = {
  GAME: 0xe67e22,
  DLC: 0x3498db,
  BETA: 0x9b59b6,
  OTHER: 0x99aab5,
};

/** Texte d'une source externe, sans mise en forme Discord ni lien masqué. */
export function safe(text: string): string {
  return escapeMarkdown(text)
    .replace(/[[\]]/g, '\\$&')
    .replace(/<(?=[@#:]|a:|t:)/g, '\\<');
}

/** Valeur dans la devise de la source (jamais convertie) : « 14,99 $US ». */
export function formatWorth(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function offerTitle(offer: Pick<GamingOffer, 'title' | 'kind' | 'stores'>): string {
  const store = STORES[primaryStore(offer.stores)].name;
  switch (offer.kind) {
    case 'GAME':
      return `${offer.title} gratuit sur ${store} !`;
    case 'DLC':
      return `${offer.title} : contenu gratuit sur ${store} !`;
    case 'BETA':
      return `${offer.title} : accès anticipé gratuit sur ${store} !`;
    default:
      return `${offer.title} : offre gratuite sur ${store} !`;
  }
}

/** Ligne de prix : l'ancien prix n'est barré que si la source le donne. */
export function priceLine(offer: Pick<GamingOffer, 'worthCents' | 'currency' | 'endsAt'>): string {
  const before =
    offer.worthCents !== null && offer.currency
      ? `~~${formatWorth(offer.worthCents, offer.currency)}~~ `
      : '';
  const until = offer.endsAt
    ? ` jusqu'au ${timestamp(offer.endsAt, 'D')} (${timestamp(offer.endsAt, 'R')})`
    : '';
  return `${before}**Gratuit**${until}`;
}

export function storeList(stores: readonly string[]): string {
  const names = stores
    .filter((store): store is StoreKey => Object.hasOwn(STORES, store))
    .map((store) => STORES[store].short);
  return names.length > 0 ? names.join(', ') : 'Plateforme non précisée';
}

export interface ProviderInfo {
  name: string;
  website: string;
}

export function buildOfferEmbed(
  offer: GamingOffer,
  provider: ProviderInfo,
  guild: Guild | null,
): EmbedBuilder {
  const quote = offer.description
    ? truncate(safe(offer.description), DESCRIPTION_LENGTH)
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => `> ${line}`)
        .join('\n')
    : '';
  const lines = [
    quote,
    quote ? '' : null,
    priceLine(offer),
    `${KIND_LABELS[offer.kind]} · ${storeList(offer.stores)}`,
    offer.keyRequired ? '🔑 Clé à récupérer sur un site partenaire (inscription requise).' : null,
    `🔗 **[Récupérer l'offre !](${offer.url})**`,
    // Attribution exigée par la source : un lien actif vers son site.
    `-# Source : [${provider.name}](${provider.website})`,
  ].filter((line): line is string => line !== null);

  const embed = new EmbedBuilder()
    .setColor(KIND_COLORS[offer.kind])
    .setTitle(truncate(safe(offerTitle(offer)), 256))
    .setURL(offer.url)
    .setDescription(truncate(lines.join('\n'), 4096))
    .setTimestamp();
  if (offer.imageUrl) embed.setImage(offer.imageUrl);
  if (guild)
    embed.setFooter({ text: truncate(guild.name, 2048), iconURL: guild.iconURL() ?? undefined });
  return embed;
}

/** Le rôle n'est mentionné que pour un jeu offert d'une valeur suffisante, et jamais par défaut. */
export function shouldMention(
  offer: Pick<GamingOffer, 'kind' | 'worthCents'>,
  config: Pick<GamingConfig, 'mentionRoleId' | 'mentionMinCents'>,
): boolean {
  if (!config.mentionRoleId || offer.kind !== 'GAME') return false;
  return (
    config.mentionMinCents === 0 ||
    (offer.worthCents !== null && offer.worthCents >= config.mentionMinCents)
  );
}

export function buildOfferMessage(
  offer: GamingOffer,
  provider: ProviderInfo,
  guild: Guild | null,
  config: Pick<GamingConfig, 'mentionRoleId' | 'mentionMinCents'>,
): MessageCreateOptions {
  const mention = shouldMention(offer, config) ? config.mentionRoleId : null;
  return {
    content: mention ? `<@&${mention}>` : undefined,
    embeds: [buildOfferEmbed(offer, provider, guild)],
    allowedMentions: { parse: [], roles: mention ? [mention] : [] },
  };
}
