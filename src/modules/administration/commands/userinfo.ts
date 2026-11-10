import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { fullTimestamp, truncate } from '../../../utils/format';

const MAX_ROLES_SHOWN = 15;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription("Affiche les informations d'un membre.")
    .addUserOption((option) =>
      option.setName('membre').setDescription('Membre à afficher (vous par défaut)'),
    ),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    const member =
      interaction.options.getMember('membre') ??
      (user.id === interaction.user.id ? interaction.member : null);

    const embed = baseEmbed(member?.displayColor || Colors.primary)
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail((member ?? user).displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Mention', value: `${user}`, inline: true },
        { name: 'Type', value: user.bot ? 'Bot' : 'Utilisateur', inline: true },
        { name: 'Compte créé le', value: fullTimestamp(user.createdAt) },
      )
      .setFooter({ text: `ID : ${user.id}` });

    if (!member) {
      embed.addFields({ name: 'Serveur', value: "Cet utilisateur n'est pas membre du serveur." });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (member.joinedAt) {
      embed.addFields({ name: 'A rejoint le serveur le', value: fullTimestamp(member.joinedAt) });
    }
    if (member.nickname) {
      embed.addFields({ name: 'Pseudo sur le serveur', value: member.nickname, inline: true });
    }
    if (member.isCommunicationDisabled()) {
      embed.addFields({
        name: 'Exclusion temporaire',
        value: `Jusqu'au ${fullTimestamp(member.communicationDisabledUntil)}`,
      });
    }

    const roles = member.roles.cache
      .filter((role) => role.id !== interaction.guildId)
      .sort((a, b) => b.position - a.position);
    const shown = roles.first(MAX_ROLES_SHOWN).map((role) => `${role}`);
    const extra = roles.size - shown.length;
    embed.addFields({
      name: `Rôles (${roles.size})`,
      value: truncate(shown.join(' ') + (extra > 0 ? ` … et ${extra} autre(s)` : ''), 1024) || 'Aucun rôle',
    });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
