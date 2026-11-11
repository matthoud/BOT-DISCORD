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
11. [Module Niveaux](#module-niveaux)
12. [Module Économie](#module-économie)
13. [Module Suggestions](#module-suggestions)
14. [Module Sondages](#module-sondages)
15. [Module Événements](#module-événements)
16. [Ajouter une commande](#ajouter-une-commande)
17. [Créer un module](#créer-un-module)
18. [Permissions](#permissions)
19. [Tests et qualité](#tests-et-qualité)
20. [Dépannage](#dépannage)

## Fonctionnalités

| Module | Commandes |
|---|---|
| 🛠️ Administration | `/serverinfo` `/userinfo` `/avatar` `/role add\|remove\|info` `/clear` `/slowmode` `/lock` `/unlock` `/nick` `/announce` |
| 🛡️ Modération | `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/clearwarnings` `/history` `/sanctions add\|remove\|list` |
| 📜 Logs | `/logs setup\|test` |
| 👋 Bienvenue | `/welcome setup` |
| 🎉 Divertissement | `/8ball` `/coinflip` `/dice` `/meme` `/joke` `/ship` `/hug` `/slap` `/choose` |
| 📊 Sondages | `/poll create` `/poll results` |
| 🧰 Utilitaires | `/help` `/ping` `/config view\|dm-sanctions\|timezone` `/module list\|enable\|disable` `/permissions allow\|deny\|reset\|list` `/preferences mp` |
| ⭐ Niveaux *(à activer)* | `/rank [membre]` `/leaderboard` `/level config` `/level rewards add\|remove\|list` |
| 🪙 Économie *(à activer)* | `/balance [membre]` `/daily` `/weekly` `/pay` `/shop` `/buy` `/inventory [membre]` `/economy leaderboard\|history` `/economy-admin config\|give\|take` `/shop-admin add\|edit\|remove` |
| 💡 Suggestions *(à activer)* | `/suggest` `/suggestions list\|view` `/suggestions-admin config` |
| 📅 Événements *(à activer)* | `/event list` `/event-admin create\|edit\|delete` `/reminder create\|list\|delete` |

Les modules marqués *(à activer)* sont inactifs sur un serveur tant qu'un administrateur n'a pas
lancé `/module enable`.

Points notables :

- **Niveaux** : chaque message rapporte de l'XP (15 à 25 par défaut, un gain par minute au plus).
  `/level config` ouvre un panneau pour régler les gains, la progression, le message et le salon
  des annonces, ainsi que les salons et rôles qui ne rapportent pas d'XP. `/level rewards` attribue
  un rôle à un niveau donné. `/rank` affiche une carte en image, `/leaderboard` les 100 premiers.
  Détail dans [Module Niveaux](#module-niveaux).
- **Économie** : une monnaie propre à chaque serveur, des récompenses quotidienne et hebdomadaire,
  des gains en discutant, des paiements entre membres, une boutique (articles et rôles) et un
  inventaire. Un solde ne peut jamais devenir négatif. Détail dans
  [Module Économie](#module-économie).
- **Suggestions** : `/suggest` publie l'idée d'un membre dans un salon dédié, où chacun vote par
  boutons ; le staff accepte, refuse ou répond depuis le message. Détail dans
  [Module Suggestions](#module-suggestions).
- **Sondages** : `/poll create` publie un sondage à boutons (2 à 10 réponses, choix unique ou
  multiple, durée de 1 minute à 30 jours, résultats en direct ou à la clôture). Détail dans
  [Module Sondages](#module-sondages).
- **Événements** : annonce avec date, description, image, inscriptions par boutons, nombre de
  places et rappel automatique avant le début ; rappels personnels avec `/reminder`. Les dates
  sont lues dans le fuseau horaire du serveur. Détail dans [Module Événements](#module-événements).

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
| `LevelConfig` | Réglages des niveaux : gains, progression, annonces, salons et rôles exclus |
| `UserExperience` | XP, nombre de messages et dernier niveau constaté d'un membre sur un serveur |
| `LevelReward` | Rôle attribué à un niveau (un rôle par niveau, un niveau par rôle) |
| `EconomyConfig` | Réglages de l'économie : monnaie, récompenses, gains en discutant |
| `EconomyAccount` | Portefeuille d'un membre sur un serveur, dates des dernières récompenses |
| `EconomyTransaction` | Historique des mouvements (conservé 180 jours) |
| `ShopItem` | Article de la boutique : prix, rôle éventuel, stock, limite par membre |
| `InventoryItem` | Exemplaires d'un article possédés par un membre |
| `SuggestionConfig` | Salon des suggestions, rôle de staff, compteur de numérotation |
| `Suggestion` | Suggestion numérotée par serveur : texte, statut, message public, réponse du staff |
| `SuggestionVote` | Vote d'un membre sur une suggestion (un seul par membre) |
| `Poll` | Sondage : question, mode, échéance, date de clôture, message public |
| `PollOption` | Réponse proposée dans un sondage |
| `PollVote` | Vote d'un membre pour une réponse |
| `Event` | Événement : date, annonce, capacité, échéance et état du rappel |
| `EventParticipant` | Réponse d'un membre à un événement (une seule par membre) |
| `Reminder` | Rappel personnel : échéance, salon d'origine, état de l'envoi |

Toutes les tables d'un serveur référencent `GuildConfig` (suppression en cascade). Les requêtes
passent exclusivement par Prisma, avec des paramètres liés : aucune requête SQL n'est construite
par concaténation.

## Module Niveaux

Activation : `/module enable module:Niveaux`, puis `/level config`.

**Gain d'XP.** Un message rapporte un nombre d'XP tiré au hasard entre le minimum et le maximum
configurés. Ne rapportent rien : les messages des bots, ceux envoyés dans un salon exclu (ou dans
un fil d'un salon exclu), ceux d'un membre portant un rôle exclu, et ceux envoyés avant la fin du
délai depuis le dernier gain du membre. Ce délai est gardé en mémoire : il repart de zéro après un
redémarrage du bot.

**Progression.** Passer du niveau *n* au niveau *n + 1* coûte `base + pas × n` XP (100 et 50 par
défaut : 100 XP pour le niveau 1, 250 au total pour le niveau 2, 450 pour le niveau 3…). Le niveau
est toujours recalculé à partir de l'XP total : modifier la progression change donc le niveau de
tous les membres, sans perte d'XP et sans annonce.

**Annonces.** Le message de passage de niveau accepte `{user}`, `{username}`, `{level}`, `{xp}` et
`{server}`. Il est publié dans le salon choisi, ou à défaut là où le membre vient d'écrire. Seul le
membre concerné peut y être mentionné. Les annonces se coupent d'un bouton dans le panneau.

**Récompenses.** `/level rewards add niveau:10 role:@Habitué` attribue le rôle à ceux qui
atteignent le niveau 10. Le bot doit avoir `Gérer les rôles` et un rôle placé au-dessus de la
récompense ; l'administrateur ne peut pas choisir un rôle supérieur au sien. Par défaut les rôles
se cumulent ; le bouton « Remplacer les rôles » ne conserve que celui du palier le plus élevé. Les
rôles sont attribués au moment où un membre monte de niveau : une récompense ajoutée après coup
est donnée au prochain passage de niveau du membre.

**Carte de niveau.** `/rank` génère une image (avatar, rang, niveau, barre de progression, XP total
et nombre de messages). La police est fournie avec le bot : aucune police n'est à installer sur le
serveur. Elle couvre les alphabets latin (accents compris), grec et cyrillique. Les émojis sont
retirés du nom affiché ; si le nom contient d'autres caractères que la police ne sait pas dessiner
(idéogrammes, pseudo « stylisé »), c'est le nom d'utilisateur qui est affiché à sa place, plutôt
qu'un nom amputé. Si l'image ne peut pas être produite, les mêmes informations sont envoyées sous
forme d'embed.

Pour ajouter une statistique à la carte, passez une entrée de plus dans `stats` lors de l'appel à
`renderRankCard` (`src/modules/levels/commands/rank.ts`) ; la carte les affiche tant que la place
le permet.

## Module Économie

Activation : `/module enable module:Économie`, puis `/economy-admin config`.

**Monnaie.** Chaque serveur a sa propre monnaie (nom et symbole réglables) et ses propres
portefeuilles : rien n'est partagé entre serveurs. Un portefeuille est créé à zéro à la première
utilisation et ne peut pas dépasser un milliard.

**Gagner de la monnaie.**

| Source | Réglage par défaut | Remarque |
|---|---|---|
| `/daily` | 100 | Disponible 24 heures après la réclamation précédente |
| `/weekly` | 500 | Disponible 7 jours après la réclamation précédente |
| Messages | 1 à 3, un gain par minute au plus | Mettre le maximum à 0 pour désactiver |
| `/pay` | — | Transfert entre deux membres, sans création de monnaie |
| `/economy-admin give` | — | Ajout manuel par un administrateur, inscrit dans l'historique |

Mettre une récompense à 0 la désactive. Les récompenses ne sont pas distribuées par une tâche de
fond : le droit est calculé au moment où le membre tape la commande, à partir de la date de sa
dernière réclamation.

**Boutique.** `/shop-admin add nom:… prix:… [description] [role] [stock] [limite]` crée un article.
Un article lié à un rôle attribue ce rôle à l'achat et ne s'achète qu'une fois par membre ; le bot
doit avoir `Gérer les rôles` et un rôle placé au-dessus. `/shop-admin edit` modifie un article
(`stock:-1` pour un stock illimité, `limite:0` pour aucune limite, `en-vente:False` pour le retirer
de la vente en le laissant dans les inventaires). `/shop-admin remove` le supprime définitivement,
y compris des inventaires, sans remboursement. Une boutique contient 50 articles au plus.

`/buy` demande une confirmation. Si le rôle d'un article ne peut finalement pas être attribué,
l'achat est annulé et remboursé.

**Historique.** `/economy history` montre au membre ses 100 derniers mouvements (récompenses,
paiements, achats, remboursements, ajustements d'un administrateur) avec le solde après chacun.
Les gains obtenus en discutant ne sont pas détaillés, car ils sont trop nombreux. Les mouvements
de plus de 180 jours sont supprimés chaque jour par une tâche planifiée.

**Protections contre les abus.**

- Un montant est toujours un entier strictement positif, borné ; un paiement à soi-même ou à un
  bot est refusé.
- Le solde est vérifié et débité dans la même requête : plusieurs dépenses simultanées ne peuvent
  pas le rendre négatif. Une contrainte de la base de données l'interdit aussi, quel que soit le
  code qui écrit.
- Une récompense réclamée plusieurs fois au même instant n'est versée qu'une fois.
- Le stock et la limite par membre sont décomptés dans la même transaction que le paiement : un
  article en un seul exemplaire ne peut pas être vendu deux fois.
- `/pay` a un délai de 10 secondes par membre ; les ajustements manuels sont journalisés.

## Module Suggestions

Activation : `/module enable module:Suggestions`, puis `/suggestions-admin config` pour choisir le
salon de publication (obligatoire) et, si besoin, un rôle de staff.

**Proposer.** `/suggest` ouvre un formulaire (10 à 1 500 caractères). La suggestion reçoit un
numéro propre au serveur et est publiée dans le salon configuré. Un membre peut en proposer une
toutes les deux minutes. Le texte ne peut mentionner personne.

**Voter.** Sous chaque suggestion, les boutons 👍 et 👎 affichent le décompte en direct. Chaque
membre a un seul vote : recliquer sur le même bouton le retire, cliquer sur l'autre le remplace.

**Traiter.** Le bouton « ⚙️ Gérer » est visible de tous mais réservé au staff : les membres ayant
`Gérer le serveur`, plus ceux du rôle de staff s'il est configuré. Il propose en privé :

| Action | Effet |
|---|---|
| Accepter / Refuser | Change le statut, clôt les votes, ajoute un commentaire facultatif |
| Répondre | Ajoute ou modifie la réponse du staff sans changer le statut |
| Rouvrir les votes | Remet la suggestion en attente et efface la décision |

Le message public est mis à jour à chaque action (couleur, statut, réponse, auteur de la décision).
S'il a été supprimé à la main, la décision est tout de même enregistrée et le staff en est averti.

**Consulter.** `/suggestions list [statut] [membre]` affiche l'historique en privé, de la plus
récente à la plus ancienne, avec les votes et un lien vers chaque message ; le pied de page donne
le nombre de suggestions en attente, acceptées et refusées. `/suggestions view numero:12` affiche
une suggestion précise.

## Module Sondages

Ce module est actif par défaut : il remplace la commande `/poll` de la première version, qui
utilisait les sondages natifs de Discord. La commande s'appelle désormais `/poll create`.

**Créer.** `/poll create question:… choix1:… choix2:… [choix3 à choix10] [duree] [multiple]
[masquer]` publie le sondage dans le salon courant.

| Option | Effet | Par défaut |
|---|---|---|
| `duree` | `30m`, `2h`, `3j`… de 1 minute à 30 jours | 24 heures |
| `multiple` | Autorise plusieurs réponses par membre | non |
| `masquer` | N'affiche les résultats qu'à la clôture | non |

Un membre peut avoir 5 sondages ouverts à la fois par serveur. Pour réserver la création de
sondages à certains rôles, utilisez `/permissions allow commande:poll`.

**Voter.** Chaque réponse a son bouton. Recliquer sur une réponse retire le vote ; en choix unique,
cliquer sur une autre remplace la précédente. Le membre reçoit en privé le rappel de son vote. Les
pourcentages sont calculés sur les votes exprimés.

**Clore.** Le sondage se termine à l'échéance : le bot affiche les résultats définitifs, marque la
ou les réponses en tête et retire les boutons. Le contrôle se fait toutes les 30 secondes ; un
sondage arrivé à échéance pendant un arrêt du bot est clos au redémarrage, et aucun vote n'est
accepté après l'échéance. Le bouton « 🔒 Clore le sondage » permet une clôture anticipée ; il est
réservé à l'auteur du sondage et aux membres ayant `Gérer les messages`.

**Consulter.** `/poll results sondage:…` affiche en privé les résultats d'un des 50 derniers
sondages du serveur. Tant qu'un sondage à résultats masqués est ouvert, seuls son auteur et les
modérateurs peuvent les consulter. Un sondage est conservé 90 jours après sa clôture.

## Module Événements

Activation : `/module enable module:Événements`. Vérifiez d'abord le fuseau horaire du serveur avec
`/config timezone` (`Europe/Paris` par défaut) : toutes les dates saisies y sont interprétées.

**Saisir une date.**

| Saisie | Signification |
|---|---|
| `25/12/2026 18:30`, `25/12/2026 à 18h` | Date et heure complètes |
| `25/12 18:30` | Année en cours, ou suivante si la date est déjà passée |
| `demain 20h`, `aujourd'hui 21:30`, `après-demain 9h` | Jour relatif |
| `21:00`, `9h`, `20h30` | Aujourd'hui, ou demain si l'heure est déjà passée |
| `dans 2h`, `dans 45m`, `3j`, `2h30m` | Délai à partir de maintenant |

Une heure seule est toujours une heure de la journée : `2h` signifie 2 heures du matin. Pour un
délai en heures, écrivez `dans 2h`. Après chaque saisie, le bot répète la date qu'il a comprise.
Une date inexistante (31 février, heure sautée lors du passage à l'heure d'été) est refusée. Dans
les messages, les dates s'affichent ensuite dans le fuseau de chaque membre.

**Créer un événement.** `/event-admin create titre:… date:… [description] [salon] [image] [rappel]
[places]` publie l'annonce (permission `Gérer les événements`).

| Option | Effet | Par défaut |
|---|---|---|
| `description` | Texte libre ; `\n` insère un retour à la ligne | aucune |
| `salon` | Salon de l'annonce | salon courant |
| `image` | Adresse `https://` d'une image affichée dans l'annonce | aucune |
| `rappel` | Aucun, 10 min, 30 min, 1 h ou 1 jour avant | 30 minutes |
| `places` | Nombre maximal de participants | illimité |

Un serveur peut avoir 25 événements à venir, programmés au plus un an à l'avance.

**S'inscrire.** Les boutons « Je participe » et « Je ne participe pas » affichent leur décompte.
Recliquer retire la réponse ; cliquer sur l'autre la remplace. Quand le nombre de places est
atteint, les inscriptions suivantes sont refusées jusqu'à ce qu'une place se libère. L'annonce
nomme les 30 premiers inscrits et compte les suivants.

**Rappel et début.** Au moment du rappel, le bot publie un message dans le salon de l'annonce en
mentionnant les participants (80 au plus). À l'heure de début, les inscriptions sont closes et les
boutons retirés. Ces deux contrôles ont lieu toutes les 30 secondes. Si le bot était arrêté à
l'heure du rappel, celui-ci est envoyé au redémarrage tant que l'événement n'a pas commencé.

**Modifier ou supprimer.** `/event-admin edit evenement:…` change le titre, la date, la
description, l'image (`image:aucune` pour la retirer), le rappel ou les places (`places:0` pour
illimité) et met l'annonce à jour. Reporter un événement rouvre les inscriptions et reprogramme le
rappel avec le même délai. `/event-admin delete` supprime l'événement et son annonce, après
confirmation ; les inscrits ne sont pas prévenus. `/event list` montre à tous les prochains
événements, avec un lien vers chaque annonce. Un événement est conservé 30 jours après son début.

**Rappels personnels.** `/reminder create quand:… message:…` programme un rappel : le moment venu,
le bot mentionne le membre dans le salon où le rappel a été créé, ou lui écrit en message privé si
ce salon n'est plus accessible. Un rappel dû pendant un arrêt du bot part au redémarrage. Un envoi
qui échoue est retenté deux fois, puis abandonné. Chaque membre peut avoir 10 rappels en attente
par serveur, au plus un an à l'avance ; `/reminder list` les affiche et `/reminder delete` en
supprime un.

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

   Un composant de configuration déclare `userPermissions`. Un composant ouvert à tous (bouton de
   vote, par exemple), ou qui vérifie lui-même un droit dépendant de la configuration du serveur,
   n'en déclare pas : ajoutez alors son identifiant à `OPEN_COMPONENTS` dans
   `tests/modules.test.ts`, pour que l'absence de permission reste un choix explicite.

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
