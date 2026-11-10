import { PermissionFlagsBits } from 'discord.js';
import {
  getWelcomeConfig,
  updateWelcomeConfig,
} from '../../../core/database/repositories/welcome.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { buildWelcomePanel, WELCOME_IDS } from '../services/panel';

const handler: ComponentHandler = {
  id: WELCOME_IDS.channel,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isChannelSelectMenu()) return;
    const channel = interaction.channels.first() ?? null;

    if (channel) {
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      const required = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ];
      if (!('permissionsFor' in channel) || !channel.permissionsFor(me)?.has(required)) {
        throw new BotError(
          `Je ne peux pas écrire dans <#${channel.id}> : il me faut \`Voir le salon\`, \`Envoyer des messages\` et \`Intégrer des liens\`.`,
        );
      }
    }

    // Sans salon, le système ne peut plus fonctionner : il est désactivé en même temps.
    const current = await getWelcomeConfig(interaction.guildId);
    await updateWelcomeConfig(interaction.guildId, {
      channelId: channel?.id ?? null,
      enabled: channel ? current.enabled : false,
    });
    await interaction.update(await buildWelcomePanel(interaction.guild));
  },
};

export default handler;
