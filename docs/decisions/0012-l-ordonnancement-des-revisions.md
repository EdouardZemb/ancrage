# ADR-0012 — L'ordonnancement des révisions : FSRS-6, par `ts-fsrs`, choisi cours par cours

- **Statut** : accepté le 2026-11-11 ; précisé le 2026-11-12 par l'ADR-0013 sur deux points, les poids
  de FSRS (ajustés sur le journal d'un cours, puis inscrits au manifeste) et la signature de
  l'ordonnanceur
- **Contexte amont** : issue 5 du dépôt (lot M1) ; ADR-0004 (le journal et les règles de Leitner) ;
  décisions M1-D1 à M1-D4 de la spec du lot. Il remplace, pour un cours qui choisit FSRS, les
  règles de Leitner de l'ADR-0004 (« Règles reprises du prototype »), sans réécrire cet ADR.

## Contexte

Les règles du prototype, reprises par l'ADR-0004, sont celles de Leitner : six boîtes, des
intervalles de 0, 1, 2, 4, 8 et 16 jours, une erreur qui renvoie en boîte 1. Elles ont deux
limites :

- **Un plafond de 16 jours.** Une unité bien sue revient toutes les deux semaines et demie, quoi
  qu'il arrive : la charge de révision ne baisse jamais pour ce qui est acquis.
- **Une seule courbe pour tout.** L'intervalle ne dépend que de la boîte, ni de la difficulté de
  l'unité ni de l'écart réel entre deux réponses.

L'ADR-0004 le prévoyait : le brief renvoyait FSRS « plus tard ». Le journal, auquel on ne fait
qu'ajouter, permet ce passage sans migration : l'état se dérive du journal (invariant 5), il suffit
d'une autre fonction de dérivation.

## Options

1. **Garder Leitner.** Aucun changement, mais le plafond reste.
2. **Allonger les intervalles de Leitner.** Un réglage du manifeste (`intervalles`), mais la
   courbe reste unique pour toutes les unités.
3. **FSRS (ordonnanceur à mémoire de stabilité et de difficulté), par `ts-fsrs`.** Modèle publié,
   bibliothèque maintenue, MIT. Une dépendance de plus dans le domaine.
4. **Écrire l'algorithme à la main.** Aucune dépendance, mais une réimplémentation dont rien ne
   garantit la fidélité au modèle.

## Décision

Un cours peut choisir FSRS ; l'ordonnanceur est alors celui de `ts-fsrs` 6.0.0, version exacte.

- **Un ordonnanceur par cours** : la rétention visée vient du cours, et l'ordonnanceur est créé une
  fois par appel de `etatsFsrs(evenements, retention)`, pas à chaque réponse.
- **Le modèle est nommé** : `FSRS6Model`, avec ses poids par défaut (`FSRS6_DEFAULT_WEIGHTS`). La
  bibliothèque a un autre modèle par défaut (FSRS-7) : on ne le laisse jamais choisir.
- **Note binaire** : une réponse juste vaut « Good », une fausse « Again ». L'application ne
  recueille ni « Hard » ni « Easy ».
- **Aucun hasard, jours entiers** : sans dispersion (`fuzz`), sans étapes courtes
  (`enableShortTerm: false`, aucune étape de réapprentissage). Chaque réponse est datée de son jour
  local, porté à midi UTC : l'heure ne compte pas.
- **Échéance** : après une réponse juste, le jour de la réponse plus l'intervalle en jours entiers
  que rend la bibliothèque, d'au moins un jour ; après une faute, le jour même (M1-D3), comme chez
  Leitner.
- **Le niveau est dérivé de la stabilité**, sous le nom `boite` : moins de 2 jours, 1 ; moins de
  4, 2 ; moins de 8, 3 ; moins de 21, 4 ; sinon 5 (M1-D4). Après une faute, 1.
- **L'écart avec la spec** : M1-D1 nomme ce champ `niveau`. Le code garde `boite`, le nom
  d'`EtatUnite` : une trentaine de fichiers le lisent, et le renommer ferait une PR de bruit. En
  FSRS, `boite` est ce niveau dérivé, non une boîte de Leitner.
- Le code est dans `src/domaine/progression/fsrs.ts`, à côté d'`etat.ts`, et rend le même type
  `EtatUnite`.

## Conséquences

- **Une dépendance du domaine** : `ts-fsrs` (MIT) et son unique dépendance,
  `@open-spaced-repetition/srs-kit` (BSD-3-Clause). Le domaine reste fait de fonctions pures
  synchrones : l'ordonnanceur se crée par `defineScheduler(…).create(…)`, sans `await`.
- **Le test « le calcul est fixé »** compare un journal de cinq réponses à un état écrit en dur. Il
  se relit à chaque montée de version de `ts-fsrs` : s'il change, c'est que le calcul a changé, et
  chaque état dérivé du journal avec lui.
- **La précision de la note binaire est inconnue.** FSRS est fait pour quatre notes ; ses poids par
  défaut sont ajustés sur des journaux qui en ont quatre. Aucune mesure n'a été faite ici sur des
  réponses binaires, et les poids ne sont pas réentraînés. On ne sait donc pas encore à quel point
  les intervalles rendus sont justes pour cette application.
- **Un jour local ne recule jamais dans le rejeu.** Le journal est trié par instant, mais le jour est
  local : si le jour d'une unité recule (fuseau changé, deux appareils), FSRS garde le dernier jour
  déjà rejoué, car la bibliothèque refuse une date antérieure.
- **Le retour à Leitner** se fait par une ligne du manifeste du cours : l'état se dérive du journal,
  aucune donnée ne se perd ni ne se migre.
- **Le plafond de 16 jours disparaît** pour les cours qui choisissent FSRS : l'intervalle croît
  avec la stabilité, sans plafond propre à l'application.
- **Difficile à changer** : le choix du modèle et de ses poids. Changer de version du modèle
  change toutes les échéances d'un coup ; il se décide par un nouvel ADR.

## Révision

À reconsidérer si des mesures sur des réponses réelles montrent que la note binaire rend des
intervalles trop courts ou trop longs (réentraîner les poids, ou recueillir quatre notes), si
`ts-fsrs` change de licence, ou si une version du modèle plus récente que FSRS-6 est retenue.
