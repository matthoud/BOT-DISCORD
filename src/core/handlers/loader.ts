import fs from 'node:fs';
import path from 'node:path';
import type {
  BotEvent,
  BotModule,
  Command,
  ComponentHandler,
  LoadedCommand,
  LoadedComponent,
  LoadedEvent,
} from '../../types';
import { logger } from '../logger';

const MODULES_DIR = path.join(__dirname, '..', '..', 'modules');
// .ts en développement (tsx), .js une fois compilé. Les fichiers de déclaration sont ignorés.
const SOURCE_FILE = /(?<!\.d)\.(ts|js)$/;

export interface ModuleRegistry {
  modules: BotModule[];
  commands: LoadedCommand[];
  components: LoadedComponent[];
  events: LoadedEvent[];
}

/** Liste récursivement les fichiers source d'un dossier (vide si le dossier n'existe pas). */
function listSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return SOURCE_FILE.test(entry.name) ? [fullPath] : [];
  });
}

function loadDefaultExport<T>(file: string): T | undefined {
  const loaded = require(file) as { default?: T };
  return loaded.default;
}

function findManifest(moduleDir: string): string | undefined {
  return ['module.ts', 'module.js']
    .map((name) => path.join(moduleDir, name))
    .find((file) => fs.existsSync(file));
}

/**
 * Découvre tous les modules de `src/modules/*`.
 * Chaque module fournit un manifeste `module.ts` et, au choix, des dossiers
 * `commands/`, `events/` et `components/` dont chaque fichier exporte un élément par défaut.
 * Une définition invalide interrompt le démarrage : mieux vaut échouer tôt qu'ignorer une commande.
 */
export function loadModules(): ModuleRegistry {
  const registry: ModuleRegistry = { modules: [], commands: [], components: [], events: [] };
  const commandNames = new Set<string>();
  const componentIds = new Set<string>();

  const moduleDirs = fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const dirName of moduleDirs) {
    const moduleDir = path.join(MODULES_DIR, dirName);
    const manifestFile = findManifest(moduleDir);
    if (!manifestFile) {
      logger.warn({ module: dirName }, 'Dossier de module sans manifeste module.ts : ignoré');
      continue;
    }

    const manifest = loadDefaultExport<BotModule>(manifestFile);
    if (!manifest || manifest.id !== dirName) {
      throw new Error(`Manifeste invalide pour le module « ${dirName} » (id attendu : ${dirName}).`);
    }
    registry.modules.push(manifest);

    for (const file of listSourceFiles(path.join(moduleDir, 'commands'))) {
      const command = loadDefaultExport<Command>(file);
      if (!command?.data?.name || typeof command.execute !== 'function') {
        throw new Error(`Commande invalide (data/execute manquant) : ${file}`);
      }
      if (commandNames.has(command.data.name)) {
        throw new Error(`Nom de commande en double : /${command.data.name} (${file})`);
      }
      commandNames.add(command.data.name);
      registry.commands.push({ ...command, moduleId: manifest.id });
    }

    for (const file of listSourceFiles(path.join(moduleDir, 'components'))) {
      const component = loadDefaultExport<ComponentHandler>(file);
      if (!component?.id || typeof component.execute !== 'function') {
        throw new Error(`Composant invalide (id/execute manquant) : ${file}`);
      }
      if (componentIds.has(component.id)) {
        throw new Error(`Identifiant de composant en double : ${component.id} (${file})`);
      }
      componentIds.add(component.id);
      registry.components.push({ ...component, moduleId: manifest.id });
    }

    for (const file of listSourceFiles(path.join(moduleDir, 'events'))) {
      const event = loadDefaultExport<BotEvent>(file);
      if (!event?.name || typeof event.execute !== 'function') {
        throw new Error(`Événement invalide (name/execute manquant) : ${file}`);
      }
      registry.events.push({ ...event, moduleId: manifest.id });
    }
  }

  return registry;
}
