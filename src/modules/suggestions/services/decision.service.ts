import type { Guild } from 'discord.js';
import type { SuggestionStatus } from '@prisma/client';
import { respondToSuggestion } from '../../../core/database/repositories/suggestions.repository';
import { successEmbed, warningEmbed } from '../../../core/ui/embeds';
import { STATUS_INFO } from './presenter';
import { refreshSuggestionMessage, requireSuggestion } from './suggestion.service';

export type StaffAction = 'accept' | 'refuse' | 'reply' | 'reopen';

export const ACTION_STATUS: Record<StaffAction, SuggestionStatus | undefined> = {
  accept: 'ACCEPTED',
  refuse: 'REFUSED',
  reopen: 'PENDING',
  reply: undefined,
};

export function isStaffAction(value: string | undefined): value is StaffAction {
  return value !== undefined && Object.hasOwn(ACTION_STATUS, value);
}

/**
 * Applique une action du staff à une suggestion, met à jour son message public et retourne
 * l'embed de compte rendu à afficher au membre du staff.
 */
export async function applyStaffAction(
  guild: Guild,
  suggestionId: number,
  staffId: string,
  action: StaffAction,
  response: string | null,
) {
  const status = ACTION_STATUS[action];
  // Rouvrir efface la décision précédente ; une simple réponse conserve le statut en place.
  await respondToSuggestion(suggestionId, staffId, action === 'reopen' ? null : response, status);

  const suggestion = await requireSuggestion(guild.id, String(suggestionId));
  const refreshed = await refreshSuggestionMessage(guild, suggestion);
  const info = STATUS_INFO[suggestion.status];
  const summary =
    action === 'reply'
      ? `Réponse enregistrée pour la suggestion n°${suggestion.number}.`
      : `La suggestion n°${suggestion.number} est maintenant : ${info.emoji} **${info.label}**.`;

  return refreshed
    ? successEmbed(summary)
    : warningEmbed(`${summary}\nSon message public est introuvable (supprimé ?) : il n'a pas pu être mis à jour.`);
}
