# Référence des commandes

<!-- Fichier généré par `npm run docs:commands` à partir du code : ne pas le modifier à la main. -->

60 commandes réparties en 13 modules. Les options entre crochets sont facultatives.
Les modules marqués *(à activer)* sont inactifs tant qu’un administrateur n’a pas lancé `/module enable`.

## Sommaire

- **🛠️ Administration** : `/announce` `/avatar` `/clear` `/lock` `/nick` `/role` `/serverinfo` `/slowmode` `/unlock` `/userinfo`
- **🪙 Économie *(à activer)*** : `/balance` `/buy` `/daily` `/economy` `/economy-admin` `/inventory` `/pay` `/shop` `/shop-admin` `/weekly`
- **📅 Événements *(à activer)*** : `/event` `/event-admin` `/reminder`
- **🎉 Divertissement** : `/8ball` `/choose` `/coinflip` `/dice` `/hug` `/joke` `/meme` `/ship` `/slap`
- **🎮 Gaming *(à activer)*** : `/gaming` `/gaming-admin`
- **⭐ Niveaux *(à activer)*** : `/leaderboard` `/level` `/rank`
- **📜 Logs** : `/logs`
- **🛡️ Modération** : `/ban` `/clearwarnings` `/history` `/kick` `/sanctions` `/timeout` `/unban` `/untimeout` `/warn` `/warnings`
- **📊 Sondages** : `/poll`
- **📡 Flux RSS *(à activer)*** : `/rss`
- **💡 Suggestions *(à activer)*** : `/suggest` `/suggestions` `/suggestions-admin`
- **🧰 Utilitaires** : `/config` `/help` `/module` `/permissions` `/ping` `/preferences`
- **👋 Bienvenue** : `/welcome`

## 🛠️ Administration

Informations, gestion des rôles, des salons, des pseudos et des annonces.

### /announce

Envoie une annonce sous forme d’embed dans un salon.

Réservée aux membres ayant : **Gérer le serveur**.

`/announce salon [mention] [couleur]`

| Option | Type | Description |
|---|---|---|
| `salon` | salon, obligatoire | Salon où publier l'annonce |
| `mention` | rôle | Rôle à mentionner avec l'annonce |
| `couleur` | texte | Couleur de l'embed — choix : bleu, vert, jaune, rouge, rose |

### /avatar

Affiche l'avatar d'un utilisateur.

Accessible à tous les membres.

`/avatar [utilisateur]`

| Option | Type | Description |
|---|---|---|
| `utilisateur` | membre | Utilisateur à afficher (vous par défaut) |

### /clear

Supprime un nombre de messages dans ce salon.

Réservée aux membres ayant : **Gérer les messages**.

`/clear nombre [membre]`

| Option | Type | Description |
|---|---|---|
| `nombre` | nombre entier, obligatoire, min. 1, max. 100 | Nombre de messages à supprimer (1 à 100) |
| `membre` | membre | Ne supprimer que les messages de cet utilisateur |

### /lock

Verrouille un salon : les membres ne peuvent plus y écrire.

Réservée aux membres ayant : **Gérer les salons**.

`/lock [salon] [raison]`

| Option | Type | Description |
|---|---|---|
| `salon` | salon | Salon concerné (salon actuel par défaut) |
| `raison` | texte, 300 caractères max. | Raison |

### /nick

Modifie le pseudonyme d'un membre.

Réservée aux membres ayant : **Gérer les pseudos**.

`/nick membre [pseudo] [raison]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `pseudo` | texte, 32 caractères max. | Nouveau pseudo (laisser vide pour réinitialiser) |
| `raison` | texte, 300 caractères max. | Raison |

### /role

Gère les rôles des membres.

Réservée aux membres ayant : **Gérer les rôles**.

#### /role add

Ajoute un rôle à un membre.

`/role add membre role [raison]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `role` | rôle, obligatoire | Rôle à ajouter |
| `raison` | texte, 300 caractères max. | Raison |

#### /role remove

Retire un rôle à un membre.

