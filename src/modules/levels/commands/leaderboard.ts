import { SlashCommandBuilder } from 'discord.js';
import {
  countRankedMembers,
  getLeaderboardPage,
  getLevelConfig,
  getRank,
  getUserExperience,
} from '../../../core/database/repositories/levels.repository';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { formatNumber, levelFromXp } from '../services/xp';

const PAGE_SIZE = 10;
/** Le classement affiché s'arrête aux 100 premiers membres. */
const MAX_ENTRIES = 100;
const MEDALS = ['🥇', '🥈', '🥉'];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Affiche le classement des membres par expérience."),
  cooldown: 10,

  async execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guildId;

    const [config, total, own] = await Promise.all([
      getLevelConfig(guildId),
      countRankedMembers(guildId),
      getUserExperience(guildId, interaction.user.id),
    ]);

    if (total === 0) {
      await interaction.editReply({
        embeds: [
          baseEmbed()
            .setTitle(`🏆 Classement — ${interaction.guild.name}`)
            .setDescription("Personne n'a encore gagné d'expérience sur ce serveur."),
        ],
      });
      return;
    }

    const ownLine =
      own && own.xp > 0
        ? `Votre rang : #${formatNumber(await getRank(guildId, own.xp))} sur ${formatNumber(total)}`
        : `Vous n'êtes pas encore classé · ${formatNumber(total)} membre(s) classé(s)`;
    const shown = Math.min(total, MAX_ENTRIES);

    await paginate(interaction, Math.ceil(shown / PAGE_SIZE), async (page) => {
      const rows = await getLeaderboardPage(guildId, page * PAGE_SIZE, PAGE_SIZE);
      const lines = rows.map((row, index) => {
        const position = page * PAGE_SIZE + index;
        const marker = MEDALS[position] ?? `**${position + 1}.**`;
        return `${marker} <@${row.userId}> — niveau **${levelFromXp(row.xp, config)}** · ${formatNumber(row.xp)} XP`;
      });
      return baseEmbed()
        .setTitle(`🏆 Classement — ${interaction.guild.name}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: ownLine });
    });
  },
};

export default command;
