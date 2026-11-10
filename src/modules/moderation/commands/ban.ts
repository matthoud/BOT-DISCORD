import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import type { Command } from '../../../types';
import { formatDuration, parseDuration } from '../../../utils/duration';
import { getBotMember } from '../../../utils/interaction';
import { buildContext, reasonOption, replyWithCase } from '../services/command.helpers';
import { banUser, MAX_TEMPBAN_SECONDS } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un utilisateur du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName('utilisateur').setDescription('Utilisateur à bannir (mention ou ID)').setRequired(true),
    )
    .addStringOption(reasonOption)
    .addStringOption((option) =>
      option
        .setName('duree')
        .setDescription('Bannissement temporaire : 12h, 7j, 2sem... (définitif si vide)'),
    )
    .addIntegerOption((option) =>
      option
        .setName('supprimer_messages')
        .setDescription("Supprimer l'historique récent des messages de l'utilisateur")
        .addChoices(
          { name: 'Ne rien supprimer', value: 0 },
          { name: 'Dernière heure', value: 3600 },
          { name: 'Dernières 24 heures', value: 86_400 },
          { name: '7 derniers jours', value: 604_800 },
        ),
    ),
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur', true);
    const member = interaction.options.getMember('utilisateur');
    const durationInput = interaction.options.getString('duree');

    let durationSeconds: number | undefined;
    if (durationInput) {
      const parsed = parseDuration(durationInput);
      if (parsed === null) {
        throw new BotError('Durée invalide. Exemples : `12h`, `7j`, `2sem`.');
      }
      if (parsed > MAX_TEMPBAN_SECONDS) {
        throw new BotError(
          `Un bannissement temporaire ne peut pas dépasser ${formatDuration(MAX_TEMPBAN_SECONDS)}.`,
        );
      }
      durationSeconds = parsed;
    }

    if (member) {
      assertCanActOn(interaction.member, member, await getBotMember(interaction));
    } else {
      if (user.id === interaction.user.id) {
        throw new BotError('Vous ne pouvez pas effectuer cette action sur vous-même.');
      }
      if (user.id === interaction.client.user.id) {
        throw new BotError('Je ne peux pas effectuer cette action sur moi-même.');
      }
    }

    await interaction.deferReply();
    const existingBan = await interaction.guild.bans.fetch(user.id).catch(() => null);
    if (existingBan) throw new BotError(`**${user.tag}** est déjà banni(e).`);

    const result = await banUser(buildContext(interaction, user), {
      durationSeconds,
      deleteMessageSeconds: interaction.options.getInteger('supprimer_messages') ?? 0,
    });
    await replyWithCase(interaction, result);
  },
};

export default command;
