import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
} from 'discord.js';

const PAGINATION_TIMEOUT_MS = 120_000;

function buildRow(page: number, pageCount: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('tmp:prev')
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId('tmp:page')
      .setLabel(`${page + 1} / ${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('tmp:next')
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= pageCount - 1),
  );
}

/**
 * Affiche un contenu paginé avec boutons Précédent / Suivant.
 * L'interaction doit déjà être différée. `render` reçoit l'index de page (à partir de 0).
 */
export async function paginate(
  interaction: ChatInputCommandInteraction<'cached'>,
  pageCount: number,
  render: (page: number) => Promise<EmbedBuilder>,
): Promise<void> {
  let page = 0;
  if (pageCount <= 1) {
    await interaction.editReply({ embeds: [await render(0)] });
    return;
  }

  const message = await interaction.editReply({
    embeds: [await render(page)],
    components: [buildRow(page, pageCount)],
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    idle: PAGINATION_TIMEOUT_MS,
    filter: (click) => click.user.id === interaction.user.id,
  });

  collector.on('collect', (click) => {
    page += click.customId === 'tmp:next' ? 1 : -1;
    page = Math.min(Math.max(page, 0), pageCount - 1);
    render(page)
      .then((embed) => click.update({ embeds: [embed], components: [buildRow(page, pageCount)] }))
      .catch(() => undefined);
  });

  collector.on('end', () => {
    interaction.editReply({ components: [buildRow(page, pageCount, true)] }).catch(() => undefined);
  });
}
