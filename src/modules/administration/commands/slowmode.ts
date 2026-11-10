import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { formatDuration, parseDuration } from '../../../utils/duration';
import { assertMemberCanAccess, auditReason, getBotMember } from '../../../utils/interaction';

/** Limite imposée par Discord : 6 heures. */
const MAX_SLOWMODE_SECONDS = 21_600;
const DISABLE_KEYWORDS = new Set(['0', 'off', 'non', 'aucun', 'desactiver', 'désactiver']);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription("Configure le mode lent d'un salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option
        .setName('duree')
        .setDescription('Délai entre deux messages : 10s, 5m, 1h... ou « off » pour désactiver')
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription('Salon concerné (salon actuel par défaut)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum),
    ),
  userPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,

  async execute(interaction) {
    const input = interaction.options.getString('duree', true).trim().toLowerCase();
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;

    if (!channel || !('setRateLimitPerUser' in channel)) {
      throw new BotError('Le mode lent ne peut pas être configuré dans ce type de salon.');
    }
    assertMemberCanAccess(interaction.member, channel);
    const me = await getBotMember(interaction);
    if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageChannels)) {
      throw new BotError(`Il me manque la permission \`Gérer les salons\` dans ${channel}.`);
    }

    const seconds = DISABLE_KEYWORDS.has(input) ? 0 : parseDuration(input);
    if (seconds === null) {
      throw new BotError('Durée invalide. Exemples : `10s`, `5m`, `1h`, ou `off` pour désactiver.');
    }
    if (seconds > MAX_SLOWMODE_SECONDS) {
      throw new BotError('Le mode lent ne peut pas dépasser 6 heures.');
    }

    await channel.setRateLimitPerUser(seconds, auditReason(interaction.user.tag, 'Commande /slowmode'));

    await interaction.reply({
      embeds: [
        successEmbed(
          seconds === 0
            ? `Le mode lent est désactivé dans ${channel}.`
            : `Mode lent réglé sur **${formatDuration(seconds)}** dans ${channel}.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