`/role remove membre role [raison]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `role` | rôle, obligatoire | Rôle à retirer |
| `raison` | texte, 300 caractères max. | Raison |

#### /role info

Affiche les informations d'un rôle.

`/role info role`

| Option | Type | Description |
|---|---|---|
| `role` | rôle, obligatoire | Rôle à afficher |

### /serverinfo

Affiche les informations du serveur.

Accessible à tous les membres.

`/serverinfo`

### /slowmode

Configure le mode lent d'un salon.

Réservée aux membres ayant : **Gérer les salons**.

`/slowmode duree [salon]`

| Option | Type | Description |
|---|---|---|
| `duree` | texte, obligatoire | Délai entre deux messages : 10s, 5m, 1h... ou « off » pour désactiver |
| `salon` | salon | Salon concerné (salon actuel par défaut) |

### /unlock

Déverrouille un salon précédemment verrouillé.

Réservée aux membres ayant : **Gérer les salons**.

`/unlock [salon] [raison]`

| Option | Type | Description |
|---|---|---|
| `salon` | salon | Salon concerné (salon actuel par défaut) |
| `raison` | texte, 300 caractères max. | Raison |

### /userinfo

Affiche les informations d'un membre.

Accessible à tous les membres.

`/userinfo [membre]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre | Membre à afficher (vous par défaut) |

## 🪙 Économie *(à activer)*

Monnaie virtuelle, récompenses, paiements, boutique et inventaire.

### /balance

Affiche votre solde, ou celui d'un autre membre.

Accessible à tous les membres.

`/balance [membre]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre | Membre à consulter (vous par défaut) |

### /buy

Achète un article de la boutique.

Accessible à tous les membres.

`/buy article`

| Option | Type | Description |
|---|---|---|
| `article` | texte, obligatoire, liste proposée | Article à acheter |

### /daily

Réclame votre récompense quotidienne.

Accessible à tous les membres.

`/daily`

### /economy

Classement et historique de l'économie du serveur.

Accessible à tous les membres.

#### /economy leaderboard

Affiche le classement des membres les plus riches.

`/economy leaderboard`

#### /economy history

Affiche vos derniers mouvements de monnaie.

`/economy history`

### /economy-admin

Configure l'économie du serveur et ajuste les soldes.

Réservée aux membres ayant : **Gérer le serveur**.

#### /economy-admin config

Ouvre le panneau de configuration de l'économie.

`/economy-admin config`

#### /economy-admin give

Ajoute de la monnaie au portefeuille d'un membre.

`/economy-admin give membre montant`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `montant` | nombre entier, obligatoire, min. 1, max. 100000000 | Montant |

#### /economy-admin take

Retire de la monnaie du portefeuille d'un membre.

`/economy-admin take membre montant`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `montant` | nombre entier, obligatoire, min. 1, max. 100000000 | Montant |

### /inventory

Affiche vos articles, ou ceux d'un autre membre.

Accessible à tous les membres.

`/inventory [membre]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre | Membre à consulter (vous par défaut) |

### /pay

Donne une partie de votre monnaie à un autre membre.

Accessible à tous les membres.

`/pay membre montant`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à payer |
| `montant` | nombre entier, obligatoire, min. 1, max. 100000000 | Montant à donner |

### /shop

Affiche les articles de la boutique du serveur.

Accessible à tous les membres.

`/shop`

### /shop-admin

Gère les articles de la boutique du serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /shop-admin add

Ajoute un article à la boutique.

`/shop-admin add nom prix [description] [role] [stock] [limite]`

| Option | Type | Description |
|---|---|---|
| `nom` | texte, obligatoire, 50 caractères max. | Nom de l'article |
| `prix` | nombre entier, obligatoire, min. 0, max. 100000000 | Prix |
| `description` | texte, 200 caractères max. | Description de l'article |
| `role` | rôle | Rôle attribué à l'achat |
| `stock` | nombre entier, min. 1, max. 1000000 | Nombre d’exemplaires disponibles (illimité par défaut) |
| `limite` | nombre entier, min. 1, max. 1000 | Nombre maximal d’exemplaires par membre (illimité par défaut, 1 pour un rôle) |

#### /shop-admin edit

Modifie un article de la boutique.

`/shop-admin edit article [nom] [prix] [description] [stock] [limite] [en-vente]`

