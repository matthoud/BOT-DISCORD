import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildBanRemove,
  async execute(ban) {
    const embed = logEmbed('🕊️ Membre débanni', Colors.success, ban.user)
      .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
      .addFields({ name: 'Utilisateur', value: `${ban.user.tag} (<@${ban.user.id}>)` });
    await sendLog(ban.guild, 'moderation', embed);
  },
});
