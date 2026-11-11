import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import {
  getLevelConfig,
  getRank,
  getUserExperience,
} from '../../../core/database/repositories/levels.repository';
import { BotError } from '../../../core/errors/BotError';
import { logger } from '../../../core/logger';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { fetchAvatar, renderRankCard } from '../services/card';
import { formatNumber, progressFromXp, textProgressBar } from '../services/xp';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Affiche votre niveau et votre progression, ou ceux d'un autre membre.")
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à consulter (vous par défaut)'),
    ),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    if (user.bot) throw new BotError("Les bots ne gagnent pas d'expérience.");
    const member = interaction.options.getMember('membre') ?? (user.id === interaction.user.id ? interaction.member : null);

    await interaction.deferReply();

    const [config, experience] = await Promise.all([
      getLevelConfig(interaction.guildId),
      getUserExperience(interaction.guildId, user.id),
    ]);
    const totalXp = experience?.xp ?? 0;
    const progress = progressFromXp(totalXp, config);
    const rank = await getRank(interaction.guildId, totalXp);
    const messages = experience?.messageCount ?? 0;
    const displayName = member?.displayName ?? user.displayName;
    // Couleur du rôle le plus haut du membre, ou couleur du bot s'il n'en a pas.
    const accentColor = member?.displayColor || Colors.primary;

    try {
      const avatarUrl = (member ?? user).displayAvatarURL({ extension: 'png', size: 256 });
      const card = await renderRankCard({
        displayName,
        username: user.username,
        avatar: await fetchAvatar(avatarUrl),
        level: progress.level,
        rank,
        currentXp: progress.currentXp,
        neededXp: progress.neededXp,
        accentColor,
        stats: [
          { label: 'XP total', value: formatNumber(totalXp) },
          { label: 'Messages', value: formatNumber(messages) },
        ],
      });
      await interaction.editReply({ files: [new AttachmentBuilder(card, { name: 'niveau.png' })] });
    } catch (error) {
      // La carte en image est un plus : en cas d'échec, les mêmes informations sont données en texte.
      logger.warn({ err: error }, 'Échec du rendu de la carte de niveau');
      const ratio = progress.neededXp > 0 ? progress.currentXp / progress.neededXp : 0;
      await interaction.editReply({
        embeds: [
          baseEmbed(accentColor)
            .setAuthor({ name: displayName, iconURL: user.displayAvatarURL({ size: 64 }) })
            .setTitle(`Niveau ${progress.level} — rang #${formatNumber(rank)}`)
            .setDescription(
              `${textProgressBar(ratio)} ${formatNumber(progress.currentXp)} / ${formatNumber(progress.neededXp)} XP`,
            )
            .addFields(
              { name: 'XP total', value: formatNumber(totalXp), inline: true },
              { name: 'Messages', value: formatNumber(messages), inline: true },
            ),
        ],
      });
    }
  },
};

export default command;