| Option | Type | Description |
|---|---|---|
| `article` | texte, obligatoire, liste proposée | Article à modifier |
| `nom` | texte, 50 caractères max. | Nouveau nom |
| `prix` | nombre entier, min. 0, max. 100000000 | Nouveau prix |
| `description` | texte, 200 caractères max. | Nouvelle description |
| `stock` | nombre entier, min. -1, max. 1000000 | Nouveau stock (0 = rupture, -1 = illimité) |
| `limite` | nombre entier, min. 0, max. 1000 | Nouvelle limite par membre (0 = illimité) |
| `en-vente` | oui / non | Proposer ou non l'article à la vente |

#### /shop-admin remove

Supprime définitivement un article, y compris des inventaires.

`/shop-admin remove article`

| Option | Type | Description |
|---|---|---|
| `article` | texte, obligatoire, liste proposée | Article à supprimer |

### /weekly

Réclame votre récompense hebdomadaire.

Accessible à tous les membres.

`/weekly`

## 📅 Événements *(à activer)*

Événements avec inscriptions par boutons, rappels automatiques et rappels personnels.

### /event

Consulte les événements du serveur.

Accessible à tous les membres.

#### /event list

Affiche les prochains événements du serveur.

`/event list`

### /event-admin

Crée, modifie ou supprime les événements du serveur.

Réservée aux membres ayant : **Gérer les événements**.

#### /event-admin create

Crée un événement et publie son annonce.

`/event-admin create titre date [description] [salon] [image] [rappel] [places]`

| Option | Type | Description |
|---|---|---|
| `titre` | texte, obligatoire, 100 caractères max. | Titre de l'événement |
| `date` | texte, obligatoire | Date et heure : 25/12/2026 18:30, demain 20h, dans 3j... (fuseau du serveur) |
| `description` | texte, 1500 caractères max. | Description (tapez \n pour un retour à la ligne) |
| `salon` | salon | Salon de l'annonce (salon actuel par défaut) |
| `image` | texte | Adresse https:// d'une image à afficher |
| `rappel` | nombre entier | Rappel automatique avant le début (30 minutes par défaut) — choix : Aucun rappel, 10 minutes avant, 30 minutes avant, 1 heure avant, 1 jour avant |
| `places` | nombre entier, min. 1, max. 10000 | Nombre maximal de participants (illimité par défaut) |

#### /event-admin edit

Modifie un événement et met son annonce à jour.

`/event-admin edit evenement [titre] [date] [description] [image] [rappel] [places]`

| Option | Type | Description |
|---|---|---|
| `evenement` | texte, obligatoire, liste proposée | Événement à modifier |
| `titre` | texte, 100 caractères max. | Nouveau titre |
| `date` | texte | Nouvelle date : 25/12/2026 18:30, demain 20h... (fuseau du serveur) |
| `description` | texte, 1500 caractères max. | Nouvelle description (tapez \n pour un retour à la ligne) |
| `image` | texte | Nouvelle adresse d'image, ou « aucune » pour la retirer |
| `rappel` | nombre entier | Nouveau rappel automatique — choix : Aucun rappel, 10 minutes avant, 30 minutes avant, 1 heure avant, 1 jour avant |
| `places` | nombre entier, min. 0, max. 10000 | Nouveau nombre maximal de participants (0 = illimité) |

#### /event-admin delete

Supprime un événement et son annonce.

`/event-admin delete evenement`

| Option | Type | Description |
|---|---|---|
| `evenement` | texte, obligatoire, liste proposée | Événement à supprimer |

### /reminder

Programme et gère vos rappels personnels.

Accessible à tous les membres.

#### /reminder create

Programme un rappel : le bot vous mentionnera ici le moment venu.

`/reminder create quand message`

| Option | Type | Description |
|---|---|---|
| `quand` | texte, obligatoire | Moment du rappel : dans 2h, demain 9h, 25/12 18:30... (fuseau du serveur) |
| `message` | texte, obligatoire, 500 caractères max. | Ce dont vous voulez vous souvenir |

#### /reminder list

Affiche vos rappels en attente sur ce serveur.

`/reminder list`

#### /reminder delete

Supprime un de vos rappels en attente.

`/reminder delete rappel`

| Option | Type | Description |
|---|---|---|
| `rappel` | texte, obligatoire, liste proposée | Rappel à supprimer |

## 🎉 Divertissement

Commandes amusantes : jeux de hasard, memes, blagues et sondages.

### /8ball

Pose une question à la boule magique.

Accessible à tous les membres.

`/8ball question`

| Option | Type | Description |
|---|---|---|
| `question` | texte, obligatoire, 300 caractères max. | Ta question |

