import { PermissionFlagsBits } from 'discord.js';
import { updateSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { buildSuggestionPanel } from '../services/panel';
import { SUGGESTION_IDS } from '../services/presenter';

/** Menu du rôle autorisé à traiter les suggestions, en plus de « Gérer le serveur ». */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.staffRole,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isRoleSelectMenu()) return;
    const role = interaction.roles.first() ?? null;
    if (role?.id === interaction.guildId) {
      throw new BotError('Le rôle @everyone ne peut pas être le rôle de staff : tout le monde pourrait traiter les suggestions.');
    }
    await updateSuggestionConfig(interaction.guildId, { staffRoleId: role?.id ?? null });
    await interaction.update(await buildSuggestionPanel(interaction.guild));
  },
};

export default handler;
