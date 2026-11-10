import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { listActiveWarnings } from '../../../core/database/repositories/moderation.repository';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { fullTimestamp, truncate } from '../../../utils/format';

const MAX_SHOWN = 15;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("Affiche les avertissements actifs d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à consulter').setRequired(true),
    ),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('membre', true);
    const warnings = await listActiveWarnings(interaction.guildId, user.id);

    const lines = warnings.slice(0, MAX_SHOWN).map((warning) => {
      const caseLabel = warning.case ? `Cas n°${warning.case.caseNumber}` : 'Avertissement';
      return `**${caseLabel}** • par <@${warning.moderatorId}> • ${fullTimestamp(warning.createdAt)}\n> ${truncate(warning.reason, 200)}`;
    });
    const hidden = warnings.length - lines.length;

    const embed = baseEmbed(warnings.length > 0 ? Colors.warning : Colors.success)
      .setTitle(`⚠️ Avertissements de ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setDescription(
        warnings.length > 0
          ? lines.join('\n\n') + (hidden > 0 ? `\n\n… et ${hidden} autre(s), visibles avec \`/history\`.` : '')
          : 'Aucun avertissement actif.',
      )
      .setFooter({ text: `${warnings.length} avertissement(s) actif(s)` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
