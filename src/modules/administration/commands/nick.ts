import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import { successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { auditReason, getBotMember, requireMember } from '../../../utils/interaction';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription("Modifie le pseudonyme d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre concerné').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('pseudo')
        .setDescription('Nouveau pseudo (laisser vide pour réinitialiser)')
        .setMaxLength(32),
    )
    .addStringOption((option) => option.setName('raison').setDescription('Raison').setMaxLength(300)),
  userPermissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],
  cooldown: 3,

  async execute(interaction) {
    const member = requireMember(interaction);
    const nickname = interaction.options.getString('pseudo')?.trim() || null;
    const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

    assertCanActOn(interaction.member, member, await getBotMember(interaction));
    if (member.nickname === nickname) {
      throw new BotError(
        nickname ? `${member} porte déjà ce pseudo.` : `${member} n'a pas de pseudo à réinitialiser.`,
      );
    }

    await member.setNickname(nickname, auditReason(interaction.user.tag, reason));

    await interaction.reply({
      embeds: [
        successEmbed(
          nickname
            ? `Le pseudo de ${member} est maintenant **${nickname}**.`
            : `Le pseudo de ${member} a été réinitialisé.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
