import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import type { BotClient } from '../../../core/client';
import {
  closePoll,
  findExpiredPolls,
  getPoll,
  getPollResults,
  type PollWithOptions,
} from '../../../core/database/repositories/polls.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { buildPollButtons, buildPollEmbed } from './presenter';

/** Sondage du serveur, ou une `BotError` s'il n'existe pas (ou plus). */
export async function requirePoll(guildId: string, rawId: string | undefined): Promise<PollWithOptions> {
  const id = Number(rawId);
  const poll = Number.isSafeInteger(id) ? await getPoll(guildId, id) : null;
  if (!poll) throw new BotError("Ce sondage n'existe plus.");
  return poll;
}

/** Vrai si le membre peut clore le sondage ou en voir les résultats masqués : son auteur ou un modérateur. */
export function canManagePoll(member: GuildMember, poll: Pick<PollWithOptions, 'authorId'>): boolean {
  return (
    member.id === poll.authorId ||
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  );
}

/**
 * Met le message d'un sondage en accord avec son état en base (résultats, boutons).
 * Retourne faux si le message est introuvable ou inaccessible.
 */
export async function refreshPollMessage(guild: Guild, poll: PollWithOptions): Promise<boolean> {
  if (!poll.messageId) return false;
  const channel = guild.channels.cache.get(poll.channelId);
  if (!channel?.isTextBased()) return false;
  try {
    const message = await channel.messages.fetch(poll.messageId);
    await message.edit({
      embeds: [buildPollEmbed(poll, await getPollResults(poll.id))],
      components: buildPollButtons(poll),
    });
    return true;
  } catch (error) {
    logger.debug({ err: error, guildId: guild.id, pollId: poll.id }, 'Message de sondage introuvable');
    return false;
  }
}

/**
 * Clôt les sondages arrivés à échéance et affiche leurs résultats définitifs.
 * L'échéance est en base : un sondage qui se termine pendant un arrêt du bot est clos au redémarrage.
 */
export async function closeExpiredPolls(client: BotClient): Promise<void> {
  for (const expired of await findExpiredPolls(new Date())) {
    // Marqué clos d'abord : un message supprimé ou inaccessible ne fait pas retraiter le sondage.
    if (!(await closePoll(expired.id))) continue;
    const guild = client.guilds.cache.get(expired.guildId);
    if (!guild?.available) continue;
    const poll = await getPoll(expired.guildId, expired.id);
    if (poll) await refreshPollMessage(guild, poll);
  }
}
