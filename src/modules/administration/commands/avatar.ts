import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { baseEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Affiche l'avatar d'un utilisateur.")
    .addUserOption((option) =>
      option.setName('utilisateur').setDescription('Utilisateur à afficher (vous par défaut)'),
    ),
  cooldown: 5,

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur') ?? interaction.user;
    const member =
      interaction.options.getMember('utilisateur') ??
      (user.id === interaction.user.id ? interaction.member : null);

    const globalAvatar = user.displayAvatarURL({ size: 1024 });
    const serverAvatar = member?.avatarURL({ size: 1024 }) ?? null;

    const embed = baseEmbed()
      .setTitle(`🖼️ Avatar de ${user.displayName}`)
      .setImage(serverAvatar ?? globalAvatar);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('Avatar global').setStyle(ButtonStyle.Link).setURL(globalAvatar),
    );
    if (serverAvatar) {
      embed.setThumbnail(globalAvatar).setDescription("Avatar spécifique à ce serveur (l'avatar global est en miniature).");
      row.addComponents(
        new ButtonBuilder().setLabel('Avatar de serveur').setStyle(ButtonStyle.Link).setURL(serverAvatar),
      );
    }

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

export default command;
