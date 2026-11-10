import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { BotError } from '../../../core/errors/BotError';
import { handleInteractionError } from '../../../core/errors/handler';
import { baseEmbed, Colors, successEmbed } from '../../../core/ui/embeds';
import type { Command } from '../../../types';
import { assertMemberCanAccess } from '../../../utils/interaction';

const MODAL_TIMEOUT_MS = 10 * 60 * 1000;

const COLOR_CHOICES = {
  bleu: Colors.primary,
  vert: Colors.success,
  jaune: Colors.warning,
  rouge: Colors.error,
  rose: Colors.fun,
} as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Envoie une annonce sous forme d’embed dans un salon.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription("Salon où publier l'annonce")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('mention').setDescription("Rôle à mentionner avec l'annonce"),
    )
    .addStringOption((option) =>
      option
        .setName('couleur')
        .setDescription("Couleur de l'embed")
        .addChoices(...Object.keys(COLOR_CHOICES).map((name) => ({ name, value: name }))),
    ),
  userPermissions: [PermissionFlagsBits.ManageGuild],
  cooldown: 10,

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon', true, [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
    ]);
    const role = interaction.options.getRole('mention');
    const colorName = (interaction.options.getString('couleur') ?? 'bleu') as keyof typeof COLOR_CHOICES;

    assertMemberCanAccess(interaction.member, channel, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);

    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    const botPermissions = channel.permissionsFor(me);
    if (
      !botPermissions.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])
    ) {
      throw new BotError(
        `Je ne peux pas publier dans ${channel} : il me faut \`Voir le salon\`, \`Envoyer des messages\` et \`Intégrer des liens\`.`,
      );
    }

    const isEveryone = role?.id === interaction.guildId;
    if (role && (isEveryone || !role.mentionable)) {
      // Mentionner @everyone ou un rôle non mentionnable exige la permission dédiée, pour le membre comme pour le bot.
      if (!channel.permissionsFor(interaction.member).has(PermissionFlagsBits.MentionEveryone)) {
        throw new BotError(
          `Vous n'avez pas la permission de mentionner ${isEveryone ? '@everyone' : `le rôle **${role.name}**`} dans ${channel}.`,
        );
      }
      if (!botPermissions.has(PermissionFlagsBits.MentionEveryone)) {
        throw new BotError(
          `Il me manque la permission \`Mentionner @everyone, @here et tous les rôles\` dans ${channel}.`,
        );
      }
    }

    const modalId = `tmp:announce:${interaction.id}`;
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle('Nouvelle annonce')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Titre')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(256)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Contenu')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(4000)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);

    const submission = await interaction
      .awaitModalSubmit({
        time: MODAL_TIMEOUT_MS,
        filter: (submit) => submit.customId === modalId && submit.user.id === interaction.user.id,
      })
      .catch(() => null);
    // Fenêtre fermée ou délai dépassé : rien à faire.
    if (!submission) return;

    try {
      await submission.deferReply({ flags: MessageFlags.Ephemeral });

      const embed = baseEmbed(COLOR_CHOICES[colorName])
        .setTitle(submission.fields.getTextInputValue('title'))
        .setDescription(submission.fields.getTextInputValue('content'))
        .setFooter({
          text: `Annonce de ${interaction.member.displayName}`,
          iconURL: interaction.member.displayAvatarURL(),
        });

      const message = await channel.send({
        content: role ? (isEveryone ? '@everyone' : `${role}`) : undefined,
        embeds: [embed],
        allowedMentions: role ? (isEveryone ? { parse: ['everyone'] } : { roles: [role.id] }) : { parse: [] },
      });

      await submission.editReply({
        embeds: [successEmbed(`Annonce publiée dans ${channel}. [Voir le message](${message.url})`)],
      });
    } catch (error) {
      await handleInteractionError(submission, error);
    }
  },
};

export default command;
