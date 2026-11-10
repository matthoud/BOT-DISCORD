import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import type { Command } from '../../../types';
import { getBotMember, requireMember } from '../../../utils/interaction';
import { buildContext, reasonOption, replyWithCase } from '../services/command.helpers';
import { kickMember } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à expulser').setRequired(true),
    )
    .addStringOption(reasonOption),
  userPermissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],
  cooldown: 3,

  async execute(interaction) {
    const member = requireMember(interaction);
    assertCanActOn(interaction.member, member, await getBotMember(interaction));

    await interaction.deferReply();
    const result = await kickMember(buildContext(interaction, member.user), member);
    await replyWithCase(interaction, result);
  },
};

export default command;
