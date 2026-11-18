import { Events } from 'discord.js';
import { logger } from '../../../core/logger';
import { defineEvent } from '../../../types';
import { reapplyOnRejoin } from '../services/quarantine.service';

/** Un membre en quarantaine qui revient sur le serveur la retrouve aussitôt. */
export default defineEvent({
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await reapplyOnRejoin(member);
    } catch (error) {
      logger.error(
        { err: error, guildId: member.guild.id },
        'Erreur lors du contrôle de quarantaine à l’arrivée',
      );
    }
  },
});
