import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import {
  updateLevelConfig,
  type LevelConfigUpdate,
} from '../../../core/database/repositories/levels.repository';
import { BotError } from '../../../core/errors/BotError';
import { successEmbed } from '../../../core/ui/embeds';
import type { ComponentHandler, ComponentInteraction } from '../../../types';
import { buildLevelPanel, LEVEL_IDS, type EditKind } from '../services/panel';
import { LEVEL_LIMITS } from '../services/xp';

/** Lit un champ numérique d'un formulaire et vérifie qu'il est entier et dans les bornes. */
function readInteger(
  interaction: ComponentInteraction & { fields: { getTextInputValue(id: string): string } },
  field: string,
  label: string,
  limits: { min: number; max: number },
): number {
  const raw = interaction.fields.getTextInputValue(field).trim();
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < limits.min || value > limits.max) {
    throw new BotError(`${label} doit être un nombre entier entre ${limits.min} et ${limits.max}.`);
  }
  return value;
}

/** Validation des formulaires du panneau de niveaux. */
const handler: ComponentHandler = {
  id: LEVEL_IDS.modal,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, args) {
    if (!interaction.isModalSubmit()) return;
    const kind = args[0] as EditKind;
    let update: LevelConfigUpdate;

    if (kind === 'xp') {
      const xpMin = readInteger(interaction, 'xpMin', "L'XP minimum", LEVEL_LIMITS.xp);
      const xpMax = readInteger(interaction, 'xpMax', "L'XP maximum", LEVEL_LIMITS.xp);
      if (xpMax < xpMin) throw new BotError("L'XP maximum doit être supérieur ou égal à l'XP minimum.");
      update = {
        xpMin,
        xpMax,
        cooldownSeconds: readInteger(interaction, 'cooldown', 'Le délai', LEVEL_LIMITS.cooldownSeconds),
      };
    } else if (kind === 'curve') {
      update = {
        levelBase: readInteger(interaction, 'levelBase', "L'XP du premier niveau", LEVEL_LIMITS.levelBase),
        levelStep: readInteger(interaction, 'levelStep', "L'XP supplémentaire par niveau", LEVEL_LIMITS.levelStep),
      };
    } else {
      const message = interaction.fields.getTextInputValue('message').trim();
      if (!message) throw new BotError('Le message ne peut pas être vide.');
      update = { levelUpMessage: message };
    }

    await updateLevelConfig(interaction.guildId, update);

    // Ouvert depuis le panneau : on le met à jour sur place.
    if (interaction.isFromMessage()) {
      await interaction.update(await buildLevelPanel(interaction.guild));
    } else {
      await interaction.reply({ embeds: [successEmbed('Réglages enregistrés.')], flags: MessageFlags.Ephemeral });
    }
  },
};

export default handler;
