import type { BotModule } from '../../types';

const welcomeModule: BotModule = {
  id: 'welcome',
  name: 'Bienvenue',
  description: "Messages d'arrivée et de départ personnalisés, rôle automatique.",
  emoji: '👋',
  canDisable: true,
};

export default welcomeModule;
