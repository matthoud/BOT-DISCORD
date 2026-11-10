import type { BotModule } from '../../types';
import { startTempBanScheduler } from './services/tempban.scheduler';

const moderationModule: BotModule = {
  id: 'moderation',
  name: 'Modération',
  description: 'Sanctions, avertissements, historique et sanctions automatiques.',
  emoji: '🛡️',
  canDisable: true,
  init(client) {
    startTempBanScheduler(client);
  },
};

export default moderationModule;
