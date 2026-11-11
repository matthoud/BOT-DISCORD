# Bot Discord modulaire

Bot Discord d'administration, de modération, de logs, de bienvenue et de divertissement, pensé pour
plusieurs serveurs et pour accueillir de nouveaux modules sans toucher à l'existant.

- **Langage** : TypeScript (Node.js ≥ 20.12)
- **Discord** : discord.js v14 (commandes slash, boutons, menus, modals)
- **Données** : PostgreSQL + Prisma
- **Logs techniques** : Pino

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Créer le bot sur le Developer Portal](#créer-le-bot-sur-le-developer-portal)
3. [Installation en développement](#installation-en-développement)
4. [Configuration du fichier .env](#configuration-du-fichier-env)
5. [Base de données](#base-de-données)
6. [Lancement](#lancement)
7. [Premiers pas sur un serveur](#premiers-pas-sur-un-serveur)
8. [Déploiement sur Debian](#déploiement-sur-debian)
9. [Mise à jour du bot](#mise-à-jour-du-bot)
10. [Architecture](#architecture)
11. [Ajouter une commande](#ajouter-une-commande)
12. [Créer un module](#créer-un-module)
13. [Permissions](#permissions)
14. [Tests et qualité](#tests-et-qualité)
15. [Dépannage](#dépannage)

## Fonctionnalités

| Module | Commandes |
|---|---|
| 🛠️ Administration | `/serverinfo` `/userinfo` `/avatar` `/role add\|remove\|info` `/clear` `/slowmode` `/lock` `/unlock` `/nick` `/announce` |
| 🛡️ Modération | `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/clearwarnings` `/history` `/sanctions add\|remove\|list` |
| 📜 Logs | `/logs setup\|test` |
| 👋 Bienvenue | `/welcome setup` |
| 🎉 Divertissement | `/8ball` `/coinflip` `/dice` `/meme` `/joke` `/ship` `/hug` `/slap` `/poll` `/choose` |
| 🧰 Utilitaires | `/help` `/ping` `/config view\|dm-sanctions\|timezone` `/module list\|enable\|disable` `/permissions allow\|deny\|reset\|list` `/preferences mp` |

Points notables :

- **Modération** : chaque action exige une raison, reçoit un numéro de cas propre au serveur, est
  enregistrée en base et publiée dans le salon de logs de modération. La hiérarchie des rôles est
  vérifiée pour le modérateur *et* pour le bot. `/ban` accepte une durée (`7j`, `12h`…) : le
  débannissement est alors automatique, même après un redémarrage.
- **Sanctions automatiques** : `/sanctions add seuil:3 action:Exclusion temporaire duree:1h`
  applique la sanction quand un membre atteint 3 avertissements actifs.
- **Logs** : cinq catégories (membres, messages, salons, rôles, modération), un salon par catégorie.
- **Bienvenue** : messages d'arrivée et de départ avec `{user}`, `{username}`, `{server}`,
  `{memberCount}`, rôle automatique, aperçu avant activation.
- **Multi-serveurs** : toutes les données sont isolées par `guildId`. Chaque module (sauf
  Utilitaires) s'active ou se désactive par serveur avec `/module`.

## Créer le bot sur le Developer Portal

1. Ouvrez <https://discord.com/developers/applications> puis **New Application**.
2. **General Information** : copiez l'**Application ID** → variable `DISCORD_CLIENT_ID`.
3. **Bot** → **Reset Token** : copiez le token → variable `DISCORD_TOKEN`. Il n'est affiché
   qu'une fois. Ne le partagez jamais et ne le commitez jamais.

### Intents

Dans **Bot → Privileged Gateway Intents**, activez :

| Intent | Utilité |
|---|---|
| **Server Members Intent** | Arrivées et départs, changements de pseudo et de rôles, bienvenue |
| **Message Content Intent** | Afficher le contenu des messages modifiés ou supprimés dans les logs |

Sans ces deux intents, le bot refuse de se connecter (erreur `Used disallowed intents`).
Les intents non privilégiés (`Guilds`, `GuildModeration`, `GuildMessages`) sont demandés
automatiquement.

### Invitation (OAuth2)

Dans **OAuth2 → URL Generator** :

- **Scopes** : `bot` et `applications.commands`.
- **Bot Permissions** :

| Permission | Utilisée par |
|---|---|
| Voir les salons, Envoyer des messages, Intégrer des liens, Voir l'historique des messages | Toutes les réponses, logs, bienvenue |
| Gérer les messages | `/clear` |
| Gérer les salons | `/slowmode` |
| Gérer les rôles | `/role`, `/lock`, `/unlock`, rôle automatique |
| Gérer les pseudos | `/nick` |
| Expulser des membres | `/kick` |
| Bannir des membres | `/ban`, `/unban` |
| Exclure temporairement des membres | `/timeout`, `/untimeout` |
| Mentionner @everyone, @here et tous les rôles | `/announce` avec mention (facultatif) |
| Créer des sondages | `/poll` |

Ouvrez l'URL générée pour inviter le bot.

> **Important** : dans **Paramètres du serveur → Rôles**, placez le rôle du bot **au-dessus** des
> rôles qu'il doit gérer ou sanctionner. Discord interdit à un bot d'agir sur un rôle supérieur ou
> égal au sien.

## Installation en développement

Prérequis : Node.js ≥ 20.12, npm, et PostgreSQL (ou Docker pour le lancer).

```bash
git clone <url-du-depot> discord-bot
cd discord-bot
npm install
cp .env.example .env      # sous Windows : copy .env.example .env
```

## Configuration du fichier .env

| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | oui | Token du bot |
| `DISCORD_CLIENT_ID` | oui | ID de l'application |
| `DEV_GUILD_ID` | non | ID d'un serveur de test : les commandes n'y sont déployées que là, instantanément. Laisser vide en production |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | avec Docker | Identifiants de la base créée par Docker Compose |
| `DATABASE_URL` | oui | URL PostgreSQL utilisée par Prisma |
| `NODE_ENV` | non | `development` (défaut) ou `production` |
| `LOG_LEVEL` | non | `fatal`, `error`, `warn`, `info` (défaut), `debug`, `trace` |

La configuration est validée au démarrage : une variable manquante ou invalide arrête le bot avec
un message qui nomme la variable (jamais sa valeur). Le fichier `.env` est ignoré par git.

## Base de données

### Option A : PostgreSQL avec Docker (recommandé en développement)

```bash
docker compose up -d db
```

La base écoute sur `127.0.0.1:5432` avec les identifiants `POSTGRES_*` du `.env`. Vérifiez que
`DATABASE_URL` utilise les mêmes.

### Option B : PostgreSQL installé sur Debian

```bash
sudo apt update && sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER discordbot WITH PASSWORD 'un-mot-de-passe-solide';"
sudo -u postgres psql -c "CREATE DATABASE discordbot OWNER discordbot;"
```

Puis dans `.env` :
`DATABASE_URL=postgresql://discordbot:un-mot-de-passe-solide@localhost:5432/discordbot?schema=public`

### Initialisation

```bash
npm run db:deploy     # applique les migrations de prisma/migrations
```

Après une modification de `prisma/schema.prisma`, créez une migration avec
`npm run db:migrate -- --name description_du_changement`, puis commitez le dossier généré.

## Lancement

```bash
npm run commands:deploy   # enregistre les commandes slash auprès de Discord
npm run dev               # lance le bot avec rechargement automatique
```

`commands:deploy` n'est à relancer que lorsqu'une commande est ajoutée, supprimée ou que ses
options changent. Avec `DEV_GUILD_ID`, l'effet est immédiat ; sans, le déploiement est global et
peut mettre jusqu'à une heure à se propager. `npm run commands:deploy -- --clear` supprime les
commandes de la cible (utile pour retirer les commandes du serveur de test avant un déploiement
global, afin d'éviter les doublons).

Production, sans Docker :

```bash
npm run build                  # compile vers dist/
npm run commands:deploy:prod
npm start
```

## Premiers pas sur un serveur

1. `/help` : vue d'ensemble des modules et commandes.
2. `/logs setup` : choisissez un salon par catégorie de logs, puis `/logs test` pour vérifier que
   chaque salon reçoit bien un message (la commande indique la cause en cas de problème).
3. `/welcome setup` : choisissez le salon, ajustez les messages, cliquez sur **Aperçu**, puis **Activer**.
4. `/sanctions add` : définissez vos sanctions automatiques.
5. `/config view` : résumé de la configuration du serveur.

## Déploiement sur Debian

### Avec Docker Compose (le plus simple)

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone <url-du-depot> /opt/discord-bot && cd /opt/discord-bot
cp .env.example .env && nano .env          # token, ID, mot de passe de la base
chmod 600 .env
docker compose up -d --build
docker compose run --rm bot node dist/scripts/deploy-commands.js
docker compose logs -f bot
```

Le conteneur applique les migrations à chaque démarrage, tourne sous un utilisateur sans
privilèges et redémarre automatiquement. Dans le réseau Docker, `DATABASE_URL` est redéfinie
automatiquement pour pointer vers le service `db`. Les données PostgreSQL sont dans le volume
`db_data`, les logs dans `bot_logs`.

Sauvegarde de la base :

```bash
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > sauvegarde.sql
```

### Sans Docker (systemd)

```bash
# Node.js 22 (dépôt NodeSource) et PostgreSQL
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql git

# Utilisateur dédié, sans shell
sudo useradd --system --home /opt/discord-bot --shell /usr/sbin/nologin discordbot
sudo git clone <url-du-depot> /opt/discord-bot
sudo chown -R discordbot:discordbot /opt/discord-bot
cd /opt/discord-bot

sudo -u discordbot cp .env.example .env
sudo -u discordbot nano .env && sudo chmod 600 .env    # voir « Base de données », option B

sudo -u discordbot npm ci
sudo -u discordbot npm run build
sudo -u discordbot npm run commands:deploy:prod

sudo cp scripts/discord-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now discord-bot
journalctl -u discord-bot -f
```

Le service applique les migrations avant chaque démarrage et relance le bot en cas d'arrêt.

Les logs techniques sont écrits au format JSON sur la sortie standard et dans `logs/bot.log`.
Pour limiter la taille de ce fichier, créez `/etc/logrotate.d/discord-bot` :

```text
/opt/discord-bot/logs/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
```

## Mise à jour du bot

Avec Docker :

```bash
cd /opt/discord-bot && git pull
docker compose up -d --build
docker compose run --rm bot node dist/scripts/deploy-commands.js   # si des commandes ont changé
```

Avec systemd :

```bash
cd /opt/discord-bot
sudo -u discordbot git pull
sudo -u discordbot npm ci
sudo -u discordbot npm run build
sudo -u discordbot npm run commands:deploy:prod                    # si des commandes ont changé
sudo systemctl restart discord-bot
```

Les migrations sont appliquées automatiquement au redémarrage. Toute la configuration étant en
base, un redémarrage ne fait rien perdre ; seuls les cooldowns en cours sont remis à zéro.

Les migrations ne font qu'ajouter des tables et des colonnes. Par précaution, sauvegardez tout de
même la base avant une mise à jour qui en contient :

```bash
# Avec Docker
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > sauvegarde-$(date +%F).sql
# Sans Docker
sudo -u postgres pg_dump <nom-de-la-base> > sauvegarde-$(date +%F).sql
```

## Architecture

```text
src/
├── index.ts                 Point d'entrée : chargement, connexion, arrêt propre
├── core/                    Socle commun, indépendant des fonctionnalités
│   ├── client.ts            Client Discord (intents, registres)
│   ├── config/env.ts        Lecture et validation du .env
│   ├── logger/              Logger Pino avec masquage des secrets
│   ├── database/            Client Prisma + repositories (seul accès à la base)
│   ├── handlers/            Chargement des modules, routage des interactions et événements
│   ├── permissions/         Garde d'accès, hiérarchie des rôles, libellés
│   ├── cooldowns/           Cooldowns par commande, membre et serveur
│   ├── scheduler/           Planificateur unique des tâches périodiques
│   ├── http/                Client HTTP sécurisé pour tous les appels vers des sites externes
│   ├── errors/              BotError + gestion globale des erreurs
│   ├── events/bus.ts        Bus interne pour la communication entre modules
│   └── ui/                  Embeds, couleurs, confirmation, pagination, customId
├── modules/                 Une fonctionnalité = un dossier
│   └── <module>/
│       ├── module.ts        Manifeste (id, nom, désactivable ou non, init)
│       ├── commands/        Commandes slash
│       ├── events/          Écouteurs d'événements Discord
│       ├── components/      Boutons, menus et modals persistants
│       └── services/        Logique métier du module
├── scripts/                 Déploiement des commandes
├── types/                   Contrats : Command, BotEvent, ComponentHandler, BotModule
└── utils/                   Fonctions génériques (durées, formatage, cache, fuseaux horaires)
prisma/                      Schéma et migrations
tests/                       Tests automatisés
```

### Parcours d'une commande

Toutes les commandes passent par `core/handlers/interactions.ts`, dans cet ordre :

1. le module est-il activé sur ce serveur ?
2. le membre a-t-il le droit (permissions Discord et règles `/permissions`) ?
3. le bot a-t-il les permissions nécessaires dans le salon ?
4. le cooldown est-il écoulé ?
5. exécution ; toute erreur est interceptée, journalisée et traduite en message clair.

Une commande **déclare** ses exigences (`userPermissions`, `botPermissions`, `cooldown`) : elle ne
les vérifie pas elle-même. Les contrôles de hiérarchie (`assertCanActOn`, `assertCanManageRole`)
sont appelés par la commande, car ils dépendent de la cible.

### Composants interactifs

- **Persistants** (`components/`) : le `customId` vaut `module:action|argument`. Ils fonctionnent
  encore après un redémarrage. Exemple : les menus de `/logs setup`.
- **Temporaires** : identifiants préfixés `tmp:`, gérés par un collecteur local (confirmation,
  pagination). Ils expirent d'eux-mêmes.

### Tâches périodiques

Toutes les tâches de fond passent par le planificateur de `core/scheduler/` : aucun module ne crée
son propre minuteur. Un module déclare ses tâches dans la fonction `init` de son manifeste :

```ts
import { scheduler } from '../../core/scheduler';

scheduler.register({
  name: 'tickets:fermeture-auto',   // unique, de la forme module:tache
  intervalSeconds: 300,
  timeoutSeconds: 60,               // facultatif, 5 minutes par défaut
  run: async ({ client, signal }) => { /* … */ },
});
```

Le planificateur garantit que :

- une tâche ne s'exécute jamais deux fois en même temps ;
- une tâche en échec est retentée avec un délai qui double à chaque échec (une heure au plus, ou
  l'intervalle s'il est plus long), sans retarder les autres ;
- une tâche trop longue est considérée en échec et son `signal` est annulé ;
- l'échéance de chaque tâche est enregistrée dans la table `ScheduledTask` : après un redémarrage,
  une tâche en retard repart aussitôt et les autres attendent leur heure.

Les tâches démarrent une fois le bot connecté à Discord. Chaque échec est journalisé avec le nom
de la tâche et le délai avant la prochaine tentative.

### Appels vers des sites externes

Tout appel HTTP sortant passe par `httpClient` (`core/http/client.ts`), jamais par `fetch`
directement. Les adresses sont traitées comme non fiables :

- seuls HTTP et HTTPS sont acceptés, sans identifiants dans l'adresse ;
- les adresses privées, locales et réservées sont refusées, y compris après une redirection ou
  lorsqu'un nom de domaine public pointe vers une adresse interne ;
- la durée (10 s par défaut) et la taille de la réponse (2 Mo par défaut, avant comme après
  décompression) sont bornées ;
- les requêtes vers un même hôte sont espacées d'une seconde ;
- `getJson(url, schema)` valide la réponse avec un schéma zod avant de la retourner.

Les erreurs sont des `HttpError` dont le message, en français, peut être montré à l'utilisateur.

### Modèle de données

| Table | Contenu |
|---|---|
| `GuildConfig` | Racine d'un serveur : préférences générales, fuseau horaire, compteur de cas |
| `ScheduledTask` | État des tâches périodiques (globale, sans lien avec un serveur) |
| `UserConfig` | Préférences d'un utilisateur |
| `ModuleConfig` | Activation et réglages d'un module pour un serveur |
| `ModerationCase` | Chaque action de modération, numérotée par serveur |
| `Warning` | Avertissements (actifs ou effacés), reliés à leur cas |
| `SanctionRule` | Sanctions automatiques par seuil d'avertissements |
| `WelcomeConfig` | Configuration de la bienvenue |
| `LoggingConfig` | Salon de logs par catégorie |
| `CustomPermission` | Rôles autorisés ou refusés par commande |

Toutes les tables d'un serveur référencent `GuildConfig` (suppression en cascade). Les requêtes
passent exclusivement par Prisma, avec des paramètres liés : aucune requête SQL n'est construite
par concaténation.

## Ajouter une commande

Créez un fichier dans `src/modules/<module>/commands/`. Il est chargé automatiquement.

```ts
// src/modules/fun/commands/hello.ts
import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, Colors } from '../../../core/ui/embeds';
import type { Command } from '../../../types';

const command: Command = {
  data: new SlashCommandBuilder().setName('hello').setDescription('Dit bonjour.'),
  cooldown: 3,

  async execute(interaction) {
    await interaction.reply({
      embeds: [baseEmbed(Colors.fun).setDescription(`Bonjour ${interaction.user} !`)],
    });
  },
};

export default command;
```

Pour une commande réservée, déclarez la permission aux **deux** endroits (un test le vérifie) :

```ts
data: new SlashCommandBuilder()
  .setName('exemple')
  .setDescription('…')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // masque la commande côté Discord
userPermissions: [PermissionFlagsBits.ManageGuild],               // vérification par le bot
botPermissions: [PermissionFlagsBits.ManageRoles],                // ce dont le bot a besoin
```

Règles à suivre :

- Pour refuser une action, lancez `throw new BotError('message pour l’utilisateur')` : le message
  est affiché en privé, proprement.
- Utilisez `interaction.deferReply()` avant tout traitement de plus de 3 secondes.
- Passez par un repository de `core/database/repositories/` pour toute donnée.
- Ajoutez le nom de la commande dans `tests/modules.test.ts`, puis lancez
  `npm run commands:deploy`.

## Créer un module

1. Créez `src/modules/<id>/module.ts` (l'`id` doit être le nom du dossier) :

   ```ts
   import type { BotModule } from '../../types';

   const ticketsModule: BotModule = {
     id: 'tickets',
     name: 'Tickets',
     description: 'Support par tickets.',
     emoji: '🎫',
     canDisable: true,
     // defaultEnabled: false,  // le module reste inactif tant qu'un administrateur ne l'active pas
     // init(client) { /* tâches périodiques, abonnement au bus interne… */ },
   };

   export default ticketsModule;
   ```

2. Ajoutez au besoin les dossiers `commands/`, `events/`, `components/` et `services/`.
3. Événement Discord (`events/`) :

   ```ts
   import { Events } from 'discord.js';
   import { defineEvent } from '../../../types';

   export default defineEvent({
     name: Events.MessageCreate,
     async execute(message) { /* … */ },
   });
   ```

   Un écouteur d'événement doit vérifier lui-même `isModuleEnabled(guildId, 'tickets')`, comme le
   font les services des modules `logging` et `welcome`.

4. Composant persistant (`components/`) :

   ```ts
   import type { ComponentHandler } from '../../../types';

   const handler: ComponentHandler = {
     id: 'tickets:open', // doit commencer par l'id du module
     async execute(interaction, args) { /* … */ },
   };

   export default handler;
   ```

   Le bouton correspondant utilise `componentId('tickets:open', 'argument')`.

5. Données : ajoutez vos modèles à `prisma/schema.prisma` avec un `guildId` relié à `GuildConfig`,
   créez la migration (`npm run db:migrate -- --name tickets`) et un repository dans
   `core/database/repositories/`. Les réglages simples peuvent aller dans `ModuleConfig.settings`.
6. Pour réagir à ce que fait un autre module sans en dépendre, utilisez le bus interne
   (`core/events/bus.ts`) : la modération y publie `moderationCase`, que le module de logs écoute.

7. Tâche de fond : déclarez-la dans `init` avec `scheduler.register` (voir « Tâches périodiques »).
   Appel à un site externe : utilisez `httpClient` (voir « Appels vers des sites externes »).

Le module apparaît automatiquement dans `/help`, `/module list` et `/config view`. Sans
`defaultEnabled: false`, il est actif sur tous les serveurs dès son installation ; avec, chaque
serveur l'active par `/module enable`.

## Permissions

Pour chaque commande, dans l'ordre :

1. Le propriétaire et les administrateurs du serveur passent toujours.
2. Un rôle **refusé** (`/permissions deny`) bloque, même si un autre rôle autorise.
3. Un rôle **autorisé** (`/permissions allow`) donne accès, même sans la permission Discord.
4. Sinon, la permission Discord déclarée par la commande est exigée.
5. Une commande publique (ex. `/meme`) devient réservée dès qu'au moins un rôle y est autorisé.

`/permissions` est réservé aux administrateurs, car il peut ouvrir l'accès à la modération.

> Les commandes réservées sont aussi masquées par Discord aux membres sans la permission. Après un
> `/permissions allow`, rendez la commande visible pour le rôle dans **Paramètres du serveur →
> Intégrations → (le bot)**. Sans cela, le rôle est autorisé par le bot mais ne voit pas la commande.

`/role info` fait partie de la commande `/role` et demande donc aussi « Gérer les rôles ».

## Tests et qualité

```bash
npm run typecheck   # vérification TypeScript stricte
npm run lint        # ESLint
npm test            # tests automatisés (Vitest)
```

Les tests couvrent la hiérarchie des rôles, la décision d'accès, les durées, les variables de
bienvenue, les cooldowns, le cache, et valident que chaque commande chargée respecte les
contraintes de Discord et que chaque commande sensible est protégée. Ils couvrent aussi le
planificateur (intervalles, absence de chevauchement, reprise après échec et après redémarrage) et
le client HTTP (adresses internes, redirections, taille, délai), à l'aide d'un serveur local.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `Configuration invalide` au démarrage | Variable manquante ou mal formée dans `.env` |
| `Used disallowed intents` | Intents privilégiés non activés sur le Developer Portal |
| `Can't reach database server` | PostgreSQL arrêté ou `DATABASE_URL` incorrecte |
| Les commandes n'apparaissent pas | `npm run commands:deploy` non lancé, ou déploiement global encore en propagation |
| Commandes en double | Déployées à la fois sur le serveur de test et globalement : `npm run commands:deploy -- --clear` avec `DEV_GUILD_ID` défini |
| « Mon rôle est placé trop bas » | Remontez le rôle du bot dans la liste des rôles |
| Logs de messages « contenu indisponible » | Message antérieur au démarrage du bot : Discord ne fournit pas son contenu |
| Aucun log publié | Module désactivé, salon non configuré, ou bot sans droit d'écriture dans le salon |
