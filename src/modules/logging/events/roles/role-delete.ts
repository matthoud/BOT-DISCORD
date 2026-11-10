import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildRoleDelete,
  async execute(role) {
    const embed = logEmbed('🗑️ Rôle supprimé', Colors.error)
      .addFields(
        { name: 'Nom', value: `\`${role.name}\``, inline: true },
        { name: 'Couleur', value: role.color ? role.hexColor.toUpperCase() : 'Aucune', inline: true },
        { name: 'Membres concernés', value: String(role.members.size), inline: true },
      )
      .setFooter({ text: `ID rôle : ${role.id}` });
    await sendLog(role.guild, 'roles', embed);
  },
});
