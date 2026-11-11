import type { TransactionType } from '@prisma/client';
import { formatNumber } from '../../../utils/format';

export const MODULE_ID = 'economy';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Bornes acceptées pour les réglages et les montants saisis. */
export const ECONOMY_LIMITS = {
  reward: { min: 0, max: 1_000_000 },
  messageGain: { min: 0, max: 1000 },
  messageCooldownSeconds: { min: 10, max: 3600 },
  amount: { min: 1, max: 100_000_000 },
  price: { min: 0, max: 100_000_000 },
  stock: { min: 0, max: 1_000_000 },
  maxPerUser: { min: 1, max: 1000 },
  shopItems: 50,
  itemName: 50,
  itemDescription: 200,
  currencyName: 30,
  currencyEmoji: 60,
} as const;

export interface Currency {
  currencyName: string;
  currencyEmoji: string;
}

/** Montant suivi du symbole de la monnaie : « 1 250 🪙 ». */
export function formatMoney(amount: number, currency: Currency): string {
  return `${formatNumber(amount)} ${currency.currencyEmoji}`;
}

/** Montant signé pour l'historique : « +100 🪙 », « −50 🪙 ». */
export function formatSignedMoney(amount: number, currency: Currency): string {
  return `${amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(amount), currency)}`;
}

/** Vrai si les gains par message sont désactivés (minimum et maximum à zéro). */
export function messageGainDisabled(config: { messageMin: number; messageMax: number }): boolean {
  return config.messageMax <= 0;
}

/** Gain pour un message : entier tiré au hasard entre `min` et `max` inclus. */
export function rollGain(min: number, max: number, random: () => number = Math.random): number {
  const low = Math.max(Math.min(min, max), 0);
  const high = Math.max(min, max, 0);
  return low + Math.floor(random() * (high - low + 1));
}

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  DAILY: '📅 Récompense quotidienne',
  WEEKLY: '🗓️ Récompense hebdomadaire',
  PAY_SENT: '📤 Paiement envoyé',
  PAY_RECEIVED: '📥 Paiement reçu',
  PURCHASE: '🛒 Achat',
  REFUND: '↩️ Remboursement',
  ADMIN_GIVE: '🛠️ Ajout par un administrateur',
  ADMIN_TAKE: '🛠️ Retrait par un administrateur',
};

/** Libellé d'une ligne d'historique, avec l'autre membre concerné ou l'article le cas échéant. */
export function describeTransaction(transaction: {
  type: TransactionType;
  counterpartyId: string | null;
  note: string | null;
}): string {
  const label = TRANSACTION_LABELS[transaction.type];
  switch (transaction.type) {
    case 'PAY_SENT':
      return transaction.counterpartyId ? `${label} à <@${transaction.counterpartyId}>` : label;
    case 'PAY_RECEIVED':
      return transaction.counterpartyId ? `${label} de <@${transaction.counterpartyId}>` : label;
    case 'ADMIN_GIVE':
    case 'ADMIN_TAKE':
      return transaction.counterpartyId ? `${label} (<@${transaction.counterpartyId}>)` : label;
    case 'PURCHASE':
    case 'REFUND':
      return transaction.note ? `${label} : ${transaction.note}` : label;
    default:
      return label;
  }
}

/** Lit un entier saisi dans un formulaire. Retourne `null` s'il n'est pas un entier dans les bornes. */
export function parseBoundedInteger(raw: string, limits: { min: number; max: number }): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= limits.min && value <= limits.max ? value : null;
}
