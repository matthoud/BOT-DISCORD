import { ApplicationCommandOptionType, type APIApplicationCommandOption } from 'discord.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ModuleRegistry } from '../src/core/handlers/loader';

// Le chargeur dépend de la configuration : on fournit des valeurs factices avant de l'importer.
process.env.DISCORD_TOKEN = 'jeton-de-test';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';

let registry: ModuleRegistry;

beforeAll(async () => {
  // Le chargeur utilise `require` sur des fichiers .ts : tsx les rend chargeables, comme avec `npm run dev`.
  // @ts-expect-error -- point d'entrée sans déclaration de types
  await import('tsx/cjs');
  const { loadModules } = await import('../src/core/handlers/loader');
  registry = loadModules();
});

/** Commandes annoncées dans le cahier des charges, par module. */
const EXPECTED: Record<string, string[]> = {
  administration: ['serverinfo', 'userinfo', 'avatar', 'role', 'clear', 'slowmode', 'lock', 'unlock', 'nick', 'announce'],
  moderation: ['ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'warnings', 'clearwarnings', 'history', 'sanctions'],
  logging: ['logs'],
  welcome: ['welcome'],
  fun: ['8ball', 'coinflip', 'dice', 'meme', 'joke', 'ship', 'hug', 'slap', 'poll', 'choose'],
  utility: ['ping', 'help', 'module', 'permissions', 'config', 'preferences'],
  levels: ['rank', 'leaderboard', 'level'],
};

/** Modules de la V2 : inactifs tant qu'un administrateur ne les active pas. */
const DISABLED_BY_DEFAULT = ['levels'];

const NAME_PATTERN = /^[\p{Ll}\p{N}_-]{1,32}$/u;

function checkOptions(path: string, options: APIApplicationCommandOption[] = []): void {
  expect(options.length, `${path} : 25 options maximum`).toBeLessThanOrEqual(25);
  let optionalSeen = false;
  for (const option of options) {
    const optionPath = `${path} ${option.name}`;
    expect(option.name, optionPath).toMatch(NAME_PATTERN);
    expect(option.description.length, `${optionPath} : description`).toBeGreaterThan(0);
    expect(option.description.length, `${optionPath} : description`).toBeLessThanOrEqual(100);

    if (
      option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
    ) {
      checkOptions(optionPath, option.options);
      continue;
    }
    // Discord exige que les options obligatoires précèdent les options facultatives.
    if (option.required) {
      expect(optionalSeen, `${optionPath} : option obligatoire après une facultative`).toBe(false);
    } else {
      optionalSeen = true;
    }
  }
}

describe('chargement des modules', () => {
  it('charge tous les modules attendus avec leurs commandes', () => {
    expect(registry.modules.map((botModule) => botModule.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [moduleId, names] of Object.entries(EXPECTED)) {
      const loaded = registry.commands
        .filter((command) => command.moduleId === moduleId)
        .map((command) => command.data.name);
      expect(loaded.sort(), moduleId).toEqual([...names].sort());
    }
  });

  it('produit des définitions de commandes conformes aux contraintes de Discord', () => {
    for (const command of registry.commands) {
      const json = command.data.toJSON();
      expect(json.name, json.name).toMatch(NAME_PATTERN);
      expect(json.description.length, `/${json.name} : description`).toBeGreaterThan(0);
      expect(json.description.length, `/${json.name} : description`).toBeLessThanOrEqual(100);
      checkOptions(`/${json.name}`, json.options);
    }
  });

  it('restreint côté Discord toute commande exigeant des permissions', () => {
    for (const command of registry.commands) {
      const json = command.data.toJSON();
      if (command.userPermissions?.length) {
        const declared = command.userPermissions.reduce((bits, bit) => bits | bit, 0n);
        expect(json.default_member_permissions, `/${json.name}`).toBe(declared.toString());
      } else {
        expect(json.default_member_permissions ?? null, `/${json.name}`).toBeNull();
      }
    }
  });

  it('protège les commandes sensibles par une permission et un cooldown', () => {
    const sensitive = [...EXPECTED.moderation!, 'role', 'clear', 'slowmode', 'lock', 'unlock', 'nick', 'announce', 'logs', 'welcome', 'module', 'permissions', 'config', 'level'];
    for (const name of sensitive) {
      const command = registry.commands.find((loaded) => loaded.data.name === name);
      expect(command?.userPermissions?.length, `/${name} : permission`).toBeGreaterThan(0);
      expect(command?.cooldown, `/${name} : cooldown`).toBeGreaterThan(0);
    }
  });

  it('protège tous les composants de configuration et garde des identifiants uniques', () => {
    const ids = registry.components.map((component) => component.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const component of registry.components) {
      expect(component.id.startsWith(`${component.moduleId}:`), component.id).toBe(true);
      if (component.moduleId !== 'utility') {
        expect(component.userPermissions?.length, component.id).toBeGreaterThan(0);
      }
    }
  });

  it('seul le module utilitaire est indispensable', () => {
    const locked = registry.modules.filter((botModule) => !botModule.canDisable).map((botModule) => botModule.id);
    expect(locked).toEqual(['utility']);
  });

  it('enregistre les événements de logs et de bienvenue', () => {
    const count = (moduleId: string) => registry.events.filter((event) => event.moduleId === moduleId).length;
    expect(count('logging')).toBe(14);
    expect(count('welcome')).toBe(2);
    expect(count('levels')).toBe(1);
  });

  it('laisse les modules de la V1 actifs par défaut et ceux de la V2 inactifs', () => {
    const disabled = registry.modules
      .filter((botModule) => botModule.defaultEnabled === false)
      .map((botModule) => botModule.id);
    expect(disabled.sort()).toEqual([...DISABLED_BY_DEFAULT].sort());
  });
});
