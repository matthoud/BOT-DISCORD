import fs from 'node:fs';
import path from 'node:path';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { loadModules } from '../core/handlers/loader';
import { permissionNames } from '../core/permissions/names';

/**
 * Génère `docs/commandes.md` à partir des définitions des commandes : la référence est donc
 * toujours fidèle au code. À relancer après l'ajout ou la modification d'une commande :
 * `npm run docs:commands`.
 */

type Option = NonNullable<RESTPostAPIChatInputApplicationCommandsJSONBody['options']>[number];

const OUTPUT = path.resolve(__dirname, '../../docs/commandes.md');
const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;
const TYPES: Record<number, string> = {
  3: 'texte',
  4: 'nombre entier',
  5: 'oui / non',
  6: 'membre',
  7: 'salon',
  8: 'rôle',
  9: 'membre ou rôle',
  10: 'nombre',
  11: 'fichier',
};

const escapeCell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function describeOption(option: Option): string {
  const details = [TYPES[option.type] ?? 'valeur'];
  if ('required' in option && option.required) details.push('obligatoire');
  if ('autocomplete' in option && option.autocomplete) details.push('liste proposée');
  if ('min_value' in option && option.min_value !== undefined)
    details.push(`min. ${option.min_value}`);
  if ('max_value' in option && option.max_value !== undefined)
    details.push(`max. ${option.max_value}`);
  if ('max_length' in option && option.max_length !== undefined)
    details.push(`${option.max_length} caractères max.`);
  let text = `| \`${option.name}\` | ${details.join(', ')} | ${escapeCell(option.description)}`;
  if ('choices' in option && option.choices?.length) {
    text += ` — choix : ${option.choices.map((choice) => escapeCell(choice.name)).join(', ')}`;
  }
  return `${text} |`;
}

function usage(prefix: string, options: Option[]): string {
  const args = options.map((option) => {
    const required = 'required' in option && option.required;
    return required ? option.name : `[${option.name}]`;
  });
  return `\`${[prefix, ...args].join(' ')}\``;
}

function renderLeaf(title: string, description: string, options: Option[]): string[] {
  const lines = [`#### ${title}`, '', description, '', usage(title, options), ''];
  if (options.length > 0) {
    lines.push(
      '| Option | Type | Description |',
      '|---|---|---|',
      ...options.map(describeOption),
      '',
    );
  }
  return lines;
}

function renderCommand(data: RESTPostAPIChatInputApplicationCommandsJSONBody): string[] {
  const name = `/${data.name}`;
  const lines = [`### ${name}`, ''];
  const required = data.default_member_permissions
    ? permissionNames([BigInt(data.default_member_permissions)])
    : [];
  lines.push(
    required.length > 0
      ? `${data.description}\n\nRéservée aux membres ayant : **${required.join(', ')}**.`
      : `${data.description}\n\nAccessible à tous les membres.`,
    '',
  );

  const options = data.options ?? [];
  const nested = options.filter(
    (option) => option.type === SUBCOMMAND || option.type === SUBCOMMAND_GROUP,
  );
  if (nested.length === 0) {
    const leaf = renderLeaf(name, '', options);
    // Commande sans sous-commande : l'en-tête et la description sont déjà écrits.
    lines.push(...leaf.slice(3));
    return lines;
  }
  for (const option of nested) {
    if (option.type === SUBCOMMAND_GROUP) {
      for (const sub of (option.options ?? []) as Option[]) {
        lines.push(
          ...renderLeaf(
            `${name} ${option.name} ${sub.name}`,
            sub.description,
            (sub as { options?: Option[] }).options ?? [],
          ),
        );
      }
    } else {
      lines.push(
        ...renderLeaf(
          `${name} ${option.name}`,
          option.description,
          (option as { options?: Option[] }).options ?? [],
        ),
      );
    }
  }
  return lines;
}

function main(): void {
  const registry = loadModules();
  const lines = [
    '# Référence des commandes',
    '',
    '<!-- Fichier généré par `npm run docs:commands` à partir du code : ne pas le modifier à la main. -->',
    '',
    `${registry.commands.length} commandes réparties en ${registry.modules.length} modules. Les options entre crochets sont facultatives.`,
    'Les modules marqués *(à activer)* sont inactifs tant qu’un administrateur n’a pas lancé `/module enable`.',
    '',
  ];
  const sections = registry.modules.map((botModule) => {
    const commands = registry.commands
      .filter((command) => command.moduleId === botModule.id)
      .sort((a, b) => a.data.name.localeCompare(b.data.name));
    const optional = botModule.defaultEnabled === false ? ' *(à activer)*' : '';
    return { botModule, commands, title: `${botModule.emoji} ${botModule.name}${optional}` };
  });

  lines.push('## Sommaire', '');
  for (const { title, commands } of sections) {
    if (commands.length > 0)
      lines.push(
        `- **${title}** : ${commands.map((command) => `\`/${command.data.name}\``).join(' ')}`,
      );
  }
  lines.push('');

  for (const { botModule, commands, title } of sections) {
    if (commands.length === 0) continue;
    lines.push(`## ${title}`, '', botModule.description, '');
    for (const command of commands) lines.push(...renderCommand(command.data.toJSON()));
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    `${lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`,
    'utf8',
  );
  process.stdout.write(`${OUTPUT} : ${registry.commands.length} commandes documentées.\n`);
}

main();
