-- CreateEnum
CREATE TYPE "RssStyle" AS ENUM ('STANDARD', 'COMPACT', 'LARGE', 'MINIMAL');

-- CreateTable
CREATE TABLE "RssCategory" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" INTEGER NOT NULL,
    "style" "RssStyle" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RssCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RssFeed" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteUrl" TEXT,
    "iconUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "customCategoryId" INTEGER,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "showSummary" BOOLEAN NOT NULL DEFAULT true,
    "showImage" BOOLEAN NOT NULL DEFAULT true,
    "mentionRoleId" TEXT,
    "includeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priorityKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignoredAuthors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryFilter" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastCheckAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "lastPostAt" TIMESTAMP(3),
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RssFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RssItem" (
    "id" SERIAL NOT NULL,
    "feedId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RssItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RssCategory_guildId_name_key" ON "RssCategory"("guildId", "name");

-- CreateIndex
CREATE INDEX "RssFeed_paused_nextCheckAt_idx" ON "RssFeed"("paused", "nextCheckAt");

-- CreateIndex
CREATE INDEX "RssFeed_customCategoryId_idx" ON "RssFeed"("customCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RssFeed_guildId_channelId_url_key" ON "RssFeed"("guildId", "channelId", "url");

-- CreateIndex
CREATE INDEX "RssItem_lastSeenAt_idx" ON "RssItem"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "RssItem_feedId_key_key" ON "RssItem"("feedId", "key");

-- AddForeignKey
ALTER TABLE "RssCategory" ADD CONSTRAINT "RssCategory_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RssFeed" ADD CONSTRAINT "RssFeed_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RssFeed" ADD CONSTRAINT "RssFeed_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "RssCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RssItem" ADD CONSTRAINT "RssItem_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "RssFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un flux n'est jamais vérifié plus souvent que toutes les 10 minutes.
ALTER TABLE "RssFeed" ADD CONSTRAINT "RssFeed_intervalMinutes_check" CHECK ("intervalMinutes" >= 10);
