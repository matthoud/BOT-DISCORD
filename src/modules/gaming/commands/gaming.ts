import { SlashCommandBuilder } from 'discord.js';
import type { GamingOfferKind } from '@prisma/client';
import {
  countAvailableOffers,
  getSyncState,
  listAvailableOffers,
} from '../../../core/database/repositories/gaming.repository';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { timestamp, truncate } from '../../../utils/format';
import { PROVIDERS } from '../providers';
import { syncTaskName } from '../services/tasks';
import { KIND_LABELS, priceLine, safe, storeList } from '../services/presenter';
import { STORE_KEYS, STORES } from '../services/stores';

const PAGE_SIZE = 6;
const KIND_CHOICES = (Object.entries(KIND_LABELS) as [GamingOfferKind, string][]).map(
  ([value, name]) => ({ name, value }),
);
const STORE_CHOICES = STORE_KEYS.map((key) => ({ name: STORES[key].short, value: key }));

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gaming')
    .setDescription('Jeux et contenus gratuits du moment.')
    .addSubcommand((sub) =>
      sub
        .setName('free')
        .setDescription('Affiche les offres gratuites actuellement disponibles.')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription("Type d'offre")
            .addChoices(...KIND_CHOICES),
        )
        .addStringOption((option) =>
          option
            .setName('boutique')
            .setDescription('Boutique ou plateforme')
            .addChoices(...STORE_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('sources').setDescription('Affiche les sources des offres et leur état.'),
    ),
  cooldown: 5,

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'sources') {
      const lines = await Promise.all(
        PROVIDERS.map(async (provider) => {
          const [state, available] = await Promise.all([
            getSyncState(syncTaskName(provider)),
            countAvailableOffers(provider.id),
          ]);
          const status = !state?.lastRunAt
            ? '⏳ Pas encore synchronisé'
            : state.consecutiveFailures > 0
              ? `⚠️ En échec : ${truncate(state.lastError ?? 'erreur inconnue', 150)}`
              : '🟢 Opérationnel';
          return [
            `**[${provider.name}](${provider.website})** — ${status}`,
            `${available} offre(s) disponible(s) · vérification toutes les ${Math.round(provider.intervalSeconds / 60)} minutes`,
            state?.lastSuccessAt
              ? `Dernière synchronisation réussie : ${timestamp(state.lastSuccessAt, 'R')}`
              : null,
          ]
            .filter(Boolean)
            .join('\n');
        }),
      );
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('🎮 Sources des offres gaming')
            .setDescription(lines.join('\n\n'))
            .setFooter({
              text: 'Les valeurs affichées sont celles annoncées par la source, dans sa devise.',
            }),
        ],
      });
      return;
    }

    await interaction.deferReply();
    const kind = interaction.options.getString('type') as GamingOfferKind | null;
    const store = interaction.options.getString('boutique');
    const offers = (
      await listAvailableOffers({ kinds: kind ? [kind] : undefined, take: 100 })
    ).filter((offer) => !store || offer.stores.includes(store));
    const title = '🎁 Offres gratuites du moment';
    if (offers.length === 0) {
      await interaction.editReply({
        embeds: [
          baseEmbed().setTitle(title).setDescription('Aucune offre ne correspond pour le moment.'),
        ],
      });
      return;
    }
    await paginate(interaction, Math.ceil(offers.length / PAGE_SIZE), async (page) => {
      const lines = offers
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .map(
          (offer) =>
            `**[${truncate(safe(offer.title), 90)}](${offer.url})**\n${priceLine(offer)}\n${KIND_LABELS[offer.kind]} · ${storeList(offer.stores)}`,
        );
      // Attribution exigée par les sources : un lien actif vers leur site.
      const sources = PROVIDERS.map((provider) => `[${provider.name}](${provider.website})`).join(
        ', ',
      );
      return baseEmbed()
        .setTitle(`${title} (${offers.length})`)
        .setDescription(`${lines.join('\n\n')}\n\n-# Source : ${sources}`);
    });
  },
};

export default command;
