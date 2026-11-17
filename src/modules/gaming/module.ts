import { pruneOffers } from '../../core/database/repositories/gaming.repository';
import { logger } from '../../core/logger';
import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { PROVIDERS } from './providers';
import { syncProvider } from './services/offers.service';
import { syncTaskName } from './services/tasks';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Une offre disparue de sa source est oubliée après ce délai ; si elle revient, elle sera annoncée. */
const OFFER_RETENTION_DAYS = 90;

const gamingModule: BotModule = {
  id: 'gaming',
  name: 'Gaming',
  description: 'Annonce les jeux, DLC et accès anticipés gratuits du moment.',
  emoji: '🎮',
  canDisable: true,
  // Rien n'est publié sans décision d'un administrateur : `/module enable`, puis `/gaming-admin setup`.
  defaultEnabled: false,
  init() {
    for (const provider of PROVIDERS) {
      scheduler.register({
        name: syncTaskName(provider),
        intervalSeconds: provider.intervalSeconds,
        timeoutSeconds: 120,
        run: ({ client, signal }) => syncProvider(client, provider, signal),
      });
    }
    scheduler.register({
      name: 'gaming:prune',
      intervalSeconds: 24 * 60 * 60,
      run: async () => {
        const removed = await pruneOffers(new Date(Date.now() - OFFER_RETENTION_DAYS * DAY_MS));
        if (removed > 0) logger.info({ removed }, 'Anciennes offres gaming supprimées');
      },
    });
  },
};

export default gamingModule;
