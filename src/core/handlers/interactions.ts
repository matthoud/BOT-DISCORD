import { PermissionFlagsBits, type Interaction } from 'discord.js';
import type { ComponentInteraction } from '../../types';
import type { BotClient } from '../client';
import { CooldownManager } from '../cooldowns/CooldownManager';
import { isModuleEnabled } from '../database/repositories/module.repository';
import { BotError } from '../errors/BotError';
import { handleInteractionError } from '../errors/handler';
import { logger } from '../logger';
import { assertCommandAccess } from '../permissions/guard';
import { permissionNames } from '../permissions/names';
import { parseComponentId } from '../ui/customId';

const cooldowns = new CooldownManager();
setInterval(() => cooldowns.sweep(), 60_000).unref();

async function assertModuleEnabled(
  client: BotClient,
  guildId: string,
  moduleId: string,
): Promise<void> {
  const botModule = client.modules.get(moduleId);
  if (!botModule?.canDisable) return;
  if (!(await isModuleEnabled(guildId, moduleId))) {
    throw new BotError(`Le module **${botModule.name}** est désactivé sur ce serveur.`);
  }
}

async function handleCommand(client: BotClient, interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inCachedGuild()) {
    throw new BotError('Cette commande ne peut être utilisée que sur un serveur.');
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    throw new BotError("Cette commande n'existe plus. Elle sera retirée prochainement.");
  }

  await assertModuleEnabled(client, interaction.guildId, command.moduleId);
  await assertCommandAccess(interaction, command);

  if (command.cooldown) {
    const key = `${command.data.name}:${interaction.guildId}:${interaction.user.id}`;
    const remainingMs = cooldowns.consume(key, command.cooldown);
    if (remainingMs > 0) {
      const seconds = Math.ceil(remainingMs / 1000);
      throw new BotError(
        `Veuillez patienter encore **${seconds} s** avant de réutiliser cette commande.`,
      );
    }
  }

  logger.info(
    {
      command: interaction.commandName,
      subcommand: interaction.options.getSubcommand(false) ?? undefined,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    },
    'Commande exécutée',
  );
  await command.execute(interaction);
}

async function handleAutocomplete(client: BotClient, interaction: Interaction): Promise<void> {
  if (!interaction.isAutocomplete() || !interaction.inCachedGuild()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command?.autocomplete) return;
  try {
    await command.autocomplete(interaction);
  } catch (error) {
    // Une autocomplétion ne peut pas afficher d'erreur : on journalise seulement.
    logger.warn({ err: error, command: interaction.commandName }, "Échec d'une autocomplétion");
  }
}

async function handleComponent(client: BotClient, interaction: ComponentInteraction): Promise<void> {
  const { id, args } = parseComponentId(interaction.customId);
  // Les composants temporaires (« tmp: ») sont traités par des collecteurs locaux.
  const handler = client.components.get(id);
  if (!handler) return;

  await assertModuleEnabled(client, interaction.guildId, handler.moduleId);

  const required = handler.userPermissions ?? [];
  const isAdmin =
    interaction.member.id === interaction.guild.ownerId ||
    interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && !interaction.memberPermissions.has(required)) {
    const names = permissionNames(required)
      .map((name) => `\`${name}\``)
      .join(', ');
    throw new BotError(`Vous n'avez pas la permission d'utiliser ce composant (${names}).`);
  }

  await handler.execute(interaction, args);
}

/** Point d'entrée unique de toutes les interactions Discord. */
export async function handleInteraction(client: BotClient, interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(client, interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(client, interaction);
    } else if (
      (interaction.isMessageComponent() || interaction.isModalSubmit()) &&
      interaction.inCachedGuild()
    ) {
      await handleComponent(client, interaction);
    }
  } catch (error) {
    await handleInteractionError(interaction, error);
  }
}
