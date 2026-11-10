import { PermissionFlagsBits } from 'discord.js';
import {
  getWelcomeConfig,
  updateWelcomeConfig,
} from '../../../core/database/repositories/welcome.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { buildWelcomePanel, WELCOME_IDS } from '../services/panel';

const handler: ComponentHandler = {
  id: WELCOME_IDS.toggle,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const config = await getWelcomeConfig(interaction.guildId);

    if (args[0] === 'leave') {
      await updateWelcomeConfig(interaction.guildId, { leaveEnabled: !config.leaveEnabled });
    } else {
      if (!config.enabled && !config.channelId) {
        throw new BotError("Choisissez d'abord un salon de bienvenue avant d'activer le système.");
      }
      await updateWelcomeConfig(interaction.guildId, { enabled: !config.enabled });
    }

    await interaction.update(await buildWelcomePanel(interaction.guild));
  },
};

export default handler;
