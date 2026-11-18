import { Events, PermissionFlagsBits } from 'discord.js';
import { getSecurityConfig } from '../../../core/database/repositories/security.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { logger } from '../../../core/logger';
import { defineEvent } from '../../../types';
import { MODULE_ID } from '../services/labels';
import { QUARANTINE_DENY } from '../services/quarantine.service';

/** Un nouveau salon reçoit aussitôt l'interdiction d'accès pour le rôle de quarantaine. */
export default defineEvent({
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!('permissionOverwrites' in channel)) return;
    const guild = channel.guild;
    if (!(await isModuleEnabled(guild.id, MODULE_ID))) return;
    const config = await getSecurityConfig(guild.id);
    if (!config.quarantineRoleId || !guild.roles.cache.has(config.quarantineRoleId)) return;
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageRoles)) return;
    try {
      await channel.permissionOverwrites.edit(config.quarantineRoleId, QUARANTINE_DENY, {
        reason: 'Quarantaine : accès interdit par défaut',
      });
    } catch (error) {
      logger.warn(
        { err: error, guildId: guild.id, channelId: channel.id },
        'Salon non protégé pour la quarantaine',
      );
    }
  },
});
