import { PermissionFlagsBits } from 'discord.js';
import {
  LOG_CATEGORIES,
  setLogChannel,
  type LogCategory,
} from '../../../core/database/repositories/logging.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { LOG_CHANNEL_PERMISSIONS } from '../services/log.service';
import { buildLogsPanel, LOG_CHANNEL_SELECT_ID } from '../services/panel';

const handler: ComponentHandler = {
  id: LOG_CHANNEL_SELECT_ID,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isChannelSelectMenu()) return;
    const category = args[0] as LogCategory;
    if (!LOG_CATEGORIES.includes(category)) throw new BotError('Catégorie de logs inconnue.');

    const channel = interaction.channels.first() ?? null;
    if (channel) {
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      if (!('permissionsFor' in channel) || !channel.permissionsFor(me)?.has(LOG_CHANNEL_PERMISSIONS)) {
        throw new BotError(
          `Je ne peux pas écrire dans <#${channel.id}> : il me faut \`Voir le salon\`, \`Envoyer des messages\` et \`Intégrer des liens\`.`,
        );
      }
    }

    await setLogChannel(interaction.guildId, category, channel?.id ?? null);
    await interaction.update(await buildLogsPanel(interaction.guild));
  },
};

export default handler;
