import { PermissionFlagsBits } from 'discord.js';
import type { Command } from '../../../types';
import { buildLockCommand, setChannelLocked } from '../services/lock.service';

const command: Command = {
  data: buildLockCommand('unlock', 'Déverrouille un salon précédemment verrouillé.'),
  userPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,
  execute: (interaction) => setChannelLocked(interaction, false),
};

export default command;
