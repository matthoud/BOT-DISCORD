import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { channelTypeLabel } from '../../services/channel.labels';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.ChannelCreate,
  async execute(channel) {
    const embed = logEmbed('📁 Salon créé', Colors.success)
      .addFields(
        { name: 'Salon', value: `${channel} (\`${channel.name}\`)`, inline: true },
        { name: 'Type', value: channelTypeLabel(channel.type), inline: true },
        { name: 'Catégorie', value: channel.parent?.name ?? '*aucune*', inline: true },
      )
      .setFooter({ text: `ID salon : ${channel.id}` });
    await sendLog(channel.guild, 'channels', embed);
  },
});
