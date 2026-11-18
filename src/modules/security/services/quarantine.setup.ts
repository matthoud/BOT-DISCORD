import {
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Role,
} from 'discord.js';
import {
  getSecurityConfig,
  updateSecurityConfig,
} from '../../../core/database/repositories/security.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { assertCanManageRole } from '../../../core/permissions/hierarchy';
import { confirm } from '../../../core/ui/confirm';
import { successEmbed, warningEmbed } from '../../../core/ui/embeds';
import { assertMemberCanAccess } from '../../../utils/interaction';
import { QUARANTINE_ALLOW, QUARANTINE_DENY } from './quarantine.service';

/**
 * `/security-admin quarantine-setup` : choisit (ou crée) le rôle de quarantaine, lui interdit
 * l'accès à tous les salons et, si demandé, lui ouvre un salon pour écrire au staff.
 * Les nouveaux salons reçoivent ensuite l'interdiction automatiquement.
 */
export async function setupQuarantine(
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
  const guild = interaction.guild;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new BotError('Il me manque la permission « Gérer les rôles ».');
  }

  let role: Role | null = interaction.options.getRole('role');
  if (role) {
    assertCanManageRole(interaction.member, role, me);
    if (role.permissions.has(PermissionFlagsBits.Administrator)) {
      throw new BotError(
        'Ce rôle donne la permission Administrateur : il ne peut pas servir de quarantaine.',
      );
    }
  }
  const contact = interaction.options.getChannel('salon', false, [ChannelType.GuildText]);
  if (contact)
    assertMemberCanAccess(interaction.member, contact, [PermissionFlagsBits.ViewChannel]);

  const channels = [...guild.channels.cache.values()]
    .filter((channel) => !channel.isThread() && 'permissionOverwrites' in channel)
    // Les catégories d'abord : leurs salons synchronisés héritent ensuite de la même règle.
    .sort(
      (a, b) =>
        Number(b.type === ChannelType.GuildCategory) - Number(a.type === ChannelType.GuildCategory),
    );

  const click = await confirm(
    interaction,
    `${role ? `Le rôle ${role}` : 'Un nouveau rôle « Quarantaine »'} sera interdit d'accès à **${channels.length} salon(s)**${
      contact ? `, sauf ${contact} où il pourra écrire au staff` : ''
    }. Ses autres permissions de salon ne changent pas.\nContinuer ?`,
    'Appliquer',
  );
  if (!click) return;

  if (!role) {
    role = await guild.roles.create({
      name: 'Quarantaine',
      color: 0x95a5a6,
      permissions: [],
      reason: `Quarantaine configurée par ${interaction.user.tag}`,
    });
  }

  let applied = 0;
  const skipped: string[] = [];
  for (const channel of channels) {
    if (!('permissionOverwrites' in channel)) continue;
    if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageRoles)) {
      skipped.push(`<#${channel.id}>`);
      continue;
    }
    try {
      await channel.permissionOverwrites.edit(
        role.id,
        channel.id === contact?.id ? QUARANTINE_ALLOW : QUARANTINE_DENY,
        {
          reason: 'Mise en place de la quarantaine',
        },
      );
      applied++;
    } catch (error) {
      logger.warn(
        { err: error, guildId: guild.id, channelId: channel.id },
        'Salon non protégé pour la quarantaine',
      );
      skipped.push(`<#${channel.id}>`);
    }
  }

  await getSecurityConfig(guild.id);
  await updateSecurityConfig(guild.id, {
    quarantineRoleId: role.id,
    quarantineChannelId: contact?.id ?? null,
  });

  const lines = [
    `Quarantaine prête avec le rôle ${role} : ${applied} salon(s) protégé(s).`,
    contact ? `Les membres en quarantaine peuvent écrire au staff dans ${contact}.` : null,
    'Les salons créés à l’avenir seront protégés automatiquement.',
  ].filter(Boolean);
  const embeds = [successEmbed(lines.join('\n'))];
  if (skipped.length > 0) {
    embeds.push(
      warningEmbed(
        `${skipped.length} salon(s) non protégé(s), faute de permission « Gérer les permissions » : ${skipped
          .slice(0, 15)
          .join(', ')}${skipped.length > 15 ? '…' : ''}`,
      ),
    );
  }
  await click.editReply({ embeds, components: [], allowedMentions: { parse: [] } });
}
