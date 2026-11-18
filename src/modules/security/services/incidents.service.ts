import type { Guild } from 'discord.js';
import type { SecurityIncident } from '@prisma/client';
import {
  createIncident,
  getSecurityConfig,
  type IncidentInput,
} from '../../../core/database/repositories/security.repository';
import { logger } from '../../../core/logger';
import { publishAlert } from './alerts';

export type IncidentReport = Omit<
  IncidentInput,
  'guildId' | 'details' | 'channelId' | 'observed'
> & {
  details?: string;
  channelId?: string | null;
  /** Vrai si la règle était en mode observation : l'incident est noté, rien n'est fait au membre. */
  observed?: boolean;
};

/**
 * Point d'entrée unique de toutes les protections : enregistre l'incident (numéroté, consultable
 * avec `/security incidents`) puis alerte le staff selon la gravité configurée.
 */
export async function reportIncident(
  guild: Guild,
  report: IncidentReport,
): Promise<SecurityIncident> {
  const incident = await createIncident({
    guildId: guild.id,
    type: report.type,
    severity: report.severity,
    userId: report.userId,
    rule: report.rule,
    action: report.action,
    observed: report.observed ?? false,
    details: report.details ?? '',
    channelId: report.channelId ?? null,
  });
  logger.info(
    {
      guildId: guild.id,
      incident: incident.number,
      type: incident.type,
      severity: incident.severity,
      rule: incident.rule,
    },
    'Incident de sécurité enregistré',
  );
  await publishAlert(guild, await getSecurityConfig(guild.id), incident);
  return incident;
}
