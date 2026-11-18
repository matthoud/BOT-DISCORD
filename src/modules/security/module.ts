import { pruneIncidents } from '../../core/database/repositories/security.repository';
import { logger } from '../../core/logger';
import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { releaseExpiredQuarantines } from './services/quarantine.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Durée de conservation des incidents de sécurité. */
export const INCIDENT_RETENTION_DAYS = 180;

const securityModule: BotModule = {
  id: 'security',
  name: 'Sécurité',
  description: 'Incidents de sécurité, alertes au staff et protections automatiques du serveur.',
  emoji: '🔒',
  canDisable: true,
  // Aucune protection ne s'applique sans décision d'un administrateur : `/module enable`.
  defaultEnabled: false,
  init() {
    scheduler.register({
      name: 'security:quarantine',
      intervalSeconds: 60,
      run: ({ client }) => releaseExpiredQuarantines(client),
    });
    scheduler.register({
      name: 'security:prune',
      intervalSeconds: 24 * 60 * 60,
      run: async () => {
        const removed = await pruneIncidents(
          new Date(Date.now() - INCIDENT_RETENTION_DAYS * DAY_MS),
        );
        if (removed > 0) logger.info({ removed }, 'Anciens incidents de sécurité supprimés');
      },
    });
  },
};

export default securityModule;
