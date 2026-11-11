import { PermissionFlagsBits, type AutocompleteInteraction, type Guild, type GuildMember, type Role } from 'discord.js';
import type { ShopItem } from '@prisma/client';
import { getShopItem, listShopItems } from '../../../core/database/repositories/economy.repository';
import { BotError } from '../../../core/errors/BotError';
import { truncate } from '../../../utils/format';
import { formatMoney, type Currency } from './money';

/** Retrouve un article à partir de la valeur d'une option : identifiant (autocomplétion) ou nom saisi à la main. */
export async function resolveItem(guildId: string, raw: string, onlyEnabled: boolean): Promise<ShopItem> {
  const value = raw.trim();
  let item: ShopItem | null = null;
  if (/^\d{1,9}$/.test(value)) item = await getShopItem(guildId, Number(value));
  if (!item) {
    const items = await listShopItems(guildId, false);
    item = items.find((candidate) => candidate.name.toLowerCase() === value.toLowerCase()) ?? null;
  }
  if (!item) throw new BotError('Article introuvable. Choisissez-le dans la liste proposée.');
  if (onlyEnabled && !item.enabled) throw new BotError("Cet article n'est plus en vente.");
  return item;
}

/** Propose les articles dont le nom contient la saisie. */
export async function respondWithItems(
  interaction: AutocompleteInteraction<'cached'>,
  currency: Currency,
  onlyEnabled: boolean,
): Promise<void> {
  const typed = interaction.options.getFocused().toLowerCase();
  const items = await listShopItems(interaction.guildId, onlyEnabled);
  await interaction.respond(
    items
      .filter((item) => item.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((item) => ({
        name: truncate(
          `${item.name} — ${formatMoney(item.price, { ...currency, currencyEmoji: currency.currencyName })}${item.enabled ? '' : ' (retiré de la vente)'}`,
          100,
        ),
        value: String(item.id),
      })),
  );
}

/** Ligne de disponibilité d'un article : stock restant et limite par membre. */
export function describeAvailability(item: Pick<ShopItem, 'stock' | 'maxPerUser'>): string {
  const parts: string[] = [];
  if (item.stock !== null) parts.push(item.stock === 0 ? 'rupture de stock' : `${item.stock} en stock`);
  if (item.maxPerUser !== null) parts.push(`${item.maxPerUser} max. par membre`);
  return parts.join(' · ');
}

/** Rôle d'un article, s'il existe encore et que le bot peut l'attribuer ; sinon lève une `BotError`. */
export function assertRoleGrantable(guild: Guild, me: GuildMember, roleId: string): Role {
  const role = guild.roles.cache.get(roleId);
  if (!role) throw new BotError("Le rôle lié à cet article n'existe plus. Prévenez un administrateur.");
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.managed ||
    me.roles.highest.position <= role.position
  ) {
    throw new BotError(
      `Je ne peux pas attribuer le rôle **${role.name}** pour le moment (permission \`Gérer les rôles\` manquante ou rôle placé au-dessus du mien). Prévenez un administrateur.`,
    );
  }
  return role;
}
