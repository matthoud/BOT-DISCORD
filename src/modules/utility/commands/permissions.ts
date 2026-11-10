import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandStringOption,
} from 'discord.js';
import type { BotClient } from '../../../core/client';
import {
  listCustomPermissions,
  removeCustomPermissions,
  setCustomPermission,
} from '../../../core/database/repositories/permission.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const commandOption = (option: SlashCommandStringOption) =>
  option
    .setName('commande')
    .setDescription('Nom de la commande (sans le /)')
    .setRequired(true)
    .setAutocomplete(true);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Configure les rôles autorisés ou refusés pour chaque commande.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('allow')
        .setDescription('Autorise un rôle à utiliser une commande.')
        .addStringOption(commandOption)
        .addRoleOption((option) =>
          option.setName('role').setDescription('Rôle à autoriser').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deny')
        .setDescription("Interdit à un rôle d'utiliser une commande.")
        .addStringOption(commandOption)
        .addRoleOption((option) =>
          option.setName('role').setDescription('Rôle à refuser').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription("Supprime les règles d'une commande (pour un rôle ou toutes).")
        .addStringOption(commandOption)
        .addRoleOption((option) =>
          option.setName('role').setDescription('Limiter la suppression à ce rôle'),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Affiche toutes les règles personnalisées du serveur.'),
    ),
  // Réservé aux administrateurs : ces règles peuvent donner accès aux commandes de modération.
  userPermissions: [PermissionFlagsBits.Administrator],
  cooldown: 3,

  async autocomplete(interaction) {
    const client = interaction.client as BotClient;
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      client.commands
        .filter((loaded) => loaded.data.name.includes(typed))
        .map((loaded) => ({ name: `/${loaded.data.name}`, value: loaded.data.name }))
        .slice(0, 25),
    );
  },

  async execute(interaction) {
    const client = interaction.client as BotClient;
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (subcommand === 'list') {
      const rules = await listCustomPermissions(guildId);
      const byCommand = new Map<string, string[]>();
      for (const rule of rules) {
        const lines = byCommand.get(rule.commandName) ?? [];
        lines.push(`${rule.allow ? '✅' : '⛔'} <@&${rule.roleId}>`);
        byCommand.set(rule.commandName, lines);
      }
      const description =
        [...byCommand.entries()]
          .map(([name, lines]) => `**/${name}**\n${lines.join('\n')}`)
          .join('\n\n')
          .slice(0, 4096) || 'Aucune règle personnalisée. Les permissions Discord par défaut s’appliquent.';

      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('🔐 Permissions personnalisées')
            .setDescription(description)
            .setFooter({ text: '✅ rôle autorisé • ⛔ rôle refusé (le refus est prioritaire)' }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const commandName = interaction.options.getString('commande', true).replace(/^\//, '').toLowerCase();
    if (!client.commands.has(commandName)) {
      throw new BotError(`La commande \`/${commandName}\` n'existe pas.`);
    }

    if (subcommand === 'reset') {
      const role = interaction.options.getRole('role');
      const removed = await removeCustomPermissions(guildId, commandName, role?.id);
      await interaction.reply({
        embeds: [successEmbed(`${removed} règle(s) supprimée(s) pour \`/${commandName}\`.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const role = interaction.options.getRole('role', true);
    if (role.id === guildId) {
      throw new BotError('Le rôle @everyone ne peut pas être utilisé dans une règle.');
    }
    const allow = subcommand === 'allow';
    await setCustomPermission(guildId, commandName, role.id, allow);

    const hint = allow
      ? "\nSi la commande n'apparaît pas pour ce rôle, autorisez-la aussi dans **Paramètres du serveur → Intégrations**."
      : '';
    await interaction.reply({
      embeds: [
        successEmbed(
          `Le rôle ${role} est maintenant **${allow ? 'autorisé' : 'refusé'}** pour \`/${commandName}\`.${hint}`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
