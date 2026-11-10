import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    // Sans l'ancien état en cache, aucune comparaison fiable n'est possible.
    if (oldMember.partial) return;

    if (oldMember.nickname !== newMember.nickname) {
      const embed = logEmbed('✏️ Pseudo modifié', Colors.info, newMember.user).addFields(
        { name: 'Membre', value: `${newMember}` },
        { name: 'Avant', value: oldMember.nickname ?? '*aucun*', inline: true },
        { name: 'Après', value: newMember.nickname ?? '*aucun*', inline: true },
      );
      await sendLog(newMember.guild, 'members', embed);
    }

    const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    if (added.size > 0 || removed.size > 0) {
      const embed = logEmbed('🏷️ Rôles du membre modifiés', Colors.info, newMember.user).addFields({
        name: 'Membre',
        value: `${newMember}`,
      });
      if (added.size > 0) {
        embed.addFields({
          name: '➕ Ajouté(s)',
          value: truncate(added.map((role) => `${role}`).join(' '), 1024),
          inline: true,
        });
      }
      if (removed.size > 0) {
        embed.addFields({
          name: '➖ Retiré(s)',
          value: truncate(removed.map((role) => `${role}`).join(' '), 1024),
          inline: true,
        });
      }
      await sendLog(newMember.guild, 'members', embed);
    }
  },
});
