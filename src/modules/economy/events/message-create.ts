import { Events } from 'discord.js';
import { defineEvent } from '../../../types';
import { handleMessageIncome } from '../services/activity.service';

export default defineEvent({
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild()) return;
    await handleMessageIncome(message);
  },
});
