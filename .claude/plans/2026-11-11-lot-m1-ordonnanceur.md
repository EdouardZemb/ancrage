# Lot M1 — L'ordonnanceur commun, et FSRS à côté de Leitner : plan d'exécution

> **Pour les agents :** compétence requise, `superpowers:subagent-driven-development` (recommandée)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).

**Objectif :** un cours choisit, dans son manifeste, l'algorithme qui dérive du journal l'échéance de
chaque unité : Leitner (inchangé, par défaut) ou FSRS.

**Architecture :** `src/domaine/progression/` gagne deux fichiers. `fsrs.ts` rejoue le journal avec
la bibliothèque `ts-fsrs` et rend le même `EtatUnite` que Leitner. `ordonnanceur.ts` choisit entre
les deux d'après les réglages du cours. Le client n'appelle plus `etatsDesUnites` directement, mais
l'ordonnanceur. Tout ce qui lit `EtatUnite` (séances, statistiques, onglets) reste tel quel.

**Pile :** TypeScript, vitest, zod, `ts-fsrs` 6.0.0 (MIT), Stryker.

**Spec :** l'issue 5 de ce dépôt, `https://github.com/EdouardZemb/ancrage/issues/5`, et son
commentaire « Cadrage » (décisions M1-D1 à M1-D10). L'exécutant lit les deux.

## Contraintes globales

- **Test d'abord** : chaque test est écrit, lancé, et échoue, avant le code qui le fait passer.
- **Les tests de `fsrs.ts` et d'`ordonnanceur.ts` n'ont pas de `describe`** (Stryker ne retrouve pas
  un test placé dans une suite).
- **Aucun hasard dans le calcul** (M1-D2) : la dispersion de la bibliothèque est coupée, et la
  version du modèle est nommée, jamais laissée au défaut de la bibliothèque.
- **Rien de nouveau au journal** : `src/domaine/journal/` ne change pas. La notice non plus.
- **Sans `memoire` au manifeste, tout se comporte comme avant** : les tests existants d'`etat.ts`,
  de `statistiques.ts` et des séances passent sans retouche.
- **Données inventées seulement** (invariant 7) : les journaux des tests sont écrits à la main, avec
  les aides de `src/domaine/evenements.fixture.ts`. Aucun texte du cours de l'instance, aucun nom :
  le cours d'exemple (`exemple-contenu/kueche/`) ou des identifiants inventés.
- **Les suites lourdes une à la fois**, le code de sortie lu avant d'aller plus loin :
  `corepack pnpm test`, puis `lint`, `types`, `duplication`.
- **Commits** : Conventional Commits en français, en-tête de 100 caractères au plus, `git add` par
  chemins, message par fichier (`git commit -F`). Envoi : `git push origin <branche>`, la branche
  toujours nommée.
- **Un worktree par PR**, dans `ancrage.worktrees\<sujet>`, sur une branche partie d'`origin/main`.

## Écart assumé avec la spec

M1-D1 nomme le champ `niveau`. Le plan garde le nom `boite` d'`EtatUnite` : une trentaine de fichiers
le lisent, et le renommer ferait une PR de bruit. En FSRS, `boite` est le niveau dérivé de la
stabilité (M1-D4). L'ADR de la tâche 1 le dit.

## Points de revue

Ce que la spec implique sans le dire, du plus probable au moins probable. Chaque ligne a son test
dans la tâche nommée.

1. **Un journal arrivé dans le désordre** (un autre appareil envoie plus tard une réponse plus
   ancienne) : l'état est le même quel que soit l'ordre d'arrivée. Tâche 1.
2. **Beaucoup de réponses le même jour sur une même unité** (une carte ratée puis réussie cinq fois
   dans la séance) : l'échéance reste une date valide, `boite` reste entre 1 et 5, et une faute en
   dernier rend l'unité due le jour même. Tâche 1.
3. **Un client plus récent que le serveur, ou l'inverse** : un algorithme inconnu dans la forme
   servie vaut Leitner au lieu de faire refuser le cours. Tâche 2.
4. **Le passage d'un cours de Leitner à FSRS avec un mois d'historique** : le nombre d'unités dues
   le jour du passage est borné (M1-D8). Tâche 3.
5. **Une réponse à 23 h 59 puis une autre à 0 h 01** : ce sont deux jours locaux, donc un jour
   d'écart pour FSRS, comme pour Leitner. Tâche 1.

---

