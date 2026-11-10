import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getWelcomeConfig } from '../../../core/database/repositories/welcome.repository';
import { componentId } from '../../../core/ui/customId';
import type { ComponentHandler } from '../../../types';
import { WELCOME_IDS, type MessageKind } from '../services/panel';

/** Bouton « modifier le message » : ouvre un modal pré-rempli avec le message actuel. */
const handler: ComponentHandler = {
  id: WELCOME_IDS.edit,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const kind: MessageKind = args[0] === 'leave' ? 'leave' : 'welcome';
    const config = await getWelcomeConfig(interaction.guildId);

    const modal = new ModalBuilder()
      .setCustomId(componentId(WELCOME_IDS.modal, kind))
      .setTitle(kind === 'welcome' ? 'Message de bienvenue' : 'Message de départ')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Message ({user} {username} {server} …)')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(1)
            .setMaxLength(1500)
            .setValue(kind === 'welcome' ? config.welcomeMessage : config.leaveMessage)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
  },
};

export default handler;
