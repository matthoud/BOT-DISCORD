import { Prisma } from '@prisma/client';
import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes, type Interaction } from 'discord.js';
import { logger } from '../logger';
import { errorEmbed } from '../ui/embeds';
import { BotError } from './BotError';

/** Erreurs signalant que l'interaction n'est plus utilisable : inutile de tenter d'y répondre. */
const EXPIRED_INTERACTION_CODES: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.UnknownInteraction,
  RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged,
]);

function isPrismaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientValidationError
  );
}

/** Traduit une erreur en message destiné à l'utilisateur. `null` = ne pas répondre. */
export function describeError(error: unknown): string | null {
  if (error instanceof BotError) return error.message;

  if (error instanceof DiscordAPIError) {
    if (EXPIRED_INTERACTION_CODES.has(error.code)) return null;
    switch (error.code) {
      case RESTJSONErrorCodes.MissingPermissions:
        return "Discord a refusé l'action : il me manque une permission, ou mon rôle est placé trop bas dans la liste des rôles.";
      case RESTJSONErrorCodes.MissingAccess:
        return "Je n'ai pas accès à ce salon ou à cette ressource.";
      case RESTJSONErrorCodes.UnknownMember:
        return "Ce membre n'est plus sur le serveur.";
      case RESTJSONErrorCodes.UnknownUser:
        return 'Utilisateur introuvable.';
      case RESTJSONErrorCodes.UnknownBan:
        return "Cet utilisateur n'est pas banni.";
      case RESTJSONErrorCodes.UnknownMessage:
      case RESTJSONErrorCodes.UnknownChannel:
      case RESTJSONErrorCodes.UnknownRole:
        return "L'élément visé n'existe plus.";
      case RESTJSONErrorCodes.CannotSendMessagesToThisUser:
        return "Impossible d'envoyer un message privé à cet utilisateur.";
      default:
        return "Discord a refusé l'action demandée. Réessayez dans quelques instants.";
    }
  }

  if (isPrismaError(error)) {
    return 'La base de données est momentanément indisponible. Réessayez dans quelques instants.';
  }

  return 'Une erreur inattendue est survenue. Elle a été enregistrée.';
}

/** Journalise l'erreur et informe l'utilisateur par un message éphémère lorsque c'est possible. */
export async function handleInteractionError(
  interaction: Interaction,
  error: unknown,
): Promise<void> {
  const context = {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    interaction: interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : 'customId' in interaction
        ? interaction.customId
        : interaction.type,
  };

  const message = describeError(error);

  if (error instanceof BotError) {
    logger.debug(context, `Action refusée : ${error.message}`);
  } else if (message === null) {
    logger.warn(context, 'Interaction expirée avant la réponse');
  } else {
    logger.error({ ...context, err: error }, "Erreur pendant le traitement d'une interaction");
  }

  if (message === null || !interaction.isRepliable()) return;

  try {
    const payload = { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (replyError) {
    logger.warn({ ...context, err: replyError }, "Impossible d'envoyer le message d'erreur");
  }
}
