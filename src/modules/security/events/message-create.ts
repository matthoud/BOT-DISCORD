import { Events } from 'discord.js';
import { isMessageRetained } from '../../../core/messages/guards';
import { defineEvent } from '../../../types';

/**
 * Fait examiner chaque message par les gardes de sécurité, même si aucun autre module ne le
 * demande (les niveaux et l'économie posent la même question : les gardes ne tournent qu'une fois).
 */
export default defineEvent({
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild()) return;
    await isMessageRetained(message);
  },
});