### /choose

Choisit au hasard parmi plusieurs propositions.

Accessible à tous les membres.

`/choose propositions`

| Option | Type | Description |
|---|---|---|
| `propositions` | texte, obligatoire, 1000 caractères max. | Propositions séparées par des virgules : pizza, sushi, burger |

### /coinflip

Lance une pièce : pile ou face ?

Accessible à tous les membres.

`/coinflip`

### /dice

Lance un ou plusieurs dés.

Accessible à tous les membres.

`/dice [faces] [nombre]`

| Option | Type | Description |
|---|---|---|
| `faces` | nombre entier, min. 2, max. 1000 | Nombre de faces (6 par défaut) |
| `nombre` | nombre entier, min. 1, max. 10 | Nombre de dés (1 par défaut) |

### /hug

Fais un câlin à un membre.

Accessible à tous les membres.

`/hug membre`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à câliner |

### /joke

Raconte une blague.

Accessible à tous les membres.

`/joke`

### /meme

Affiche un meme aléatoire.

Accessible à tous les membres.

`/meme`

### /ship

Calcule la compatibilité entre deux membres.

Accessible à tous les membres.

`/ship membre1 [membre2]`

| Option | Type | Description |
|---|---|---|
| `membre1` | membre, obligatoire | Premier membre |
| `membre2` | membre | Second membre (vous par défaut) |

### /slap

Gifle un membre (pour rire).

Accessible à tous les membres.

`/slap membre`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à gifler |

## 🎮 Gaming *(à activer)*

Annonce les jeux, DLC et accès anticipés gratuits du moment.

### /gaming

Jeux et contenus gratuits du moment.

Accessible à tous les membres.

#### /gaming free

Affiche les offres gratuites actuellement disponibles.

`/gaming free [type] [boutique]`

| Option | Type | Description |
|---|---|---|
| `type` | texte | Type d'offre — choix : 🎁 Jeu à conserver, 🧩 DLC ou contenu en jeu, 🧪 Accès anticipé ou bêta, 🎉 Offre gratuite |
| `boutique` | texte | Boutique ou plateforme — choix : Epic Games Store, Steam, GOG, itch.io, Sans DRM, PlayStation, Xbox, Switch, Android, iOS, VR, PC |

#### /gaming sources

Affiche les sources des offres et leur état.

`/gaming sources`

### /gaming-admin

Configure les annonces de jeux et contenus gratuits.

Réservée aux membres ayant : **Gérer le serveur**.

#### /gaming-admin setup

Choisit les salons des annonces et les active.

`/gaming-admin setup salon [salon-extras] [annoncer-actuelles]`

| Option | Type | Description |
|---|---|---|
| `salon` | salon, obligatoire | Salon des jeux offerts |
| `salon-extras` | salon | Salon des DLC, bêtas et autres offres (même salon par défaut) |
| `annoncer-actuelles` | oui / non | Publier aussi les offres déjà en cours (10 au plus) |

#### /gaming-admin config

Affiche la configuration des annonces.

`/gaming-admin config`

#### /gaming-admin filters

Choisit les types, boutiques et valeur minimale des offres annoncées.

`/gaming-admin filters [jeux] [dlc] [beta] [autres] [boutiques] [valeur-min]`

| Option | Type | Description |
|---|---|---|
| `jeux` | oui / non | Annoncer : 🎁 Jeu à conserver |
| `dlc` | oui / non | Annoncer : 🧩 DLC ou contenu en jeu |
| `beta` | oui / non | Annoncer : 🧪 Accès anticipé ou bêta |
| `autres` | oui / non | Annoncer : 🎉 Offre gratuite |
| `boutiques` | texte, 200 caractères max. | Liste séparée par des virgules, ou « toutes » (epic, steam, gog, itch, drm-free…) |
| `valeur-min` | nombre, min. 0, max. 1000 | Valeur minimale en dollars US selon la source (0 = toutes) |

#### /gaming-admin mention

Mentionne un rôle pour les jeux offerts intéressants (désactivé par défaut).

`/gaming-admin mention [role] [valeur-min] [desactiver]`

| Option | Type | Description |
|---|---|---|
| `role` | rôle | Rôle à mentionner |
| `valeur-min` | nombre, min. 0, max. 1000 | Valeur minimale du jeu en dollars US (0 = tous les jeux) |
| `desactiver` | oui / non | Ne plus mentionner de rôle |

