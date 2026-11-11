import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  getLevelConfig,
  listLevelRewards,
  removeLevelReward,
  setLevelReward,
} from '../../../core/database/repositories/levels.repository';
import { BotError } from '../../../core/errors/BotError';
import { assertCanManageRole } from '../../../core/permissions/hierarchy';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { getBotMember } from '../../../utils/interaction';
import { buildLevelPanel } from '../services/panel';
import { formatNumber, LEVEL_LIMITS, totalXpForLevel } from '../services/xp';

const { rewardLevel, rewardsPerGuild } = LEVEL_LIMITS;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Configure le système de niveaux du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('config').setDescription('Ouvre le panneau de configuration des niveaux.'),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('rewards')
        .setDescription('Rôles attribués automatiquement à certains niveaux.')
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Attribue un rôle aux membres qui atteignent un niveau.')
            .addIntegerOption((option) =>
              option
                .setName('niveau')
                .setDescription('Niveau à atteindre')
                .setMinValue(rewardLevel.min)
                .setMaxValue(rewardLevel.max)
                .setRequired(true),
            )
            .addRoleOption((option) =>
              option.setName('role').setDescription('Rôle à attribuer').setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription("Supprime la récompense d'un niveau.")
            .addIntegerOption((option) =>
              option
                .setName('niveau')
                .setDescription('Niveau dont la récompense doit être supprimée')
                .setMinValue(rewardLevel.min)
                .setMaxValue(rewardLevel.max)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('Affiche les récompenses de niveau.')),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (interaction.options.getSubcommandGroup() === null) {
      await interaction.reply({ ...(await buildLevelPanel(interaction.guild)), flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === 'add') {
      const level = interaction.options.getInteger('niveau', true);
      const role = interaction.options.getRole('role', true);
      const me = await getBotMember(interaction);
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new BotError('Il me manque la permission `Gérer les rôles` pour attribuer des récompenses.');
      }
      // Un membre ne peut pas faire distribuer par le bot un rôle qu'il ne pourrait pas donner lui-même.
      assertCanManageRole(interaction.member, role, me);

      const rewards = await listLevelRewards(guildId);
      if (rewards.length >= rewardsPerGuild && !rewards.some((reward) => reward.level === level)) {
        throw new BotError(`Un serveur ne peut pas avoir plus de ${rewardsPerGuild} récompenses de niveau.`);
      }

      await setLevelReward(guildId, level, role.id);
      await interaction.reply({
        embeds: [successEmbed(`Le rôle ${role} sera attribué aux membres qui atteignent le niveau **${level}**.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'remove') {
      const level = interaction.options.getInteger('niveau', true);
      if (!(await removeLevelReward(guildId, level))) {
        throw new BotError(`Aucune récompense n'est définie pour le niveau ${level}.`);
      }
      await interaction.reply({
        embeds: [
          successEmbed(
            `La récompense du niveau **${level}** est supprimée. Les membres qui ont déjà le rôle le conservent.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const [config, rewards] = await Promise.all([getLevelConfig(guildId), listLevelRewards(guildId)]);
    const lines = rewards.map((reward) => {
      const role = interaction.guild.roles.cache.has(reward.roleId) ? `<@&${reward.roleId}>` : '*rôle supprimé*';
      return `Niveau **${reward.level}** — ${role} (${formatNumber(totalXpForLevel(reward.level, config))} XP)`;
    });
    await interaction.reply({
      embeds: [
        baseEmbed()
          .setTitle('🎁 Récompenses de niveau')
          .setDescription(
            lines.length > 0
              ? lines.join('\n')
              : 'Aucune récompense définie. Ajoutez-en avec `/level rewards add`.',
          )
          .setFooter({
            text: config.stackRewards
              ? 'Les rôles des paliers précédents sont conservés.'
              : 'Seul le rôle du palier le plus élevé est conservé.',
          }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
