import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildBanAdd,
  async execute(ban) {
    // La raison n'est pas toujours transmise avec l'événement : on la récupère si possible.
    const reason = ban.reason ?? (await ban.fetch().catch(() => null))?.reason ?? null;

    const embed = logEmbed('🔨 Membre banni', Colors.error, ban.user)
      .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'Utilisateur', value: `${ban.user.tag} (<@${ban.user.id}>)` },
        { name: 'Raison', value: reason ? truncate(reason, 1024) : '*Aucune raison fournie*' },
      );
    await sendLog(ban.guild, 'moderation', embed);
  },
});
