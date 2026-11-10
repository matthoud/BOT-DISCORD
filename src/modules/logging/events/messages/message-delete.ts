import { Events } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

export default defineEvent({
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.inGuild()) return;
    // Les messages des bots (dont les logs eux-mêmes) ne sont pas journalisés.
    if (message.author?.bot) return;

    const embed = logEmbed('🗑️ Message supprimé', Colors.error, message.author).addFields(
      { name: 'Salon', value: `${message.channel}`, inline: true },
      {
        name: 'Auteur',
        value: message.author ? `${message.author}` : '*inconnu*',
        inline: true,
      },
    );

    if (message.partial) {
      // Message antérieur au démarrage du bot : Discord ne transmet que son identifiant.
      embed.addFields({ name: 'Contenu', value: "*Indisponible : le message n'était pas en mémoire.*" });
    } else {
      embed.addFields({
        name: 'Contenu',
        value: message.content ? truncate(message.content, 1024) : '*Aucun texte*',
      });
      if (message.attachments.size > 0) {
        embed.addFields({
          name: `Pièces jointes (${message.attachments.size})`,
          value: truncate(message.attachments.map((attachment) => attachment.name).join(', '), 1024),
        });
      }
    }

    await sendLog(message.guild, 'messages', embed);
  },
});
