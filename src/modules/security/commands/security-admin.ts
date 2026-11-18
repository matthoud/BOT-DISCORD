import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { IncidentSeverity, SecurityConfig } from '@prisma/client';
import {
  getSecurityConfig,
  toggleListEntry,
  updateSecurityConfig,
  type SecurityConfigUpdate,
} from '../../../core/database/repositories/security.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { assertMemberCanAccess } from '../../../utils/interaction';
import { buildIncidentEmbed, resolveAlertChannel } from '../services/alerts';
import { SEVERITIES, SEVERITY_LABELS } from '../services/labels';

/** Taille maximale de chaque liste d'exemptions. */
export const EXEMPTION_LIMIT = 25;

const list = (ids: string[], format: (id: string) => string) =>
  ids.length > 0 ? ids.map(format).join(', ') : 'aucun';

function describeConfig(config: SecurityConfig): string {
  return [
    `**Salon des alertes** : ${config.alertChannelId ? `<#${config.alertChannelId}>` : 'aucun'}`,
    `**Gravité minimale des alertes** : ${SEVERITY_LABELS[config.alertMinSeverity].emoji} ${SEVERITY_LABELS[config.alertMinSeverity].name}`,
    `**Rôles exemptés** : ${list(config.exemptRoleIds, (id) => `<@&${id}>`)}`,
    `**Membres exemptés** : ${list(config.exemptUserIds, (id) => `<@${id}>`)}`,
    `**Salons ignorés** : ${list(config.ignoredChannelIds, (id) => `<#${id}>`)}`,
    '-# Les administrateurs, le propriétaire du serveur et les bots ne sont jamais visés par les protections automatiques.',
  ].join('\n');
}

const exemptionTargets = (sub: SlashCommandSubcommandBuilder) =>
  sub
    .addRoleOption((option) => option.setName('role').setDescription('Rôle'))
    .addUserOption((option) => option.setName('membre').setDescription('Membre'))
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription('Salon (ses fils compris)')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.GuildForum,
          ChannelType.GuildVoice,
        ),
    );

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('security-admin')
    .setDescription('Configure la sécurité du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('config').setDescription('Affiche la configuration de la sécurité.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('alerts')
        .setDescription('Choisit le salon et la gravité minimale des alertes au staff.')
        .addChannelOption((option) =>
          option
            .setName('salon')
            .setDescription('Salon des alertes (réservé au staff)')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('gravite')
            .setDescription('Gravité minimale publiée')
            .addChoices(
              ...SEVERITIES.map((value) => ({ name: SEVERITY_LABELS[value].name, value })),
            ),
        )
        .addBooleanOption((option) =>
          option.setName('desactiver').setDescription('Ne plus publier aucune alerte'),
        ),
    )
    .addSubcommand((sub) =>
      exemptionTargets(
        sub
          .setName('exempt-add')
          .setDescription('Exempte un rôle, un membre ou un salon des protections.'),
      ),
    )
    .addSubcommand((sub) =>
      exemptionTargets(sub.setName('exempt-remove').setDescription('Retire une exemption.')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test-alert')
        .setDescription(
          "Publie une alerte d'essai pour vérifier le salon (rien n'est enregistré).",
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'config') {
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('🔒 Configuration de la sécurité')
            .setDescription(describeConfig(await getSecurityConfig(guildId))),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'alerts') {
      const data: SecurityConfigUpdate = {};
      const channel = interaction.options.getChannel('salon', false, [ChannelType.GuildText]);
      const disable = interaction.options.getBoolean('desactiver') ?? false;
      if (channel && disable) throw new BotError('Choisissez soit un salon, soit « desactiver ».');
      if (channel) {
        assertMemberCanAccess(interaction.member, channel, [PermissionFlagsBits.ViewChannel]);
        const resolved = await resolveAlertChannel(interaction.guild, {
          alertChannelId: channel.id,
        });
        if ('error' in resolved)
          throw new BotError(`Je ne peux pas publier dans ${channel} : ${resolved.error}.`);
        data.alertChannelId = channel.id;
      }
      if (disable) data.alertChannelId = null;
      const severity = interaction.options.getString('gravite') as IncidentSeverity | null;
      if (severity) data.alertMinSeverity = severity;
      if (Object.keys(data).length === 0)
        throw new BotError('Indiquez un salon, une gravité ou « desactiver ».');
      const config = await updateSecurityConfig(guildId, data);
      const warning =
        channel &&
        channel
          .permissionsFor(interaction.guild.roles.everyone)
          ?.has(PermissionFlagsBits.ViewChannel)
          ? '\n⚠️ Ce salon est visible par tous les membres : réservez-le au staff.'
          : '';
      await interaction.reply({
        embeds: [successEmbed(`${describeConfig(config)}${warning}`)],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'test-alert') {
      const config = await getSecurityConfig(guildId);
      const resolved = await resolveAlertChannel(interaction.guild, config);
      if ('error' in resolved) throw new BotError(`Alerte impossible : ${resolved.error}.`);
      const sample = buildIncidentEmbed({
        id: 0,
        guildId,
        number: 0,
        type: 'OTHER',
        severity: 'INFO',
        userId: null,
        rule: 'Alerte d’essai',
        action: 'Aucune',
        observed: false,
        details: `Alerte d'essai demandée par ${interaction.user}. Les vraies alertes ressembleront à celle-ci.`,
        channelId: null,
        status: 'OPEN',
        handledById: null,
        handledAt: null,
        note: null,
        createdAt: new Date(),
      }).setTitle('🧪 Alerte d’essai');
      await resolved.channel.send({ embeds: [sample], allowedMentions: { parse: [] } });
      await interaction.reply({
        embeds: [successEmbed(`Alerte d'essai publiée dans ${resolved.channel}.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Exemptions.
    const add = subcommand === 'exempt-add';
    const role = interaction.options.getRole('role');
    const user = interaction.options.getUser('membre');
    const channel = interaction.options.getChannel('salon');
    const targets = [role, user, channel].filter(Boolean);
    if (targets.length !== 1)
      throw new BotError('Indiquez exactement un rôle, un membre ou un salon.');
    let config: SecurityConfig;
    let label: string;
    if (role) {
      if (role.id === guildId)
        throw new BotError(
          'Le rôle @everyone ne peut pas être exempté : cela désactiverait toutes les protections.',
        );
      config = await toggleListEntry(guildId, 'exemptRoleIds', role.id, add, EXEMPTION_LIMIT);
      label = `le rôle ${role}`;
    } else if (user) {
      config = await toggleListEntry(guildId, 'exemptUserIds', user.id, add, EXEMPTION_LIMIT);
      label = `${user}`;
    } else {
      config = await toggleListEntry(
        guildId,
        'ignoredChannelIds',
        channel!.id,
        add,
        EXEMPTION_LIMIT,
      );
      label = `le salon <#${channel!.id}>`;
    }
    await interaction.reply({
      embeds: [
        successEmbed(
          `${add ? 'Exemption ajoutée' : 'Exemption retirée'} pour ${label}.\n\n${describeConfig(config)}`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
