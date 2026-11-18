# Sources des données gaming

Le module Gaming n'utilise que des sources dont la documentation et les conditions d'utilisation
ont été lues. Il ne fait aucun scraping et n'invente aucune donnée : une information absente de la
source (prix, date de fin) n'est pas affichée.

## Source utilisée

### GamerPower

| | |
|---|---|
| Site | <https://www.gamerpower.com> |
| Documentation | <https://www.gamerpower.com/api-read> (lue le 17/11/2026) |
| Adresse appelée | `https://www.gamerpower.com/api/giveaways` |
| Clé d'API | Aucune |
| Coût | Gratuit, usage personnel et commercial |
| Limite | 10 requêtes par seconde au plus (le bot en fait une toutes les 30 minutes) |
| Obligation | Attribution par un lien actif vers GamerPower.com : présent dans chaque annonce et dans `/gaming free` |
| Interdit | Présenter les données comme les siennes ou les revendre |

**Données fournies** (contrôlées sur une vraie réponse) : identifiant, titre, valeur (en dollars US,
parfois `N/A`), image, description (en anglais), instructions, lien vers l'offre, type (`Game`,
`DLC`, `Early Access`, `Other`), plateformes, date de fin (parfois `N/A`), statut.

**Utilisation par le bot.**

| Donnée GamerPower | Affichage |
|---|---|
| `Game` | 🎁 Jeu à conserver |
| `DLC` | 🧩 DLC ou contenu en jeu |
| `Early Access` | 🧪 Accès anticipé ou bêta |
| autre type | 🎉 Offre gratuite |
| valeur `$14.99` | ~~14,99 $US~~ **Gratuit** (jamais convertie en euros) |
| valeur `N/A` | **Gratuit**, sans prix barré |
| date de fin `N/A` | aucune date affichée |
| titre ou instructions mentionnant une clé | 🔑 Clé à récupérer sur un site partenaire |

Chaque réponse est validée avant usage : une entrée mal formée est ignorée, une réponse entièrement
invalide fait échouer la synchronisation (nouvelle tentative plus tard), sans effet sur le reste du
bot. GamerPower ne recense ni les Free Weekends ni les Free-to-Play : le bot n'en annonce donc pas,
et ne présente jamais une offre temporaire comme un jeu à conserver.

## Sources étudiées et non intégrées

| Source | Usage envisagé | Raison |
|---|---|---|
| Epic Games Store | Jeux gratuits de la semaine | Aucune API officielle documentée ; l'adresse utilisée par d'autres outils est interne et peut changer sans préavis. Les jeux gratuits Epic arrivent déjà par GamerPower |
| IsThereAnyDeal | Promotions de toutes les boutiques, en euros | Documentation inaccessible aux outils automatiques : conditions, limites et clé d'API non vérifiées. Reporté à la demande du propriétaire du bot |
| CheapShark | Promotions sans clé | Documentation affichée uniquement par JavaScript : devise et conditions non vérifiées |
| API de la boutique Steam | Prix et promotions Steam | Non documentée publiquement |
| GOG | Promotions GOG | Aucune API publique documentée identifiée (non étudiée en détail) |
| IGDB, RAWG | Calendrier des sorties, recherche de jeux | Clé d'API nécessaire ; documentation et conditions pas encore vérifiées |

En conséquence, `/gaming deals`, `/gaming upcoming`, `/gaming search` et `/gaming info`, prévus au
cahier des charges, n'existent pas encore : une commande sans source fiable ne ferait rien ou
inventerait des données. Les **actualités gaming** passent par le module Flux RSS (catégorie
Gaming), par exemple avec les flux officiels de Steam (`https://store.steampowered.com/feeds/news/app/<id>/`)
ou de sites spécialisés.

## Ajouter une source

1. Lire sa documentation et ses conditions : clé d'API, limites de requêtes, obligations
   (attribution), usages interdits. Ne pas utiliser une adresse non documentée.
2. Créer `src/modules/gaming/providers/<source>.ts` qui implémente `GamingProvider`
   (`providers/types.ts`) : identifiant, nom, site (affiché pour l'attribution), intervalle entre
   deux synchronisations et `fetchOffers()`. Valider la réponse avec un schéma zod et passer par
   `httpClient` (adresses internes bloquées, taille et durée bornées).
3. Ne remplir un champ de `NormalizedOffer` que si la source le donne ; sinon `null`.
4. Ajouter le fournisseur à `PROVIDERS` dans `providers/index.ts` : sa tâche de synchronisation
   est déclarée automatiquement (`gaming:sync:<identifiant>`) et il apparaît dans `/gaming sources`.
5. Une clé d'API éventuelle va dans `.env` (et sa description dans `.env.example`, sans valeur),
   jamais dans le code ni dans les journaux.
6. Ajouter des tests sur une vraie réponse enregistrée (`tests/gaming.test.ts`) et mettre ce
   document à jour.
