-- CreateTable
CREATE TABLE "LevelConfig" (
    "guildId" TEXT NOT NULL,
    "xpMin" INTEGER NOT NULL DEFAULT 15,
    "xpMax" INTEGER NOT NULL DEFAULT 25,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "levelBase" INTEGER NOT NULL DEFAULT 100,
    "levelStep" INTEGER NOT NULL DEFAULT 50,
    "announceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "announceChannelId" TEXT,
    "levelUpMessage" TEXT NOT NULL DEFAULT '🎉 Bravo {user}, tu passes au niveau **{level}** !',
    "stackRewards" BOOLEAN NOT NULL DEFAULT true,
    "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignoredRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "UserExperience" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelReward" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserExperience_guildId_xp_idx" ON "UserExperience"("guildId", "xp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserExperience_guildId_userId_key" ON "UserExperience"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LevelReward_guildId_level_key" ON "LevelReward"("guildId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "LevelReward_guildId_roleId_key" ON "LevelReward"("guildId", "roleId");

-- AddForeignKey
ALTER TABLE "LevelConfig" ADD CONSTRAINT "LevelConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserExperience" ADD CONSTRAINT "UserExperience_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelReward" ADD CONSTRAINT "LevelReward_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

