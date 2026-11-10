import { PermissionFlagsBits } from 'discord.js';
import { updateWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import { BotError } from '../../../core/errors/BotError';
import { assertCanManageRole } from '../../../core/permissions/hierarchy';
import type { ComponentHandler } from '../../../types';
import { buildWelcomePanel, WELCOME_IDS } from '../services/panel';

const handler: ComponentHandler = {
  id: WELCOME_IDS.role,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isRoleSelectMenu()) return;
    const role = interaction.roles.first() ?? null;

    if (role) {
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new BotError('Il me manque la permission `Gérer les rôles` pour attribuer un rôle automatique.');
      }
      // Un membre ne peut pas faire distribuer par le bot un rôle qu'il ne pourrait pas donner lui-même.
      assertCanManageRole(interaction.member, role, me);
    }

    await updateWelcomeConfig(interaction.guildId, { autoRoleId: role?.id ?? null });
    await interaction.update(await buildWelcomePanel(interaction.guild));
  },
};

export default handler;
