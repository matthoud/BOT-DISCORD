import { InteractionContextType, REST, Routes } from 'discord.js';
import { env } from '../core/config/env';
import { loadModules } from '../core/handlers/loader';
import { logger } from '../core/logger';

/**
 * Enregistre les commandes slash auprès de Discord.
 * - DEV_GUILD_ID défini : déploiement sur ce seul serveur (effet immédiat).
 * - sinon : déploiement global (propagation pouvant prendre jusqu'à une heure).
 * Option `--clear` : supprime toutes les commandes de la cible au lieu de les déployer.
 */
async function main(): Promise<void> {
  const clear = process.argv.includes('--clear');
  const body = clear
    ? []
    : loadModules().commands.map((command) => ({
        ...command.data.toJSON(),
        // Toutes les commandes sont réservées aux serveurs (pas de messages privés).
        contexts: [InteractionContextType.Guild],
      }));

  const rest = new REST().setToken(env.DISCORD_TOKEN);
  const route = env.DEV_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

  await rest.put(route, { body });

  logger.info(
    { count: body.length, cible: env.DEV_GUILD_ID ? `serveur ${env.DEV_GUILD_ID}` : 'global' },
    clear ? 'Commandes supprimées' : 'Commandes déployées',
  );
}

main()
  .catch((error) => {
    logger.fatal({ err: error }, 'Échec du déploiement des commandes');
    process.exitCode = 1;
  })
  .finally(() => {
    // Laisse le logger vider son tampon avant de quitter.
    setTimeout(() => process.exit(), 200);
  });