#### /gaming-admin test

Montre une annonce telle qu’elle serait publiée, sans rien publier.

`/gaming-admin test`

#### /gaming-admin pause

Suspend les annonces.

`/gaming-admin pause`

#### /gaming-admin resume

Reprend les annonces.

`/gaming-admin resume`

## ⭐ Niveaux *(à activer)*

Expérience, niveaux, classement et rôles de récompense.

### /leaderboard

Affiche le classement des membres par expérience.

Accessible à tous les membres.

`/leaderboard`

### /level

Configure le système de niveaux du serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /level config

Ouvre le panneau de configuration des niveaux.

`/level config`

#### /level rewards add

Attribue un rôle aux membres qui atteignent un niveau.

`/level rewards add niveau role`

| Option | Type | Description |
|---|---|---|
| `niveau` | nombre entier, obligatoire, min. 1, max. 1000 | Niveau à atteindre |
| `role` | rôle, obligatoire | Rôle à attribuer |

#### /level rewards remove

Supprime la récompense d'un niveau.

`/level rewards remove niveau`

| Option | Type | Description |
|---|---|---|
| `niveau` | nombre entier, obligatoire, min. 1, max. 1000 | Niveau dont la récompense doit être supprimée |

#### /level rewards list

Affiche les récompenses de niveau.

`/level rewards list`

### /rank

Affiche votre niveau et votre progression, ou ceux d'un autre membre.

Accessible à tous les membres.

`/rank [membre]`

| Option | Type | Description |
|---|---|---|
| `membre` | membre | Membre à consulter (vous par défaut) |

## 📜 Logs

Journal des événements du serveur, avec un salon par catégorie.

### /logs

Configure les logs du serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /logs setup

Ouvre le panneau de configuration des salons de logs.

`/logs setup`

#### /logs test

Envoie un message de test dans chaque salon de logs et signale les problèmes.

`/logs test`

## 🛡️ Modération

Sanctions, avertissements, historique et sanctions automatiques.

### /ban

Bannit un utilisateur du serveur.

Réservée aux membres ayant : **Bannir des membres**.

`/ban utilisateur raison [duree] [supprimer_messages]`

| Option | Type | Description |
|---|---|---|
| `utilisateur` | membre, obligatoire | Utilisateur à bannir (mention ou ID) |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |
| `duree` | texte | Bannissement temporaire : 12h, 7j, 2sem... (définitif si vide) |
| `supprimer_messages` | nombre entier | Supprimer l'historique récent des messages de l'utilisateur — choix : Ne rien supprimer, Dernière heure, Dernières 24 heures, 7 derniers jours |

### /clearwarnings

Supprime tous les avertissements actifs d'un membre.

Réservée aux membres ayant : **Exclure temporairement des membres**.

`/clearwarnings membre raison`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |

### /history

Affiche l'historique de modération d'un membre.

Réservée aux membres ayant : **Exclure temporairement des membres**.

`/history membre`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à consulter (mention ou ID) |

### /kick

Expulse un membre du serveur.

Réservée aux membres ayant : **Expulser des membres**.

`/kick membre raison`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à expulser |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |

### /sanctions

Configure les sanctions automatiques liées aux avertissements.

Réservée aux membres ayant : **Gérer le serveur**.

#### /sanctions add

Définit la sanction appliquée à un nombre d'avertissements.

`/sanctions add seuil action [duree]`

| Option | Type | Description |
|---|---|---|
| `seuil` | nombre entier, obligatoire, min. 1, max. 50 | Nombre d'avertissements actifs déclenchant la sanction |
| `action` | texte, obligatoire | Sanction à appliquer — choix : Exclusion temporaire, Expulsion, Bannissement |
| `duree` | texte | Durée (obligatoire pour une exclusion, optionnelle pour un bannissement) |

#### /sanctions remove

Supprime la sanction automatique d'un seuil.

`/sanctions remove seuil`

| Option | Type | Description |
|---|---|---|
| `seuil` | nombre entier, obligatoire, min. 1 | Seuil à supprimer |

#### /sanctions list

Affiche les sanctions automatiques configurées.

`/sanctions list`

### /timeout

Exclut temporairement un membre (il ne peut plus écrire ni parler).

