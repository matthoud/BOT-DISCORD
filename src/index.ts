import { env } from './core/config/env';
import { BotClient } from './core/client';
import { prisma } from './core/database/prisma';
import { registerCoreEvents, registerModuleEvents } from './core/handlers/events';
import { loadModules } from './core/handlers/loader';
import { logger } from './core/logger';

const client = new BotClient();
let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Arrêt du bot en cours');
  try {
    await client.destroy();
    await prisma.$disconnect();
  } catch (error) {
    logger.error({ err: error }, "Erreur pendant l'arrêt");
  } finally {
    // Laisse le temps au logger d'écrire ses dernières lignes.
    setTimeout(() => process.exit(exitCode), 200);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesse rejetée non gérée');
});
process.on('uncaughtException', (error) => {
  // État potentiellement incohérent : on journalise puis on laisse le superviseur redémarrer le bot.
  logger.fatal({ err: error }, 'Exception non interceptée');
  void shutdown('uncaughtException', 1);
});

async function main(): Promise<void> {
  const registry = loadModules();
  for (const botModule of registry.modules) client.modules.set(botModule.id, botModule);
  for (const command of registry.commands) client.commands.set(command.data.name, command);
  for (const component of registry.components) client.components.set(component.id, component);

  registerCoreEvents(client);
  registerModuleEvents(client, registry.events);

  logger.info(
    {
      modules: registry.modules.map((botModule) => botModule.id),
      commands: registry.commands.length,
      events: registry.events.length,
      components: registry.components.length,
    },
    'Modules chargés',
  );

  // Échec immédiat si la base est injoignable, plutôt qu'à la première commande.
  await prisma.$connect();
  logger.info('Connexion à PostgreSQL établie');

  for (const botModule of registry.modules) {
    await botModule.init?.(client);
  }

  await client.login(env.DISCORD_TOKEN);
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Échec du démarrage');
  void shutdown('startup-failure', 1);
});
