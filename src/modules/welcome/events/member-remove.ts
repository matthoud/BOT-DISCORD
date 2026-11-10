import { Events } from 'discord.js';
import { defineEvent } from '../../../types';
import { handleMemberLeave } from '../services/welcome.service';

export default defineEvent({
  name: Events.GuildMemberRemove,
  execute: (member) => handleMemberLeave(member),
});
