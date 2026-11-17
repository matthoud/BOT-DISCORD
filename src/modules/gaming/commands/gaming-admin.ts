import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { GamingConfig, GamingOfferKind } from '@prisma/client';
import {
  countAnnouncements,
  getGamingConfig,
  listAvailableOffers,
  saveGamingConfig,
  skipOffers,
  type GamingConfigUpdate,
} from '../../../core/database/repositories/gaming.repository';
import { isModuleEnabled } from '../../../core/database/repositories/module.repository';
import { BotError } from '../../../core/errors/BotError';
import { baseEmbed, Colors, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { assertMemberCanAccess } from '../../../utils/interaction';
import { rejectReason, toCents } from '../services/filters';
import {
  announceOffers,
  assertChannel,
  MAX_ANNOUNCES_PER_RUN,
  providerInfo,
} from '../services/offers.service';
import { buildOfferMessage, formatWorth, KIND_LABELS, MODULE_ID } from '../services/presenter';
import { parseStoreList, STORE_KEYS, STORES } from '../services/stores';

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;
const KIND_OPTIONS: [string, GamingOfferKind][] = [
  ['jeux', 'GAME'],
  ['dlc', 'DLC'],
  ['beta', 'BETA'],
  ['autres', 'OTHER'],
];

function describeConfig(config: GamingConfig): string {
  const usd = (cents: number) => formatWorth(cents, 'USD');
  return [
    `**Salon des jeux** : ${config.channelId ? `<#${config.channelId}>` : 'non configuré'}`,
    `**Salon des DLC, bêtas et autres** : ${config.extrasChannelId ? `<#${config.extrasChannelId}>` : 'même salon'}`,
    `**Types annoncés** : ${config.kinds.map((kind) => KIND_LABELS[kind]).join(', ') || 'aucun'}`,
    `**Boutiques** : ${config.stores.length > 0 ? config.stores.map((store) => STORES[store as keyof typeof STORES]?.short ?? store).join(', ') : 'toutes'}`,
    `**Valeur minimale** : ${config.minWorthCents > 0 ? usd(config.minWorthCents) : 'aucune'}`,
    `**Mention** : ${
      config.mentionRoleId
        ? `<@&${config.mentionRoleId}> pour les jeux${config.mentionMinCents > 0 ? ` d'au moins ${usd(config.mentionMinCents)}` : ''}`
        : 'désactivée'
    }`,
    `**État** : ${config.paused ? '⏸️ En pause' : '🟢 Actif'}`,
  ].join('\n');
}

async function requireConfig(guildId: string): Promise<GamingConfig> {
  const config = await getGamingConfig(guildId);
  if (!config?.channelId)
    throw new BotError("Le module n'est pas encore configuré : utilisez `/gaming-admin setup`.");
  return config;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gaming-admin')
    .setDescription('Configure les annonces de jeux et contenus gratuits.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Choisit les salons des annonces et les active.')
        .addChannelOption((option) =>
          option
            .setName('salon')
            .setDescription('Salon des jeux offerts')
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('salon-extras')
            .setDescription('Salon des DLC, bêtas et autres offres (même salon par défaut)')
            .addChannelTypes(...TEXT_CHANNELS),
        )
        .addBooleanOption((option) =>
          option
            .setName('annoncer-actuelles')
            .setDescription(
              `Publier aussi les offres déjà en cours (${MAX_ANNOUNCES_PER_RUN * 2} au plus)`,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('config').setDescription('Affiche la configuration des annonces.'),
    )
    .addSubcommand((sub) => {
      sub
        .setName('filters')
        .setDescription('Choisit les types, boutiques et valeur minimale des offres annoncées.');
      for (const [name, kind] of KIND_OPTIONS) {
        sub.addBooleanOption((option) =>
          option.setName(name).setDescription(`Annoncer : ${KIND_LABELS[kind]}`),
        );
      }
      return sub
        .addStringOption((option) =>
          option
            .setName('boutiques')
            .setDescription(
              `Liste séparée par des virgules, ou « toutes » (${STORE_KEYS.slice(0, 5).join(', ')}…)`,
            )
            .setMaxLength(200),
        )
        .addNumberOption((option) =>
          option
            .setName('valeur-min')
            .setDescription('Valeur minimale en dollars US selon la source (0 = toutes)')
            .setMinValue(0)
            .setMaxValue(1000),
        );
    })
    .addSubcommand((sub) =>
      sub
        .setName('mention')
        .setDescription(
          'Mentionne un rôle pour les jeux offerts intéressants (désactivé par défaut).',
        )
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à mentionner'))
        .addNumberOption((option) =>
          option
            .setName('valeur-min')
            .setDescription('Valeur minimale du jeu en dollars US (0 = tous les jeux)')
            .setMinValue(0)
            .setMaxValue(1000),
        )
        .addBooleanOption((option) =>
          option.setName('desactiver').setDescription('Ne plus mentionner de rôle'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Montre une annonce telle qu’elle serait publiée, sans rien publier.'),
    )
    .addSubcommand((sub) => sub.setName('pause').setDescription('Suspend les annonces.'))
    .addSubcommand((sub) => sub.setName('resume').setDescription('Reprend les annonces.')),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channels: GuildTextBasedChannel[] = [];
      for (const name of ['salon', 'salon-extras']) {
        const channel = interaction.options.getChannel(name, name === 'salon', [...TEXT_CHANNELS]);
        if (!channel) continue;
        assertMemberCanAccess(interaction.member, channel, [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ]);
        await assertChannel(interaction.guild, channel);
        channels.push(channel);
      }
      const [main, extras] = channels;
      if (!main) throw new BotError('Salon introuvable.');
      const publishCurrent = interaction.options.getBoolean('annoncer-actuelles') ?? false;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const config = await saveGamingConfig(guildId, {
        channelId: main.id,
        extrasChannelId: extras && extras.id !== main.id ? extras.id : null,
        paused: false,
        announceSince: new Date(),
      });

      let note =
        'Seules les nouvelles offres seront annoncées. `/gaming free` liste celles en cours.';
      if (publishCurrent) {
        const available = (await listAvailableOffers()).filter(
          (offer) => rejectReason(offer, config) === null,
        );
        const posted = await announceOffers(
          interaction.guild,
          config,
          available.slice(0, MAX_ANNOUNCES_PER_RUN * 2).reverse(),
        );
        // Les offres en cours non publiées ne le seront pas plus tard.
        await skipOffers(
          guildId,
          available.map((offer) => offer.id),
        );
        note = `${posted} offre(s) en cours publiée(s). Les suivantes seront annoncées à leur apparition.`;
      }
      const enabled = await isModuleEnabled(guildId, MODULE_ID);
      await interaction.editReply({
        embeds: [
          successEmbed(
            `Annonces gaming configurées.\n\n${describeConfig(config)}\n\n${note}${enabled ? '' : '\n\n⚠️ Le module est désactivé : activez-le avec `/module enable`.'}`,
          ),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'config') {
      const config = await requireConfig(guildId);
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('🎮 Configuration des annonces gaming')
            .setDescription(
              `${describeConfig(config)}\n\n${await countAnnouncements(guildId)} offre(s) publiée(s) sur ce serveur.`,
            )
            .setFooter({
              text: 'Valeurs en dollars US : celles annoncées par la source, jamais converties.',
            }),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'filters') {
      const config = await requireConfig(guildId);
      const data: GamingConfigUpdate = {};
      const kinds = new Set(config.kinds);
      let kindsChanged = false;
      for (const [name, kind] of KIND_OPTIONS) {
        const value = interaction.options.getBoolean(name);
        if (value === null) continue;
        kindsChanged = true;
        if (value) kinds.add(kind);
        else kinds.delete(kind);
      }
      if (kindsChanged) {
        if (kinds.size === 0)
          throw new BotError(
            "Gardez au moins un type d'offre, ou mettez les annonces en pause avec `/gaming-admin pause`.",
          );
        data.kinds = KIND_OPTIONS.map(([, kind]) => kind).filter((kind) => kinds.has(kind));
      }
      const stores = interaction.options.getString('boutiques');
      if (stores !== null) {
        const parsed = parseStoreList(stores);
        if ('error' in parsed) throw new BotError(parsed.error);
        data.stores = parsed.values;
      }
      const minWorth = interaction.options.getNumber('valeur-min');
      if (minWorth !== null) {
        const cents = toCents(minWorth);
        if (cents === null) throw new BotError('Valeur minimale invalide.');
        data.minWorthCents = cents;
      }
      const updated = Object.keys(data).length > 0 ? await saveGamingConfig(guildId, data) : config;
      await interaction.reply({
        embeds: [
          baseEmbed(Object.keys(data).length > 0 ? Colors.success : Colors.info)
            .setTitle('🔎 Filtres des annonces gaming')
            .setDescription(describeConfig(updated))
            .setFooter({ text: `Boutiques possibles : ${STORE_KEYS.join(', ')}` }),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'mention') {
      await requireConfig(guildId);
      const role = interaction.options.getRole('role');
      const disable = interaction.options.getBoolean('desactiver') ?? false;
      const minWorth = interaction.options.getNumber('valeur-min');
      if (role && disable) throw new BotError('Choisissez soit un rôle, soit « desactiver ».');
      const data: GamingConfigUpdate = {};
      if (disable) data.mentionRoleId = null;
      if (role) {
        if (role.id === guildId)
          throw new BotError('Le rôle @everyone ne peut pas être mentionné.');
        if (role.managed)
          throw new BotError(
            'Ce rôle est géré par une intégration : il ne peut pas être mentionné.',
          );
        data.mentionRoleId = role.id;
      }
      if (minWorth !== null) data.mentionMinCents = toCents(minWorth) ?? 0;
      if (Object.keys(data).length === 0)
        throw new BotError('Indiquez un rôle, une valeur minimale ou « desactiver ».');
      const updated = await saveGamingConfig(guildId, data);
      await interaction.reply({
        embeds: [successEmbed(describeConfig(updated))],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (subcommand === 'test') {
      const config = (await getGamingConfig(guildId)) ?? {
        guildId,
        channelId: null,
        extrasChannelId: null,
        kinds: ['GAME'] as GamingOfferKind[],
        stores: [],
        minWorthCents: 0,
        mentionRoleId: null,
        mentionMinCents: 0,
        paused: false,
        announceSince: new Date(),
        updatedAt: new Date(),
      };
      const available = await listAvailableOffers();
      const offer = available.find((candidate) => rejectReason(candidate, config) === null);
      if (!offer) {
        throw new BotError(
          available.length === 0
            ? "Aucune offre n'est disponible pour le moment (voir `/gaming sources`)."
            : `Aucune des ${available.length} offres en cours ne passe vos filtres.`,
        );
      }
      const message = buildOfferMessage(
        offer,
        providerInfo(offer.provider),
        interaction.guild,
        config,
      );
      await interaction.reply({
        content: `Aperçu, rien n'a été publié.${message.content ? ` Le rôle serait mentionné : ${message.content}` : ''}`,
        embeds: message.embeds,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const config = await requireConfig(guildId);
    const paused = subcommand === 'pause';
    if (config.paused === paused)
      throw new BotError(
        paused ? 'Les annonces sont déjà en pause.' : 'Les annonces ne sont pas en pause.',
      );
    // À la reprise, les offres apparues pendant la pause ne sont pas publiées d'un coup.
    await saveGamingConfig(guildId, paused ? { paused } : { paused, announceSince: new Date() });
    await interaction.reply({
      embeds: [
        successEmbed(
          paused
            ? 'Annonces gaming en pause. Reprenez-les avec `/gaming-admin resume`.'
            : 'Annonces gaming reprises : les prochaines nouvelles offres seront publiées. `/gaming free` liste celles apparues pendant la pause.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
