import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { channelTypeLabel } from '../../services/channel.labels';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.ChannelDelete,
  async execute(channel) {
    if (channel.isDMBased()) return;
    const embed = logEmbed('🗑️ Salon supprimé', Colors.error)
      .addFields(
        { name: 'Nom', value: `\`${channel.name}\``, inline: true },
        { name: 'Type', value: channelTypeLabel(channel.type), inline: true },
        { name: 'Catégorie', value: channel.parent?.name ?? '*aucune*', inline: true },
      )
      .setFooter({ text: `ID salon : ${channel.id}` });
    await sendLog(channel.guild, 'channels', embed);
  },
});
