import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import type { Command } from '../../../types';
import { parseDuration } from '../../../utils/duration';
import { getBotMember, requireMember } from '../../../utils/interaction';
import { buildContext, reasonOption, replyWithCase } from '../services/command.helpers';
import { MAX_TIMEOUT_SECONDS, timeoutMember } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Exclut temporairement un membre (il ne peut plus écrire ni parler).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à exclure').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('duree')
        .setDescription('Durée : 10m, 2h, 1j... (28 jours maximum)')
        .setRequired(true),
    )
    .addStringOption(reasonOption),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 3,

  async execute(interaction) {
    const member = requireMember(interaction);
    const durationSeconds = parseDuration(interaction.options.getString('duree', true));
    if (durationSeconds === null) {
      throw new BotError('Durée invalide. Exemples : `10m`, `2h`, `1j`.');
    }
    if (durationSeconds > MAX_TIMEOUT_SECONDS) {
      throw new BotError('Une exclusion temporaire ne peut pas dépasser 28 jours.');
    }

    assertCanActOn(interaction.member, member, await getBotMember(interaction));
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      throw new BotError('Discord ne permet pas d’exclure temporairement un administrateur.');
    }

    await interaction.deferReply();
    const result = await timeoutMember(buildContext(interaction, member.user), member, durationSeconds);
    await replyWithCase(interaction, result);
  },
};

export default command;