## Tâche 1 : l'adaptateur FSRS et son ADR (PR 1)

**Fichiers :**
- Créer : `src/domaine/progression/fsrs.ts`, `src/domaine/progression/fsrs.test.ts`
- Créer : `docs/decisions/0012-l-ordonnancement-des-revisions.md`
- Modifier : `package.json`, `pnpm-lock.yaml`, `docs/decisions/README.md`, `stryker.config.json`

**Interfaces :**
- Consomme : `Evenement` (`src/domaine/journal/evenement.js`) ; `jourDe`, `ajouterJours`
  (`src/domaine/journal/temps.js`) ; `EtatUnite`, `journalSansDoublon` (`./etat.js`).
- Produit :
  - `etatsFsrs(evenements: readonly Evenement[], retention: number): ReadonlyMap<string, EtatUnite>`
  - `boiteDeStabilite(joursDeStabilite: number): 1 | 2 | 3 | 4 | 5`

- [ ] **Étape 1 : la dépendance.** `corepack pnpm add --save-exact ts-fsrs@6.0.0`. Relever la licence
  de `ts-fsrs` (MIT attendue) et de `@open-spaced-repetition/srs-kit` (BSD-3-Clause attendue) dans
  `node_modules`. Une autre licence : s'arrêter et le dire.

- [ ] **Étape 2 : lire l'API installée, pas ce plan.** La version 6 a une API neuve. Lire les
  `.d.ts` du paquet et son README dans `node_modules/ts-fsrs/`. Il faut un ordonnanceur :
  - créé **de façon synchrone** (`DefaultScheduler()` est asynchrone ; `defineScheduler(…).create(…)`
    semble synchrone). S'il n'existe aucun chemin synchrone, s'arrêter et le dire : le domaine est
    fait de fonctions pures synchrones ;
  - au modèle **`FSRS-6` nommé**, avec ses poids par défaut ;
  - sans dispersion (`enableFuzz: false`), sans étapes courtes (`enableShortTerm: false`), en jours
    entiers ;
  - à la rétention reçue en paramètre.

- [ ] **Étape 3 : les tests, qui échouent.** Dans `fsrs.test.ts`, sans `describe`, sur des journaux
  écrits avec `evenements.fixture.ts`. Les unités s'appellent `u1`, `u2`, `u1:inverse`.

  | Test | Ce qu'il affirme |
  |---|---|
  | `une unité sans réponse est absente` | `etatsFsrs([], 0.9).size === 0` |
  | `une première réponse juste` | `boite >= 1`, `justes === 1`, `fausses === 0`, `echeance > jour de la réponse` |
  | `une faute rend l'unité due le jour même` | après juste (J) puis faux (J+3) : `echeance === J+3`, `boite === 1`, `fausses === 1` |
  | `les justes espacées allongent l'intervalle` | quatre justes, chacune à l'échéance rendue par la précédente : chaque intervalle (échéance − jour) est strictement plus grand que le précédent |
  | `l'intervalle dépasse le plafond de Leitner` | après ces quatre justes, l'intervalle est supérieur à 16 jours |
  | `l'ordre d'arrivée ne compte pas` | le même journal de 6 réponses sur 2 unités, à l'endroit, à l'envers et mélangé à la main : trois états `toEqual` |
  | `un doublon ne compte qu'une fois` | le journal avec un événement répété donne l'état du journal sans lui |
  | `un examen n'y entre pas` | un événement `examen` ajouté ne change rien |
  | `l'unité inverse est une autre unité` | `u1` et `u1:inverse` ont chacune leur état |
  | `beaucoup de réponses le même jour` | faux, puis cinq justes le même jour : `boite` entre 1 et 5, `echeance` au format `AAAA-MM-JJ`, `>=` ce jour ; puis un faux en dernier : `echeance ===` ce jour |
  | `23 h 59 puis 0 h 01` | deux justes, à `…T23:59:00+01:00` puis le lendemain `…T00:01:00+01:00` : même état que deux justes à midi, deux jours de suite |
  | `une rétention plus haute rapproche l'échéance` | même journal : l'échéance à 0,95 est `<=` celle à 0,80, et strictement plus tôt après quatre justes espacées |
  | `le calcul est fixé` | un journal de 5 réponses à dates fixes : l'état entier est comparé à une valeur écrite en dur, relevée une fois à l'étape 5. Ce test garde d'une dérive à une montée de version |
  | `boiteDeStabilite` | 0,5 → 1 ; 1,99 → 1 ; 2 → 2 ; 3,99 → 2 ; 4 → 3 ; 7,99 → 3 ; 8 → 4 ; 20,99 → 4 ; 21 → 5 ; 400 → 5 |

