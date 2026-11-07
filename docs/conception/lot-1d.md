# Lot 1d — décisions et arbitrages

Le lot 1d (issue ancrage-donnees#5, v0.4.0) a porté l'application du prototype dans ancrage : les 9 onglets en
Preact, la progression en journal synchronisé (ADR-0004), l'installation et le hors-ligne. Son plan
a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses, avec leurs
numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« décision N ») ;
- les arbitrages faits pendant l'exécution (« R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** Les décisions durables sont dans les ADR : l'ADR-0004 pour la progression, l'ADR-0008
pour le contenu hors-ligne et la compatibilité de l'API.

Il ne vaut que pour le lot 1d. Les fichiers de l'administration et des comptes viennent du lot 1c
(`Admin.tsx`, les libellés de l'administration dans `textes.ts`, `src/serveur/comptes/`,
`routes-admin.test.ts`). Leurs renvois « décision N » et « R<n> » visent le plan du lot 1c, qui
n'a pas été gardé.

## Le prototype : `H:` et `T:`

Les deux renvois désignent le prototype de l'apprenante, dans l'état où il était le 15/10/2026. Il est hors
du dépôt, sur le poste d'Edouard :
- `H:<ligne>` est une ligne de `app/terminologie-trainer.html`, dans le dossier du prototype ;
- `T:<ligne>` est une ligne de `outils-build/test_app.js`, dans le dossier du prototype.

Seuls leur comportement et leurs textes d'interface ont servi : leur contenu de cours est périmé,
et c'est `contenus/` qui fait foi.

## Les décisions du plan (17/10/2026)

Les décisions 1 à 7 sont les réponses d'Edouard. Les décisions 8 à 28 ont été prises par Claude et
soumises à la relecture. Quand un arbitrage en a changé une, la ligne le dit.

1. **Découpage** : un seul plan, livré sur le staging en trois paliers, puis une seule étiquette,
   v0.4.0.
   - A : la logique, le journal et la synchronisation côté serveur.
   - B : les 9 onglets, en ligne.
   - C : le hors-ligne et l'installation.
2. **« Lernstand zurücksetzen »** (H:2217-2223) disparaît. Le journal ne fait que grandir
   (invariant 5). La suppression de compte arrive au lot 1e.
3. **Langue des écrans du cours** : celle du cours (`cours.langue`). Les textes n'existent qu'en
   allemand pour l'instant.
4. **Accueil** : avec un seul cours, `/` mène directement à son aperçu. Un lien de l'en-tête mène
   à « Mon compte ».
5. **Apparence** : celle du prototype (H:5-180 : couleurs, polices, mode sombre), pour toute
   l'application.
6. **Icône** : une ancre blanche sur le bleu-vert du prototype (`#0b7f8f`), produite par
   `scripts/icones.mjs`.
7. **Exécution** : par sous-agents, et chaque tâche est relue.
8. **Événement** :
   - **Champs** : ceux de l'ADR-0004, avec ses noms exacts, et `v: 1`.
   - **`resultat`** :
     - pour une `reponse`, `{ "juste": boolean }` ;
     - pour un `examen`, `{ points, questions, note, minutes, chapitres }` (H:1988).
   - **L'unité d'un examen** est l'identifiant du module `examen`.
   - **Les unités qui reçoivent une réponse** :
     - la carte, `<carte>` ou `<carte>:inverse` ;
     - le mot ;
     - le point d'un schéma ;
     - le texte annoté entier, juste si au moins `reussite` de ses réponses le sont (H:2166) ;
     - l'exercice.
   - Les jetons et les questions d'un texte ne produisent pas d'événement.
   - **Un examen remis** produit une `reponse` par question, puis un `examen` (H:1984).
9. **`repondu_a`** :
   - c'est l'heure locale de l'appareil, avec son décalage (`AAAA-MM-JJTHH:MM:SS.mmm±HH:MM`) ;
   - le jour d'un événement est ses 10 premiers caractères ;
   - les événements sont ordonnés par instant, puis par `id`.
10. **Serveur** :
    - unicité sur (`personne`, `id`) : le premier reçu fait foi ;
    - le curseur est un entier croissant (devenu un numéro propre à la personne et au cours : R10) ;
    - seule la forme des unités est contrôlée. Une unité retirée du contenu est ignorée au calcul.
11. **Le contenu hors-ligne vit dans IndexedDB, pas dans le cache du service worker.** Voir
    l'ADR-0008.
12. **Téléphone partagé** : tout est rangé par personne.
    - Quand une autre personne se connecte, seule la file d'envoi de la précédente reste.
    - À la déconnexion :
      - on tente une synchronisation ;
      - puis on vide IndexedDB, les préférences et les caches ;
      - on désinscrit le service worker ;
      - enfin, la page se recharge.
    - Précisée par R30, R31, R31b et R33.
