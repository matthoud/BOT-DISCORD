import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { fullTimestamp } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildMemberAdd,
  async execute(member) {
    const embed = logEmbed('📥 Membre arrivé', Colors.success, member.user)
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'Membre', value: `${member} (${member.user.tag})`, inline: true },
        { name: 'Type', value: member.user.bot ? 'Bot' : 'Utilisateur', inline: true },
        { name: 'Compte créé le', value: fullTimestamp(member.user.createdAt) },
        { name: 'Membres', value: member.guild.memberCount.toLocaleString('fr-FR'), inline: true },
      );
    await sendLog(member.guild, 'members', embed);
  },
});
