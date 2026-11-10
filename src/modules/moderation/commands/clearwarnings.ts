import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  clearWarnings,
  countActiveWarnings,
} from '../../../core/database/repositories/moderation.repository';
import { BotError } from '../../../core/errors/BotError';
import { assertCanActOn } from '../../../core/permissions/hierarchy';
import { confirm } from '../../../core/ui/confirm';
import type { Command } from '../../../types';
import { getBotMember } from '../../../utils/interaction';
import { buildCaseEmbed } from '../services/case.presenter';
import { buildContext, reasonOption } from '../services/command.helpers';
import { recordCase } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription("Supprime tous les avertissements actifs d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre concerné').setRequired(true),
    )
    .addStringOption(reasonOption),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('membre', true);
    const member = interaction.options.getMember('membre');
    // Empêche notamment un modérateur d'effacer ses propres avertissements.
    if (member) {
      assertCanActOn(interaction.member, member, await getBotMember(interaction));
    } else if (user.id === interaction.user.id) {
      throw new BotError('Vous ne pouvez pas effectuer cette action sur vous-même.');
    }

    const count = await countActiveWarnings(interaction.guildId, user.id);
    if (count === 0) throw new BotError(`**${user.tag}** n'a aucun avertissement actif.`);

    const confirmed = await confirm(
      interaction,
      `Supprimer les **${count}** avertissement(s) actif(s) de ${user} ? Ils resteront visibles dans l'historique.`,
      'Supprimer',
    );
    if (!confirmed) return;

    const context = buildContext(interaction, user);
    const cleared = await clearWarnings(interaction.guildId, user.id);
    const moderationCase = await recordCase({
      ...context,
      reason: `${context.reason} (${cleared} avertissement(s) effacé(s))`,
    }, 'CLEAR_WARNINGS');

    await interaction.editReply({ embeds: [buildCaseEmbed(moderationCase)], components: [] });
  },
};

export default command;