- [ ] **Étape 4 :** `corepack pnpm vitest run src/domaine/progression/fsrs.test.ts` : échec,
  « etatsFsrs is not a function » ou équivalent.

- [ ] **Étape 5 : `fsrs.ts`.**
  - Rejouer `journalSansDoublon(evenements)`, les seules `reponse`, unité par unité.
  - Chaque réponse est datée de son **jour local** (`jourDe`), porté à midi UTC pour la
    bibliothèque : l'heure ne compte pas, seul l'écart en jours compte.
  - Juste vaut la note « Good », faux la note « Again ».
  - Après une réponse juste : `echeance = ajouterJours(jour, n)`, où `n` est l'intervalle en jours
    entiers que rend la bibliothèque, au moins 1. Après une faute : `echeance = jour` (M1-D3).
  - `boite = boiteDeStabilite(stabilité en jours)` après une réponse juste ; `boite = 1` après une
    faute. Seuils de M1-D4 : moins de 2 jours → 1 ; moins de 4 → 2 ; moins de 8 → 3 ; moins de
    21 → 4 ; sinon 5.
  - L'ordonnanceur de la bibliothèque est créé une fois par rétention, pas à chaque réponse.
  - L'en-tête du fichier dit, comme celui d'`etat.ts`, d'où vient la règle et ce qui la fixe
    (ADR-0012, M1-D2 à M1-D4).
  - Relever alors la valeur du test `le calcul est fixé`, et l'écrire en dur.

- [ ] **Étape 6 :** le même `vitest run` : tout passe.

- [ ] **Étape 7 : la mutation.** Ajouter `"src/domaine/progression/fsrs.ts"` à `mutate` dans
  `stryker.config.json`, après `etat.ts`. Lancer
  `corepack pnpm mutation --mutate "src/domaine/progression/fsrs.ts"` : score de 90 % au moins.
  Un mutant survivant se tue par un test, pas par une exclusion.

- [ ] **Étape 8 : l'ADR-0012**, « L'ordonnancement des révisions », au format des ADR voisins. Il
  dit : le contexte (le plafond de 16 jours, ce que l'ADR-0004 prévoyait) ; la décision (un
  ordonnanceur par cours, FSRS-6 par `ts-fsrs`, note binaire, sans dispersion, modèle nommé, le
  niveau dérivé de la stabilité sous le nom `boite`) ; les conséquences (une dépendance du domaine,
  le test `le calcul est fixé` à relire à chaque montée de version, la précision inconnue de la note
  binaire, le retour à Leitner par une ligne du manifeste) ; ce qu'il remplace (les règles de
  Leitner de l'ADR-0004, pour un cours qui choisit FSRS). L'inscrire dans `docs/decisions/README.md`.

- [ ] **Étape 9 :** `corepack pnpm test`, puis `lint`, `types`, `duplication`, un à la fois, tous
  à 0.

- [ ] **Étape 10 : commit et PR.** `feat: FSRS rejoue le journal, à côté de Leitner (M1)`. Le corps
  de la PR cite l'issue 5 (`Refs #5`).

## Tâche 2 : le réglage `memoire`, du manifeste au téléphone (PR 2)

**Fichiers :**
- Modifier : `src/domaine/contenu/schemas.ts` (près de `reglagesLeitner`, l. 485-499),
  `src/domaine/contenu/modele.ts` (l. 298-313), `src/domaine/contenu/analyse.ts` (l. 322),
  `src/domaine/cours/servi.ts` (l. 31, 311, 326, 506), `src/serveur/contenus/reference.ts` (l. 52,
  203), `docs/format-des-contenus.md` (l. 91-127)
- Tests : les fichiers de test voisins de chacun

**Interfaces :**
- Produit, dans `modele.ts` :
  ```ts
  export type AlgorithmeDeMemoire = 'leitner' | 'fsrs';
  export interface ReglagesMemoire { algorithme: AlgorithmeDeMemoire; retention: number }
  ```
  et `memoire?: ReglagesMemoire` sur le cours analysé et sur le cours servi, à côté de `leitner`.

