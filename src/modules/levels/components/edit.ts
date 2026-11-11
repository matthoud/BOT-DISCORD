import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getLevelConfig } from '../../../core/database/repositories/levels.repository';
import { componentId } from '../../../core/ui/customId';
import type { ComponentHandler } from '../../../types';
import { LEVEL_IDS, type EditKind } from '../services/panel';
import { LEVEL_LIMITS } from '../services/xp';

const numberInput = (id: string, label: string, value: number): ActionRowBuilder<TextInputBuilder> =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(6)
      .setValue(String(value))
      .setRequired(true),
  );

/** Boutons « modifier » du panneau : ouvrent un formulaire pré-rempli avec les réglages actuels. */
const handler: ComponentHandler = {
  id: LEVEL_IDS.edit,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isButton()) return;
    const kind = args[0] as EditKind;
    const config = await getLevelConfig(interaction.guildId);
    const modal = new ModalBuilder().setCustomId(componentId(LEVEL_IDS.modal, kind));

    if (kind === 'xp') {
      const { xp, cooldownSeconds } = LEVEL_LIMITS;
      modal.setTitle("Gains d'XP").addComponents(
        numberInput('xpMin', `XP minimum par message (${xp.min} à ${xp.max})`, config.xpMin),
        numberInput('xpMax', `XP maximum par message (${xp.min} à ${xp.max})`, config.xpMax),
        numberInput(
          'cooldown',
          // 45 caractères au plus pour le libellé d'un champ de formulaire Discord.
          `Délai entre gains, en secondes (${cooldownSeconds.min} à ${cooldownSeconds.max})`,
          config.cooldownSeconds,
        ),
      );
    } else if (kind === 'curve') {
      modal.setTitle('Progression des niveaux').addComponents(
        numberInput('levelBase', 'XP pour passer du niveau 0 au niveau 1', config.levelBase),
        numberInput('levelStep', 'XP supplémentaire à chaque niveau suivant', config.levelStep),
      );
    } else {
      modal.setTitle('Message de passage de niveau').addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Message ({user} {username} {level} {xp} …)')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(1)
            .setMaxLength(1000)
            .setValue(config.levelUpMessage)
            .setRequired(true),
        ),
      );
    }

    await interaction.showModal(modal);
  },
};

export default handler;
