import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  countPendingReminders,
  createReminder,
  deleteReminder,
  listPendingReminders,
} from '../../../core/database/repositories/events.repository';
import { getGuildConfig } from '../../../core/database/repositories/guild.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { formatDateIn } from '../../../utils/datetime';
import { timestamp, truncate } from '../../../utils/format';
import { resolveFutureDate } from '../services/dates';
import { REMINDER_LIMITS } from '../services/reminder.service';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Programme et gère vos rappels personnels.')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Programme un rappel : le bot vous mentionnera ici le moment venu.')
        .addStringOption((option) =>
          option
            .setName('quand')
            .setDescription('Moment du rappel : dans 2h, demain 9h, 25/12 18:30... (fuseau du serveur)')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Ce dont vous voulez vous souvenir')
            .setMaxLength(REMINDER_LIMITS.messageLength)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Affiche vos rappels en attente sur ce serveur.'))
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Supprime un de vos rappels en attente.')
        .addStringOption((option) =>
          option.setName('rappel').setDescription('Rappel à supprimer').setRequired(true).setAutocomplete(true),
        ),
    ),
  cooldown: 5,

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const { timezone } = await getGuildConfig(interaction.guildId);
    const reminders = await listPendingReminders(interaction.guildId, interaction.user.id);
    await interaction.respond(
      reminders
        .filter((reminder) => reminder.message.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((reminder) => ({
          name: truncate(`${formatDateIn(reminder.remindAt, timezone)} — ${reminder.message}`, 100),
          value: String(reminder.id),
        })),
    );
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      const message = interaction.options.getString('message', true).trim();
      if (!message) throw new BotError('Le message du rappel ne peut pas être vide.');
      const { date, timezone } = await resolveFutureDate(guildId, interaction.options.getString('quand', true), REMINDER_LIMITS);
      if ((await countPendingReminders(guildId, userId)) >= REMINDER_LIMITS.pendingPerMember) {
        throw new BotError(
          `Vous avez déjà ${REMINDER_LIMITS.pendingPerMember} rappels en attente sur ce serveur. Supprimez-en un avec \`/reminder delete\`.`,
        );
      }

      await createReminder({ guildId, channelId: interaction.channelId, userId, message, remindAt: date });
      await interaction.reply({
        embeds: [
          successEmbed(
            `Rappel programmé pour ${timestamp(date, 'F')} (${timestamp(date, 'R')}).\nJe vous mentionnerai dans ce salon, ou en message privé s'il n'est plus accessible.\n-# Date comprise : ${formatDateIn(date, timezone)} (${timezone})`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'delete') {
      const raw = interaction.options.getString('rappel', true);
      if (!/^\d{1,9}$/.test(raw) || !(await deleteReminder(guildId, userId, Number(raw)))) {
        throw new BotError('Rappel introuvable. Choisissez-le dans la liste proposée.');
      }
      await interaction.reply({ embeds: [successEmbed('Rappel supprimé.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const reminders = await listPendingReminders(guildId, userId);
    const lines = reminders.map(
      (reminder) =>
        `${timestamp(reminder.remindAt, 'f')} (${timestamp(reminder.remindAt, 'R')}) · <#${reminder.channelId}>\n> ${truncate(reminder.message.replace(/\s+/g, ' '), 150)}`,
    );
    await interaction.reply({
      embeds: [
        baseEmbed()
          .setTitle('⏰ Vos rappels en attente')
          .setDescription(lines.length > 0 ? lines.join('\n\n') : 'Aucun rappel en attente. Créez-en un avec `/reminder create`.')
          .setFooter({ text: `${reminders.length} / ${REMINDER_LIMITS.pendingPerMember} rappels` }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