- [ ] **Étape 1 : les tests du manifeste, qui échouent.**
  - `memoire: { algorithme: "fsrs" }` est accepté, et l'analyse rend `retention: 0.9`.
  - `memoire: { algorithme: "fsrs", retention: 0.85 }` rend 0,85.
  - Sont refusés, chacun avec un message en français : `algorithme: "sm2"` ; `retention: 0.79` ;
    `retention: 0.96` ; une clé inconnue dans `memoire` (objet strict).
  - Sans `memoire`, le cours analysé n'a pas la clé (`'memoire' in cours === false`).
- [ ] **Étape 2 :** les lancer, ils échouent. Puis le schéma zod (`algorithme` obligatoire dans
  `memoire`, `retention` facultatif, entre 0,80 et 0,95), le type et `analyse.ts`.
- [ ] **Étape 3 : les tests de la forme servie, qui échouent.**
  - Un cours avec `memoire` le sert tel quel ; un cours sans ne sert pas la clé.
  - Côté client (`coursServiUtilisable` et son schéma tolérant) : une forme servie sans `memoire`
    est utilisable ; avec `{ algorithme: "fsrs", retention: 0.9 }` aussi ; avec un algorithme
    inconnu (`"sm2"`) ou une rétention hors bornes, le cours reste utilisable et `memoire` est
    absent du résultat (point de revue 3).
- [ ] **Étape 4 :** `servi.ts`, jusqu'à ce qu'ils passent.
- [ ] **Étape 5 : l'instantané de référence.** Test d'abord : `reference.ts` écrit `memoire` quand le
  cours l'a, et rien de plus quand il ne l'a pas. L'instantané d'un cours sans `memoire` est donc
  octet pour octet celui d'avant.
- [ ] **Étape 6 : `docs/format-des-contenus.md`.** La clé, ses valeurs, son défaut, et cette règle :
  **un cours ne reçoit `memoire` qu'une version après celle qui la connaît**. Le schéma du
  manifeste est strict : l'image précédente, que le retour arrière remet en service, refuserait un
  manifeste qui porte une clé qu'elle ignore (invariant 8).
- [ ] **Étape 7 :** `corepack pnpm test`, puis `lint`, `types`, `duplication`. Puis
  `corepack pnpm contenus:verifier` sur l'exemple : 0.
- [ ] **Étape 8 : commit et PR.** `feat: le manifeste d'un cours choisit son algorithme de mémoire (M1)`.

## Tâche 3 : l'ordonnanceur, branché au client (PR 3)

Elle part d'un `main` qui porte les tâches 1 et 2.

**Fichiers :**
- Créer : `src/domaine/progression/ordonnanceur.ts`, `src/domaine/progression/ordonnanceur.test.ts`
- Modifier : `src/client/cours/useProgression.ts` (l. 114 et 268), son test,
  `exemple-contenu/kueche/cours.yaml`, `stryker.config.json`, `CLAUDE.md` (« Commandes », la liste
  de `mutation`), `docs/pistes.md`

**Interfaces :**
- Consomme : `etatsFsrs` (tâche 1) ; `ReglagesMemoire` (tâche 2) ; `etatsDesUnites`, `EtatUnite`
  (`./etat.js`) ; `ReglagesLeitner`.
- Produit :
  ```ts
  export type Ordonnanceur = (evenements: readonly Evenement[]) => ReadonlyMap<string, EtatUnite>;
  export function ordonnanceurDe(reglages: {
    leitner: ReglagesLeitner;
    memoire?: ReglagesMemoire;
  }): Ordonnanceur;
  ```

- [ ] **Étape 1 : les tests, qui échouent**, sans `describe`.
  - Sans `memoire` : le résultat est `toEqual` à `etatsDesUnites(journal, leitner)`.
  - Avec `algorithme: "leitner"` : de même.
  - Avec `algorithme: "fsrs", retention: 0.85` : `toEqual` à `etatsFsrs(journal, 0.85)`, et différent
    de l'état Leitner sur un journal de quatre justes espacées.
  - **Le passage (M1-D8, point de revue 4).** Un journal inventé, construit par une boucle écrite
    dans le test : 60 unités, introduites 2 par jour pendant 30 jours ; chaque unité reçoit une
    réponse juste le jour de son introduction, puis à chaque échéance que Leitner lui donne
    (intervalles 0, 1, 2, 4, 8, 16) ; une unité sur cinq reçoit une faute à sa deuxième révision. Au
    jour 31 : `duesFsrs <= duesLeitner + 6`. Si ce test échoue une fois le code écrit, **ne pas
    retoucher la borne** : s'arrêter et donner les deux nombres.
