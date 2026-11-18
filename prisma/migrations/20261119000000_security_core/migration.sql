-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARNING', 'IMPORTANT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('RAID', 'SPAM', 'DANGEROUS_LINK', 'MASS_MENTION', 'RULE_EVASION', 'NEW_ACCOUNT', 'VERIFICATION', 'QUARANTINE', 'AUTO_SANCTION', 'SUSPICIOUS', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "SecurityConfig" (
    "guildId" TEXT NOT NULL,
    "alertChannelId" TEXT,
    "alertMinSeverity" "IncidentSeverity" NOT NULL DEFAULT 'WARNING',
    "exemptUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exemptRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incidentCounter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "userId" TEXT,
    "rule" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "observed" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT NOT NULL DEFAULT '',
    "channelId" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityIncident_guildId_createdAt_idx" ON "SecurityIncident"("guildId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SecurityIncident_guildId_userId_idx" ON "SecurityIncident"("guildId", "userId");

-- CreateIndex
CREATE INDEX "SecurityIncident_guildId_severity_createdAt_idx" ON "SecurityIncident"("guildId", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityIncident_createdAt_idx" ON "SecurityIncident"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_guildId_number_key" ON "SecurityIncident"("guildId", "number");

-- AddForeignKey
ALTER TABLE "SecurityConfig" ADD CONSTRAINT "SecurityConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

