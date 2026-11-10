import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  StringSelectMenuBuilder,
  type EmbedBuilder,
} from 'discord.js';
import type { BotClient } from '../../../core/client';
import { getModuleStates } from '../../../core/database/repositories/module.repository';
import { componentId } from '../../../core/ui/customId';
import { baseEmbed } from '../../../core/ui/embeds';
import type { LoadedCommand } from '../../../types';

export const HELP_SELECT_ID = 'utility:help';

/** Liste les usages d'une commande : une ligne par sous-commande, ou la commande elle-même. */
function describeCommand(command: LoadedCommand): string[] {
  const json = command.data.toJSON();
  const subcommands = (json.options ?? []).filter(
    (option) => option.type === ApplicationCommandOptionType.Subcommand,
  );
  if (subcommands.length === 0) return [`**/${json.name}** — ${json.description}`];
  return subcommands.map((sub) => `**/${json.name} ${sub.name}** — ${sub.description}`);
}

export async function buildHelpMenu(client: BotClient, guildId: string, selected?: string) {
  const states = await getModuleStates(guildId);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(componentId(HELP_SELECT_ID))
      .setPlaceholder('Choisissez un module')
      .addOptions(
        client.modules.map((botModule) => ({
          label: botModule.name,
          value: botModule.id,
          description:
            (states.get(botModule.id) ?? true) ? botModule.description.slice(0, 100) : 'Module désactivé',
          emoji: botModule.emoji,
          default: botModule.id === selected,
        })),
      ),
  );
}

export async function buildHelpOverview(client: BotClient, guildId: string): Promise<EmbedBuilder> {
  const states = await getModuleStates(guildId);
  const lines = client.modules.map((botModule) => {
    const enabled = !botModule.canDisable || (states.get(botModule.id) ?? true);
    const count = client.commands.filter((command) => command.moduleId === botModule.id).size;
    return `${botModule.emoji} **${botModule.name}** ${enabled ? '' : '*(désactivé)* '}— ${count} commande(s)\n${botModule.description}`;
  });

  return baseEmbed()
    .setTitle('📖 Aide')
    .setDescription(
      `Sélectionnez un module dans le menu ci-dessous pour afficher ses commandes.\n\n${lines.join('\n\n')}`,
    );
}

export function buildModuleHelp(client: BotClient, moduleId: string): EmbedBuilder | null {
  const botModule = client.modules.get(moduleId);
  if (!botModule) return null;

  const lines = client.commands
    .filter((command) => command.moduleId === moduleId)
    .sort((a, b) => a.data.name.localeCompare(b.data.name))
    .map(describeCommand)
    .flat();

  return baseEmbed()
    .setTitle(`${botModule.emoji} ${botModule.name}`)
    .setDescription(
      `${botModule.description}\n\n${lines.join('\n') || 'Aucune commande dans ce module.'}`.slice(0, 4096),
    );
}