- [ ] **Étape 2 :** les lancer, ils échouent. Puis `ordonnanceur.ts`.
- [ ] **Étape 3 : le client.** Test d'abord, dans `useProgression.test.tsx` : avec un cours servi en
  FSRS, quatre réponses justes espacées donnent une échéance au-delà de 16 jours ; avec le même
  cours sans `memoire`, l'échéance Leitner. Puis `useProgression.ts` appelle
  `ordonnanceurDe(cours.cours)`, mémorisé sur `leitner` et `memoire`.
- [ ] **Étape 4 : l'exemple passe en FSRS.** `memoire: { algorithme: "fsrs" }` dans
  `exemple-contenu/kueche/cours.yaml`. Les tests qui lisent l'exemple et attendent une échéance de
  Leitner prennent `exempleDeCours()` sans `memoire`, ou affirment la nouvelle échéance ; au moins
  un test du client garde un cours en Leitner.
- [ ] **Étape 5 : la mutation.** Ajouter `"src/domaine/progression/ordonnanceur.ts"` à `mutate`, et
  le dire dans `CLAUDE.md`, « Commandes ». `corepack pnpm mutation --mutate "$(node
  scripts/mutation-groupe.mjs domaine)"` : 90 % au moins.
- [ ] **Étape 6 : le poids du client.** `corepack pnpm build` sur `origin/main` d'avant la tâche 1,
  puis sur la branche : relever la taille gzip des `.js` de `dist/client` dans les deux cas, et
  l'écrire dans le corps de la PR. Au-delà de 40 ko gzip de plus, s'arrêter et le dire.
- [ ] **Étape 7 : `docs/pistes.md`.** La piste « Répétition espacée moderne » part (elle a son
  issue). La piste « Alternance des sujets » devient : seulement ciblée sur des termes que l'on
  confond, la méta-analyse de Brunmair et Richter (2019) étant défavorable à l'alternance
  généralisée pour des mots.
- [ ] **Étape 8 :** `corepack pnpm test`, `lint`, `types`, `duplication`, puis `corepack pnpm build`,
  `corepack pnpm e2e` et `corepack pnpm contenus:client`, un à la fois, tous à 0.
- [ ] **Étape 9 : commit et PR.** `feat: l'échéance d'une unité suit l'algorithme de son cours (M1)`.

## Tâche 4 : la revue finale, puis la vérification

- [ ] **Étape 1 : la revue finale** du diff des trois PR, par un agent frais sur le modèle le plus
  capable. Il relit la spec, ce plan, et cherche dans tout le dépôt ce que le lot périme : les
  phrases qui disent que l'échéance est celle de Leitner (`CLAUDE.md`, `docs/`, les en-têtes de
  `etat.ts`, `cartes.ts`, `statistiques.ts`).
- [ ] **Étape 2 : 👤 sur le staging, sur un téléphone Android.** Le staging sert le cours de
  l'instance, resté en Leitner : rien ne doit y avoir changé (les échéances, « heute zu
  wiederholen », les Fächer). FSRS se vérifie au poste, sur l'exemple : `corepack pnpm build`, puis
  `corepack pnpm start`, une séance de cartes, et l'Übersicht le lendemain.
- [ ] **Étape 3 : la clôture.** Une PR retire ce plan, écrit `docs/conception/lot-m1.md` (les
  décisions M1-D et les arbitrages M1-R nés en route) et met à jour « État » dans `CLAUDE.md`.
- [ ] **Étape 4 : 👤 l'étiquette `vX.Y.Z`**, par le propriétaire.

## Ce que le lot laisse

- **Le cours de l'instance passe en FSRS par une PR du dépôt de données**, au plus tôt une version
  après celle de ce lot (tâche 2, étape 6), et après la lecture du test du passage.
- Le lot suivant, « Heute », lira `ordonnanceurDe` pour tous les éléments.

## Exécution

- **Par sous-agents**, un par tâche, les tâches 1 à 3 dans l'ordre, chacune fusionnée avant la
  suivante. Un agent de modèle intermédiaire suffit : le plan porte les décisions.
- **Une revue par tâche** avant sa fusion, puis la revue finale de la tâche 4.
- **Le contrôleur** garde les arrêts : aucun chemin synchrone, une licence inattendue, la borne du
  passage, le poids du client. Il les porte au propriétaire avec les nombres.
