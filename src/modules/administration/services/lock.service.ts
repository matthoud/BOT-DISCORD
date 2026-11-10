import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { assertMemberCanAccess, auditReason } from '../../../utils/interaction';

/** Construit la commande /lock ou /unlock (mêmes options). */
export function buildLockCommand(name: 'lock' | 'unlock', description: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription('Salon concerné (salon actuel par défaut)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName('raison').setDescription('Raison').setMaxLength(300));
}

/**
 * Verrouille ou déverrouille un salon en modifiant la permission « Envoyer des messages »
 * du rôle @everyone. Le déverrouillage rétablit l'héritage (ni autorisé, ni refusé).
 */
export async function setChannelLocked(
  interaction: ChatInputCommandInteraction<'cached'>,
  locked: boolean,
): Promise<void> {
  const channel = interaction.options.getChannel('salon') ?? interaction.channel;
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new BotError('Seuls les salons textuels peuvent être verrouillés.');
  }

  assertMemberCanAccess(interaction.member, channel);

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  // Modifier les permissions d'un salon exige « Gérer les rôles » (Gérer les permissions) dans ce salon.
  if (!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageRoles])) {
    throw new BotError(`Il me manque la permission \`Gérer les rôles\` dans ${channel}.`);
  }

  const everyone = interaction.guild.roles.everyone;
  const isLocked =
    channel.permissionOverwrites.cache.get(everyone.id)?.deny.has(PermissionFlagsBits.SendMessages) ??
    false;
  if (isLocked === locked) {
    throw new BotError(`${channel} est déjà ${locked ? 'verrouillé' : 'déverrouillé'}.`);
  }

  const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
  await channel.permissionOverwrites.edit(
    everyone,
    { SendMessages: locked ? false : null },
    { reason: auditReason(interaction.user.tag, reason) },
  );

  await interaction.reply({
    embeds: [
      baseEmbed(locked ? Colors.warning : Colors.success)
        .setTitle(locked ? '🔒 Salon verrouillé' : '🔓 Salon déverrouillé')
        .setDescription(
          locked
            ? `Les membres ne peuvent plus écrire dans ${channel}.`
            : `Les membres peuvent de nouveau écrire dans ${channel}.`,
        )
        .addFields(
          { name: 'Par', value: `${interaction.user}`, inline: true },
          { name: 'Raison', value: reason, inline: true },
        ),
    ],
  });
}