Réservée aux membres ayant : **Exclure temporairement des membres**.

`/timeout membre duree raison`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à exclure |
| `duree` | texte, obligatoire | Durée : 10m, 2h, 1j... (28 jours maximum) |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |

### /unban

Débannit un utilisateur.

Réservée aux membres ayant : **Bannir des membres**.

`/unban utilisateur raison`

| Option | Type | Description |
|---|---|---|
| `utilisateur` | membre, obligatoire | ID de l'utilisateur à débannir |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |

### /untimeout

Met fin à l'exclusion temporaire d'un membre.

Réservée aux membres ayant : **Exclure temporairement des membres**.

`/untimeout membre raison`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre concerné |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |

### /warn

Avertit un membre.

Réservée aux membres ayant : **Exclure temporairement des membres**.

`/warn membre raison`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à avertir |
| `raison` | texte, obligatoire, 500 caractères max. | Raison de l'action (enregistrée dans l'historique) |

### /warnings

Affiche les avertissements actifs d'un membre.

Réservée aux membres ayant : **Exclure temporairement des membres**.

`/warnings membre`

| Option | Type | Description |
|---|---|---|
| `membre` | membre, obligatoire | Membre à consulter |

## 📊 Sondages

Sondages à boutons, à choix unique ou multiple, avec durée et résultats.

### /poll

Crée un sondage ou affiche ses résultats.

Accessible à tous les membres.

#### /poll create

Crée un sondage à boutons dans ce salon.

`/poll create question choix1 choix2 [choix3] [choix4] [choix5] [choix6] [choix7] [choix8] [choix9] [choix10] [duree] [multiple] [masquer]`

| Option | Type | Description |
|---|---|---|
| `question` | texte, obligatoire, 250 caractères max. | Question du sondage |
| `choix1` | texte, obligatoire, 80 caractères max. | Réponse n°1 |
| `choix2` | texte, obligatoire, 80 caractères max. | Réponse n°2 |
| `choix3` | texte, 80 caractères max. | Réponse n°3 |
| `choix4` | texte, 80 caractères max. | Réponse n°4 |
| `choix5` | texte, 80 caractères max. | Réponse n°5 |
| `choix6` | texte, 80 caractères max. | Réponse n°6 |
| `choix7` | texte, 80 caractères max. | Réponse n°7 |
| `choix8` | texte, 80 caractères max. | Réponse n°8 |
| `choix9` | texte, 80 caractères max. | Réponse n°9 |
| `choix10` | texte, 80 caractères max. | Réponse n°10 |
| `duree` | texte | Durée : 30m, 2h, 3j... (24 heures par défaut, 30 jours au plus) |
| `multiple` | oui / non | Autoriser plusieurs réponses par personne |
| `masquer` | oui / non | N'afficher les résultats qu'à la clôture |

#### /poll results

Affiche les résultats d'un sondage du serveur.

`/poll results sondage`

| Option | Type | Description |
|---|---|---|
| `sondage` | texte, obligatoire, liste proposée | Sondage à consulter |

## 📡 Flux RSS *(à activer)*

Publie automatiquement les nouveaux articles de flux RSS et Atom, avec filtres et catégories.

### /rss

Gère les flux RSS et Atom publiés sur le serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /rss add

Ajoute un flux RSS ou Atom à publier dans un salon.

`/rss add url [salon] [nom] [categorie] [intervalle] [resume] [image] [mention]`

| Option | Type | Description |
|---|---|---|
| `url` | texte, obligatoire, 2000 caractères max. | Adresse du flux (ou d’une page qui en annonce un) |
| `salon` | salon | Salon de publication (salon actuel par défaut) |
| `nom` | texte, 80 caractères max. | Nom affiché (titre du flux par défaut) |
| `categorie` | texte, liste proposée | Catégorie, qui détermine la présentation |
| `intervalle` | nombre entier | Intervalle de vérification (30 minutes par défaut) — choix : 10 minutes, 15 minutes, 30 minutes, 1 heure, 2 heures, 6 heures, 12 heures, 24 heures |
| `resume` | oui / non | Afficher le résumé de l'article |
| `image` | oui / non | Afficher l'image de l'article |
| `mention` | rôle | Rôle mentionné à chaque nouvel article |

#### /rss remove

Supprime un flux.

`/rss remove flux`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à supprimer |

