import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countActiveWarnings,
  countCases,
  listCases,
} from '../../../core/database/repositories/moderation.repository';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { formatCaseLine } from '../services/case.presenter';

const PAGE_SIZE = 5;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription("Affiche l'historique de modération d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à consulter (mention ou ID)').setRequired(true),
    ),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 3,

  async execute(interaction) {
    const user = interaction.options.getUser('membre', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [total, activeWarnings] = await Promise.all([
      countCases(interaction.guildId, user.id),
      countActiveWarnings(interaction.guildId, user.id),
    ]);
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    await paginate(interaction, pageCount, async (page) => {
      const cases = await listCases(interaction.guildId, user.id, page * PAGE_SIZE, PAGE_SIZE);
      return baseEmbed(total > 0 ? Colors.moderation : Colors.success)
        .setTitle(`📋 Historique de ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setDescription(
          cases.length > 0
            ? cases.map(formatCaseLine).join('\n\n')
            : 'Aucune action de modération enregistrée pour cet utilisateur.',
        )
        .setFooter({
          text: `${total} cas au total • ${activeWarnings} avertissement(s) actif(s) • ID : ${user.id}`,
        });
    });
  },
};

export default command;
