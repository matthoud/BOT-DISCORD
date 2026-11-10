import { ChannelType, GuildVerificationLevel, SlashCommandBuilder } from 'discord.js';
import { baseEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { fullTimestamp } from '../../../utils/format';

const VERIFICATION: Record<GuildVerificationLevel, string> = {
  [GuildVerificationLevel.None]: 'Aucune',
  [GuildVerificationLevel.Low]: 'Faible',
  [GuildVerificationLevel.Medium]: 'Moyenne',
  [GuildVerificationLevel.High]: 'Élevée',
  [GuildVerificationLevel.VeryHigh]: 'Très élevée',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Affiche les informations du serveur.'),
  cooldown: 5,

  async execute(interaction) {
    const { guild } = interaction;
    const channels = guild.channels.cache;
    const count = (...types: ChannelType[]) =>
      channels.filter((channel) => types.includes(channel.type)).size;

    const embed = baseEmbed()
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Membres', value: guild.memberCount.toLocaleString('fr-FR'), inline: true },
        { name: 'Rôles', value: String(guild.roles.cache.size - 1), inline: true },
        {
          name: 'Salons',
          value: [
            `💬 Textuels : ${count(ChannelType.GuildText, ChannelType.GuildAnnouncement)}`,
            `🔊 Vocaux : ${count(ChannelType.GuildVoice, ChannelType.GuildStageVoice)}`,
            `🗂️ Forums : ${count(ChannelType.GuildForum)}`,
            `📁 Catégories : ${count(ChannelType.GuildCategory)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Boosts',
          value: `Niveau ${guild.premiumTier}\n${guild.premiumSubscriptionCount ?? 0} boost(s)`,
          inline: true,
        },
        {
          name: 'Divers',
          value: `Émojis : ${guild.emojis.cache.size}\nVérification : ${VERIFICATION[guild.verificationLevel]}`,
          inline: true,
        },
        { name: 'Créé le', value: fullTimestamp(guild.createdAt) },
      )
      .setFooter({ text: `ID : ${guild.id}` });

    const banner = guild.bannerURL({ size: 1024 });
    if (banner) embed.setImage(banner);

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
