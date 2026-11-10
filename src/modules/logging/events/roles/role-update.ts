import { Events } from 'discord.js';
import { permissionNames } from '../../../../core/permissions/names';
import { Colors } from '../../../../core/ui/embeds';
import { defineEvent } from '../../../../types';
import { truncate } from '../../../../utils/format';
import { logEmbed, sendLog } from '../../services/log.service';

const yesNo = (value: boolean) => (value ? 'oui' : 'non');

export default defineEvent({
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    const changes: string[] = [];
    if (oldRole.name !== newRole.name) {
      changes.push(`**Nom :** \`${oldRole.name}\` → \`${newRole.name}\``);
    }
    if (oldRole.color !== newRole.color) {
      changes.push(`**Couleur :** ${oldRole.hexColor.toUpperCase()} → ${newRole.hexColor.toUpperCase()}`);
    }
    if (oldRole.hoist !== newRole.hoist) {
      changes.push(`**Affiché séparément :** ${yesNo(oldRole.hoist)} → ${yesNo(newRole.hoist)}`);
    }
    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push(`**Mentionnable :** ${yesNo(oldRole.mentionable)} → ${yesNo(newRole.mentionable)}`);
    }

    const embed = logEmbed('🔧 Rôle modifié', Colors.warning).setFooter({
      text: `ID rôle : ${newRole.id}`,
    });

    if (!oldRole.permissions.equals(newRole.permissions)) {
      const granted = newRole.permissions.remove(oldRole.permissions).bitfield;
      const revoked = oldRole.permissions.remove(newRole.permissions).bitfield;
      if (granted !== 0n) {
        embed.addFields({
          name: '✅ Permissions accordées',
          value: truncate(permissionNames([granted]).join(', '), 1024),
        });
      }
      if (revoked !== 0n) {
        embed.addFields({
          name: '⛔ Permissions retirées',
          value: truncate(permissionNames([revoked]).join(', '), 1024),
        });
      }
    }

    // Les simples changements de position (très fréquents) ne sont pas journalisés.
    if (changes.length === 0 && (embed.data.fields?.length ?? 0) === 0) return;

    embed.setDescription(`${newRole}\n\n${changes.join('\n')}`.trim());
    await sendLog(newRole.guild, 'roles', embed);
  },
});
