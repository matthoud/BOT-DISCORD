-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('WARN', 'TIMEOUT', 'UNTIMEOUT', 'KICK', 'BAN', 'UNBAN', 'CLEAR_WARNINGS');

-- CreateEnum
CREATE TYPE "SanctionAction" AS ENUM ('TIMEOUT', 'KICK', 'BAN');

-- CreateTable
CREATE TABLE "GuildConfig" (
    "guildId" TEXT NOT NULL,
    "caseCounter" INTEGER NOT NULL DEFAULT 0,
    "dmOnSanction" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "UserConfig" (
    "userId" TEXT NOT NULL,
    "dmNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConfig_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ModuleConfig" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "type" "CaseType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetTag" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "duration" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warning" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "caseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SanctionRule" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "action" "SanctionAction" NOT NULL,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanctionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Bienvenue {user} sur **{server}** ! Nous sommes désormais {memberCount} membres.',
    "leaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "leaveMessage" TEXT NOT NULL DEFAULT '**{username}** a quitté {server}. Nous sommes désormais {memberCount} membres.',
    "autoRoleId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "LoggingConfig" (
    "guildId" TEXT NOT NULL,
    "membersChannelId" TEXT,
    "messagesChannelId" TEXT,
    "channelsChannelId" TEXT,
    "rolesChannelId" TEXT,
    "moderationChannelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoggingConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "CustomPermission" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "allow" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleConfig_guildId_moduleId_key" ON "ModuleConfig"("guildId", "moduleId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_targetId_idx" ON "ModerationCase"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_moderatorId_idx" ON "ModerationCase"("guildId", "moderatorId");

-- CreateIndex
CREATE INDEX "ModerationCase_resolved_expiresAt_idx" ON "ModerationCase"("resolved", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_guildId_caseNumber_key" ON "ModerationCase"("guildId", "caseNumber");

-- CreateIndex
CREATE INDEX "Warning_guildId_userId_active_idx" ON "Warning"("guildId", "userId", "active");

-- CreateIndex
CREATE INDEX "Warning_caseId_idx" ON "Warning"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "SanctionRule_guildId_threshold_key" ON "SanctionRule"("guildId", "threshold");

-- CreateIndex
CREATE INDEX "CustomPermission_guildId_commandName_idx" ON "CustomPermission"("guildId", "commandName");

-- CreateIndex
CREATE UNIQUE INDEX "CustomPermission_guildId_commandName_roleId_key" ON "CustomPermission"("guildId", "commandName", "roleId");

-- AddForeignKey
ALTER TABLE "ModuleConfig" ADD CONSTRAINT "ModuleConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SanctionRule" ADD CONSTRAINT "SanctionRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeConfig" ADD CONSTRAINT "WelcomeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggingConfig" ADD CONSTRAINT "LoggingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPermission" ADD CONSTRAINT "CustomPermission_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

