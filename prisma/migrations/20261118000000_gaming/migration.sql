-- CreateEnum
CREATE TYPE "GamingOfferKind" AS ENUM ('GAME', 'DLC', 'BETA', 'OTHER');

-- CreateTable
CREATE TABLE "GamingOffer" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "GamingOfferKind" NOT NULL,
    "stores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "worthCents" INTEGER,
    "currency" TEXT,
    "endsAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "url" TEXT NOT NULL,
    "keyRequired" BOOLEAN NOT NULL DEFAULT false,
    "baseline" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamingConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "extrasChannelId" TEXT,
    "kinds" "GamingOfferKind"[] DEFAULT ARRAY['GAME']::"GamingOfferKind"[],
    "stores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minWorthCents" INTEGER NOT NULL DEFAULT 0,
    "mentionRoleId" TEXT,
    "mentionMinCents" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "announceSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamingConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "GamingAnnouncement" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "offerId" INTEGER NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamingAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GamingOffer_active_firstSeenAt_idx" ON "GamingOffer"("active", "firstSeenAt");

-- CreateIndex
CREATE INDEX "GamingOffer_lastSeenAt_idx" ON "GamingOffer"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "GamingOffer_provider_externalId_key" ON "GamingOffer"("provider", "externalId");

-- CreateIndex
CREATE INDEX "GamingAnnouncement_offerId_idx" ON "GamingAnnouncement"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "GamingAnnouncement_guildId_offerId_key" ON "GamingAnnouncement"("guildId", "offerId");

-- AddForeignKey
ALTER TABLE "GamingConfig" ADD CONSTRAINT "GamingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamingAnnouncement" ADD CONSTRAINT "GamingAnnouncement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamingAnnouncement" ADD CONSTRAINT "GamingAnnouncement_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "GamingOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Valeurs et seuils jamais négatifs.
ALTER TABLE "GamingOffer" ADD CONSTRAINT "GamingOffer_worthCents_check" CHECK ("worthCents" IS NULL OR "worthCents" >= 0);
ALTER TABLE "GamingConfig" ADD CONSTRAINT "GamingConfig_thresholds_check" CHECK ("minWorthCents" >= 0 AND "mentionMinCents" >= 0);
