import { PermissionFlagsBits } from 'discord.js';
import { updateSuggestionConfig } from '../../../core/database/repositories/suggestions.repository';
import type { ComponentHandler } from '../../../types';
import { buildSuggestionPanel } from '../services/panel';
import { SUGGESTION_IDS } from '../services/presenter';
import { resolveSuggestionChannel } from '../services/suggestion.service';

/** Menu du salon où les suggestions sont publiées. */
const handler: ComponentHandler = {
  id: SUGGESTION_IDS.channel,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    if (!interaction.isChannelSelectMenu()) return;
    const channelId = interaction.channels.first()?.id ?? null;
    // Refuse un salon où le bot ne pourrait pas publier, avec la permission manquante nommée.
    if (channelId) await resolveSuggestionChannel(interaction.guild, { channelId });
    await updateSuggestionConfig(interaction.guildId, { channelId });
    await interaction.update(await buildSuggestionPanel(interaction.guild));
  },
};

export default handler;
