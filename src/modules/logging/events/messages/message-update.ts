import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.inGuild() || newMessage.author?.bot) return;
    // Sans l'ancien contenu (message absent du cache), la comparaison est impossible.
    if (oldMessage.partial || newMessage.partial) return;
    // Ignore les mises à jour sans changement de texte (aperçu de lien, épinglage...).
    if (oldMessage.content === newMessage.content) return;

    const embed = logEmbed('📝 Message modifié', Colors.warning, newMessage.author).addFields(
      { name: 'Salon', value: `${newMessage.channel}`, inline: true },
      { name: 'Auteur', value: `${newMessage.author}`, inline: true },
      { name: 'Message', value: `[Aller au message](${newMessage.url})`, inline: true },
      { name: 'Avant', value: oldMessage.content ? truncate(oldMessage.content, 1024) : '*Aucun texte*' },
      { name: 'Après', value: newMessage.content ? truncate(newMessage.content, 1024) : '*Aucun texte*' },
    );

    await sendLog(newMessage.guild, 'messages', embed);
  },
});
