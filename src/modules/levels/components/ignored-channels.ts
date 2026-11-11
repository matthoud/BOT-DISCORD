import { PermissionFlagsBits } from 'discord.js';
import { updateLevelConfig } from '../../../core/database/repositories/levels.repository';
import type { ComponentHandler } from '../../../types';
import { buildLevelPanel, LEVEL_IDS } from '../services/panel';

/** Menu des salons où les messages ne rapportent pas d'XP. */
const handler: ComponentHandler = {
  id: LEVEL_IDS.ignoredChannels,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isChannelSelectMenu()) return;
    await updateLevelConfig(interaction.guildId, { ignoredChannelIds: [...interaction.channels.keys()] });
    await interaction.update(await buildLevelPanel(interaction.guild));
  },
};

export default handler;
