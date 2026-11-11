import { PermissionFlagsBits } from 'discord.js';
import { updateLevelConfig } from '../../../core/database/repositories/levels.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { buildLevelPanel, LEVEL_IDS } from '../services/panel';

/** Menu du salon des annonces de niveau. Menu vidé : l'annonce se fait là où le membre écrit. */
const handler: ComponentHandler = {
  id: LEVEL_IDS.announceChannel,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isChannelSelectMenu()) return;
    const channel = interaction.channels.first() ?? null;
    if (channel) {
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      const canWrite =
        'permissionsFor' in channel &&
        channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
      if (!canWrite) {
        throw new BotError(
          `Je ne peux pas écrire dans <#${channel.id}> : il me faut \`Voir le salon\` et \`Envoyer des messages\`.`,
        );
      }
    }
    await updateLevelConfig(interaction.guildId, { announceChannelId: channel?.id ?? null });
    await interaction.update(await buildLevelPanel(interaction.guild));
  },
};

export default handler;
