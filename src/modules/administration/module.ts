import type { BotModule } from '../../types';

const administrationModule: BotModule = {
  id: 'administration',
  name: 'Administration',
  description: 'Informations, gestion des rôles, des salons, des pseudos et des annonces.',
  emoji: '🛠️',
  canDisable: true,
};

export default administrationModule;
