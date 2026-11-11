import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { BotClient } from '../../../core/client';
import {
  getGuildConfig,
  updateGuildConfig,
} from '../../../core/database/repositories/guild.repository';
import { getLoggingConfig } from '../../../core/database/repositories/logging.repository';
import { getModuleStates } from '../../../core/database/repositories/module.repository';
import { listCustomPermissions } from '../../../core/database/repositories/permission.repository';
import { getWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { formatNowIn, isValidTimezone, searchTimezones } from '../../../utils/timezone';

const channel = (id: string | null | undefined) => (id ? `<#${id}>` : '*non défini*');

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Affiche ou modifie les préférences générales du bot sur ce serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Affiche un résumé de la configuration du serveur.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('dm-sanctions')
        .setDescription('Prévenir ou non les membres sanctionnés par message privé.')
        .addBooleanOption((option) =>
          option.setName('actif').setDescription('Envoyer un message privé').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('timezone')
        .setDescription('Définit le fuseau horaire utilisé pour les dates saisies sur ce serveur.')
        .addStringOption((option) =>
          option
            .setName('fuseau')
            .setDescription('Fuseau horaire, par exemple Europe/Paris')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async autocomplete(interaction) {
    const zones = searchTimezones(interaction.options.getFocused());
    await interaction.respond(zones.map((zone) => ({ name: zone.replace(/_/g, ' '), value: zone })));
  },

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (interaction.options.getSubcommand() === 'timezone') {
      const timezone = interaction.options.getString('fuseau', true).trim();
      if (!isValidTimezone(timezone)) {
        throw new BotError(
          'Fuseau horaire inconnu. Choisissez-le dans la liste proposée, par exemple `Europe/Paris`.',
        );
      }
      await updateGuildConfig(guildId, { timezone });
      await interaction.reply({
        embeds: [
          successEmbed(
            `Le fuseau horaire du serveur est maintenant **${timezone}** (il y est ${formatNowIn(timezone)}).`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.options.getSubcommand() === 'dm-sanctions') {
      const enabled = interaction.options.getBoolean('actif', true);
      await updateGuildConfig(guildId, { dmOnSanction: enabled });
      await interaction.reply({
        embeds: [
          successEmbed(
            `Les membres sanctionnés ${enabled ? 'seront' : 'ne seront plus'} prévenus par message privé.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const client = interaction.client as BotClient;
    const [guildConfig, states, logging, welcome, permissions] = await Promise.all([
      getGuildConfig(guildId),
      getModuleStates(guildId),
      getLoggingConfig(guildId),
      getWelcomeConfig(guildId),
      listCustomPermissions(guildId),
    ]);

    const modules = client.modules
      .map((botModule) => {
        const enabled = !botModule.canDisable || (states.get(botModule.id) ?? true);
        return `${enabled ? '🟢' : '🔴'} ${botModule.name}`;
      })
      .join('\n');

    const embed = baseEmbed()
      .setTitle(`⚙️ Configuration — ${interaction.guild.name}`)
      .addFields(
        { name: 'Modules', value: modules, inline: true },
        { name: 'Général', value: `Fuseau horaire : ${guildConfig.timezone}`, inline: true },
        {
          name: 'Modération',
          value: `MP aux membres sanctionnés : ${guildConfig.dmOnSanction ? 'oui' : 'non'}\nCas enregistrés : ${guildConfig.caseCounter}`,
          inline: true,
        },
        {
          name: 'Bienvenue',
          value: `État : ${welcome.enabled ? 'activé' : 'désactivé'}\nSalon : ${channel(welcome.channelId)}\nRôle automatique : ${welcome.autoRoleId ? `<@&${welcome.autoRoleId}>` : '*aucun*'}`,
        },
        {
          name: 'Salons de logs',
          value: [
            `Membres : ${channel(logging?.membersChannelId)}`,
            `Messages : ${channel(logging?.messagesChannelId)}`,
            `Salons : ${channel(logging?.channelsChannelId)}`,
            `Rôles : ${channel(logging?.rolesChannelId)}`,
            `Modération : ${channel(logging?.moderationChannelId)}`,
          ].join('\n'),
        },
        {
          name: 'Permissions personnalisées',
          value: `${permissions.length} règle(s) — détail avec \`/permissions list\``,
        },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