#### /rss list

Affiche les flux du serveur et leur état.

`/rss list`

#### /rss info

Affiche le détail d'un flux.

`/rss info flux`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à afficher |

#### /rss test

Teste une adresse ou un flux enregistré, sans rien publier.

`/rss test [url] [flux]`

| Option | Type | Description |
|---|---|---|
| `url` | texte, 2000 caractères max. | Adresse à tester |
| `flux` | texte, liste proposée | Flux enregistré à tester (avec ses filtres) |

#### /rss pause

Suspend un flux.

`/rss pause flux`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à suspendre |

#### /rss resume

Reprend un flux suspendu.

`/rss resume flux`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à reprendre |

#### /rss refresh

Vérifie un flux immédiatement.

`/rss refresh flux`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à vérifier |

#### /rss edit

Modifie un flux.

`/rss edit flux [salon] [nom] [categorie] [intervalle] [resume] [image] [mention] [sans-mention]`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à modifier |
| `salon` | salon | Nouveau salon de publication |
| `nom` | texte, 80 caractères max. | Nouveau nom affiché |
| `categorie` | texte, liste proposée | Catégorie, qui détermine la présentation |
| `intervalle` | nombre entier | Nouvel intervalle de vérification — choix : 10 minutes, 15 minutes, 30 minutes, 1 heure, 2 heures, 6 heures, 12 heures, 24 heures |
| `resume` | oui / non | Afficher le résumé de l'article |
| `image` | oui / non | Afficher l'image de l'article |
| `mention` | rôle | Rôle mentionné à chaque nouvel article |
| `sans-mention` | oui / non | Ne plus mentionner de rôle |

#### /rss filters

Affiche ou modifie les filtres d'un flux (mots séparés par des virgules).

`/rss filters flux [inclure] [exclure] [prioritaires] [auteurs] [categories]`

| Option | Type | Description |
|---|---|---|
| `flux` | texte, obligatoire, liste proposée | Flux à filtrer |
| `inclure` | texte, 1000 caractères max. | Publier uniquement les articles contenant un de ces mots (« aucun » pour vider) |
| `exclure` | texte, 1000 caractères max. | Ne jamais publier les articles contenant un de ces mots |
| `prioritaires` | texte, 1000 caractères max. | Mots mis en avant (⭐) ; seuls ces articles mentionnent le rôle |
| `auteurs` | texte, 1000 caractères max. | Auteurs à ignorer |
| `categories` | texte, 1000 caractères max. | Publier uniquement ces catégories du site |

#### /rss config view

Affiche les paramètres, limites et catégories.

`/rss config view`

#### /rss config category-add

Crée une catégorie personnalisée.

`/rss config category-add nom emoji [couleur] [style]`

| Option | Type | Description |
|---|---|---|
| `nom` | texte, obligatoire, 32 caractères max. | Nom de la catégorie |
| `emoji` | texte, obligatoire, 64 caractères max. | Emoji de la catégorie (🎲, ou un emoji du serveur) |
| `couleur` | texte, 7 caractères max. | Couleur hexadécimale, par exemple #ff8800 |
| `style` | texte | Mise en page des articles — choix : Standard (résumé et grande image), Compact (résumé court et vignette), Grand format (grande image et résumé long), Minimal (titre et lien) |

#### /rss config category-edit

Modifie une catégorie personnalisée.

`/rss config category-edit categorie [nom] [emoji] [couleur] [style]`

| Option | Type | Description |
|---|---|---|
| `categorie` | texte, obligatoire, liste proposée | Catégorie à modifier |
| `nom` | texte, 32 caractères max. | Nom de la catégorie |
| `emoji` | texte, 64 caractères max. | Emoji de la catégorie (🎲, ou un emoji du serveur) |
| `couleur` | texte, 7 caractères max. | Couleur hexadécimale, par exemple #ff8800 |
| `style` | texte | Mise en page des articles — choix : Standard (résumé et grande image), Compact (résumé court et vignette), Grand format (grande image et résumé long), Minimal (titre et lien) |

#### /rss config category-remove

Supprime une catégorie personnalisée.

`/rss config category-remove categorie`

| Option | Type | Description |
|---|---|---|
| `categorie` | texte, obligatoire, liste proposée | Catégorie à supprimer |

## 💡 Suggestions *(à activer)*

