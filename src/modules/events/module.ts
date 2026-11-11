import { pruneEvents, pruneReminders } from '../../core/database/repositories/events.repository';
import { logger } from '../../core/logger';
import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { processEvents } from './services/event.service';
import { processReminders } from './services/reminder.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Durée de conservation d'un événement après son début, et d'un rappel après son envoi. */
const EVENT_RETENTION_DAYS = 30;
const REMINDER_RETENTION_DAYS = 7;

const eventsModule: BotModule = {
  id: 'events',
  name: 'Événements',
  description: 'Événements avec inscriptions par boutons, rappels automatiques et rappels personnels.',
  emoji: '📅',
  canDisable: true,
  // Rien ne démarre sans décision d'un administrateur : `/module enable`.
  defaultEnabled: false,
  init() {
    scheduler.register({
      name: 'events:process',
      intervalSeconds: 30,
      run: ({ client }) => processEvents(client),
    });
    scheduler.register({
      name: 'events:reminders',
      intervalSeconds: 30,
      run: ({ client }) => processReminders(client),
    });
    scheduler.register({
      name: 'events:prune',
      intervalSeconds: 24 * 60 * 60,
      run: async () => {
        const now = Date.now();
        const events = await pruneEvents(new Date(now - EVENT_RETENTION_DAYS * DAY_MS));
        const reminders = await pruneReminders(new Date(now - REMINDER_RETENTION_DAYS * DAY_MS));
        if (events + reminders > 0) logger.info({ events, reminders }, 'Anciens événements et rappels supprimés');
      },
    });
  },
};

export default eventsModule;
