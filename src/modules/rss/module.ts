import { pruneItems } from '../../core/database/repositories/rss.repository';
import { logger } from '../../core/logger';
import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { processDueFeeds } from './services/feed.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Durée de conservation de l'empreinte d'un article disparu de son flux. */
const ITEM_RETENTION_DAYS = 30;

const rssModule: BotModule = {
  id: 'rss',
  name: 'Flux RSS',
  description:
    'Publie automatiquement les nouveaux articles de flux RSS et Atom, avec filtres et catégories.',
  emoji: '📡',
  canDisable: true,
  // Aucun site n'est contacté sans décision d'un administrateur : `/module enable`.
  defaultEnabled: false,
  init() {
    scheduler.register({
      name: 'rss:check',
      intervalSeconds: 60,
      run: ({ client, signal }) => processDueFeeds(client, { signal }),
    });
    scheduler.register({
      name: 'rss:prune',
      intervalSeconds: 24 * 60 * 60,
      run: async () => {
        const removed = await pruneItems(new Date(Date.now() - ITEM_RETENTION_DAYS * DAY_MS));
        if (removed > 0) logger.info({ removed }, 'Anciennes empreintes d’articles RSS supprimées');
      },
    });
  },
};

export default rssModule;
