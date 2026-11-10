import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type PermissionsBitField,
} from 'discord.js';
import { BotError } from '../core/errors/BotError';

/** Récupère le membre passé en option, ou lève une erreur claire s'il n'est pas sur le serveur. */
export function requireMember(
  interaction: ChatInputCommandInteraction<'cached'>,
  optionName = 'membre',
): GuildMember {
  const member = interaction.options.getMember(optionName);
  if (!member) throw new BotError("Ce membre n'est pas (ou plus) sur le serveur.");
  return member;
}

/** Le bot en tant que membre du serveur. */
export async function getBotMember(
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<GuildMember> {
  return interaction.guild.members.me ?? interaction.guild.members.fetchMe();
}

/**
 * Vérifie que le membre a lui-même accès au salon visé par une commande.
 * Les permissions d'une commande sont contrôlées dans le salon où elle est tapée :
 * sans ce contrôle, elle permettrait d'agir sur un salon que le membre ne voit pas.
 */
export function assertMemberCanAccess(
  member: GuildMember,
  channel: { id: string; permissionsFor(member: GuildMember): Readonly<PermissionsBitField> | null },
  permissions: bigint[] = [PermissionFlagsBits.ViewChannel],
): void {
  if (!channel.permissionsFor(member)?.has(permissions)) {
    throw new BotError(`Vous n'avez pas un accès suffisant à <#${channel.id}> pour y faire cette action.`);
  }
}

/** Raison transmise au journal d'audit Discord (limitée à 512 caractères). */
export function auditReason(moderatorTag: string, reason: string): string {
  return `${moderatorTag} : ${reason}`.slice(0, 512);
}
