import type { Command } from '../../../types';
import { buildSocialCommand, runSocialCommand, type SocialAction } from '../services/social';

const action: SocialAction = {
  name: 'slap',
  description: 'Gifle un membre (pour rire).',
  optionDescription: 'Membre à gifler',
  emoji: '🖐️',
  phrases: [
    '{author} gifle {target} avec une énorme truite. Splash !',
    '{author} met une petite claque à {target}. Ça réveille !',
    '{target} se prend une gifle monumentale de {author}… au ralenti.',
    '{author} gifle {target} avec un gant en velours. Classe, mais ferme.',
    '{author} tente de gifler {target}, qui esquive presque. Presque.',
  ],
  selfPhrases: [
    '{author} se gifle tout seul. Tout va bien ?',
    '{author} se met une claque pour rester éveillé.',
  ],
};

const command: Command = {
  data: buildSocialCommand(action),
  cooldown: 3,
  execute: (interaction) => runSocialCommand(interaction, action),
};

export default command;