13. **Droit retiré ou suspendu** : les routes du cours répondent 404.
    - Le contenu et les événements locaux du cours sont effacés.
    - La file est gardée.
    - Précisée par R18.
14. **Session expirée** (401) : on continue à réviser, et un bandeau « Sitzung abgelaufen » mène
    à `/connexion`. La file est gardée.
15. **Moments de synchronisation** :
    - au démarrage ;
    - au retour du réseau ;
    - 3 s après la dernière réponse ;
    - en fin de séance ;
    - au passage en arrière-plan.

    Si l'envoi échoue faute de réseau, une synchronisation en arrière-plan (`ancrage-journal`) est
    demandée au service worker.
16. **Mise à jour de l'application** : le nouveau service worker attend la fermeture de
    l'application, sans `skipWaiting`. Le client précaché parle donc parfois à un serveur d'une
    autre version (ADR-0008). **Remplacée par 2a-D1** (lot 2a, `lot-2a.md`) : le nouveau service
    worker prend la main quand l'application le lui demande, à un moment choisi, jamais en pleine
    séance.
17. **Préférences** : propres à l'appareil, rangées par personne et par cours dans `localStorage`
    (`ancrage.preferences.<personne>.<cours>`), et vidées à la déconnexion.
18. **Réglages pédagogiques dans le contenu**, par ajouts au format 1 :
    - `leitner` dans `cours.yaml` ;
    - `reussite` pour `texte-annote` ;
    - un module `examen` ;
    - une `description` facultative.

    Il y a au plus un module de type `morphologie`, `texte-annote`, `exercices` ou `examen` par
    cours.
19. **Onglets selon les modules**, dans l'ordre du prototype (H:194-202). « Übersicht » et
    « Fortschritt » sont toujours là.
20. **Chemins** :
    - `/` mène au cours s'il n'y en a qu'un, à `/compte` sinon ;
    - un cours se trouve à `/cours/<id>` ;
    - chaque onglet se trouve à `/cours/<id>/<onglet>`.
21. **Hasard injecté** : toute fonction de tirage reçoit `hasard: () => number`.
22. **Tests des composants** : `@testing-library/preact` et `happy-dom`, en plus du parcours de
    bout en bout.
23. **Mutation** : Stryker est étendu à `src/domaine/journal/` et à
    `src/domaine/progression/etat.ts`, avec un seuil de 90 %.
24. **Test de taille du prototype** (T:124-132) : il est remplacé par les limites du journal, un
    lot de 500 événements et une page de 1000.
25. **Service worker** : `vite-plugin-pwa` (ADR-0005), stratégie `injectManifest`, avec un service
    worker en TypeScript (`src/client/sw.ts`). Version 1.x : R28.
26. **Polices** : les paquets Fontsource, en sous-ensembles latin et latin-ext, précachés.
27. **Examens** :
    - leur nombre n'est plus limité ;
    - « Fortschritt » montre les 10 derniers ;
    - « Übersicht » montre la note du dernier.
28. **Comportement identique au prototype** :
    - ses textes allemands deviennent des textes d'interface ;
    - ses raccourcis clavier sont gardés (H:2238-2258), précisés par R26 ;
    - la saisie reste réservée au sens inverse.

## Les arbitrages de l'exécution (17 et 18/10/2026)

Il n'y a pas de R34.

- **R1** : le worktree vit dans `ancrage.worktrees/lot-1d`.
- **R2** : la projection servie par `routes-cours.ts` nomme `leitner`.
- **R3** : les schémas n'ont pas encore de `description`.
- **R4** : une branche par PR, puis une revue finale et une PR de clôture.
- **R5** : les bornes des réglages de l'examen :
  - `secondes_par_question` et `minutes_minimum` sont des entiers ≥ 1 ;
  - `note_suffisante` va de 1 à 6 ;
  - `seuil_chapitre` est dans ]0, 1] ;
  - les tailles n'ont pas de plafond.
- **R6** : les commits d'un sous-agent nomment le modèle qui les a écrits.
- **R7** : `leitner.intervalles` est croissant au sens large. Deux intervalles égaux sont permis.
- **R8** : le module `texte-annote` a deux textes distincts :
  - `description`, le sous-titre de l'aperçu (H:1732) ;
  - `consigne`, en tête de l'onglet « Berichte » (H:2123).
- **R9** : `jetonsDuModule(module)` rend tous les jetons de tous les textes. L'examen s'en sert.
- **R10** : le curseur rendu au client est un numéro propre à (personne, cours), attribué à
  l'insertion. Le `rang` global, dont les trous trahiraient l'activité des autres, reste une clé
  interne, jamais exposée (invariant 1).
