import { Events, type GuildChannel } from 'discord.js';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { formatDuration } from '../../../../utils/duration';
import { truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

/** Sérialise les permissions spécifiques d'un salon pour détecter un changement. */
function overwritesSignature(channel: GuildChannel): string {
  return channel.permissionOverwrites.cache
    .map((overwrite) => `${overwrite.id}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`)
    .sort()
    .join('|');
}

function readProperty(channel: object, key: string): unknown {
  return key in channel ? (channel as Record<string, unknown>)[key] : undefined;
}

export default defineEvent({
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (oldChannel.isDMBased() || newChannel.isDMBased()) return;

    const changes: string[] = [];
    if (oldChannel.name !== newChannel.name) {
      changes.push(`**Nom :** \`${oldChannel.name}\` → \`${newChannel.name}\``);
    }
    if (oldChannel.parentId !== newChannel.parentId) {
      changes.push(
        `**Catégorie :** ${oldChannel.parent?.name ?? '*aucune*'} → ${newChannel.parent?.name ?? '*aucune*'}`,
      );
    }

    const oldTopic = readProperty(oldChannel, 'topic') ?? null;
    const newTopic = readProperty(newChannel, 'topic') ?? null;
    if (oldTopic !== newTopic) {
      changes.push(
        `**Sujet :** ${truncate(String(oldTopic ?? '*aucun*'), 300)} → ${truncate(String(newTopic ?? '*aucun*'), 300)}`,
      );
    }

    const oldSlowmode = Number(readProperty(oldChannel, 'rateLimitPerUser') ?? 0);
    const newSlowmode = Number(readProperty(newChannel, 'rateLimitPerUser') ?? 0);
    if (oldSlowmode !== newSlowmode) {
      const label = (seconds: number) => (seconds > 0 ? formatDuration(seconds) : 'désactivé');
      changes.push(`**Mode lent :** ${label(oldSlowmode)} → ${label(newSlowmode)}`);
    }

    const oldNsfw = Boolean(readProperty(oldChannel, 'nsfw'));
    const newNsfw = Boolean(readProperty(newChannel, 'nsfw'));
    if (oldNsfw !== newNsfw) {
      changes.push(`**Restriction d'âge :** ${oldNsfw ? 'oui' : 'non'} → ${newNsfw ? 'oui' : 'non'}`);
    }

    if (
      'permissionOverwrites' in oldChannel &&
      'permissionOverwrites' in newChannel &&
      overwritesSignature(oldChannel as GuildChannel) !== overwritesSignature(newChannel as GuildChannel)
    ) {
      changes.push('**Permissions du salon** modifiées');
    }

    // Les simples changements de position (très fréquents) ne sont pas journalisés.
    if (changes.length === 0) return;

    const embed = logEmbed('🔧 Salon modifié', Colors.warning)
      .setDescription(`${newChannel}\n\n${changes.join('\n')}`.slice(0, 4096))
      .setFooter({ text: `ID salon : ${newChannel.id}` });
    await sendLog(newChannel.guild, 'channels', embed);
  },
});