Suggestions des membres, votes par boutons et décisions du staff.

### /suggest

Propose une suggestion pour le serveur.

Accessible à tous les membres.

`/suggest`

### /suggestions

Consulte les suggestions du serveur.

Accessible à tous les membres.

#### /suggestions list

Affiche l'historique des suggestions, avec leurs votes.

`/suggestions list [statut] [membre]`

| Option | Type | Description |
|---|---|---|
| `statut` | texte | Ne montrer que les suggestions ayant ce statut — choix : En attente, Acceptée, Refusée |
| `membre` | membre | Ne montrer que les suggestions de ce membre |

#### /suggestions view

Affiche une suggestion à partir de son numéro.

`/suggestions view numero`

| Option | Type | Description |
|---|---|---|
| `numero` | nombre entier, obligatoire, min. 1 | Numéro de la suggestion |

### /suggestions-admin

Configure le système de suggestions du serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /suggestions-admin config

Ouvre le panneau de configuration des suggestions.

`/suggestions-admin config`

## 🧰 Utilitaires

Aide, configuration du bot, gestion des modules et des permissions.

### /config

Affiche ou modifie les préférences générales du bot sur ce serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /config view

Affiche un résumé de la configuration du serveur.

`/config view`

#### /config dm-sanctions

Prévenir ou non les membres sanctionnés par message privé.

`/config dm-sanctions actif`

| Option | Type | Description |
|---|---|---|
| `actif` | oui / non, obligatoire | Envoyer un message privé |

#### /config timezone

Définit le fuseau horaire utilisé pour les dates saisies sur ce serveur.

`/config timezone fuseau`

| Option | Type | Description |
|---|---|---|
| `fuseau` | texte, obligatoire, liste proposée | Fuseau horaire, par exemple Europe/Paris |

### /help

Affiche la liste des modules et de leurs commandes.

Accessible à tous les membres.

`/help`

### /module

Active ou désactive les modules du bot sur ce serveur.

Réservée aux membres ayant : **Gérer le serveur**.

#### /module list

Affiche l'état de chaque module.

`/module list`

#### /module enable

Active un module.

`/module enable module`

| Option | Type | Description |
|---|---|---|
| `module` | texte, obligatoire, liste proposée | Module à activer |

#### /module disable

Désactive un module.

`/module disable module`

| Option | Type | Description |
|---|---|---|
| `module` | texte, obligatoire, liste proposée | Module à désactiver |

### /permissions

Configure les rôles autorisés ou refusés pour chaque commande.

Réservée aux membres ayant : **Administrateur**.

#### /permissions allow

Autorise un rôle à utiliser une commande.

`/permissions allow commande role`

| Option | Type | Description |
|---|---|---|
| `commande` | texte, obligatoire, liste proposée | Nom de la commande (sans le /) |
| `role` | rôle, obligatoire | Rôle à autoriser |

#### /permissions deny

Interdit à un rôle d'utiliser une commande.

`/permissions deny commande role`

| Option | Type | Description |
|---|---|---|
| `commande` | texte, obligatoire, liste proposée | Nom de la commande (sans le /) |
| `role` | rôle, obligatoire | Rôle à refuser |

#### /permissions reset

Supprime les règles d'une commande (pour un rôle ou toutes).

`/permissions reset commande [role]`

| Option | Type | Description |
|---|---|---|
| `commande` | texte, obligatoire, liste proposée | Nom de la commande (sans le /) |
| `role` | rôle | Limiter la suppression à ce rôle |

#### /permissions list

Affiche toutes les règles personnalisées du serveur.

`/permissions list`

### /ping

Affiche la latence du bot.

Accessible à tous les membres.

`/ping`

### /preferences

Gère vos préférences personnelles (valables sur tous les serveurs).

Accessible à tous les membres.

#### /preferences mp

Accepter ou refuser les messages privés du bot.

`/preferences mp actif`

| Option | Type | Description |
|---|---|---|
| `actif` | oui / non, obligatoire | Recevoir les messages privés |

## 👋 Bienvenue

Messages d'arrivée et de départ personnalisés, rôle automatique.

### /welcome

Configure le système de bienvenue.

Réservée aux membres ayant : **Gérer le serveur**.

#### /welcome setup

Ouvre le panneau de configuration de la bienvenue.

`/welcome setup`
