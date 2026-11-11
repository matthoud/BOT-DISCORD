import { scheduler } from '../../core/scheduler';
import type { BotModule } from '../../types';
import { sweepXpCooldowns } from './services/xp.service';

const levelsModule: BotModule = {
  id: 'levels',
  name: 'Niveaux',
  description: 'Expérience, niveaux, classement et rôles de récompense.',
  emoji: '⭐',
  canDisable: true,
  // Rien ne démarre sans décision d'un administrateur : `/module enable levels`.
  defaultEnabled: false,
  init() {
    scheduler.register({
      name: 'levels:cooldowns',
      intervalSeconds: 300,
      persist: false,
      run: async () => sweepXpCooldowns(),
    });
  },
};

export default levelsModule;
