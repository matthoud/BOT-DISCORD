import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countActiveWarnings,
  createWarning,
} from '../../../core/database/repositories/moderation.repository';
import { BotError } from '../../../core/errors/BotError';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import type { Command } from '../../../types';
import { getBotMember, requireMember } from '../../../utils/interaction';
import { applyAutomaticSanction } from '../services/autosanction.service';
import { buildContext, reasonOption, replyWithCase } from '../services/command.helpers';
import { notifyTarget, recordCase } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertit un membre.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à avertir').setRequired(true),
    )
    .addStringOption(reasonOption),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 3,

  async execute(interaction) {
    const member = requireMember(interaction);
    if (member.user.bot) throw new BotError('Un bot ne peut pas recevoir d’avertissement.');
    assertCanActOn(interaction.member, member, await getBotMember(interaction));

    await interaction.deferReply();
    const context = buildContext(interaction, member.user);

    const moderationCase = await recordCase(context, 'WARN');
    await createWarning({
      guildId: interaction.guildId,
      userId: member.id,
      moderatorId: interaction.user.id,
      reason: context.reason,
      caseId: moderationCase.id,
    });
    const notified = await notifyTarget(context, 'WARN');

    const total = await countActiveWarnings(interaction.guildId, member.id);
    const notes = [`Ce membre a maintenant **${total}** avertissement(s) actif(s).`];
    const sanction = await applyAutomaticSanction(interaction.guild, member);
    if (sanction) notes.push(sanction);

    await replyWithCase(interaction, { moderationCase, notified }, { notes });
  },
};

export default command;
