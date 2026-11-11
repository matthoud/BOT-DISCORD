import { prunePolls } from '../../core/database/repositories/polls.repository';
import { logger } from '../../core/logger';
import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { closeExpiredPolls } from './services/poll.service';

/** Durée de conservation d'un sondage après sa clôture. */
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const pollsModule: BotModule = {
  id: 'polls',
  name: 'Sondages',
  description: 'Sondages à boutons, à choix unique ou multiple, avec durée et résultats.',
  emoji: '📊',
  canDisable: true,
  // Actif par défaut : il remplace la commande /poll de la V1, qui l'était aussi.
  init() {
    scheduler.register({
      name: 'polls:close',
      intervalSeconds: 30,
      run: ({ client }) => closeExpiredPolls(client),
    });
    scheduler.register({
      name: 'polls:prune',
      intervalSeconds: 24 * 60 * 60,
      run: async () => {
        const removed = await prunePolls(new Date(Date.now() - RETENTION_MS));
        if (removed > 0) logger.info({ removed }, 'Anciens sondages supprimés');
      },
    });
  },
};

export default pollsModule;
