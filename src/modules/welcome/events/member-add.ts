import { Events } from 'discord.js';
import { defineEvent } from '../../../types';
import { handleMemberJoin } from '../services/welcome.service';

export default defineEvent({
  name: Events.GuildMemberAdd,
  execute: (member) => handleMemberJoin(member),
});
