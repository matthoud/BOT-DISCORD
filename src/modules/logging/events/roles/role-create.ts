import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.GuildRoleCreate,
  async execute(role) {
    const embed = logEmbed('🏷️ Rôle créé', Colors.success)
      .addFields(
        { name: 'Rôle', value: `${role} (\`${role.name}\`)`, inline: true },
        { name: 'Géré par une intégration', value: role.managed ? 'Oui' : 'Non', inline: true },
      )
      .setFooter({ text: `ID rôle : ${role.id}` });
    await sendLog(role.guild, 'roles', embed);
  },
});
