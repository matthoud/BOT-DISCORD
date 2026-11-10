import { appEvents } from '../../core/events/bus';
import type { BotModule } from '../../types';
import { sendLog } from './services/log.service';

const loggingModule: BotModule = {
  id: 'logging',
  name: 'Logs',
  description: 'Journal des événements du serveur, avec un salon par catégorie.',
  emoji: '📜',
  canDisable: true,
  init() {
    // Les cas de modération sont publiés par le module de modération sur le bus interne.
    appEvents.on('moderationCase', ({ guild, embed }) => sendLog(guild, 'moderation', embed));
  },
};

export default loggingModule;
