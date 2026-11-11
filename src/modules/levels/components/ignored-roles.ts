import { PermissionFlagsBits } from 'discord.js';
import { updateLevelConfig } from '../../../core/database/repositories/levels.repository';
import type { ComponentHandler } from '../../../types';
import { buildLevelPanel, LEVEL_IDS } from '../services/panel';

/** Menu des rôles dont les membres ne gagnent pas d'XP. */
const handler: ComponentHandler = {
  id: LEVEL_IDS.ignoredRoles,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isRoleSelectMenu()) return;
    await updateLevelConfig(interaction.guildId, { ignoredRoleIds: [...interaction.roles.keys()] });
    await interaction.update(await buildLevelPanel(interaction.guild));
  },
};

export default handler;
