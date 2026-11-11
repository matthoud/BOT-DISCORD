import {
  Prisma,
  type EconomyAccount,
  type EconomyConfig,
  type EconomyTransaction,
  type InventoryItem,
  type ShopItem,
  type TransactionType,
} from '@prisma/client';
import { CONFIG_CACHE_TTL_MS, TtlCache } from '../../../utils/cache';
import { BotError } from '../../errors/BotError';
import { prisma } from '../prisma';
import { ensureGuild } from './guild.repository';

/** Solde maximal d'un portefeuille (également garanti par une contrainte en base). */
export const MAX_BALANCE = 1_000_000_000;

const configCache = new TtlCache<string, EconomyConfig>(CONFIG_CACHE_TTL_MS);

type Tx = Prisma.TransactionClient;

export type EconomyConfigUpdate = Partial<
  Pick<
    EconomyConfig,
    | 'currencyName'
    | 'currencyEmoji'
    | 'dailyAmount'
    | 'weeklyAmount'
    | 'messageMin'
    | 'messageMax'
    | 'messageCooldownSeconds'
  >
>;

export interface MovementDetails {
  type: TransactionType;
  counterpartyId?: string;
  note?: string;
}

/* ------------------------------------------------------------------ Réglages */

export async function getEconomyConfig(guildId: string): Promise<EconomyConfig> {
  return configCache.getOrLoad(guildId, async () => {
    await ensureGuild(guildId);
    return prisma.economyConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  });
}

export async function updateEconomyConfig(guildId: string, data: EconomyConfigUpdate): Promise<EconomyConfig> {
  await ensureGuild(guildId);
  const config = await prisma.economyConfig.upsert({
    where: { guildId },
    create: { ...data, guildId },
    update: data,
  });
  configCache.set(guildId, config);
  return config;
}

/* -------------------------------------------------------------- Portefeuilles */

/**
 * Retourne le portefeuille du membre en le créant au besoin.
 * La création ignore les doublons (`ON CONFLICT DO NOTHING`) : plusieurs demandes simultanées pour
 * un portefeuille encore inexistant ne provoquent ni erreur ni annulation de la transaction en cours.
 */
async function ensureAccount(tx: Tx, guildId: string, userId: string): Promise<EconomyAccount> {
  await tx.economyAccount.createMany({ data: [{ guildId, userId }], skipDuplicates: true });
  return tx.economyAccount.findUniqueOrThrow({ where: { guildId_userId: { guildId, userId } } });
}

function assertAmount(amount: number): void {
  // Dernier rempart : aucun mouvement nul, négatif ou non entier ne doit atteindre la base.
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_BALANCE) {
    throw new BotError('Montant invalide.');
  }
}

/**
 * Ajoute `amount` au solde. La condition sur le plafond fait partie de la requête de mise à jour :
 * deux crédits simultanés ne peuvent pas le dépasser.
 */
async function creditInTx(tx: Tx, guildId: string, userId: string, amount: number): Promise<number> {
  assertAmount(amount);
  await ensureAccount(tx, guildId, userId);
  const { count } = await tx.economyAccount.updateMany({
    where: { guildId, userId, balance: { lte: MAX_BALANCE - amount } },
    data: { balance: { increment: amount } },
  });
  if (count === 0) throw new BotError('Ce portefeuille a atteint le solde maximal autorisé.');
  const account = await tx.economyAccount.findUniqueOrThrow({ where: { guildId_userId: { guildId, userId } } });
  return account.balance;
}

/**
 * Retire `amount` du solde, uniquement s'il est suffisant. La condition fait partie de la requête :
 * deux dépenses simultanées ne peuvent pas rendre le solde négatif.
 */
