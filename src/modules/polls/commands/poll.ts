import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countOpenPollsBy,
  createPoll,
  deletePoll,
  getPollResults,
  listRecentPolls,
  setPollMessage,
} from '../../../core/database/repositories/polls.repository';
import { BotError } from '../../../core/errors/BotError';
import type { Command } from '../../../types';
import { formatDuration, parseDuration } from '../../../utils/duration';
import { truncate } from '../../../utils/format';
import { requirePoll, canManagePoll } from '../services/poll.service';
import { buildPollButtons, buildPollEmbed, isPollClosed, POLL_LIMITS } from '../services/presenter';

const OPTION_NAMES = Array.from({ length: POLL_LIMITS.maxOptions }, (_, index) => `choix${index + 1}`);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crée un sondage ou affiche ses résultats.')
    .addSubcommand((sub) => {
      sub
        .setName('create')
        .setDescription('Crée un sondage à boutons dans ce salon.')
        .addStringOption((option) =>
          option
            .setName('question')
            .setDescription('Question du sondage')
            .setMaxLength(POLL_LIMITS.questionLength)
            .setRequired(true),
        );
      OPTION_NAMES.forEach((name, index) => {
        sub.addStringOption((option) =>
          option
            .setName(name)
            .setDescription(`Réponse n°${index + 1}`)
            .setMaxLength(POLL_LIMITS.optionLength)
            .setRequired(index < POLL_LIMITS.minOptions),
        );
      });
      return sub
        .addStringOption((option) =>
          option.setName('duree').setDescription('Durée : 30m, 2h, 3j... (24 heures par défaut, 30 jours au plus)'),
        )
        .addBooleanOption((option) =>
          option.setName('multiple').setDescription('Autoriser plusieurs réponses par personne'),
        )
        .addBooleanOption((option) =>
          option.setName('masquer').setDescription("N'afficher les résultats qu'à la clôture"),
        );
    })
    .addSubcommand((sub) =>
      sub
        .setName('results')
        .setDescription("Affiche les résultats d'un sondage du serveur.")
        .addStringOption((option) =>
          option.setName('sondage').setDescription('Sondage à consulter').setRequired(true).setAutocomplete(true),
        ),
    ),
  // Le message du sondage est relu puis modifié à chaque vote et à la clôture.
  botPermissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
  ],
  cooldown: 15,

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const polls = await listRecentPolls(interaction.guildId, 50);
    await interaction.respond(
      polls
        .filter((poll) => poll.question.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((poll) => ({
          name: truncate(`${isPollClosed(poll) ? '🔒' : '🟢'} ${poll.question}`, 100),
          value: String(poll.id),
        })),
    );
  },

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (interaction.options.getSubcommand() === 'results') {
      const raw = interaction.options.getString('sondage', true);
      if (!/^\d{1,9}$/.test(raw)) throw new BotError('Sondage introuvable. Choisissez-le dans la liste proposée.');
      const poll = await requirePoll(guildId, raw);
      if (poll.hideResults && !isPollClosed(poll) && !canManagePoll(interaction.member, poll)) {
        throw new BotError('Les résultats de ce sondage seront affichés à sa clôture.');
      }
      const embed = buildPollEmbed(poll, await getPollResults(poll.id), true);
      if (poll.messageId) {
        embed.setURL(`https://discord.com/channels/${guildId}/${poll.channelId}/${poll.messageId}`);
      }
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
    const question = clean(interaction.options.getString('question', true));
    const options = OPTION_NAMES.map((name) => clean(interaction.options.getString(name) ?? '')).filter(Boolean);
    if (!question) throw new BotError('La question ne peut pas être vide.');
    if (options.length < POLL_LIMITS.minOptions) {
      throw new BotError(`Un sondage doit proposer au moins ${POLL_LIMITS.minOptions} réponses.`);
    }
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      throw new BotError('Chaque réponse du sondage doit être différente.');
    }

    const durationInput = interaction.options.getString('duree');
    const duration = durationInput ? parseDuration(durationInput) : POLL_LIMITS.defaultDurationSeconds;
    if (duration === null) throw new BotError('Durée invalide. Exemples : `30m`, `2h`, `3j`.');
    if (duration < POLL_LIMITS.minDurationSeconds || duration > POLL_LIMITS.maxDurationSeconds) {
      throw new BotError(
        `La durée doit être comprise entre ${formatDuration(POLL_LIMITS.minDurationSeconds)} et ${formatDuration(POLL_LIMITS.maxDurationSeconds)}.`,
      );
    }
    if ((await countOpenPollsBy(guildId, interaction.user.id)) >= POLL_LIMITS.openPerMember) {
      throw new BotError(
        `Vous avez déjà ${POLL_LIMITS.openPerMember} sondages en cours sur ce serveur. Closez-en un avant d'en créer un autre.`,
      );
    }

    // Le sondage est enregistré avant d'être publié : ses boutons portent son identifiant.
    const poll = await createPoll({
      guildId,
      channelId: interaction.channelId,
      authorId: interaction.user.id,
      question,
      options,
      multiple: interaction.options.getBoolean('multiple') ?? false,
      hideResults: interaction.options.getBoolean('masquer') ?? false,
      endsAt: new Date(Date.now() + duration * 1000),
    });

    try {
      const response = await interaction.reply({
        embeds: [buildPollEmbed(poll, { counts: new Map(), voters: 0 })],
        components: buildPollButtons(poll),
        // Ni la question ni les réponses ne peuvent mentionner qui que ce soit.
        allowedMentions: { parse: [] },
        withResponse: true,
      });
      const messageId = response.resource?.message?.id;
      if (!messageId) throw new Error('Message du sondage introuvable après publication');
      await setPollMessage(poll.id, messageId);
    } catch (error) {
      // Rien n'a été publié : le sondage n'est pas conservé.
      await deletePoll(poll.id);
      throw error;
    }
  },
};

export default command;
