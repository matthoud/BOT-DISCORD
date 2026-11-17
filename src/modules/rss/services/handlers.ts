import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type Role,
} from 'discord.js';
import { Prisma, type RssStyle } from '@prisma/client';
import {
  countFeeds,
  countFeedsInCategory,
  createCategory,
  createFeed,
  deleteCategory,
  deleteFeed,
  getCategory,
  getFeed,
  listCategories,
  listFeeds,
  recordCheckSuccess,
  setFeedPaused,
  updateCategory,
  updateFeed,
  type FeedUpdate,
  type FeedWithCategory,
} from '../../../core/database/repositories/rss.repository';
import { BotError } from '../../../core/errors/BotError';
import { HttpError } from '../../../core/http/errors';
import { parseExternalUrl } from '../../../core/http/network';
import { confirm } from '../../../core/ui/confirm';
import { baseEmbed, Colors, successEmbed, warningEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import { timestamp, truncate } from '../../../utils/format';
import { assertMemberCanAccess } from '../../../utils/interaction';
import {
  BUILTIN_CATEGORIES,
  categoryOf,
  DEFAULT_CATEGORY,
  formatColor,
  parseCategoryChoice,
  parseColor,
  parseEmoji,
  STYLE_LABELS,
  type CategoryDisplay,
} from './categories';
import {
  assertFeedChannel,
  claimAndCheck,
  MAX_POSTS_PER_CHECK,
  publishItem,
  resolveFeedChannel,
  selectNewItems,
} from './feed.service';
import { FeedFetchError, fetchFeed, type FetchResult } from './fetcher';
import { evaluateItem, hasFilters, parseList, type FeedFilters } from './filters';
import { newestItem, type FeedItem } from './parser';
import { buildArticleEmbed, formatInterval, RSS_LIMITS, safeText } from './presenter';

type Interaction = ChatInputCommandInteraction<'cached'>;

const REFRESH_COOLDOWN_MS = 60_000;
const LIST_PAGE_SIZE = 8;
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ Utilitaires */

/** Flux du serveur, ou une `BotError` s'il n'existe pas (ou plus). */
export async function requireFeed(
  guildId: string,
  rawId: string | null | undefined,
): Promise<FeedWithCategory> {
  const feed = /^\d{1,9}$/.test(rawId ?? '') ? await getFeed(guildId, Number(rawId)) : null;
  if (!feed) throw new BotError('Flux introuvable. Choisissez-le dans la liste proposée.');
  return feed;
}

function readUrl(raw: string): string {
  try {
    return parseExternalUrl(raw.trim()).toString();
  } catch (error) {
    throw new BotError(
      error instanceof HttpError ? error.message : "L'adresse du flux est invalide.",
    );
  }
}

/** Télécharge un flux pour l'ajouter ou le tester ; les erreurs deviennent des messages lisibles. */
async function downloadFeed(url: string): Promise<Extract<FetchResult, { status: 'ok' }>> {
  try {
    const result = await fetchFeed(url, { discover: true });
    if (result.status !== 'ok') throw new FeedFetchError("Le site n'a renvoyé aucun contenu.");
    return result;
  } catch (error) {
    if (error instanceof FeedFetchError)
      throw new BotError(`Impossible d'utiliser ce flux : ${error.message}`);
    throw error;
  }
}

async function resolveCategory(
  guildId: string,
  raw: string | null,
): Promise<Pick<FeedUpdate, 'category' | 'customCategoryId'> | null> {
  if (raw === null) return null;
  const choice = parseCategoryChoice(raw);
  if (choice?.kind === 'builtin') return { category: choice.key, customCategoryId: null };
  if (choice?.kind === 'custom' && (await getCategory(guildId, choice.id))) {
    return { category: DEFAULT_CATEGORY, customCategoryId: choice.id };
  }
  throw new BotError('Catégorie introuvable. Choisissez-la dans la liste proposée.');
}

async function requireCustomCategory(guildId: string, raw: string | null) {
  const choice = parseCategoryChoice(raw ?? '');
  const category = choice?.kind === 'custom' ? await getCategory(guildId, choice.id) : null;
  if (!category)
    throw new BotError(
      'Catégorie personnalisée introuvable. Choisissez-la dans la liste proposée.',
    );
  return category;
}

/** Salon visé par une commande : le membre et le bot doivent pouvoir y écrire. */
async function resolveTargetChannel(
  interaction: Interaction,
  required: boolean,
): Promise<GuildTextBasedChannel | null> {
  const option = interaction.options.getChannel('salon', false, [...TEXT_CHANNELS]);
  const channel = option ?? (required ? interaction.channel : null);
  if (!channel) return null;
  if (!channel.isTextBased() || channel.isDMBased()) {
    throw new BotError('Les articles ne peuvent pas être publiés dans ce type de salon.');
  }
  assertMemberCanAccess(interaction.member, channel, [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ]);
  await assertFeedChannel(interaction.guild, channel);
  return channel;
}

/** Rôle à mentionner : jamais @everyone ni un rôle géré par une intégration. */
function validateMentionRole(interaction: Interaction, role: Role | null): string | null {
  if (!role) return null;
  if (role.id === interaction.guildId)
    throw new BotError('Le rôle @everyone ne peut pas être mentionné par un flux.');
  if (role.managed)
    throw new BotError('Ce rôle est géré par une intégration : il ne peut pas être mentionné.');
  return role.id;
}

function mentionWarning(
  interaction: Interaction,
  roleId: string | null,
  channel: GuildTextBasedChannel | null,
): string {
  if (!roleId || !channel) return '';
  const role = interaction.guild.roles.cache.get(roleId);
  const me = interaction.guild.members.me;
  if (
    role &&
    !role.mentionable &&
    me &&
    !channel.permissionsFor(me).has(PermissionFlagsBits.MentionEveryone)
  ) {
    return `\n⚠️ Le rôle ${role} n'est pas mentionnable et je n'ai pas la permission « Mentionner @everyone » : il ne sera pas notifié.`;
  }
  return '';
}

function describeState(feed: FeedWithCategory): string {
  if (feed.paused)
    return feed.pausedReason ? `⏸️ Suspendu automatiquement : ${feed.pausedReason}` : '⏸️ En pause';
  if (feed.consecutiveFailures > 0)
    return `⚠️ En échec (${feed.consecutiveFailures} fois) : ${feed.lastError ?? 'erreur inconnue'}`;
  return '🟢 Actif';
}

function stateIcon(feed: FeedWithCategory): string {
  if (feed.paused) return '⏸️';
  return feed.consecutiveFailures > 0 ? '⚠️' : '🟢';
}

function categoryLabel(category: CategoryDisplay): string {
  return `${category.emoji} ${category.name}`;
}

function describeFilters(filters: FeedFilters): string {
  if (!hasFilters(filters)) return 'Aucun : tous les articles sont publiés.';
  const line = (label: string, values: string[]) =>
    values.length > 0
      ? `**${label}** : ${values.map((value) => `\`${value.replace(/`/g, "'")}\``).join(', ')}`
      : null;
  return [
    line('Inclure', filters.includeKeywords),
    line('Exclure', filters.excludeKeywords),
    line('Prioritaires', filters.priorityKeywords),
    line('Auteurs ignorés', filters.ignoredAuthors),
    line('Catégories exigées', filters.categoryFilter),
  ]
    .filter(Boolean)
    .join('\n');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/* --------------------------------------------------------------------- Flux */

export async function handleAdd(interaction: Interaction): Promise<void> {
  const url = readUrl(interaction.options.getString('url', true));
  const channel = await resolveTargetChannel(interaction, true);
  if (!channel) throw new BotError('Salon de publication introuvable.');
  const mentionRoleId = validateMentionRole(interaction, interaction.options.getRole('mention'));
  if ((await countFeeds(interaction.guildId)) >= RSS_LIMITS.feedsPerGuild) {
    throw new BotError(
      `Un serveur ne peut pas suivre plus de ${RSS_LIMITS.feedsPerGuild} flux. Supprimez-en un avec \`/rss remove\`.`,
    );
  }
  const category = (await resolveCategory(
    interaction.guildId,
    interaction.options.getString('categorie'),
  )) ?? {
    category: DEFAULT_CATEGORY,
    customCategoryId: null,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await downloadFeed(url);
  const { feed: parsed } = result;
  const fallbackName = new URL(result.url).hostname;
  const name = truncate(
    clean(interaction.options.getString('nom') ?? '') || parsed.title || fallbackName,
    RSS_LIMITS.nameLength,
  );

  let feed: FeedWithCategory;
  try {
    feed = await createFeed(
      {
        guildId: interaction.guildId,
        channelId: channel.id,
        url: result.url,
        name,
        siteUrl: parsed.siteUrl,
        iconUrl: parsed.iconUrl,
        category: category.category ?? DEFAULT_CATEGORY,
        customCategoryId: category.customCategoryId ?? null,
        intervalMinutes:
          interaction.options.getInteger('intervalle') ?? RSS_LIMITS.defaultIntervalMinutes,
        showSummary: interaction.options.getBoolean('resume') ?? true,
        showImage: interaction.options.getBoolean('image') ?? true,
        mentionRoleId,
        creatorId: interaction.user.id,
        etag: result.validators.etag,
        lastModified: result.validators.lastModified,
      },
      [...new Set(parsed.items.flatMap((item) => item.keys))],
      RSS_LIMITS.feedsPerGuild,
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new BotError('Ce flux est déjà publié dans ce salon.');
    throw error;
  }

  // Le plus récent est publié pour montrer le rendu ; les autres sont mémorisés sans être publiés.
  const newest = newestItem(parsed.items);
  let publishNote =
    "Le flux ne contient aucun article pour l'instant : le prochain sera publié dès sa parution.";
  if (newest) {
    try {
      await publishItem(channel, feed, newest);
      await recordCheckSuccess(feed.id, { nextCheckAt: feed.nextCheckAt, posted: 1 });
      publishNote = `Le dernier article a été publié dans ${channel} ; les ${parsed.items.length - 1} autres sont considérés comme déjà lus.`;
    } catch {
      publishNote = `⚠️ Le dernier article n'a pas pu être publié dans ${channel}. Vérifiez mes permissions.`;
    }
  }

  const discovered =
    result.url !== url ? `\nCette page annonçait un flux : j'utilise <${result.url}>.` : '';
  await interaction.editReply({
    embeds: [
      successEmbed(
        `Flux **${safeText(feed.name, 100)}** (${parsed.format}, ${parsed.items.length} article(s)) ajouté dans ${channel}.${discovered}\n` +
          `Catégorie : ${categoryLabel(categoryOf(feed))} · vérification toutes les ${formatInterval(feed.intervalMinutes)}.\n` +
          `${publishNote}\nAffinez la sélection avec \`/rss filters\`.${mentionWarning(interaction, mentionRoleId, channel)}`,
      ),
    ],
  });
}

export async function handleRemove(interaction: Interaction): Promise<void> {
  const feed = await requireFeed(interaction.guildId, interaction.options.getString('flux'));
  const click = await confirm(
    interaction,
    `Supprimer le flux **${safeText(feed.name, 100)}** (publié dans <#${feed.channelId}>) ?\nLes articles déjà publiés restent dans le salon.`,
    'Supprimer',
  );
  if (!click) return;
  await deleteFeed(interaction.guildId, feed.id);
  await click.editReply({
    embeds: [successEmbed(`Flux **${safeText(feed.name, 100)}** supprimé.`)],
    components: [],
  });
}

export async function handleList(interaction: Interaction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const feeds = await listFeeds(interaction.guildId);
  const title = `📡 Flux RSS — ${feeds.length} / ${RSS_LIMITS.feedsPerGuild}`;
  if (feeds.length === 0) {
    await interaction.editReply({
      embeds: [
        baseEmbed()
          .setTitle(title)
          .setDescription('Aucun flux pour le moment. Ajoutez-en un avec `/rss add`.'),
      ],
    });
    return;
  }
  await paginate(interaction, Math.ceil(feeds.length / LIST_PAGE_SIZE), async (page) => {
    const lines = feeds.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE).map((feed) => {
      const category = categoryOf(feed);
      const last = feed.lastPostAt
        ? `dernier article ${timestamp(feed.lastPostAt, 'R')}`
        : 'aucun article publié';
      const error =
        !feed.paused && feed.consecutiveFailures > 0
          ? `\n└ ⚠️ ${truncate(feed.lastError ?? 'erreur', 120)}`
          : '';
      return `${stateIcon(feed)} **${safeText(feed.name, 80)}** · <#${feed.channelId}>\n${category.emoji} ${category.name} · toutes les ${formatInterval(feed.intervalMinutes)} · ${last}${error}`;
    });
    return baseEmbed()
      .setTitle(title)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: '🟢 actif · ⏸️ en pause · ⚠️ en échec — détails avec /rss info' });
  });
}

