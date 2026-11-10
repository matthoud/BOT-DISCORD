import type { Command } from '../../../types';
import { buildSocialCommand, runSocialCommand, type SocialAction } from '../services/social';

const action: SocialAction = {
  name: 'hug',
  description: 'Fais un câlin à un membre.',
  optionDescription: 'Membre à câliner',
  emoji: '🤗',
  phrases: [
    '{author} fait un énorme câlin à {target} !',
    '{author} serre {target} très fort dans ses bras.',
    '{target} reçoit un câlin tout doux de la part de {author}.',
    '{author} court vers {target} pour un câlin surprise !',
    'Câlin collectif ! Enfin… surtout entre {author} et {target}.',
  ],
  selfPhrases: [
    '{author} se fait un câlin à soi-même. On est là si besoin !',
    '{author} s’enroule dans un plaid : auto-câlin validé.',
  ],
};

const command: Command = {
  data: buildSocialCommand(action),
  cooldown: 3,
  execute: (interaction) => runSocialCommand(interaction, action),
};

export default command;
