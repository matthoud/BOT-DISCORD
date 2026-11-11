import { Events } from 'discord.js';
import { defineEvent } from '../../../types';
import { handleMessageXp } from '../services/xp.service';

export default defineEvent({
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild()) return;
    await handleMessageXp(message);
  },
});
