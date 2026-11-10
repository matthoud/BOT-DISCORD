import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { baseEmbed } from '../../../core/ui/embeds';
import { formatDuration } from '../../../utils/duration';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Affiche la latence du bot.'),
  cooldown: 5,

  async execute(interaction) {
    const sentAt = Date.now();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roundTrip = Date.now() - sentAt;
    const gateway = interaction.client.ws.ping;

    const embed = baseEmbed()
      .setTitle('🏓 Pong !')
      .addFields(
        { name: 'Aller-retour', value: `${roundTrip} ms`, inline: true },
        { name: 'Passerelle Discord', value: gateway >= 0 ? `${gateway} ms` : 'Mesure en cours', inline: true },
        {
          name: 'En ligne depuis',
          value: formatDuration(Math.floor((interaction.client.uptime ?? 0) / 1000)),
          inline: true,
        },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
