import type { BotModule } from '../../types';
import { registerTempBanTask } from './services/tempban.scheduler';

const moderationModule: BotModule = {
  id: 'moderation',
  name: 'Modération',
  description: 'Sanctions, avertissements, historique et sanctions automatiques.',
  emoji: '🛡️',
  canDisable: true,
  init() {
    registerTempBanTask();
  },
};

export default moderationModule;
