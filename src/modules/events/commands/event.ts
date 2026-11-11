import { SlashCommandBuilder } from 'discord.js';
import { countGoing, listUpcomingEvents } from '../../../core/database/repositories/events.repository';
import { baseEmbed } from '../../../core/ui/embeds';
import { paginate } from '../../../core/ui/paginate';
import type { Command } from '../../../types';
import { timestamp, truncate } from '../../../utils/format';
import { describeSeats, EVENT_LIMITS, eventUrl } from '../services/presenter';

const PAGE_SIZE = 5;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Consulte les événements du serveur.')
    .addSubcommand((sub) => sub.setName('list').setDescription('Affiche les prochains événements du serveur.')),
  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();
    const events = await listUpcomingEvents(interaction.guildId, new Date(), EVENT_LIMITS.upcomingPerGuild);
    const title = `📅 Prochains événements — ${interaction.guild.name}`;

    if (events.length === 0) {
      await interaction.editReply({
        embeds: [baseEmbed().setTitle(title).setDescription("Aucun événement n'est prévu pour le moment.")],
      });
      return;
    }

    const going = await countGoing(events.map((event) => event.id));
    await paginate(interaction, Math.ceil(events.length / PAGE_SIZE), async (page) => {
      const lines = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((event) => {
        const url = eventUrl(event);
        const name = url ? `[${truncate(event.title, 80)}](${url})` : truncate(event.title, 80);
        return `**${name}**\n${timestamp(event.startsAt, 'F')} · ${timestamp(event.startsAt, 'R')}\n✅ ${describeSeats(going.get(event.id) ?? 0, event.capacity)} participant(s) · <#${event.channelId}>`;
      });
      return baseEmbed()
        .setTitle(title)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: "Cliquez sur un titre pour ouvrir l'annonce et vous inscrire." });
    });
  },
};

export default command;