- **R11** : si `depuis` dépasse le dernier numéro (base restaurée), le serveur rend ce dernier
  numéro, et le client relit depuis 0.
- **R12** : un corps illisible garde la réponse 400 par défaut de Fastify. Le client traite tout
  400 comme une requête refusée.
- **R13** : après une relecture complète causée par un recul, les événements locaux absents du
  serveur sont remis dans la file.
- **R14** : `ajouterEvenement` refuse un événement invalide. Rien d'invalide n'entre dans la file.
- **R15** : les synchronisations simultanées d'un même cours sont fusionnées.
- **R15b** : un appel qui arrive pendant une synchronisation déclenche une seule relance après
  elle.
- **R16** : zod est accepté côté client, environ 27 ko gzip de plus. Il faut R14.
- **R17** : un recul se détecte par l'identité. L'appareil garde l'`id` de l'événement du curseur
  et relit depuis `curseur − 1`. Si le premier événement rendu n'a pas cet `id`, c'est un recul.
  Le lot 2b ajoute un second signal (2b-D4) : une réponse acceptée par le serveur, gardée dans la
  note des envois, que la lecture ne rend pas. Il règle les deux cas où le recul ne se voyait pas.
- **R18** : sur `introuvable`, le client ne fait oublier un cours que si `GET /api/cours` confirme
  son absence. Une liste injoignable ne fait rien oublier.
- **R19** : `bloquerSynchronisations` et `attendreLesSynchronisations` encadrent toute cérémonie
  de connexion, d'invitation, de lien ou de déconnexion. La file d'une personne ne part jamais
  sous la session d'une autre.
- **R20** : la base locale ferme sa connexion sur `blocking`.
- **R21** : `POST /api/cours/:id/journal` exige l'en-tête `x-ancrage-personne`.
  - Sans lui, la réponse est 400.
  - S'il nomme une autre personne que la session, la réponse est 409 `autre_personne`, et rien
    n'est écrit.
  - Le client traite le 409 comme une reconnexion.
- **R22** : des onglets sont restés vides sur le staging entre deux PR du palier B.
- **R23** : la liste locale lue à `/` hors ligne est le travail de la tâche du hors-ligne.
- **R24** : un échec de rangement d'une réponse s'affiche dans un bandeau, et l'onglet continue.
- **R25** : l'état de chaque onglet survit au changement d'onglet (`useEtatDOnglet`).
- **R25b** : « Lernen » et « Zum Quiz » repartent d'une série neuve (`oublierEtatDOnglet`).
- **R26** : `useTouches` laisse Entrée et Espace à un bouton ou à un lien. Une touche répétée est
  ignorée.
- **R27** : un examen chronométré n'est remis à l'échéance que si son onglet est affiché.
- **R28** : `vite-plugin-pwa` 1.x plutôt que la 2.0.0, trop récente.
- **R29** : `workbox-build` est déclaré, et l'e2e attend l'activation du service worker 15 s.
- **R30** : une déconnexion sans réseau n'efface rien, et le dit.
- **R31** : la déconnexion n'efface la base que si la file de la personne est vide après l'envoi.
- **R31b** : la déconnexion ne refuse que pour une cause passagère : réseau, 401, 409, 429 ou 5xx.
  Pour une cause durable, elle ferme la session et vide tout, sauf les files.
- **R32** : l'en-tête de R21 vaut aussi pour `GET /api/cours/:id/journal`.
- **R33** : à la déconnexion, les files non vides des autres personnes de l'appareil sont gardées.
- **R35** : l'identité mémorisée « moi » est remplacée même si `reserverA` échoue, et l'échec est
  signalé.
- **R36** : `GET /api/cours` et `GET /api/cours/:id` acceptent l'en-tête `x-ancrage-personne`.
  - Si l'en-tête nomme une autre personne, la réponse est 409 `autre_personne`, après `acces`.
  - Sans en-tête, aucun contrôle, pour le client de la version précédente (ADR-0008).
- **R37** : les dessins des schémas sont contrôlés, et une CSP est posée sur toutes les réponses.
  - `controlerBalises` refuse :
    - `<script`, `<foreignObject`, `<iframe`, `<object` et `<embed` ;
    - tout attribut `on…=` et tout `javascript:` ;
    - tout `href` qui ne commence pas par `#`.
  - Voir `docs/exploitation.md` pour la CSP.
- **R38** : ce document, l'ADR-0008 et l'extension de l'invariant 8 à l'API.
- **R39** : les mineurs de la revue finale sont triés. Ceux à corriger le sont avant la v0.4.0, les
  autres vont dans une issue « Lot 1d : suites ».
- **R40** : l'onglet choisi est ramené dans la vue par le `scrollLeft` de la barre, jamais par
  `scrollIntoView`, qui déplacerait le point de départ du clavier.
