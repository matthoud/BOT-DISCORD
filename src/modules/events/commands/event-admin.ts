import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countUpcomingEvents,
  createEvent,
  deleteEvent,
  getParticipation,
  listEditableEvents,
  setEventMessage,
  updateEvent,
  type EventUpdate,
} from '../../../core/database/repositories/events.repository';
import { BotError } from '../../../core/errors/BotError';
import { HttpError } from '../../../core/http/errors';
import { parseExternalUrl } from '../../../core/http/network';
import { confirm } from '../../../core/ui/confirm';
import { successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { formatDateIn } from '../../../utils/datetime';
import { truncate } from '../../../utils/format';
import { assertMemberCanAccess } from '../../../utils/interaction';
import { resolveFutureDate } from '../services/dates';
import {
  assertEventChannel,
  deleteEventMessage,
  refreshEventMessage,
  requireEvent,
} from '../services/event.service';
import {
  buildEventButtons,
  buildEventEmbed,
  computeReminderAt,
  DEFAULT_REMINDER_MINUTES,
  EVENT_LIMITS,
  eventUrl,
  hasEventStarted,
  REMINDER_CHOICES,
} from '../services/presenter';

const DATE_LIMITS = { minDelayMs: 60_000, maxDelayMs: EVENT_LIMITS.maxAheadMs };
const { capacity, titleLength, descriptionLength } = EVENT_LIMITS;

const clean = (value: string): string => value.replace(/[ \t]+/g, ' ').trim();
/** Dans une option de commande, « \n » saisi tel quel vaut un retour à la ligne. */
const multiline = (value: string): string => clean(value.replace(/\\n/g, '\n'));

/** Valide l'adresse d'une image : HTTPS uniquement. Elle est affichée par Discord, jamais téléchargée par le bot. */
function parseImageUrl(raw: string): string {
  try {
    const url = parseExternalUrl(raw);
    if (url.protocol !== 'https:') throw new HttpError('INVALID_URL', "L'adresse de l'image doit commencer par https://.");
    return url.toString();
  } catch (error) {
    throw new BotError(error instanceof HttpError ? error.message : "L'adresse de l'image est invalide.");
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('event-admin')
    .setDescription('Crée, modifie ou supprime les événements du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Crée un événement et publie son annonce.')
        .addStringOption((option) =>
          option.setName('titre').setDescription("Titre de l'événement").setMaxLength(titleLength).setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('date')
            .setDescription('Date et heure : 25/12/2026 18:30, demain 20h, dans 3j... (fuseau du serveur)')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Description (tapez \\n pour un retour à la ligne)')
            .setMaxLength(descriptionLength),
        )
        .addChannelOption((option) =>
          option
            .setName('salon')
            .setDescription("Salon de l'annonce (salon actuel par défaut)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) => option.setName('image').setDescription("Adresse https:// d'une image à afficher"))
        .addIntegerOption((option) =>
          option
            .setName('rappel')
            .setDescription('Rappel automatique avant le début (30 minutes par défaut)')
            .addChoices(...REMINDER_CHOICES),
        )
        .addIntegerOption((option) =>
          option
            .setName('places')
            .setDescription('Nombre maximal de participants (illimité par défaut)')
            .setMinValue(capacity.min)
            .setMaxValue(capacity.max),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Modifie un événement et met son annonce à jour.')
        .addStringOption((option) =>
          option.setName('evenement').setDescription('Événement à modifier').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((option) => option.setName('titre').setDescription('Nouveau titre').setMaxLength(titleLength))
        .addStringOption((option) =>
          option.setName('date').setDescription('Nouvelle date : 25/12/2026 18:30, demain 20h... (fuseau du serveur)'),
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Nouvelle description (tapez \\n pour un retour à la ligne)')
            .setMaxLength(descriptionLength),
        )
        .addStringOption((option) =>
          option.setName('image').setDescription("Nouvelle adresse d'image, ou « aucune » pour la retirer"),
        )
        .addIntegerOption((option) =>
          option.setName('rappel').setDescription('Nouveau rappel automatique').addChoices(...REMINDER_CHOICES),
        )
        .addIntegerOption((option) =>
          option
            .setName('places')
            .setDescription('Nouveau nombre maximal de participants (0 = illimité)')
            .setMinValue(0)
            .setMaxValue(capacity.max),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Supprime un événement et son annonce.')
        .addStringOption((option) =>
          option.setName('evenement').setDescription('Événement à supprimer').setRequired(true).setAutocomplete(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageEvents],
  cooldown: 5,

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const events = await listEditableEvents(interaction.guildId, 50);
    await interaction.respond(
      events
        .filter((event) => event.title.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((event) => ({
          name: truncate(`${hasEventStarted(event) ? '⚪' : '🟢'} ${event.title}`, 100),
          value: String(event.id),
        })),
    );
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      const title = clean(interaction.options.getString('titre', true));
      if (!title) throw new BotError('Le titre ne peut pas être vide.');
      const channel =
        interaction.options.getChannel('salon', false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]) ??
        interaction.channel;
      if (!channel?.isTextBased() || channel.isDMBased()) {
        throw new BotError("L'annonce ne peut pas être publiée dans ce type de salon.");
      }
      // Les permissions de la commande valent pour le salon courant : le membre doit aussi pouvoir écrire dans le salon visé.
      assertMemberCanAccess(interaction.member, channel, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]);
      await assertEventChannel(interaction.guild, channel);

      const { date, timezone } = await resolveFutureDate(guildId, interaction.options.getString('date', true), DATE_LIMITS);
      if ((await countUpcomingEvents(guildId, new Date())) >= EVENT_LIMITS.upcomingPerGuild) {
        throw new BotError(`Un serveur ne peut pas avoir plus de ${EVENT_LIMITS.upcomingPerGuild} événements à venir.`);
      }
      const image = interaction.options.getString('image');
      const reminderMinutes = interaction.options.getInteger('rappel') ?? DEFAULT_REMINDER_MINUTES;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const event = await createEvent({
        guildId,
        channelId: channel.id,
        creatorId: interaction.user.id,
        title,
        description: multiline(interaction.options.getString('description') ?? ''),
        imageUrl: image ? parseImageUrl(image) : null,
        startsAt: date,
        capacity: interaction.options.getInteger('places'),
        reminderAt: computeReminderAt(date, reminderMinutes),
      });

      let message;
      try {
        const participation = { going: [], declined: 0 };
        message = await channel.send({
          embeds: [buildEventEmbed(event, participation)],
          components: buildEventButtons(event, participation),
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        // Rien n'a été publié : l'événement n'est pas conservé.
        await deleteEvent(guildId, event.id);
        throw error;
      }
      await setEventMessage(event.id, message.id);

      const reminderNote =
        reminderMinutes === 0
          ? 'Aucun rappel automatique.'
          : event.reminderAt
            ? 'Les participants seront mentionnés lors du rappel.'
            : "Pas de rappel : il tomberait avant maintenant.";
      await interaction.editReply({
        embeds: [
          successEmbed(
            `Événement **${event.title}** publié dans ${channel}. [Voir l'annonce](${message.url})\nDate comprise : **${formatDateIn(date, timezone)}** (${timezone}).\n${reminderNote}`,
          ),
        ],
      });
      return;
    }

    const event = await requireEvent(guildId, interaction.options.getString('evenement', true));

    if (subcommand === 'edit') {
      const data: EventUpdate = {};
      const title = interaction.options.getString('titre');
      if (title !== null) {
        data.title = clean(title);
        if (!data.title) throw new BotError('Le titre ne peut pas être vide.');
      }
      const description = interaction.options.getString('description');
      if (description !== null) data.description = multiline(description);
      const image = interaction.options.getString('image');
      if (image !== null) data.imageUrl = /^aucune?$/i.test(image.trim()) ? null : parseImageUrl(image);
      const places = interaction.options.getInteger('places');
      if (places !== null) data.capacity = places === 0 ? null : places;

      const dateInput = interaction.options.getString('date');
      const reminderMinutes = interaction.options.getInteger('rappel');
      let dateNote = '';
      if (dateInput !== null || reminderMinutes !== null) {
        let startsAt = event.startsAt;
        if (dateInput !== null) {
          const resolved = await resolveFutureDate(guildId, dateInput, DATE_LIMITS);
          startsAt = resolved.date;
          data.startsAt = startsAt;
          dateNote = `\nNouvelle date : **${formatDateIn(startsAt, resolved.timezone)}** (${resolved.timezone}).`;
        } else if (hasEventStarted(event)) {
          throw new BotError('Cet événement a déjà commencé : indiquez aussi une nouvelle date pour modifier son rappel.');
        }
        // Sans nouveau choix, le délai de rappel d'origine est conservé par rapport à la nouvelle date.
        const minutes =
          reminderMinutes ??
          (event.reminderAt ? Math.round((event.startsAt.getTime() - event.reminderAt.getTime()) / 60_000) : 0);
        data.reminderAt = computeReminderAt(startsAt, minutes);
      }

      if (Object.keys(data).length === 0) throw new BotError('Indiquez au moins une modification.');
      if (data.capacity != null) {
        const { going } = await getParticipation(event.id);
        if (going.length > data.capacity) {
          throw new BotError(
            `${going.length} membres sont déjà inscrits : le nombre de places ne peut pas être inférieur.`,
          );
        }
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const updated = await updateEvent(guildId, event.id, data);
      const refreshed = await refreshEventMessage(interaction.guild, updated);
      const url = eventUrl(updated);
      await interaction.editReply({
        embeds: [
          successEmbed(
            `Événement **${updated.title}** mis à jour.${dateNote}${refreshed && url ? ` [Voir l'annonce](${url})` : "\nSon annonce est introuvable (supprimée ?) : elle n'a pas pu être mise à jour."}`,
          ),
        ],
      });
      return;
    }

    const { going } = await getParticipation(event.id);
    const click = await confirm(
      interaction,
      `Supprimer l'événement **${event.title}** et son annonce ?${going.length > 0 ? `\n${going.length} membre(s) y sont inscrits ; ils ne seront pas prévenus.` : ''}`,
      'Supprimer',
    );
    if (!click) return;
    await deleteEvent(guildId, event.id);
    await deleteEventMessage(interaction.guild, event);
    await click.editReply({ embeds: [successEmbed(`Événement **${event.title}** supprimé.`)], components: [] });
  },
};

export default command;