async function debitInTx(tx: Tx, guildId: string, userId: string, amount: number): Promise<number> {
  assertAmount(amount);
  const { count } = await tx.economyAccount.updateMany({
    where: { guildId, userId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
  if (count === 0) throw new BotError('Solde insuffisant.');
  const account = await tx.economyAccount.findUniqueOrThrow({ where: { guildId_userId: { guildId, userId } } });
  return account.balance;
}

function recordInTx(
  tx: Tx,
  guildId: string,
  userId: string,
  signedAmount: number,
  balanceAfter: number,
  details: MovementDetails,
): Promise<EconomyTransaction> {
  return tx.economyTransaction.create({
    data: {
      guildId,
      userId,
      type: details.type,
      amount: signedAmount,
      balanceAfter,
      counterpartyId: details.counterpartyId,
      note: details.note,
    },
  });
}

/** Portefeuille d'un membre (créé vide s'il n'existe pas). */
export async function getAccount(guildId: string, userId: string): Promise<EconomyAccount> {
  await ensureGuild(guildId);
  return ensureAccount(prisma, guildId, userId);
}

/** Crédite un portefeuille et enregistre le mouvement. Retourne le nouveau solde. */
export async function credit(
  guildId: string,
  userId: string,
  amount: number,
  details: MovementDetails,
): Promise<number> {
  await ensureGuild(guildId);
  return prisma.$transaction(async (tx) => {
    const balance = await creditInTx(tx, guildId, userId, amount);
    await recordInTx(tx, guildId, userId, amount, balance, details);
    return balance;
  });
}

/** Débite un portefeuille et enregistre le mouvement. Lève une `BotError` si le solde est insuffisant. */
export async function debit(
  guildId: string,
  userId: string,
  amount: number,
  details: MovementDetails,
): Promise<number> {
  await ensureGuild(guildId);
  return prisma.$transaction(async (tx) => {
    await ensureAccount(tx, guildId, userId);
    const balance = await debitInTx(tx, guildId, userId, amount);
    await recordInTx(tx, guildId, userId, -amount, balance, details);
    return balance;
  });
}

/**
 * Gain d'activité (message) : crédité sans ligne d'historique, ces gains étant trop nombreux.
 * Un portefeuille au plafond est simplement laissé tel quel.
 */
export async function creditActivity(guildId: string, userId: string, amount: number): Promise<void> {
  assertAmount(amount);
  await ensureGuild(guildId);
  await prisma.$transaction(async (tx) => {
    await ensureAccount(tx, guildId, userId);
    await tx.economyAccount.updateMany({
      where: { guildId, userId, balance: { lte: MAX_BALANCE - amount } },
      data: { balance: { increment: amount } },
    });
  });
}

/** Transfère `amount` d'un membre à un autre, de façon atomique. Retourne les deux nouveaux soldes. */
export async function transfer(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<{ fromBalance: number; toBalance: number }> {
  if (fromUserId === toUserId) throw new BotError('Vous ne pouvez pas vous payer vous-même.');
  await ensureGuild(guildId);
  return prisma.$transaction(async (tx) => {
    await ensureAccount(tx, guildId, fromUserId);
    const fromBalance = await debitInTx(tx, guildId, fromUserId, amount);
    const toBalance = await creditInTx(tx, guildId, toUserId, amount);
    await recordInTx(tx, guildId, fromUserId, -amount, fromBalance, { type: 'PAY_SENT', counterpartyId: toUserId });
    await recordInTx(tx, guildId, toUserId, amount, toBalance, { type: 'PAY_RECEIVED', counterpartyId: fromUserId });
    return { fromBalance, toBalance };
  });
}

export type ClaimKind = 'daily' | 'weekly';

export type ClaimResult =
  | { claimed: true; balance: number }
  /** Déjà réclamée : date à partir de laquelle la prochaine sera disponible. */
  | { claimed: false; availableAt: Date };

/**
 * Réclame la récompense quotidienne ou hebdomadaire.
 * La vérification du délai et son enregistrement se font dans une seule requête : deux demandes
 * simultanées ne peuvent pas obtenir la récompense deux fois.
 */
export async function claimReward(
  guildId: string,
  userId: string,
  kind: ClaimKind,
  amount: number,
  periodMs: number,
  now = new Date(),
): Promise<ClaimResult> {
  const column = kind === 'daily' ? 'lastDailyAt' : 'lastWeeklyAt';
  const threshold = new Date(now.getTime() - periodMs);
  await ensureGuild(guildId);

  return prisma.$transaction(async (tx) => {
    const account = await ensureAccount(tx, guildId, userId);
    const { count } = await tx.economyAccount.updateMany({
      where: { guildId, userId, OR: [{ [column]: null }, { [column]: { lte: threshold } }] },
      data: { [column]: now },
    });
    if (count === 0) {
      const last = account[column] ?? now;
      return { claimed: false as const, availableAt: new Date(last.getTime() + periodMs) };
    }
    const balance = await creditInTx(tx, guildId, userId, amount);
    await recordInTx(tx, guildId, userId, amount, balance, { type: kind === 'daily' ? 'DAILY' : 'WEEKLY' });
    return { claimed: true as const, balance };
  });
}

/** Rang d'un membre dans le classement des fortunes (1 = premier). */
export async function getWealthRank(guildId: string, balance: number): Promise<number> {
  return (await prisma.economyAccount.count({ where: { guildId, balance: { gt: balance } } })) + 1;
}

export async function countWealthyMembers(guildId: string): Promise<number> {
  return prisma.economyAccount.count({ where: { guildId, balance: { gt: 0 } } });
}

export async function getWealthPage(
  guildId: string,
  skip: number,
  take: number,
): Promise<Pick<EconomyAccount, 'userId' | 'balance'>[]> {
  return prisma.economyAccount.findMany({
    where: { guildId, balance: { gt: 0 } },
    orderBy: [{ balance: 'desc' }, { id: 'asc' }],
    skip,
    take,
    select: { userId: true, balance: true },
  });
}

/* ----------------------------------------------------------------- Historique */

export async function countTransactions(guildId: string, userId: string): Promise<number> {
  return prisma.economyTransaction.count({ where: { guildId, userId } });
}

export async function getTransactionPage(
  guildId: string,
  userId: string,
  skip: number,
  take: number,
): Promise<EconomyTransaction[]> {
  return prisma.economyTransaction.findMany({
    where: { guildId, userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip,
    take,
  });
}

/** Supprime les mouvements plus anciens que `before`. Retourne le nombre de lignes supprimées. */
export async function pruneTransactions(before: Date): Promise<number> {
  const { count } = await prisma.economyTransaction.deleteMany({ where: { createdAt: { lt: before } } });
  return count;
}

/* ------------------------------------------------------------------- Boutique */

export interface ShopItemInput {
  name: string;
  description: string;
  price: number;
  roleId: string | null;
  stock: number | null;
  maxPerUser: number | null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Articles du serveur, du moins cher au plus cher. `onlyEnabled` : uniquement ceux en vente. */
export async function listShopItems(guildId: string, onlyEnabled: boolean): Promise<ShopItem[]> {
  return prisma.shopItem.findMany({
    where: { guildId, ...(onlyEnabled ? { enabled: true } : {}) },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
  });
}

export async function countShopItems(guildId: string): Promise<number> {
  return prisma.shopItem.count({ where: { guildId } });
}

export async function getShopItem(guildId: string, itemId: number): Promise<ShopItem | null> {
  return prisma.shopItem.findFirst({ where: { id: itemId, guildId } });
}

export async function createShopItem(guildId: string, input: ShopItemInput): Promise<ShopItem> {
  await ensureGuild(guildId);
  const existing = await prisma.shopItem.findUnique({ where: { guildId_name: { guildId, name: input.name } } });
  if (existing) throw new BotError(`Un article nommé **${input.name}** existe déjà.`);
  try {
    return await prisma.shopItem.create({ data: { guildId, ...input } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new BotError(`Un article nommé **${input.name}** existe déjà.`);
    throw error;
  }
}

export async function updateShopItem(
  guildId: string,
  itemId: number,
  data: Partial<ShopItemInput> & { enabled?: boolean },
): Promise<ShopItem> {
  if (data.name !== undefined) {
    const sameName = await prisma.shopItem.findUnique({ where: { guildId_name: { guildId, name: data.name } } });
    if (sameName && sameName.id !== itemId) throw new BotError(`Un article nommé **${data.name}** existe déjà.`);
  }
  const { count } = await prisma.shopItem.updateMany({ where: { id: itemId, guildId }, data });
  if (count === 0) throw new BotError("Cet article n'existe plus.");
  return prisma.shopItem.findUniqueOrThrow({ where: { id: itemId } });
}

/** Supprime un article et le retire de tous les inventaires. */
export async function deleteShopItem(guildId: string, itemId: number): Promise<boolean> {
  const { count } = await prisma.shopItem.deleteMany({ where: { id: itemId, guildId } });
  return count > 0;
}

export async function countItemOwners(itemId: number): Promise<number> {
  return prisma.inventoryItem.count({ where: { itemId, quantity: { gt: 0 } } });
}

/**
 * Achète un exemplaire d'un article : solde, stock et limite par membre sont vérifiés et modifiés
 * dans une même transaction. Lève une `BotError` explicite si l'achat est impossible.
 */
export async function purchaseItem(
  guildId: string,
  userId: string,
  itemId: number,
): Promise<{ item: ShopItem; balance: number; quantity: number }> {
  await ensureGuild(guildId);
  return prisma.$transaction(async (tx) => {
    const item = await tx.shopItem.findFirst({ where: { id: itemId, guildId } });
    if (!item || !item.enabled) throw new BotError("Cet article n'est plus en vente.");

    const account = await ensureAccount(tx, guildId, userId);
    // Un article gratuit ne donne lieu à aucun débit.
    const balance = item.price > 0 ? await debitInTx(tx, guildId, userId, item.price) : account.balance;

    if (item.stock !== null) {
      const { count } = await tx.shopItem.updateMany({
        where: { id: item.id, stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      });
      if (count === 0) throw new BotError('Cet article est en rupture de stock.');
    }

    const owned = await tx.inventoryItem.upsert({
      where: { guildId_userId_itemId: { guildId, userId, itemId: item.id } },
      create: { guildId, userId, itemId: item.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    // Vérifiée après l'incrément : deux achats simultanés ne peuvent pas dépasser la limite.
    if (item.maxPerUser !== null && owned.quantity > item.maxPerUser) {
      throw new BotError(
        item.maxPerUser === 1
          ? 'Vous possédez déjà cet article.'
          : `Vous possédez déjà le nombre maximal d'exemplaires de cet article (${item.maxPerUser}).`,
      );
    }

    await recordInTx(tx, guildId, userId, -item.price, balance, { type: 'PURCHASE', note: item.name });
    return { item, balance, quantity: owned.quantity };
  });
}

/** Annule un achat qui n'a pas pu être honoré (rôle impossible à attribuer) : rembourse et restitue le stock. */
export async function refundPurchase(guildId: string, userId: string, item: ShopItem): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.inventoryItem.updateMany({
      where: { guildId, userId, itemId: item.id, quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    await tx.inventoryItem.deleteMany({ where: { guildId, userId, itemId: item.id, quantity: 0 } });
    if (item.stock !== null) {
      await tx.shopItem.updateMany({ where: { id: item.id }, data: { stock: { increment: 1 } } });
    }
    if (item.price === 0) return (await ensureAccount(tx, guildId, userId)).balance;
    const balance = await creditInTx(tx, guildId, userId, item.price);
    await recordInTx(tx, guildId, userId, item.price, balance, { type: 'REFUND', note: item.name });
    return balance;
  });
}

export type InventoryEntry = InventoryItem & { item: ShopItem };

/** Inventaire d'un membre, articles compris. */
export async function getInventory(guildId: string, userId: string): Promise<InventoryEntry[]> {
  return prisma.inventoryItem.findMany({
    where: { guildId, userId, quantity: { gt: 0 } },
    include: { item: true },
    orderBy: { createdAt: 'asc' },
  });
}
