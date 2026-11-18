import { Events } from 'discord.js';
import { isMessageRetained } from '../../../core/messages/guards';
import { defineEvent } from '../../../types';
import { handleMessageIncome } from '../services/activity.service';

export default defineEvent({
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild()) return;
    // Un message retenu par une protection (spam, lien interdit…) ne rapporte rien.
    if (await isMessageRetained(message)) return;
    await handleMessageIncome(message);
  },
});
