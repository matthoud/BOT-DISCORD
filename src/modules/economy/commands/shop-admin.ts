import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  countItemOwners,
  countShopItems,
  createShopItem,
  deleteShopItem,
  getEconomyConfig,
  updateShopItem,
  type ShopItemInput,
} from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { assertCanManageRole } from '../../../core/permissions/hierarchy';
import { confirm } from '../../../core/ui/confirm';
import { successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { getBotMember } from '../../../utils/interaction';
import { ECONOMY_LIMITS, formatMoney } from '../services/money';
import { resolveItem, respondWithItems } from '../services/shop.service';

const { price, stock, maxPerUser, itemName, itemDescription, shopItems } = ECONOMY_LIMITS;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shop-admin')
    .setDescription('Gère les articles de la boutique du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Ajoute un article à la boutique.')
        .addStringOption((option) =>
          option.setName('nom').setDescription("Nom de l'article").setMaxLength(itemName).setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('prix').setDescription('Prix').setMinValue(price.min).setMaxValue(price.max).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('description').setDescription("Description de l'article").setMaxLength(itemDescription),
        )
        .addRoleOption((option) => option.setName('role').setDescription("Rôle attribué à l'achat"))
        .addIntegerOption((option) =>
          option
            .setName('stock')
            .setDescription('Nombre d’exemplaires disponibles (illimité par défaut)')
            .setMinValue(1)
            .setMaxValue(stock.max),
        )
        .addIntegerOption((option) =>
          option
            .setName('limite')
            .setDescription('Nombre maximal d’exemplaires par membre (illimité par défaut, 1 pour un rôle)')
            .setMinValue(maxPerUser.min)
            .setMaxValue(maxPerUser.max),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Modifie un article de la boutique.')
        .addStringOption((option) =>
          option.setName('article').setDescription('Article à modifier').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((option) => option.setName('nom').setDescription('Nouveau nom').setMaxLength(itemName))
        .addIntegerOption((option) =>
          option.setName('prix').setDescription('Nouveau prix').setMinValue(price.min).setMaxValue(price.max),
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('Nouvelle description').setMaxLength(itemDescription),
        )
        .addIntegerOption((option) =>
          option
            .setName('stock')
            .setDescription('Nouveau stock (0 = rupture, -1 = illimité)')
            .setMinValue(-1)
            .setMaxValue(stock.max),
        )
        .addIntegerOption((option) =>
          option
            .setName('limite')
            .setDescription('Nouvelle limite par membre (0 = illimité)')
            .setMinValue(0)
            .setMaxValue(maxPerUser.max),
        )
        .addBooleanOption((option) =>
          option.setName('en-vente').setDescription("Proposer ou non l'article à la vente"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Supprime définitivement un article, y compris des inventaires.')
        .addStringOption((option) =>
          option.setName('article').setDescription('Article à supprimer').setRequired(true).setAutocomplete(true),
        ),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 3,

  async autocomplete(interaction) {
    await respondWithItems(interaction, await getEconomyConfig(interaction.guildId), false);
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();
    const config = await getEconomyConfig(guildId);
    const cleanName = (value: string): string => value.replace(/\s+/g, ' ').trim();

    if (subcommand === 'add') {
      const name = cleanName(interaction.options.getString('nom', true));
      if (!name) throw new BotError("Le nom de l'article ne peut pas être vide.");
      if ((await countShopItems(guildId)) >= shopItems) {
        throw new BotError(`Une boutique ne peut pas contenir plus de ${shopItems} articles.`);
      }

      const role = interaction.options.getRole('role');
      if (role) {
        const me = await getBotMember(interaction);
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          throw new BotError('Il me manque la permission `Gérer les rôles` pour vendre un rôle.');
        }
        // Un membre ne peut pas faire vendre par le bot un rôle qu'il ne pourrait pas donner lui-même.
        assertCanManageRole(interaction.member, role, me);
      }

      const input: ShopItemInput = {
        name,
        description: interaction.options.getString('description')?.trim() ?? '',
        price: interaction.options.getInteger('prix', true),
        roleId: role?.id ?? null,
        stock: interaction.options.getInteger('stock'),
        // Un rôle ne s'achète qu'une fois.
        maxPerUser: interaction.options.getInteger('limite') ?? (role ? 1 : null),
      };
      const item = await createShopItem(guildId, input);
      await interaction.reply({
        embeds: [
          successEmbed(
            `Article **${item.name}** ajouté à la boutique pour **${formatMoney(item.price, config)}**${role ? ` (rôle ${role})` : ''}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const item = await resolveItem(guildId, interaction.options.getString('article', true), false);

    if (subcommand === 'edit') {
      const data: Partial<ShopItemInput> & { enabled?: boolean } = {};
      const name = interaction.options.getString('nom');
      if (name !== null) {
        data.name = cleanName(name);
        if (!data.name) throw new BotError("Le nom de l'article ne peut pas être vide.");
      }
      const newPrice = interaction.options.getInteger('prix');
      if (newPrice !== null) data.price = newPrice;
      const description = interaction.options.getString('description');
      if (description !== null) data.description = description.trim();
      const newStock = interaction.options.getInteger('stock');
      if (newStock !== null) data.stock = newStock === -1 ? null : newStock;
      const limit = interaction.options.getInteger('limite');
      if (limit !== null) data.maxPerUser = limit === 0 ? null : limit;
      const enabled = interaction.options.getBoolean('en-vente');
      if (enabled !== null) data.enabled = enabled;

      if (Object.keys(data).length === 0) throw new BotError('Indiquez au moins une modification.');
      const updated = await updateShopItem(guildId, item.id, data);
      await interaction.reply({
        embeds: [
          successEmbed(
            `Article **${updated.name}** mis à jour : ${formatMoney(updated.price, config)}, ${updated.stock === null ? 'stock illimité' : `${updated.stock} en stock`}, ${updated.maxPerUser === null ? 'sans limite par membre' : `${updated.maxPerUser} max. par membre`}, ${updated.enabled ? 'en vente' : 'retiré de la vente'}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const owners = await countItemOwners(item.id);
    const click = await confirm(
      interaction,
      `Supprimer définitivement l'article **${item.name}** ?${owners > 0 ? `\n${owners} membre(s) le possèdent : il disparaîtra de leur inventaire, sans remboursement. Pour seulement arrêter la vente, utilisez plutôt \`/shop-admin edit en-vente:False\`.` : ''}`,
      'Supprimer',
    );
    if (!click) return;
    await deleteShopItem(guildId, item.id);
    await click.editReply({ embeds: [successEmbed(`Article **${item.name}** supprimé.`)], components: [] });
  },
};

export default command;
