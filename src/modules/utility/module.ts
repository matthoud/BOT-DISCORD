import type { BotModule } from '../../types';

const utilityModule: BotModule = {
  id: 'utility',
  name: 'Utilitaires',
  description: 'Aide, configuration du bot, gestion des modules et des permissions.',
  emoji: '🧰',
  // Indispensable : contient les commandes qui permettent de configurer tout le reste.
  canDisable: false,
};

export default utilityModule;
