import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { BotClient } from '../../../core/client';
import {
  getModuleStates,
  setModuleEnabled,
} from '../../../core/database/repositories/module.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('module')
    .setDescription('Active ou désactive les modules du bot sur ce serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('list').setDescription("Affiche l'état de chaque module."))
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Active un module.')
        .addStringOption((option) =>
          option.setName('module').setDescription('Module à activer').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Désactive un module.')
        .addStringOption((option) =>
          option
            .setName('module')
            .setDescription('Module à désactiver')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async autocomplete(interaction) {
    const client = interaction.client as BotClient;
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      client.modules
        .filter((botModule) => botModule.canDisable)
        .filter(
          (botModule) =>
            botModule.id.includes(typed) || botModule.name.toLowerCase().includes(typed),
        )
        .map((botModule) => ({ name: botModule.name, value: botModule.id }))
        .slice(0, 25),
    );
  },

  async execute(interaction) {
    const client = interaction.client as BotClient;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const states = await getModuleStates(interaction.guildId);
      const lines = client.modules.map((botModule) => {
        const enabled = !botModule.canDisable || (states.get(botModule.id) ?? true);
        const status = enabled ? '🟢 Activé' : '🔴 Désactivé';
        const lock = botModule.canDisable ? '' : ' 🔒';
        return `${botModule.emoji} **${botModule.name}** (\`${botModule.id}\`) — ${status}${lock}\n${botModule.description}`;
      });
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('🧩 Modules')
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: '🔒 = module indispensable, toujours actif' }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const moduleId = interaction.options.getString('module', true);
    const botModule = client.modules.get(moduleId);
    if (!botModule) throw new BotError(`Le module \`${moduleId}\` n'existe pas.`);
    if (!botModule.canDisable) {
      throw new BotError(`Le module **${botModule.name}** est indispensable et reste toujours actif.`);
    }

    const enable = subcommand === 'enable';
    await setModuleEnabled(interaction.guildId, moduleId, enable);
    await interaction.reply({
      embeds: [
        successEmbed(`Le module **${botModule.name}** est maintenant ${enable ? 'activé' : 'désactivé'}.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
