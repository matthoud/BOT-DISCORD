import type { IncidentSeverity, IncidentStatus, IncidentType } from '@prisma/client';

export const MODULE_ID = 'security';

export const SEVERITIES: IncidentSeverity[] = ['INFO', 'WARNING', 'IMPORTANT', 'CRITICAL'];

export const SEVERITY_LABELS: Record<
  IncidentSeverity,
  { name: string; emoji: string; color: number }
> = {
  INFO: { name: 'Information', emoji: 'ℹ️', color: 0x3498db },
  WARNING: { name: 'Avertissement', emoji: '⚠️', color: 0xf1c40f },
  IMPORTANT: { name: 'Incident important', emoji: '🟠', color: 0xe67e22 },
  CRITICAL: { name: 'Incident critique', emoji: '🚨', color: 0xe74c3c },
};

export const TYPE_LABELS: Record<IncidentType, string> = {
  RAID: 'Raid',
  SPAM: 'Spam',
  DANGEROUS_LINK: 'Lien dangereux',
  MASS_MENTION: 'Mentions abusives',
  RULE_EVASION: 'Contournement des règles',
  NEW_ACCOUNT: 'Compte récent',
  VERIFICATION: 'Vérification',
  QUARANTINE: 'Quarantaine',
  AUTO_SANCTION: 'Sanction automatique',
  SUSPICIOUS: 'Comportement suspect',
  OTHER: 'Autre',
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  OPEN: '🔴 À traiter',
  RESOLVED: '✅ Traité',
  DISMISSED: '⚪ Fausse alerte',
};

/** Gravités égales ou supérieures à `minimum`. */
export function severitiesFrom(minimum: IncidentSeverity): IncidentSeverity[] {
  return SEVERITIES.slice(SEVERITIES.indexOf(minimum));
}

export function isAtLeast(severity: IncidentSeverity, minimum: IncidentSeverity): boolean {
  return SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf(minimum);
}
