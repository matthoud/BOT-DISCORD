import type { BotModule } from '../../types';

const suggestionsModule: BotModule = {
  id: 'suggestions',
  name: 'Suggestions',
  description: 'Suggestions des membres, votes par boutons et décisions du staff.',
  emoji: '💡',
  canDisable: true,
  // Rien ne démarre sans décision d'un administrateur : `/module enable`.
  defaultEnabled: false,
};

export default suggestionsModule;
