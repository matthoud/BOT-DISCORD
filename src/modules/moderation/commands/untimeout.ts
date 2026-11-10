import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import type { Command } from '../../../types';
import { getBotMember, requireMember } from '../../../utils/interaction';
import { buildContext, reasonOption, replyWithCase } from '../services/command.helpers';
import { removeTimeout } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription("Met fin à l'exclusion temporaire d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre concerné').setRequired(true),
    )
    .addStringOption(reasonOption),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 3,

  async execute(interaction) {
    const member = requireMember(interaction);
    if (!member.isCommunicationDisabled()) {
      throw new BotError(`${member} n'est pas exclu(e) temporairement.`);
    }
    assertCanActOn(interaction.member, member, await getBotMember(interaction));

    await interaction.deferReply();
    const result = await removeTimeout(buildContext(interaction, member.user), member);
    await replyWithCase(interaction, result, { showNotification: false });
  },
};

export default command;
