import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import type { Command } from '../../../types';
import { buildContext, reasonOption, replyWithCase } from '../services/command.helpers';
import { unbanUser } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName('utilisateur').setDescription("ID de l'utilisateur à débannir").setRequired(true),
    )
    .addStringOption(reasonOption),
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur', true);

    await interaction.deferReply();
    const ban = await interaction.guild.bans.fetch(user.id).catch(() => null);
    if (!ban) throw new BotError(`**${user.tag}** n'est pas banni(e).`);

    const result = await unbanUser(buildContext(interaction, user));
    await replyWithCase(interaction, result, { showNotification: false });
  },
};

export default command;
