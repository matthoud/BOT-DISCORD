import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    const authors = new Set(
      messages.filter((message) => message.author).map((message) => `${message.author}`),
    );
    const embed = logEmbed('🧹 Suppression groupée de messages', Colors.error).addFields(
      { name: 'Salon', value: `${channel}`, inline: true },
      { name: 'Messages supprimés', value: String(messages.size), inline: true },
    );
    if (authors.size > 0) {
      embed.addFields({ name: 'Auteurs', value: [...authors].slice(0, 20).join(' ') });
    }
    await sendLog(channel.guild, 'messages', embed);
  },
});
