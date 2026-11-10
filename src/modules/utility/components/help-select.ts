import type { BotClient } from '../../../core/client';
import { BotError } from '../../../core/errors/BotError';
import type { ComponentHandler } from '../../../types';
import { HELP_SELECT_ID, buildHelpMenu, buildModuleHelp } from '../services/help.service';

const handler: ComponentHandler = {
  id: HELP_SELECT_ID,

  async execute(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const client = interaction.client as BotClient;
    const moduleId = interaction.values[0] ?? '';
    const embed = buildModuleHelp(client, moduleId);
    if (!embed) throw new BotError("Ce module n'existe plus.");

    await interaction.update({
      embeds: [embed],
      components: [await buildHelpMenu(client, interaction.guildId, moduleId)],
    });
  },
};

export default handler;