export async function handleInfo(interaction: Interaction): Promise<void> {
  const feed = await requireFeed(interaction.guildId, interaction.options.getString('flux'));
  const category = categoryOf(feed);
  const when = (date: Date | null) =>
    date ? `${timestamp(date, 'f')} (${timestamp(date, 'R')})` : 'jamais';
  const embed = baseEmbed(category.color)
    .setTitle(
      `${category.emoji.startsWith('<') ? '📡' : category.emoji} ${safeText(feed.name, 200)}`,
    )
    .setDescription(`<${feed.url}>`)
    .addFields(
      { name: 'État', value: truncate(describeState(feed), 1024) },
      { name: 'Salon', value: `<#${feed.channelId}>`, inline: true },
      {
        name: 'Catégorie',
        value: `${categoryLabel(category)}\n${STYLE_LABELS[category.style]}`,
        inline: true,
      },
      {
        name: 'Vérification',
        value: `Toutes les ${formatInterval(feed.intervalMinutes)}`,
        inline: true,
      },
      {
        name: 'Présentation',
        value: `Résumé : ${feed.showSummary ? 'oui' : 'non'} · Image : ${feed.showImage ? 'oui' : 'non'}\nMention : ${
          feed.mentionRoleId
            ? `<@&${feed.mentionRoleId}>${feed.priorityKeywords.length > 0 ? ' (articles prioritaires seulement)' : ''}`
            : 'aucune'
        }`,
      },
      { name: 'Filtres', value: truncate(describeFilters(feed), 1024) },
      {
        name: 'Activité',
        value: [
          `Dernière vérification : ${when(feed.lastCheckAt)}`,
          `Dernier succès : ${when(feed.lastSuccessAt)}`,
          `Dernier article publié : ${when(feed.lastPostAt)}`,
          feed.paused ? null : `Prochaine vérification : ${timestamp(feed.nextCheckAt, 'R')}`,
          `Articles publiés : ${feed.postCount}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    )
    .setFooter({ text: `Flux n°${feed.id} · ajouté par un administrateur` });
  if (feed.siteUrl) embed.setURL(feed.siteUrl);
  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/** Aperçu sans publication : rendu du dernier article et, pour un flux enregistré, effet des filtres. */
export async function handleTest(interaction: Interaction): Promise<void> {
  const rawUrl = interaction.options.getString('url');
  const feedId = interaction.options.getString('flux');
  if (!rawUrl === !feedId)
    throw new BotError('Indiquez soit une adresse (`url`), soit un flux enregistré (`flux`).');
  const feed = feedId ? await requireFeed(interaction.guildId, feedId) : null;
  const url = feed ? feed.url : readUrl(rawUrl ?? '');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await downloadFeed(url);
  const { feed: parsed } = result;
  const display = feed ?? {
    name: parsed.title || new URL(result.url).hostname,
    siteUrl: parsed.siteUrl,
    iconUrl: parsed.iconUrl,
    showSummary: true,
    showImage: true,
    mentionRoleId: null,
    priorityKeywords: [],
  };
  const category = feed ? categoryOf(feed) : BUILTIN_CATEGORIES[DEFAULT_CATEGORY];

  const lines = [
    `Format : **${parsed.format}** · ${parsed.items.length} article(s) lu(s)`,
    `Titre : ${safeText(parsed.title || '(aucun)', 200)}`,
    result.url !== url ? `Flux découvert dans la page : <${result.url}>` : null,
  ];
  let preview: { item: FeedItem; priority: boolean } | null = null;
  if (feed) {
    // Simulation sur les derniers articles, comme s'ils étaient nouveaux (âge non pris en compte).
    const sample = parsed.items.slice(0, 5);
    lines.push('', '**Filtres appliqués aux 5 premiers articles :**');
    for (const item of sample) {
      const decision = evaluateItem(item, feed);
      lines.push(
        `${decision.publish ? (decision.priority ? '⭐' : '✅') : '🚫'} ${safeText(item.title || 'Sans titre', 90)}${decision.reason ? ` — ${decision.reason}` : ''}`,
      );
    }
    preview = selectNewItems(sample, feed, Number.POSITIVE_INFINITY).at(-1) ?? null;
    if (!preview && sample.length > 0)
      lines.push('', 'Aucun de ces articles ne serait publié avec les filtres actuels.');
  } else {
    const newest = newestItem(parsed.items);
    preview = newest ? { item: newest, priority: false } : null;
  }

  const embeds = [
    baseEmbed(Colors.info)
      .setTitle('🧪 Test du flux')
      .setDescription(lines.filter((line) => line !== null).join('\n')),
  ];
  if (preview) embeds.push(buildArticleEmbed(display, category, preview.item, preview.priority));
  await interaction.editReply({
    content: preview ? 'Aperçu ci-dessous : rien n’a été publié.' : undefined,
    embeds,
    allowedMentions: { parse: [] },
  });
}

export async function handlePause(interaction: Interaction, paused: boolean): Promise<void> {
  const feed = await requireFeed(interaction.guildId, interaction.options.getString('flux'));
  if (!(await setFeedPaused(interaction.guildId, feed.id, paused))) {
    throw new BotError(paused ? 'Ce flux est déjà en pause.' : "Ce flux n'est pas en pause.");
  }
  await interaction.reply({
    embeds: [
      successEmbed(
        paused
          ? `Flux **${safeText(feed.name, 100)}** mis en pause. Reprenez-le avec \`/rss resume\`.`
          : `Flux **${safeText(feed.name, 100)}** repris : il sera vérifié dans la minute. Les articles parus entre-temps (moins de 7 jours, ${MAX_POSTS_PER_CHECK} au plus) seront publiés.`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleRefresh(interaction: Interaction): Promise<void> {
  const feed = await requireFeed(interaction.guildId, interaction.options.getString('flux'));
  if (feed.paused) throw new BotError('Ce flux est en pause : reprenez-le avec `/rss resume`.');
  if (feed.lastCheckAt && Date.now() - feed.lastCheckAt.getTime() < REFRESH_COOLDOWN_MS) {
    throw new BotError('Ce flux vient d’être vérifié. Réessayez dans une minute.');
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const report = await claimAndCheck(interaction.client, feed.id);
  if (!report) throw new BotError('Une vérification de ce flux est déjà en cours.');
  const message = report.notModified
    ? "Le site indique que le flux n'a pas changé depuis la dernière vérification."
    : report.newItems === 0
      ? 'Aucun nouvel article.'
      : `${report.newItems} nouvel(s) article(s), ${report.posted} publié(s) dans <#${feed.channelId}>.${report.posted < report.newItems ? ' Les autres sont filtrés ou trop anciens.' : ''}`;
  await interaction.editReply({
    embeds: [successEmbed(`Flux **${safeText(feed.name, 100)}** vérifié. ${message}`)],
  });
}

export async function handleEdit(interaction: Interaction): Promise<void> {
  const feed = await requireFeed(interaction.guildId, interaction.options.getString('flux'));
  const data: FeedUpdate = {};

  const channel = await resolveTargetChannel(interaction, false);
  if (channel) data.channelId = channel.id;
  const name = interaction.options.getString('nom');
  if (name !== null) {
    data.name = truncate(clean(name), RSS_LIMITS.nameLength);
    if (!data.name) throw new BotError('Le nom ne peut pas être vide.');
  }
  Object.assign(
    data,
    await resolveCategory(interaction.guildId, interaction.options.getString('categorie')),
  );
  const interval = interaction.options.getInteger('intervalle');
  if (interval !== null) data.intervalMinutes = interval;
  const summary = interaction.options.getBoolean('resume');
  if (summary !== null) data.showSummary = summary;
  const image = interaction.options.getBoolean('image');
  if (image !== null) data.showImage = image;
  const role = interaction.options.getRole('mention');
  if (role) data.mentionRoleId = validateMentionRole(interaction, role);
  if (interaction.options.getBoolean('sans-mention')) {
    if (role) throw new BotError('Choisissez soit un rôle à mentionner, soit « sans-mention ».');
    data.mentionRoleId = null;
  }
  if (Object.keys(data).length === 0) throw new BotError('Indiquez au moins une modification.');

  let updated: FeedWithCategory;
  try {
    updated = await updateFeed(interaction.guildId, feed.id, data);
  } catch (error) {
    if (isUniqueViolation(error)) throw new BotError('Ce flux est déjà publié dans ce salon.');
    throw error;
  }
  const target =
    channel ??
    (await resolveFeedChannel(interaction.guild, updated.channelId).then((r) =>
      'channel' in r ? r.channel : null,
    ));
  await interaction.reply({
    embeds: [
      successEmbed(
        `Flux **${safeText(updated.name, 100)}** modifié : ${categoryLabel(categoryOf(updated))} · <#${updated.channelId}> · toutes les ${formatInterval(updated.intervalMinutes)}.${data.mentionRoleId ? mentionWarning(interaction, data.mentionRoleId, target) : ''}`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

const FILTER_OPTIONS = [
  ['inclure', 'includeKeywords'],
  ['exclure', 'excludeKeywords'],
  ['prioritaires', 'priorityKeywords'],
  ['auteurs', 'ignoredAuthors'],
  ['categories', 'categoryFilter'],
] as const;

export async function handleFilters(interaction: Interaction): Promise<void> {
  const feed = await requireFeed(interaction.guildId, interaction.options.getString('flux'));
  const data: FeedUpdate = {};
  for (const [option, field] of FILTER_OPTIONS) {
    const raw = interaction.options.getString(option);
    if (raw === null) continue;
    const parsed = parseList(raw);
    if ('error' in parsed) throw new BotError(`Option \`${option}\` : ${parsed.error}`);
    data[field] = parsed.values;
  }
  const updated =
    Object.keys(data).length > 0 ? await updateFeed(interaction.guildId, feed.id, data) : feed;
  const note =
    updated.mentionRoleId && updated.priorityKeywords.length > 0
      ? `\n\nLe rôle <@&${updated.mentionRoleId}> ne sera mentionné que pour les articles prioritaires.`
      : '';
  await interaction.reply({
    embeds: [
      baseEmbed(Object.keys(data).length > 0 ? Colors.success : Colors.info)
        .setTitle(`🔎 Filtres — ${safeText(updated.name, 200)}`)
        .setDescription(`${describeFilters(updated)}${note}`)
        .setFooter({
          text: 'Mots séparés par des virgules, « aucun » pour vider une liste. Casse et accents ignorés. Vérifiez l’effet avec /rss test.',
        }),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/* ------------------------------------------------------------- Configuration */

export async function handleConfigView(interaction: Interaction): Promise<void> {
  const [feeds, categories] = await Promise.all([
    listFeeds(interaction.guildId),
    listCategories(interaction.guildId),
  ]);
  const failing = feeds.filter((feed) => !feed.paused && feed.consecutiveFailures > 0).length;
  const paused = feeds.filter((feed) => feed.paused).length;
  const builtin = Object.entries(BUILTIN_CATEGORIES)
    .map(
      ([, category]) => `${category.emoji} **${category.name}** — ${STYLE_LABELS[category.style]}`,
    )
    .join('\n');
  const custom =
    categories.length === 0
      ? 'Aucune. Créez-en avec `/rss config category-add`.'
      : categories
          .map(
            (category) =>
              `${category.emoji} **${safeText(category.name, 40)}** — ${STYLE_LABELS[category.style]} · ${formatColor(category.color)}`,
          )
          .join('\n');
  await interaction.reply({
    embeds: [
      baseEmbed()
        .setTitle('⚙️ Configuration RSS')
        .addFields(
          {
            name: 'Flux',
            value: `${feeds.length} / ${RSS_LIMITS.feedsPerGuild} · ${paused} en pause · ${failing} en échec\nIntervalle minimal : ${RSS_LIMITS.minIntervalMinutes} minutes (${formatInterval(RSS_LIMITS.defaultIntervalMinutes)} par défaut)`,
          },
          { name: 'Catégories du bot', value: builtin },
          {
            name: `Catégories personnalisées (${categories.length} / ${RSS_LIMITS.customCategories})`,
            value: truncate(custom, 1024),
          },
          {
            name: 'Règles de publication',
            value: `À l'ajout, seul le dernier article est publié. Ensuite, au plus ${MAX_POSTS_PER_CHECK} nouveaux articles par vérification, de moins de 7 jours. Un article n'est jamais publié deux fois.`,
          },
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function readCategoryFields(interaction: Interaction, required: boolean) {
  const data: Partial<{ name: string; emoji: string; color: number; style: RssStyle }> = {};
  const name = interaction.options.getString('nom', required);
  if (name !== null) {
    data.name = clean(name);
    if (!data.name) throw new BotError('Le nom ne peut pas être vide.');
  }
  const emoji = interaction.options.getString('emoji', required);
  if (emoji !== null) {
    const parsed = parseEmoji(emoji);
    if (!parsed)
      throw new BotError('Indiquez un seul emoji (par exemple 🎲 ou un emoji du serveur).');
    data.emoji = parsed;
  }
  const color = interaction.options.getString('couleur');
  if (color !== null) {
    const parsed = parseColor(color);
    if (parsed === null)
      throw new BotError(
        'Couleur invalide : utilisez le format hexadécimal, par exemple `#ff8800`.',
      );
    data.color = parsed;
  }
  const style = interaction.options.getString('style');
  if (style !== null) data.style = style as RssStyle;
  return data;
}

export async function handleCategoryAdd(interaction: Interaction): Promise<void> {
  const data = readCategoryFields(interaction, true);
  const category = await createCategory(
    interaction.guildId,
    {
      name: data.name ?? '',
      emoji: data.emoji ?? '🔗',
      color: data.color ?? Colors.primary,
      style: data.style ?? 'STANDARD',
    },
    RSS_LIMITS.customCategories,
  );
  await interaction.reply({
    embeds: [
      successEmbed(
        `Catégorie ${category.emoji} **${safeText(category.name, 40)}** créée (${STYLE_LABELS[category.style]}, ${formatColor(category.color)}). Choisissez-la avec \`/rss add\` ou \`/rss edit\`.`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleCategoryEdit(interaction: Interaction): Promise<void> {
  const category = await requireCustomCategory(
    interaction.guildId,
    interaction.options.getString('categorie'),
  );
  const data = readCategoryFields(interaction, false);
  if (Object.keys(data).length === 0) throw new BotError('Indiquez au moins une modification.');
  const updated = await updateCategory(interaction.guildId, category.id, data);
  const feeds = await countFeedsInCategory(interaction.guildId, updated.id);
  await interaction.reply({
    embeds: [
      successEmbed(
        `Catégorie ${updated.emoji} **${safeText(updated.name, 40)}** modifiée (${STYLE_LABELS[updated.style]}, ${formatColor(updated.color)}). ${feeds} flux l'utilisent : leurs prochains articles prendront ce rendu.`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleCategoryRemove(interaction: Interaction): Promise<void> {
  const category = await requireCustomCategory(
    interaction.guildId,
    interaction.options.getString('categorie'),
  );
  const feeds = await countFeedsInCategory(interaction.guildId, category.id);
  const click = await confirm(
    interaction,
    `Supprimer la catégorie ${category.emoji} **${safeText(category.name, 40)}** ?${feeds > 0 ? `\n${feeds} flux l'utilisent : ils passeront dans la catégorie « ${BUILTIN_CATEGORIES.other.name} ».` : ''}`,
    'Supprimer',
  );
  if (!click) return;
  const moved = await deleteCategory(interaction.guildId, category.id);
  if (moved === null) {
    await click.editReply({
      embeds: [warningEmbed("Cette catégorie n'existait plus.")],
      components: [],
    });
    return;
  }
  await click.editReply({
    embeds: [
      successEmbed(
        `Catégorie **${safeText(category.name, 40)}** supprimée.${moved > 0 ? ` ${moved} flux déplacé(s) dans « Autre ».` : ''}`,
      ),
    ],
    components: [],
  });
}
