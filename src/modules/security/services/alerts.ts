import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildTextBasedChannel,
  type MessageCreateOptions,
} from 'discord.js';
import type { SecurityConfig, SecurityIncident } from '@prisma/client';
import { logger } from '../../../core/logger';
import { permissionNames } from '../../../core/permissions/names';
import { componentId } from '../../../core/ui/customId';
import { timestamp, truncate } from '../../../utils/format';
import { isAtLeast, SEVERITY_LABELS, STATUS_LABELS, TYPE_LABELS } from './labels';

const ALERT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/** Alertes publiées au plus par serveur et par minute : un raid ne doit pas noyer le salon du staff. */
export const ALERTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

/** Fenêtre de publication par serveur : alertes publiées et alertes retenues depuis le début. */
const windows = new Map<string, { start: number; sent: number; held: number }>();

/**
 * Décide si une alerte peut partir maintenant. Retourne le nombre d'alertes retenues à signaler
 * (à mentionner dans celle-ci), ou `null` si la limite est atteinte.
 */
export function takeAlertSlot(guildId: string, now = Date.now()): number | null {
  let window = windows.get(guildId);
  if (!window || now - window.start >= WINDOW_MS) {
    const held = window?.held ?? 0;
    window = { start: now, sent: 0, held };
    windows.set(guildId, window);
  }
  if (window.sent >= ALERTS_PER_MINUTE) {
    window.held++;
    return null;
  }
  window.sent++;
  const held = window.held;
  window.held = 0;
  return held;
}

/** Réservé aux tests. */
export function resetAlertWindows(): void {
  windows.clear();
}

/** Présentation d'un incident : l'essentiel pour agir, sans donnée personnelle superflue. */
export function buildIncidentEmbed(incident: SecurityIncident): EmbedBuilder {
  const severity = SEVERITY_LABELS[incident.severity];
  const embed = new EmbedBuilder()
    .setColor(severity.color)
    .setTitle(`${severity.emoji} Incident n°${incident.number} — ${TYPE_LABELS[incident.type]}`)
    .addFields(
      { name: 'Gravité', value: severity.name, inline: true },
      { name: 'Statut', value: STATUS_LABELS[incident.status], inline: true },
      { name: 'Date', value: timestamp(incident.createdAt, 'f'), inline: true },
      {
        name: 'Membre',
        value: incident.userId ? `<@${incident.userId}> (${incident.userId})` : 'Aucun',
        inline: true,
      },
      { name: 'Salon', value: incident.channelId ? `<#${incident.channelId}>` : '—', inline: true },
      { name: 'Règle', value: truncate(incident.rule, 1024), inline: true },
      {
        name: 'Action',
        value: truncate(
          incident.observed
            ? `${incident.action} (mode observation : rien n'a été fait au membre)`
            : incident.action,
          1024,
        ),
      },
    )
    .setTimestamp(incident.createdAt);
  if (incident.details) embed.setDescription(truncate(incident.details, 1000));
  if (incident.handledById && incident.handledAt) {
    embed.addFields({
      name: 'Suivi',
      value: truncate(
        `Par <@${incident.handledById}> ${timestamp(incident.handledAt, 'R')}${incident.note ? ` : ${incident.note}` : ''}`,
        1024,
      ),
    });
  }
  return embed;
}

/** Boutons de suivi d'un incident. */
export function buildIncidentButtons(
  incident: SecurityIncident,
): ActionRowBuilder<ButtonBuilder>[] {
  const id = String(incident.number);
  if (incident.status !== 'OPEN') {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(componentId('security:incident', id, 'OPEN'))
          .setLabel('Rouvrir')
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(componentId('security:incident', id, 'RESOLVED'))
        .setLabel('Marquer comme traité')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(componentId('security:incident', id, 'DISMISSED'))
        .setLabel('Fausse alerte')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildAlertMessage(
  incident: SecurityIncident,
  heldBefore = 0,
): MessageCreateOptions {
  return {
    content:
      heldBefore > 0
        ? `-# ${heldBefore} alerte(s) précédente(s) non publiée(s) (limite atteinte) : voir \`/security incidents\`.`
        : undefined,
    embeds: [buildIncidentEmbed(incident)],
    components: buildIncidentButtons(incident),
    // Une alerte n'envoie jamais de notification à un membre ou à un rôle.
    allowedMentions: { parse: [] },
  };
}

/** Salon d'alertes utilisable, ou une raison lisible. */
export async function resolveAlertChannel(
  guild: Guild,
  config: Pick<SecurityConfig, 'alertChannelId'>,
): Promise<{ channel: GuildTextBasedChannel } | { error: string }> {
  if (!config.alertChannelId) return { error: "aucun salon d'alertes n'est configuré" };
  const channel = guild.channels.cache.get(config.alertChannelId);
  if (!channel?.isTextBased()) return { error: "le salon d'alertes est introuvable (supprimé ?)" };
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const missing = channel.permissionsFor(me).missing(ALERT_PERMISSIONS);
  if (missing.length > 0) {
    return {
      error: `permissions manquantes : ${permissionNames(missing.map((name) => PermissionFlagsBits[name])).join(', ')}`,
    };
  }
  return { channel };
}

/**
 * Publie l'alerte d'un incident si sa gravité atteint le seuil du serveur.
 * Retourne vrai si l'alerte est partie. Une alerte impossible n'empêche jamais l'incident d'être enregistré.
 */
export async function publishAlert(
  guild: Guild,
  config: SecurityConfig,
  incident: SecurityIncident,
): Promise<boolean> {
  if (!isAtLeast(incident.severity, config.alertMinSeverity)) return false;
  const resolved = await resolveAlertChannel(guild, config);
  if ('error' in resolved) {
    if (config.alertChannelId)
      logger.warn({ guildId: guild.id, reason: resolved.error }, 'Alerte de sécurité non publiée');
    return false;
  }
  const held = takeAlertSlot(guild.id);
  if (held === null) return false;
  try {
    await resolved.channel.send(buildAlertMessage(incident, held));
    return true;
  } catch (error) {
    logger.warn(
      { err: error, guildId: guild.id, incident: incident.number },
      'Échec de la publication d’une alerte de sécurité',
    );
    return false;
  }
}
