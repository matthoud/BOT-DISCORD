import { PermissionFlagsBits } from 'discord.js';
import type { Command } from '../../../types';
import { buildLockCommand, setChannelLocked } from '../services/lock.service';

const command: Command = {
  data: buildLockCommand('lock', "Verrouille un salon : les membres ne peuvent plus y écrire."),
  userPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,
  execute: (interaction) => setChannelLocked(interaction, true),
};

export default command;
