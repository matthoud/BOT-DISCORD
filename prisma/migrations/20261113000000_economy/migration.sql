-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DAILY', 'WEEKLY', 'PAY_SENT', 'PAY_RECEIVED', 'PURCHASE', 'REFUND', 'ADMIN_GIVE', 'ADMIN_TAKE');

-- CreateTable
CREATE TABLE "EconomyConfig" (
    "guildId" TEXT NOT NULL,
    "currencyName" TEXT NOT NULL DEFAULT 'pièces',
    "currencyEmoji" TEXT NOT NULL DEFAULT '🪙',
    "dailyAmount" INTEGER NOT NULL DEFAULT 100,
    "weeklyAmount" INTEGER NOT NULL DEFAULT 500,
    "messageMin" INTEGER NOT NULL DEFAULT 1,
    "messageMax" INTEGER NOT NULL DEFAULT 3,
    "messageCooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomyConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "EconomyAccount" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lastDailyAt" TIMESTAMP(3),
    "lastWeeklyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyTransaction" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "counterpartyId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "roleId" TEXT,
    "stock" INTEGER,
    "maxPerUser" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EconomyAccount_guildId_balance_idx" ON "EconomyAccount"("guildId", "balance" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "EconomyAccount_guildId_userId_key" ON "EconomyAccount"("guildId", "userId");

-- CreateIndex
CREATE INDEX "EconomyTransaction_guildId_userId_createdAt_idx" ON "EconomyTransaction"("guildId", "userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EconomyTransaction_createdAt_idx" ON "EconomyTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_guildId_name_key" ON "ShopItem"("guildId", "name");

-- CreateIndex
CREATE INDEX "InventoryItem_itemId_idx" ON "InventoryItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_guildId_userId_itemId_key" ON "InventoryItem"("guildId", "userId", "itemId");

-- AddForeignKey
ALTER TABLE "EconomyConfig" ADD CONSTRAINT "EconomyConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyAccount" ADD CONSTRAINT "EconomyAccount_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyTransaction" ADD CONSTRAINT "EconomyTransaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Garde-fous en base : un solde, un prix, un stock ou une quantité ne peut jamais être négatif,
-- quel que soit le chemin emprunté par le code.
ALTER TABLE "EconomyAccount" ADD CONSTRAINT "EconomyAccount_balance_check" CHECK ("balance" >= 0 AND "balance" <= 1000000000);
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_price_check" CHECK ("price" >= 0);
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_stock_check" CHECK ("stock" IS NULL OR "stock" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_check" CHECK ("quantity" >= 0);
