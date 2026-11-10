import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { confirm } from '../../../core/ui/confirm';
import { successEmbed, warningEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime un nombre de messages dans ce salon.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName('nombre')
        .setDescription('Nombre de messages à supprimer (1 à 100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('membre').setDescription('Ne supprimer que les messages de cet utilisateur'),
    ),
  userPermissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ],
  cooldown: 5,

  async execute(interaction) {
    const amount = interaction.options.getInteger('nombre', true);
    const user = interaction.options.getUser('membre');
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      throw new BotError('Cette commande doit être utilisée dans un salon textuel.');
    }

    const scope = user ? ` de ${user}` : '';
    const confirmed = await confirm(
      interaction,
      `Supprimer **${amount}** message(s)${scope} dans ${channel} ? Cette action est irréversible.`,
      'Supprimer',
    );
    if (!confirmed) return;

    let toDelete = await channel.messages.fetch({ limit: 100 });
    if (user) toDelete = toDelete.filter((message) => message.author.id === user.id);
    const selection = [...toDelete.values()].slice(0, amount);

    // `true` : Discord refuse la suppression groupée des messages de plus de 14 jours, ils sont ignorés.
    const deleted = selection.length > 0 ? await channel.bulkDelete(selection, true) : null;
    const deletedCount = deleted?.size ?? 0;
    const skipped = selection.length - deletedCount;

    const embed =
      deletedCount > 0
        ? successEmbed(`**${deletedCount}** message(s) supprimé(s)${scope}.`)
        : warningEmbed('Aucun message à supprimer.');
    if (skipped > 0) {
      embed.setFooter({
        text: `${skipped} message(s) de plus de 14 jours n'ont pas pu être supprimés.`,
      });
    }
    await interaction.editReply({ embeds: [embed], components: [] });
  },
};

export default command;
