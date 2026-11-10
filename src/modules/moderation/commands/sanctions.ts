import type { SanctionAction } from '@prisma/client';
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  deleteSanctionRule,
  listSanctionRules,
  upsertSanctionRule,
} from '../../../core/database/repositories/moderation.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { parseDuration } from '../../../utils/duration';
import { describeRule, SANCTION_LABELS } from '../services/autosanction.service';
import { MAX_TEMPBAN_SECONDS, MAX_TIMEOUT_SECONDS } from '../services/moderation.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription('Configure les sanctions automatiques liées aux avertissements.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription("Définit la sanction appliquée à un nombre d'avertissements.")
        .addIntegerOption((option) =>
          option
            .setName('seuil')
            .setDescription("Nombre d'avertissements actifs déclenchant la sanction")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Sanction à appliquer')
            .setRequired(true)
            .addChoices(
              ...Object.entries(SANCTION_LABELS).map(([value, name]) => ({ name, value })),
            ),
        )
        .addStringOption((option) =>
          option
            .setName('duree')
            .setDescription('Durée (obligatoire pour une exclusion, optionnelle pour un bannissement)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("Supprime la sanction automatique d'un seuil.")
        .addIntegerOption((option) =>
          option.setName('seuil').setDescription('Seuil à supprimer').setMinValue(1).setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Affiche les sanctions automatiques configurées.'),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (subcommand === 'list') {
      const rules = await listSanctionRules(guildId);
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('⚖️ Sanctions automatiques')
            .setDescription(
              rules.length > 0
                ? rules
                    .map((rule) => `**${rule.threshold} avertissement(s)** → ${describeRule(rule)}`)
                    .join('\n')
                : 'Aucune sanction automatique. Ajoutez-en avec `/sanctions add`.',
            )
            .setFooter({ text: 'Seuls les avertissements actifs sont comptés.' }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const threshold = interaction.options.getInteger('seuil', true);

    if (subcommand === 'remove') {
      const removed = await deleteSanctionRule(guildId, threshold);
      if (!removed) throw new BotError(`Aucune sanction n'est configurée pour le seuil ${threshold}.`);
      await interaction.reply({
        embeds: [successEmbed(`Sanction automatique du seuil **${threshold}** supprimée.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const action = interaction.options.getString('action', true) as SanctionAction;
    const durationInput = interaction.options.getString('duree');
    let duration: number | null = null;

    if (durationInput) {
      duration = parseDuration(durationInput);
      if (duration === null) throw new BotError('Durée invalide. Exemples : `1h`, `7j`.');
    }
    if (action === 'KICK' && duration !== null) {
      throw new BotError("Une expulsion n'a pas de durée.");
    }
    if (action === 'TIMEOUT') {
      if (duration === null) throw new BotError('Une exclusion temporaire nécessite une durée.');
      if (duration > MAX_TIMEOUT_SECONDS) {
        throw new BotError('Une exclusion temporaire ne peut pas dépasser 28 jours.');
      }
    }
    if (action === 'BAN' && duration !== null && duration > MAX_TEMPBAN_SECONDS) {
      throw new BotError('Un bannissement temporaire ne peut pas dépasser 1 an.');
    }

    const rule = await upsertSanctionRule(guildId, threshold, action, duration);
    await interaction.reply({
      embeds: [
        successEmbed(
          `À **${threshold}** avertissement(s) actif(s), la sanction sera : **${describeRule(rule)}**.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
