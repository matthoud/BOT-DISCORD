import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import { pickRandom } from '../../../utils/format';

export interface SocialAction {
  name: string;
  description: string;
  optionDescription: string;
  emoji: string;
  /** Phrases avec `{author}` et `{target}`. */
  phrases: readonly string[];
  /** Phrases utilisées quand l'auteur se cible lui-même. */
  selfPhrases: readonly string[];
}

export function buildSocialCommand(action: SocialAction) {
  return new SlashCommandBuilder()
    .setName(action.name)
    .setDescription(action.description)
    .addUserOption((option) =>
      option.setName('membre').setDescription(action.optionDescription).setRequired(true),
    );
}

/** Exécute une commande d'interaction entre deux membres (câlin, gifle...). */
export async function runSocialCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  action: SocialAction,
): Promise<void> {
  const target = interaction.options.getUser('membre', true);
  const isSelf = target.id === interaction.user.id;
  const phrase = pickRandom(isSelf ? action.selfPhrases : action.phrases)
    .replaceAll('{author}', `${interaction.user}`)
    .replaceAll('{target}', `${target}`);

  await interaction.reply({
    // La mention hors embed notifie le membre visé (les mentions dans un embed ne notifient pas).
    content: isSelf || target.bot ? undefined : `${target}`,
    embeds: [baseEmbed(Colors.fun).setDescription(`${action.emoji} ${phrase}`)],
  });
}
