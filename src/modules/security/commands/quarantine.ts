import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countQuarantines,
  getActiveQuarantine,
  listActiveQuarantines,
  listQuarantineHistory,
} from '../../../core/database/repositories/security.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { parseDuration } from '../../../utils/duration';
import { timestamp, truncate } from '../../../utils/format';
import { requireMember } from '../../../utils/interaction';
import {
  MAX_QUARANTINE_SECONDS,
  quarantineMember,
  releaseMember,
} from '../services/quarantine.service';

const PAGE_SIZE = 10;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('quarantine')
    .setDescription('Isole un membre le temps de régler un problème.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription(
          'Met un membre en quarantaine : ses rôles sont mis de côté et il perd l’accès aux salons.',
        )
        .addUserOption((option) =>
          option.setName('membre').setDescription('Membre à isoler').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('raison')
            .setDescription('Raison (visible du staff et du membre)')
            .setMaxLength(500)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('duree')
            .setDescription('Levée automatique : 30m, 12h, 7j… (jusqu’à levée manuelle si vide)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Lève la quarantaine d’un membre et lui rend ses rôles.')
        .addUserOption((option) =>
          option.setName('membre').setDescription('Membre concerné').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('raison').setDescription('Raison de la levée').setMaxLength(500),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Affiche les membres actuellement en quarantaine.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Affiche la quarantaine en cours et l’historique d’un membre.')
        .addUserOption((option) =>
          option.setName('membre').setDescription('Membre concerné').setRequired(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ManageRoles],
  cooldown: 3,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const member = requireMember(interaction);
      const rawDuration = interaction.options.getString('duree');
      const durationSeconds = rawDuration ? parseDuration(rawDuration) : null;
      if (rawDuration && (durationSeconds === null || durationSeconds > MAX_QUARANTINE_SECONDS)) {
        throw new BotError(
          'Durée invalide : utilisez par exemple `30m`, `12h` ou `7j` (90 jours au plus).',
        );
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await quarantineMember({
        member,
        moderator: interaction.member,
        reason: interaction.options.getString('raison', true),
        durationSeconds,
      });
      const notes = [
        result.record.expiresAt
          ? `Levée automatique ${timestamp(result.record.expiresAt, 'R')}.`
          : 'Levée manuelle avec `/quarantine remove`.',
        `${result.record.removedRoleIds.length} rôle(s) mis de côté, rendus à la levée.`,
        result.keptRoles > 0
          ? `⚠️ ${result.keptRoles} rôle(s) conservé(s) : gérés par une intégration ou supérieurs au mien.`
          : null,
        result.notified
          ? 'Le membre a été prévenu par message privé.'
          : 'Le membre n’a pas pu être prévenu par message privé.',
        `Incident n°${result.incident.number}.`,
      ].filter(Boolean);
      await interaction.editReply({
        embeds: [successEmbed(`${member} est en quarantaine.\n${notes.join('\n')}`)],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'remove') {
      const user = interaction.options.getUser('membre', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await releaseMember(
        interaction.guild,
        user.id,
        interaction.member,
        interaction.options.getString('raison') ?? 'Levée manuelle',
      );
      if (!result) throw new BotError(`${user} n’est pas en quarantaine.`);
      const detail = result.memberPresent
        ? `${result.restored} rôle(s) rendu(s).${result.lost > 0 ? ` ${result.lost} rôle(s) n’existent plus ou ne peuvent plus être attribués.` : ''}`
        : 'Le membre n’est plus sur le serveur : ses rôles ne seront pas rendus.';
      await interaction.editReply({
        embeds: [successEmbed(`Quarantaine de ${user} levée. ${detail}`)],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'info') {
      const user = interaction.options.getUser('membre', true);
      const [active, history, total] = await Promise.all([
        getActiveQuarantine(interaction.guildId, user.id),
        listQuarantineHistory(interaction.guildId, user.id, 5),
        countQuarantines(interaction.guildId, user.id),
      ]);
      const embed = baseEmbed().setTitle(`🔒 Quarantaine — ${user.tag}`);
      embed.addFields({
        name: 'En cours',
        value: active
          ? truncate(
              `Depuis ${timestamp(active.createdAt, 'R')} par ${active.moderatorId ? `<@${active.moderatorId}>` : 'la sécurité automatique'}\n` +
                `Fin : ${active.expiresAt ? timestamp(active.expiresAt, 'R') : 'levée manuelle'}\nRaison : ${active.reason}`,
              1024,
            )
          : 'Aucune',
      });
      embed.addFields({
        name: `Historique (${total})`,
        value:
          history
            .filter((record) => record.releasedAt)
            .map(
              (record) =>
                `• ${timestamp(record.createdAt, 'd')} → ${timestamp(record.releasedAt!, 'd')} : ${truncate(record.reason, 80)}`,
            )
            .join('\n') || 'Aucune quarantaine passée',
      });
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const active = await listActiveQuarantines(interaction.guildId);
    const title = `🔒 Membres en quarantaine (${active.length})`;
    if (active.length === 0) {
      await interaction.editReply({
        embeds: [baseEmbed().setTitle(title).setDescription('Aucun membre en quarantaine.')],
      });
      return;
    }
    await paginate(interaction, Math.ceil(active.length / PAGE_SIZE), async (page) =>
      baseEmbed()
        .setTitle(title)
        .setDescription(
          active
            .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
            .map(
              (record) =>
                `<@${record.userId}> · depuis ${timestamp(record.createdAt, 'R')} · ${
                  record.expiresAt ? `fin ${timestamp(record.expiresAt, 'R')}` : 'levée manuelle'
                }\n└ ${truncate(record.reason, 90)}`,
            )
            .join('\n'),
        ),
    );
  },
};

export default command;
