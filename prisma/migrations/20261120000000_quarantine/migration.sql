-- AlterTable
ALTER TABLE "SecurityConfig" ADD COLUMN     "quarantineChannelId" TEXT,
ADD COLUMN     "quarantineRoleId" TEXT;

-- CreateTable
CREATE TABLE "QuarantineRecord" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT,
    "reason" TEXT NOT NULL,
    "removedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseReason" TEXT,

    CONSTRAINT "QuarantineRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuarantineRecord_guildId_userId_idx" ON "QuarantineRecord"("guildId", "userId");

-- CreateIndex
CREATE INDEX "QuarantineRecord_guildId_releasedAt_idx" ON "QuarantineRecord"("guildId", "releasedAt");

-- CreateIndex
CREATE INDEX "QuarantineRecord_releasedAt_expiresAt_idx" ON "QuarantineRecord"("releasedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "QuarantineRecord" ADD CONSTRAINT "QuarantineRecord_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Une seule quarantaine active par membre et par serveur.
CREATE UNIQUE INDEX "QuarantineRecord_active_key" ON "QuarantineRecord"("guildId", "userId") WHERE "releasedAt" IS NULL;
