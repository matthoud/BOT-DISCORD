import { PermissionFlagsBits } from 'discord.js';
import { getLevelConfig, updateLevelConfig } from '../../../core/database/repositories/levels.repository';
import type { ComponentHandler } from '../../../types';
import { buildLevelPanel, LEVEL_IDS, type ToggleKind } from '../services/panel';

/** Boutons bascule du panneau : annonces de niveau et cumul des rôles de récompense. */
const handler: ComponentHandler = {
  id: LEVEL_IDS.toggle,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const kind = args[0] as ToggleKind;
    const config = await getLevelConfig(interaction.guildId);
    await updateLevelConfig(
      interaction.guildId,
      kind === 'stack' ? { stackRewards: !config.stackRewards } : { announceEnabled: !config.announceEnabled },
    );
    await interaction.update(await buildLevelPanel(interaction.guild));
  },
};

export default handler;
