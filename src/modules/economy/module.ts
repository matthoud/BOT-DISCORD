import { pruneTransactions } from '../../core/database/repositories/economy.repository';
import { logger } from '../../core/logger';
import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { activityCooldowns } from './services/activity.service';
import { DAY_MS } from './services/money';

/** Durée de conservation de l'historique des mouvements. */
const HISTORY_RETENTION_DAYS = 180;

const economyModule: BotModule = {
  id: 'economy',
  name: 'Économie',
  description: 'Monnaie virtuelle, récompenses, paiements, boutique et inventaire.',
  emoji: '🪙',
  canDisable: true,
  // Rien ne démarre sans décision d'un administrateur : `/module enable`.
  defaultEnabled: false,
  init() {
    scheduler.register({
      name: 'economy:cooldowns',
      intervalSeconds: 300,
      persist: false,
      run: async () => activityCooldowns.sweep(),
    });
    scheduler.register({
      name: 'economy:prune-history',
      intervalSeconds: 24 * 60 * 60,
      run: async () => {
        const removed = await pruneTransactions(new Date(Date.now() - HISTORY_RETENTION_DAYS * DAY_MS));
        if (removed > 0) logger.info({ removed }, "Anciens mouvements d'économie supprimés");
      },
    });
  },
};

export default economyModule;
