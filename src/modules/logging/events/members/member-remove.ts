import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { fullTimestamp, truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildMemberRemove,
  async execute(member) {
    // Le départ du bot lui-même ne peut pas être journalisé.
    if (member.id === member.client.user.id) return;

    const embed = logEmbed('📤 Membre parti', Colors.error, member.user)
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .addFields({ name: 'Membre', value: `${member.user.tag} (<@${member.id}>)`, inline: true });

    if (member.joinedAt) {
      embed.addFields({ name: 'Avait rejoint le', value: fullTimestamp(member.joinedAt) });
    }
    // Pour un membre absent du cache (partial), les rôles ne sont pas connus.
    if (!member.partial) {
      const roles = member.roles.cache
        .filter((role) => role.id !== member.guild.id)
        .map((role) => `${role}`);
      if (roles.length > 0) {
        embed.addFields({ name: `Rôles (${roles.length})`, value: truncate(roles.join(' '), 1024) });
      }
    }
    embed.addFields({
      name: 'Membres',
      value: member.guild.memberCount.toLocaleString('fr-FR'),
      inline: true,
    });

    await sendLog(member.guild, 'members', embed);
  },
});
