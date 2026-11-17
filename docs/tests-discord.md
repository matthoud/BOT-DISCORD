# Tests sur Discord

Ces vérifications complètent les tests automatisés (`npm test`, `npm run test:integration`) :
elles demandent un vrai serveur Discord. Faites-les après un déploiement important, de préférence
sur un serveur de test. Prévoyez deux comptes : un administrateur et un membre sans permission.

## Après chaque déploiement

- [X] Le journal du bot affiche « Planificateur démarré » et aucune erreur `FATAL`.
- [X] `npm run commands:deploy` a annoncé le bon nombre de commandes (60 actuellement).
- [X] `/ping` répond ; `/help` liste les modules.
- [X] `/config view` affiche les modules, le fuseau horaire et les salons configurés.
- [X] `/logs test` publie un message dans chaque salon de logs configuré.

## Permissions

- [X] Avec le compte membre, les commandes d'administration (`/ban`, `/module`, `/rss`,
      `/gaming-admin`, `/economy-admin`, `/event-admin`…) n'apparaissent pas.
- [X] Un module désactivé (`/module disable`) refuse ses commandes avec un message clair.

## Communauté

- [X] Niveaux : quelques messages font gagner de l'XP (une fois par minute) ; `/rank` affiche la
      carte avec le bon pseudo ; un passage de niveau est annoncé.
- [X] Économie : `/daily` deux fois de suite → le second est refusé avec le délai restant ; `/pay`
      vers le compte membre ; achat d'un article dans `/shop`.
- [X] Suggestions : `/suggest` → message publié ; vote des deux comptes ; acceptation par le staff.
- [X] Sondages : `/poll create` de 2 minutes ; votes ; clôture automatique avec résultats.
- [X] Événements : `/event-admin create` dans 15 minutes avec rappel de 10 minutes ; inscription
      des deux comptes ; le rappel mentionne les inscrits ; les boutons disparaissent au début.
- [X] Rappels : `/reminder create quand:dans 2m` → rappel reçu une seule fois.

## Flux RSS

- [X] `/rss add` d'un flux actif → le dernier article est publié, avec image et bouton.
- [X] `/rss test flux:…` après `/rss filters inclure:…` → l'effet des filtres est indiqué.
- [X] `/rss refresh` → « aucun nouvel article » ; pas de doublon dans le salon.
- [X] `/rss pause` puis `/rss resume` ; `/rss info` affiche l'état et la prochaine vérification.

## Gaming

- [X] `/gaming sources` → GamerPower opérationnel ; `/gaming free` liste les offres.
- [ ] `/gaming-admin test` → aperçu conforme (prix barré seulement si connu, date de fin seulement
      si connue, lien GamerPower).
- [ ] Une nouvelle offre est publiée une seule fois dans le bon salon (à vérifier au fil des jours).

## Redémarrage

- [X] Créer un rappel à 3 minutes et un sondage de 3 minutes, arrêter le bot 5 minutes, le
      relancer : le rappel est envoyé et le sondage clôturé dès le démarrage, une seule fois.
- [X] Après le redémarrage, aucun article RSS ni offre gaming n'est republié.
