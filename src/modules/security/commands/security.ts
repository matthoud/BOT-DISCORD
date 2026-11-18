import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { IncidentSeverity, IncidentStatus } from '@prisma/client';
import {
  countIncidents,
  countIncidentsBySeverity,
  getIncident,
  getSecurityConfig,
  listIncidents,
  type IncidentFilters,
} from '../../../core/database/repositories/security.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { timestamp, truncate } from '../../../utils/format';
import { buildIncidentButtons, buildIncidentEmbed, resolveAlertChannel } from '../services/alerts';
import {
  severitiesFrom,
  SEVERITIES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../services/labels';

const PAGE_SIZE = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIODS = [
  { name: 'Dernières 24 heures', value: '1' },
  { name: '7 derniers jours', value: '7' },
  { name: '30 derniers jours', value: '30' },
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Consulte la sécurité du serveur et ses incidents.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Résumé de la sécurité du serveur.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('incidents')
        .setDescription('Liste les incidents de sécurité, du plus récent au plus ancien.')
        .addStringOption((option) =>
          option
            .setName('gravite')
            .setDescription('Gravité minimale')
            .addChoices(
              ...SEVERITIES.map((value) => ({ name: SEVERITY_LABELS[value].name, value })),
            ),
        )
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné'))
        .addStringOption((option) =>
          option
            .setName('periode')
            .setDescription('Période')
            .addChoices(...PERIODS),
        )
        .addStringOption((option) =>
          option
            .setName('statut')
            .setDescription('Statut de traitement')
            .addChoices(
              ...(Object.entries(STATUS_LABELS) as [IncidentStatus, string][]).map(
                ([value, name]) => ({ name, value }),
              ),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('incident')
        .setDescription("Affiche le détail d'un incident et permet de le traiter.")
        .addIntegerOption((option) =>
          option
            .setName('numero')
            .setDescription("Numéro de l'incident")
            .setMinValue(1)
            .setRequired(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 3,

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'incident') {
      const incident = await getIncident(guildId, interaction.options.getInteger('numero', true));
      if (!incident) throw new BotError('Incident introuvable sur ce serveur.');
      await interaction.reply({
        embeds: [buildIncidentEmbed(incident)],
        components: buildIncidentButtons(incident),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'status') {
      const config = await getSecurityConfig(guildId);
      const [day, week, open, alert] = await Promise.all([
        countIncidentsBySeverity(guildId, new Date(Date.now() - DAY_MS)),
        countIncidentsBySeverity(guildId, new Date(Date.now() - 7 * DAY_MS)),
        countIncidents(guildId, { status: 'OPEN' }),
        resolveAlertChannel(interaction.guild, config),
      ]);
      const counts = (byLevel: Record<IncidentSeverity, number>) =>
        SEVERITIES.map(
          (severity) => `${SEVERITY_LABELS[severity].emoji} ${byLevel[severity]}`,
        ).join(' · ');
      const alerts =
        'channel' in alert
          ? `${alert.channel}, à partir de « ${SEVERITY_LABELS[config.alertMinSeverity].name} »`
          : `⚠️ Aucune alerte publiée : ${alert.error}.`;
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle(`🔒 Sécurité — ${interaction.guild.name}`)
            .addFields(
              { name: 'Alertes au staff', value: alerts },
              { name: 'Incidents (24 h)', value: counts(day), inline: true },
              { name: 'Incidents (7 jours)', value: counts(week), inline: true },
              { name: 'À traiter', value: String(open), inline: true },
              {
                name: 'Exemptions',
                value: `${config.exemptRoleIds.length} rôle(s), ${config.exemptUserIds.length} membre(s), ${config.ignoredChannelIds.length} salon(s) ignoré(s). Administrateurs et propriétaire toujours exemptés.`,
              },
            )
            .setFooter({
              text: 'Détail : /security incidents · Réglages : /security-admin config',
            }),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const filters: IncidentFilters = {};
    const severity = interaction.options.getString('gravite') as IncidentSeverity | null;
    if (severity) filters.severities = severitiesFrom(severity);
    const member = interaction.options.getUser('membre');
    if (member) filters.userId = member.id;
    const period = interaction.options.getString('periode');
    if (period) filters.since = new Date(Date.now() - Number(period) * DAY_MS);
    const status = interaction.options.getString('statut') as IncidentStatus | null;
    if (status) filters.status = status;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const total = await countIncidents(guildId, filters);
    const title = `🔒 Incidents de sécurité (${total})`;
    if (total === 0) {
      await interaction.editReply({
        embeds: [baseEmbed().setTitle(title).setDescription('Aucun incident ne correspond.')],
      });
      return;
    }
    await paginate(interaction, Math.ceil(total / PAGE_SIZE), async (page) => {
      const incidents = await listIncidents(guildId, filters, page, PAGE_SIZE);
      const lines = incidents.map(
        (incident) =>
          `**n°${incident.number}** ${SEVERITY_LABELS[incident.severity].emoji} ${TYPE_LABELS[incident.type]} · ${
            incident.userId ? `<@${incident.userId}>` : 'aucun membre'
          } · ${timestamp(incident.createdAt, 'R')}\n└ ${truncate(incident.rule, 60)} → ${truncate(incident.action, 60)}${
            incident.observed ? ' (observation)' : ''
          } · ${STATUS_LABELS[incident.status]}`,
      );
      return baseEmbed()
        .setTitle(title)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Détail et traitement : /security incident numero:…' });
    });
  },
};

export default command;
