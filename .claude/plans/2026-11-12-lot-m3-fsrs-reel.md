# Lot M3 — FSRS pour un cours réel, ajusté et suivi : plan d'exécution

> **Pour les agents :** compétence requise, `superpowers:subagent-driven-development` (recommandée)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).

**Objectif :** un cours monté peut passer de Leitner à FSRS chapitre par chapitre, avec des
paramètres ajustés sur son journal, un plafond d'intervalle avant l'examen, et un rapport privé qui
suit l'effet.

**Architecture :** quatre objets, peu couplés. Le journal apprend le mode d'une réponse, dans
`resultat`, sans colonne ni migration. La clé `memoire` du manifeste gagne des paramètres, une date
d'examen et un algorithme « par chapitre », que lit une fonction pure et que l'ordonnanceur applique.
Deux outils du poste, hors de l'image, lisent une copie de la base en lecture seule : l'un ajuste
les paramètres, l'autre écrit le rapport. La notice dit le mode et les deux usages.

**Pile :** TypeScript, zod, `ts-fsrs` 6.0.0, `@open-spaced-repetition/binding` (dépendance de
développement), `better-sqlite3`, vitest, Stryker, Playwright.

**Spec :** l'issue 21 de ce dépôt, `https://github.com/EdouardZemb/ancrage/issues/21`. L'exécutant
la lit.

## Contraintes globales

- **Test d'abord** : chaque test est écrit, lancé, et échoue, avant le code qui le fait passer.
- **Deux versions** (invariant 8). La version N accepte et comprend ; la version N+1 émet. En N : le
  serveur accepte un mode, le manifeste connaît ses nouvelles clés, les outils existent. En N+1 : le
  client envoie le mode, et la notice change. Les tâches 1 à 6 sont la version N ; la tâche 8 est la
  version N+1, après l'étiquette de la tâche 7.
- **Aucune donnée réelle** dans le dépôt ni dans les tests (invariant 7) : les outils se prouvent
  sur une base temporaire et un journal inventé. Aucun nom, aucun texte du cours de l'instance.
- **Les outils du poste ne vont pas dans l'image** : ils vivent sous `src/outillage/memoire/`, se
  lancent par `tsx`, et n'importent rien que `src/serveur/` importerait en retour.
- **Lecture seule** : un outil ouvre une copie de la base comme `inspecter` de
  `src/serveur/base/sauvegarde.ts`, sans migrer ni créer de fichier à côté.
- **Ni horloge ni hasard cachés dans le domaine.** Un plafond d'intervalle se calcule depuis le jour
  de la réponse, jamais depuis aujourd'hui : deux appareils au même journal donnent le même état.
- **Les tests des fichiers mutés n'ont pas de `describe`** (Stryker).
- **Les suites lourdes une à la fois**, le code de sortie lu avant d'aller plus loin :
  `corepack pnpm test`, puis `lint`, `types`, `duplication`. Un test d'écran qui passe par l'écran
  du cours ne dépend pas du hasard du navigateur, et se répète huit fois avant l'envoi (registre,
  LE-15).
- **Commits** : Conventional Commits en français, en-tête de 100 caractères au plus, `git add` par
  chemins, message par fichier (`git commit -F`). Envoi : `git push origin <branche>`, seule dans
  sa commande, sans redirection.
- **Un worktree par PR**, dans `ancrage.worktrees\<sujet>`, sur une branche partie d'`origin/main`.
- **Le texte de chaque PR** porte « Partie de » suivi du numéro de l'issue, et une section
  `## Écarts à la spec`. Seule la PR de clôture ferme l'issue.

## Décisions du plan

- **M3-P1, le mode vit dans `resultat`.** `resultat: { juste, mode? }` : la colonne `resultat` est
  déjà un JSON, que le dépôt, la relecture et l'export recopient tel quel. Ni migration, ni colonne.
  `v` reste à 1 : un autre `v` serait refusé par le serveur de la version précédente. Une fois
  qu'un client de la version N+1 a pu émettre, le serveur ne redescend plus sous la version N : un
  serveur d'avant refuserait le lot, et la file du cours resterait bloquée, sans perte, jusqu'au
  retour d'un serveur qui accepte. `docs/exploitation.md` le dit.
- **M3-P2, les modes.** Neuf valeurs, qui disent le geste et non l'onglet : `retournee` (carte
  retournée, jugée par la personne), `saisie` (réponse tapée, jugée par l'application), `corrigee`
  (saisie jugée fausse, puis déclarée juste par la personne), `choix` (une proposition parmi
  plusieurs, liste d'une phrase à trous comprise), `assemblage` (tuiles d'un mot), `pointage` (un
  point touché sur un dessin), `association` (appariement, classement), `montree` (réponse montrée
  puis jugée par la personne), `lecture` (le bilan d'un texte). Une réponse d'examen porte le mode
  de sa question.
- **M3-P3, « par chapitre » est un algorithme à lui.** `memoire.algorithme` gagne la valeur
  `par-chapitre`, avec `chapitres`, la liste des modules de cartes en FSRS. Tout le reste du cours
  (les autres cartes, les mots, les points, les exercices, les fiches) reste en Leitner. Un
  appareil resté à la version précédente ne connaît pas cette valeur et retombe sur Leitner pour
  tout le cours : c'est le repli sûr. Garder `fsrs` avec une liste l'aurait fait appliquer FSRS à
  tout le cours. Le repli ne vaut que pour le client : un serveur d'avant la version N refuse de
  démarrer sur un manifeste qui porte une clé nouvelle. Après le premier manifeste neuf, on ne
  redescend donc plus sous la version N (`docs/format-des-contenus.md`, `docs/exploitation.md`).
- **M3-P4, les paramètres.** `memoire.parametres` porte les 21 poids de FSRS-6, valides au sens de
  `checkFSRS6Parameters`. Sans eux, les poids par défaut. Ils valent pour `fsrs` comme pour
  `par-chapitre`. Avec `fsrs`, un appareil resté à la version précédente retire `parametres` et
  `examen`, qu'il ne connaît pas, et calcule avec les poids par défaut, sans plafond : ses
  échéances diffèrent jusqu'à sa mise à jour, au lancement suivant. C'est la limite déjà connue du
  lot M1 (M1-D6), que tient la règle « une version après ».
- **M3-P5, le plafond.** `memoire.examen` porte une date. Pour une réponse donnée `n` jours avant
  elle (`joursEntre(jourDe(repondu_a), examen)`), l'intervalle ne dépasse pas la moitié de `n`,
  arrondie vers le bas, et vaut un jour au moins. Le plafond porte sur l'échéance rendue, pas sur
  la stabilité que garde FSRS. Deux précisions de la spec, à déclarer dans la PR de la tâche 3 : à
  un jour de l'examen, l'intervalle est d'un jour, plus que la moitié ; le jour de l'examen et
  après, il n'y a plus de plafond. Leitner n'est pas concerné : il plafonne déjà à 16 jours.
- **M3-P9, le passage d'un chapitre n'a pas de mécanisme à lui.** FSRS rejoue tout le journal :
  une unité déjà révisée garde son histoire, elle ne repart pas de zéro. Le nombre d'unités dues
  le jour du passage est donc de l'ordre de celui de Leitner la veille, et « Heute » l'étale par
  ses séances de 20. Le lot le prouve par un test qui compare les deux comptes sur un journal
  inventé d'un mois, et le rapport de la tâche 6 mesure le pic réel. S'il dépassait une fois et
  demie le compte de Leitner, la question reviendrait à Edouard.
- **M3-P10, l'ajustement lit ce que le rejeu lit.** `etatsFsrs` traite chaque réponse comme une
  révision, celles d'un même jour à zéro jour d'écart. L'outil donne à l'optimiseur la même suite,
  tirée de la même fonction, pour que les paramètres ajustés soient ceux du calcul qui s'en sert.
- **M3-P6, l'accord se dit à la commande.** La base n'a pas de champ d'accord, et n'en gagne pas.
  Le rapport d'une personne demande `--personne <identifiant>` et `--accord <JJ/MM/AAAA>`, la date
  où elle l'a donné, que le rapport imprime. Sans les deux, le rapport ne donne que des chiffres
  d'ensemble.
- **M3-P7, la mesure sur téléphone.** Un écran de l'application, `/mesure`, fabrique en mémoire un
  journal inventé de la taille voulue et chronomètre son rejeu par chaque algorithme, sur
  l'appareil qui l'ouvre. Il ne lit ni n'écrit aucune donnée, et n'est lié depuis aucun écran. Il
  s'ouvre sans connexion, comme la notice, et ne lance une mesure qu'au bouton, la plus grande
  après un avertissement : un téléphone ne se fige pas en ouvrant la page.
- **M3-P8, la notice change avec le client qui émet** (version N+1), pas avant : elle décrit ce que
  l'application fait.

## Points de revue

Ce que la spec implique sans le dire, du plus probable au moins probable. Chaque ligne a son test
dans la tâche nommée.

1. **Un téléphone resté à la version précédente, après un retour arrière du serveur** : il n'envoie
   jamais de mode à un serveur qui le refuserait, puisque le client n'émet qu'en N+1. Tâche 1 (le
   serveur de N accepte) et tâche 8 (le client de N+1 émet).
2. **Un manifeste écrit à moitié** : `par-chapitre` sans `chapitres`, un chapitre inconnu, 20 poids
   au lieu de 21, une date d'examen mal formée. L'analyse refuse, avec le fichier et la clé.
   Tâche 2.
3. **Le passage d'un chapitre avec un mois d'historique** : le nombre d'unités dues le jour du
   passage est borné, et l'état se rejoue du journal entier. Tâche 3.
4. **Une réponse le jour de l'examen, ou après** : pas de plafond négatif ni nul, l'intervalle est
   celui de FSRS. Tâche 3.
5. **Un journal trop court pour ajuster** : l'outil le dit et rend un code d'erreur, au lieu
   d'écrire des paramètres sans valeur. Tâche 5.
6. **Une base copiée pendant une écriture** (un fichier `-wal` absent) : l'outil lit ce que la
   copie contient, sans créer de fichier à côté. Tâche 5.
7. **Un rapport demandé pour une personne sans date d'accord** : refus, code d'usage. Tâche 6.
8. **Un client qui émet face à un serveur qui refuse le mode** (un retour arrière sous la
   version N) : la file reste entière et repart quand le serveur accepte. Tâche 8.
9. **Plusieurs réponses le même jour sur une unité** : l'ajustement les compte comme le rejeu.
   Tâche 5.
10. **Une sortie d'outil qui nommerait quelqu'un** : ni la sortie, ni les erreurs, ni le rapport
    d'ensemble ne portent un identifiant ou un nom affiché. Tâches 5 et 6.

## Mécanismes annoncés

- `src/domaine/journal/evenement.ts:99` — `resultatReponse` — le résultat d'une réponse est un
  objet strict : une clé de plus fait refuser l'événement.
- `src/domaine/journal/evenement.ts:96` — `VERSION_EVENEMENT` — `v` est un littéral : tout autre
  `v` est refusé.
- `src/serveur/routes-journal.ts:40` — `schemaEvenement` — le serveur valide chaque événement d'un
  lot, et refuse le lot entier pour un seul événement invalide.
- `src/client/synchro.ts:427` — `refuse` — un lot refusé par le serveur laisse la file du cours
  bloquée.
- `src/serveur/journal/depot-journal.ts:93` — `JSON.stringify(message.resultat)` — le dépôt range
  `resultat` tel quel, en JSON.
- `src/serveur/journal/depot-journal.ts:53` — `JSON.parse(ligne.resultat)` — la relecture rend
  `resultat` tel qu'il a été rangé.
- `src/serveur/comptes/export.ts:80` — `JSON.parse(ligne.resultat)` — l'export rend `resultat` tel
  qu'il a été rangé.
- `src/client/stockage/journal-local.ts:70` — `schemaEvenement.safeParse` — l'appareil valide un
  événement avant de le ranger.
- `src/client/cours/useProgression.ts:248` — `enregistrer` — une réponse se crée d'une unité et
  d'un verdict, sans autre donnée.
- `src/client/cours/contexte-cours.ts:31` — `enregistrer(unite: string, juste: boolean)` — c'est
  la signature que tous les onglets appellent.
- `src/domaine/contenu/schemas.ts:495` — `reglagesMemoire` — la clé `memoire` du manifeste est un
  objet strict : le serveur de la version précédente refuse une clé qu'il ne connaît pas.
- `src/domaine/contenu/analyse.ts:326` — `ecrit.memoire` — l'analyse recopie `memoire` champ par
  champ.
- `src/domaine/cours/servi.ts:315` — `cours.memoire` — la forme servie recopie `memoire` champ par
  champ.
- `src/domaine/cours/servi.ts:337` — `const memoire = z.object` — le client lit `memoire` sans
  rigueur : une clé inconnue est retirée, une valeur inconnue d'`algorithme` rend `undefined`.
- `src/domaine/cours/servi.ts:343` — `memoireDuCours` — sans réglage lisible, le cours est en
  Leitner.
- `src/serveur/contenus/reference.ts:210-213` — `memoire` — l'instantané de référence recopie
  `memoire` champ par champ.
- `src/domaine/progression/ordonnanceur.ts:17` — `ordonnanceurDe` — l'ordonnanceur ne reçoit que
  les réglages et le journal : il ne sait pas à quel chapitre une unité appartient.
- `src/domaine/progression/fsrs.ts:57` — `FSRS6_DEFAULT_WEIGHTS` — les poids sont ceux par défaut.
- `src/domaine/progression/fsrs.ts:107` — `scheduledDays` — l'échéance est le jour de la réponse
  plus l'intervalle de la bibliothèque, d'un jour au moins.
- `src/domaine/cartes/unites.ts:18` — `module: string` — une unité de carte connaît son module, qui
  est son chapitre ; les autres unités n'en ont pas.
- `src/domaine/journal/temps.ts:38` — `ajouterJours` — le domaine sait ajouter des jours à une
  date, pas compter les jours entre deux dates.
- `src/serveur/base/sauvegarde.ts:79` — `readonly: true` — une base s'ouvre en lecture seule, sans
  migration.
- `src/client/routeur.ts:43` — `route` — un chemin que le routeur ne connaît pas mène à
  l'accueil : `/mesure` doit y entrer.
- `src/client/routeur.ts:112` — `redirection` — un écran se redirige selon que le visiteur est
  connecté ou non ; la notice s'ouvre sans connexion.
- `src/client/cours/useProgression.ts:255` — `enregistrerExamen` — un examen remis journalise une
  réponse par question, d'une unité et d'un verdict.
- `src/domaine/progression/fsrs.ts:92-103` — `planificateur.review` — chaque réponse est une
  révision, au jour de la réponse ; celles d'un même jour se suivent à zéro jour d'écart.
- `src/domaine/notice-gabarit.ts:22` — `NOTICE_VERSION` — la version de la notice est une date,
  celle de la fusion qui change son texte.
- `stryker.config.json:6` — `mutate` — la liste des fichiers mutés.

## Outils et cas limites

- Stryker — il ne retrouve pas un test placé dans un `describe`, et compte alors ses mutants
  comme survivants — la passe `corepack pnpm mutation` du groupe `domaine`, à 90 % sur les
  fichiers ajoutés à la liste
- zod `strictObject` — il refuse toute clé inconnue, là où `z.object` la retire sans rien dire —
  les tests « un événement avec un mode inconnu est refusé » et « sans mode, accepté » de la tâche 1
- `checkFSRS6Parameters` de `ts-fsrs` — il lève une exception sur des poids hors bornes ou en
  mauvais nombre, au lieu de rendre un verdict — le test « 20 poids : l'analyse refuse, sans
  exception » de la tâche 2
- `@open-spaced-repetition/binding` — sur trop peu de révisions, l'optimiseur rend les poids par
  défaut ou échoue, sans le dire clairement — le test « un journal trop court rend le code 2 » de
  la tâche 5
- `better-sqlite3` en lecture seule — il refuse une base en mode WAL dont le fichier `-shm` ne peut
  être créé, selon le dossier — le test « une copie faite par `VACUUM INTO` se lit dans un dossier
  en lecture seule, sans fichier créé » de la tâche 5

## Revues

- Revue de tâche, spec et qualité, avant la PR : Tâche 1
- Revue de tâche, spec et qualité, avant la PR : Tâche 2
- Revue de tâche, spec et qualité, avant la PR : Tâche 3
- Revue de tâche, spec et qualité, avant la PR : Tâche 4
- Revue de tâche, spec et qualité, avant la PR : Tâche 5
- Revue de tâche, spec et qualité, avant la PR : Tâche 6
- Revue de tâche, spec et qualité, avant la PR : Tâche 8
- Revue finale du lot, sur la tête de `main` : Tâche 9
- Relecture des corrections de la revue finale : Tâche 9

---

### Tâche 1 : le journal accepte le mode d'une réponse, et l'ADR (PR 1, version N)

**Fichiers :**
- Modifier : `src/domaine/journal/evenement.ts`, `src/domaine/journal/evenement.test.ts`
- Modifier : `src/serveur/routes-journal.test.ts`, `src/serveur/comptes/export.test.ts`
- Créer : `docs/decisions/0013-le-mode-d-une-reponse-au-journal.md`
- Modifier : `docs/decisions/README.md`, `docs/decisions/0007-donnees-personnelles-et-sauvegardes.md`
  (son statut seulement, qui renvoie à l'ADR-0013)

**Interfaces :**
- Produit :
  - `MODES_DE_REPONSE`, la liste de M3-P2, et `type ModeDeReponse`
  - `ResultatReponse = { juste: boolean; mode?: ModeDeReponse }`, le schéma `resultatReponse`
    gagnant `mode` facultatif. `v` reste à 1, et le commentaire qui annonçait « un nouveau `v` »
    dit pourquoi.

- [ ] **Étape 1 : les tests, qui échouent.** Un événement sans mode est accepté ; avec chacun des
  modes de la liste, accepté ; avec un mode inconnu, refusé ; avec une autre clé dans `resultat`,
  refusé ; le résultat d'un événement d'examen reste strict et sans mode. Côté serveur : un lot avec un mode est rangé, relu et exporté avec ce mode ; un lot sans
  mode se relit sans la clé.
- [ ] **Étape 2 : le code, puis les tests verts.** Le client ne change pas : il n'envoie pas de
  mode.
- [ ] **Étape 3 : l'ADR-0013.** Contexte (l'ADR-0007 fixe ce que le journal collecte ; un taux de
  réussite qui mêle un jugement de soi et une saisie stricte ne permet ni d'ajuster FSRS ni de
  suivre), options (rien ; le mode ; la réponse donnée et la durée), décision (le mode, rien
  d'autre), conséquences (la notice change et les personnes sont prévenues ; deux versions),
  révision. Le statut de l'ADR-0007 y renvoie, sans réécrire son texte.
- [ ] **Étape 4 : la mutation de `src/domaine/journal/`, 90 % au moins ; puis `test`, `lint`,
  `types`, `duplication`, le commit et la PR.**

### Tâche 2 : le manifeste porte les paramètres, l'examen et les chapitres (PR 2, version N)

**Fichiers :**
- Créer : `src/domaine/progression/reglages.ts`, `src/domaine/progression/reglages.test.ts`
- Modifier : `src/domaine/contenu/schemas.ts`, `analyse.ts`, `modele.ts`, et leurs tests
- Modifier : `src/domaine/cours/servi.ts`, `src/serveur/contenus/reference.ts`, et leurs tests
- Modifier : `docs/format-des-contenus.md`, `stryker.config.json`, `CLAUDE.md` (la liste de
  `corepack pnpm mutation`)

**Interfaces :**
- Produit, dans `modele.ts` : `ReglagesMemoire` devient
  `{ algorithme: 'leitner' | 'fsrs' | 'par-chapitre'; retention: number; parametres?: number[]; examen?: string; chapitres?: string[] }`.
- Produit, dans `reglages.ts` : `lireReglagesDeMemoire(lu: unknown): ReglagesMemoire | undefined`,
  la lecture sans rigueur que fait le client, sortie de `servi.ts` pour être mutée seule ;
  `memoireDuCours` l'appelle. Elle rend `undefined` pour une valeur d'`algorithme` inconnue, une
  rétention hors bornes, des poids invalides, `par-chapitre` sans `chapitres`.
- Les règles de l'analyse (le serveur, strict) : `parametres` a 21 nombres, valides pour FSRS-6 ;
  `examen` est une date ; `chapitres` n'est admis qu'avec `par-chapitre`, y est obligatoire et non
  vide, et chaque identifiant est celui d'un module de cartes du cours ; `parametres` et `examen`
  ne sont admis qu'avec `fsrs` ou `par-chapitre`.

- [ ] **Étape 1 : les tests de l'analyse, qui échouent** : chaque règle, son cas juste et son cas
  refusé (Point de revue 2), le message nommant le fichier et la clé. Les poids invalides refusent
  sans exception.
- [ ] **Étape 2 : le code de l'analyse, du modèle et du schéma, puis les tests verts.**
- [ ] **Étape 3 : les tests de la forme servie, de `lireReglagesDeMemoire` et de l'instantané de
  référence, qui échouent** : les trois clés traversent, de l'analyse à ce que lit le client ; un
  cours sans elles se sert comme avant, à l'octet près.
- [ ] **Étape 4 : le code, puis les tests verts.**
- [ ] **Étape 5 : `docs/format-des-contenus.md`** décrit les trois clés, leurs règles, le repli
  d'un appareil de la version précédente (M3-P3), et rappelle qu'un cours monté ne les reçoit
  qu'une version après celle qui les connaît.
- [ ] **Étape 6 : la mutation de `reglages.ts`, 90 % au moins ; puis `test`, `lint`, `types`,
  `duplication`, le commit et la PR.**

### Tâche 3 : l'ordonnanceur applique les paramètres, le plafond et les chapitres (PR 3, version N)

**Fichiers :**
- Modifier : `src/domaine/journal/temps.ts`, `src/domaine/progression/fsrs.ts`,
  `src/domaine/progression/ordonnanceur.ts`, et leurs tests
- Modifier : `src/client/cours/useProgression.ts`, `src/client/cours/contexte-cours.fixture.tsx`,
  et leurs tests
- Modifier : `exemple-contenu/kueche/cours.yaml` (le cours d'exemple passe en `par-chapitre`, son
  premier chapitre en FSRS, avec une date d'examen lointaine), et ce que ce passage déplace dans
  les tests et le bout en bout

**Interfaces :**
- Consomme : `ReglagesMemoire` (tâche 2).
- Produit :
  - `joursEntre(debut: string, fin: string): number`, dans `temps.ts`
  - `etatsFsrs(evenements, reglages: { retention: number; parametres?: readonly number[]; examen?: string })`
  - `ordonnanceurDe(reglages: { leitner; memoire?: ReglagesMemoire; chapitreDe?: (unite: string) => string | undefined }): Ordonnanceur`.
    Avec `par-chapitre`, une unité dont `chapitreDe` rend un chapitre de `memoire.chapitres` suit
    FSRS ; toute autre, Leitner. Sans `chapitreDe`, tout est en Leitner.
  - Dans `useProgression`, `chapitreDe` se tire des unités de cartes du cours préparé, les deux
    sens d'une carte rendant le même chapitre ; l'ordonnanceur reste mémorisé.

- [ ] **Étape 1 : les tests de `joursEntre` et du plafond, qui échouent.** 100 jours avant
  l'examen, un intervalle de FSRS de 80 jours devient 50 ; à 3 jours, 1 ; le jour de l'examen et
  après, l'intervalle de FSRS (Point de revue 4). Le plafond part du jour de la réponse : le même
  journal rejoué un autre jour rend le même état.
- [ ] **Étape 2 : le code, puis les tests verts.**
- [ ] **Étape 3 : les tests des paramètres, qui échouent** : des poids donnés changent les
  échéances par rapport aux poids par défaut ; sans eux, le test « le calcul est fixé » de
  `fsrs.test.ts` passe sans retouche.
- [ ] **Étape 4 : le code, puis les tests verts.**
- [ ] **Étape 5 : les tests du partage par chapitre, qui échouent.** Un journal qui mêle deux
  chapitres et un mot : le chapitre nommé a les états de FSRS, l'autre et le mot ceux de Leitner,
  chacun égal à ce que rend son algorithme seul sur ses unités. Le passage d'un chapitre avec un
  mois d'historique (M3-P9) : sur un journal inventé d'un mois, le nombre d'unités du chapitre
  dues le jour du passage en FSRS ne dépasse pas une fois et demie celui de Leitner (Point de
  revue 3). Si le test ne tient pas sur un journal honnête, la tâche s'arrête et le dit.
- [ ] **Étape 6 : le code du domaine et du client, puis les tests verts.** Le cours d'exemple
  passe en `par-chapitre` ; `corepack pnpm build`, `e2e` et `e2e:mise-a-jour` restent verts. Le
  texte de la PR déclare les deux précisions du plafond (M3-P5).
- [ ] **Étape 7 : la mutation de `fsrs.ts`, `ordonnanceur.ts` et `temps.ts`, 90 % au moins ; puis
  `test`, `lint`, `types`, `duplication`, le commit et la PR.**

### Tâche 4 : l'écran de mesure du rejeu (PR 4, version N)

**Fichiers :**
- Créer : `src/domaine/progression/journal-invente.ts` et son test
- Créer : `src/client/ecrans/Mesure.tsx` et son test
- Modifier : `src/client/routeur.ts` (le type `Route`, `route`), `src/client/App.tsx` (l'écran, sa
  clé de filet, sa `redirection` : ouvert sans connexion), et leurs tests ; `docs/exploitation.md`
  (comment mesurer)

**Interfaces :**
- Produit : `journalInvente(taille: number, unites: number, graine: number): Evenement[]`, des
  réponses datées sur 60 jours, d'identifiants inventés, par un hasard fixé ; l'écran `/mesure`
  (M3-P7), qui rejoue ce journal par Leitner, par FSRS et par chapitre, cinq fois chacun, et
  affiche la médiane en millisecondes pour 1 000, 10 000 et 30 000 réponses.

- [ ] **Étape 1 : les tests, qui échouent** : le journal inventé est le même pour la même graine,
  valide au sens de `schemaEvenement`, sans unité d'un cours réel ; l'écran ne mesure rien à
  l'ouverture, affiche ses durées au bouton, avertit avant les 30 000 réponses, n'appelle ni l'API
  ni le stockage de l'appareil, s'ouvre sans connexion et n'est lié depuis aucun écran.
- [ ] **Étape 2 : le code, puis les tests verts ; `corepack pnpm build`, puis `contenus:client` :
  aucun texte de cours dans le client construit.**
- [ ] **Étape 3 : `test`, `lint`, `types`, `duplication`, le commit et la PR.**

### Tâche 5 : l'outil qui ajuste les paramètres (PR 5, version N)

**Fichiers :**
- Créer : `src/outillage/memoire/lire-journaux.ts`, `ajuster.ts`, `cli-ajuster.ts`, et leurs tests
- Modifier : `package.json` (le script `memoire:ajuster`, la dépendance de développement),
  `pnpm-lock.yaml`, `docs/exploitation.md`, `CLAUDE.md` (« Commandes »)

**Interfaces :**
- Produit :
  - `lireJournaux(base: string, cours: string): { journaux: Evenement[][] }`, un journal par
    personne, sans identifiant ni nom, la base ouverte en lecture seule
  - `revuesDuJournal(evenements: readonly Evenement[]): { unite: string; jours: string[]; justes: boolean[] }[]`,
    dans `src/domaine/progression/fsrs.ts` : la suite des révisions de chaque unité telle que
    `etatsFsrs` la rejoue (chaque réponse, son jour qui ne recule pas), sortie du rejeu pour que
    l'outil et lui lisent la même (M3-P10). `etatsFsrs` l'appelle, et ses tests passent sans
    retouche.
  - `ecrireJournal(base: string, journaux: readonly Evenement[][]): void`, une aide de test
    (`*.fixture.ts`) qui range des journaux inventés dans une base temporaire migrée, une personne
    inventée par journal
  - `ajuster(journaux): { parametres: number[]; revues: number; avant: Qualite; apres: Qualite }`,
    où `Qualite` donne la perte logarithmique et l'écart entre réussite prédite et observée, par
    tranche de prédiction
  - `corepack pnpm memoire:ajuster --base <copie.sqlite> --cours <id>` : écrit sur la sortie le
    bloc YAML à coller dans le manifeste, puis la qualité avant et après. Codes : 0 ajusté ; 2 trop
    peu de révisions (moins de 1 000) ; 64 usage ; 1 base illisible.

- [ ] **Étape 1 : l'optimiseur, éprouvé avant tout code.** Installer
  `@open-spaced-repetition/binding` en dépendance de développement, lire son interface dans ses
  types, vérifier sa licence, qu'il se charge sous Windows et sous Linux (le poste et la CI), et
  qu'il accepte des révisions du même jour, à zéro jour d'écart (M3-P10). S'il ne se charge pas
  sur l'un des deux, s'il refuse ces révisions, ou s'il demande une clé de `pnpm` que le dépôt ne
  veut pas, la tâche s'arrête là et le dit : l'ajustement s'écrirait alors à la main, ce qui est une décision
  à reprendre avec Edouard.
- [ ] **Étape 2 : les tests de `lireJournaux` et de `revuesDe`, qui échouent**, sur une base
  temporaire migrée et un journal inventé (`journalInvente`, tâche 4) : deux personnes donnent deux
  journaux, sans rien qui les nomme ; la base n'est pas modifiée et aucun fichier ne paraît à côté
  d'elle, même dans un dossier en lecture seule (Point de revue 6) ; plusieurs réponses d'un même
  jour font autant de révisions, comme dans le rejeu (Point de revue 9) ; une base sans ce cours
  rend une liste vide.
- [ ] **Étape 3 : le code, puis les tests verts.**
- [ ] **Étape 4 : les tests d'`ajuster` et de la commande, qui échouent.** Un journal inventé tiré
  d'une mémoire simulée avec des poids connus, loin des poids par défaut : la perte après
  ajustement est plus basse qu'avant. Un journal de 200 révisions : code 2, et aucun paramètre
  écrit (Point de revue 5). Les 21 poids rendus passent l'analyse de la tâche 2. Avec deux
  personnes inventées dans la base, ni la sortie, ni les erreurs ne portent leur identifiant ou
  leur nom affiché (Point de revue 10).
- [ ] **Étape 5 : le code, puis les tests verts.** `docs/exploitation.md` dit comment obtenir une
  copie de la base (un instantané des sauvegardes, copié sur le poste par Edouard), où la poser
  (hors des dépôts), et quand l'effacer.
- [ ] **Étape 6 : l'image.** `corepack pnpm build` : `dist/serveur` n'importe rien de
  `src/outillage/memoire/`. L'étape de l'image qui n'installe que les dépendances de production ne
  tire pas l'optimiseur, et le job `image` de la CI se construit. Le garde-fou des données
  (`src/outillage/garde-fou-donnees.test.ts`) passe : les tests n'ouvrent qu'une base temporaire.
- [ ] **Étape 7 : `test`, `lint`, `types`, `duplication` (une préparation de base partagée par les
  tests passe par l'aide `ecrireJournal`, pas par une copie), le commit et la PR.**

### Tâche 6 : le rapport de suivi (PR 6, version N)

**Fichiers :**
- Créer : `src/outillage/memoire/mesures.ts`, `projection.ts`, `rapport.ts`, `cli-rapport.ts`, et
  leurs tests
- Modifier : `package.json` (le script `memoire:rapport`), `docs/exploitation.md`, `CLAUDE.md`

**Interfaces :**
- Consomme : `lireJournaux` et `ecrireJournal` (tâche 5), `posablesDuCours`
  (`src/domaine/seances/heute.ts`), `ordonnanceurDe` (tâche 3).
- Produit :
  - `mesures(journal, cours): Mesures` : les réponses et les découvertes par jour, la réussite
    selon le délai depuis la réponse d'avant et selon le mode, la part du cours vue et sûre, les
    dues du jour
  - `projeter(etat, cours, { jusquau: string; nouvellesParJour: number; algorithme; graine: number }): Projection` :
    la charge par jour jusqu'à la date, par un tirage au hasard fixé, d'après la réussite observée
    pour Leitner et la rétention visée pour FSRS
  - `corepack pnpm memoire:rapport --base <copie.sqlite> --cours <id> --contenu <dossier> --sortie <fichier.html> [--personne <identifiant> --accord <JJ/MM/AAAA>]` :
    un fichier HTML autonome. Codes : 0 ; 64 usage, dont `--personne` sans `--accord` ; 1 base ou
    contenu illisible. La sortie est refusée dans un dépôt git.

- [ ] **Étape 1 : les tests de `mesures` et de `projeter`, qui échouent**, sur un journal inventé
  dont les comptes sont connus à la main ; la même graine rend la même projection.
- [ ] **Étape 2 : le code, puis les tests verts.**
- [ ] **Étape 3 : les tests du rapport et de la commande, qui échouent.** Sans `--personne` : des
  chiffres d'ensemble, et rien qui distingue une personne. Une personne est active si elle a
  20 réponses au moins dans les 28 derniers jours du journal. Avec moins de trois personnes
  actives, le rapport d'ensemble le dit et s'arrête aux totaux du cours ; avec trois ou plus, une
  case d'un découpage (par jour, par délai, par mode) qui compte moins de 20 réponses est omise.
  Ni le rapport d'ensemble, ni les erreurs ne portent un identifiant ou un nom affiché (Point de
  revue 10). Avec
  `--personne` sans `--accord` : code 64 (Point de revue 7). Avec les deux : le rapport imprime la
  date de l'accord, que l'outil ne peut pas contrôler : c'est une déclaration du responsable, et
  le rapport le dit. Une sortie sous un dépôt git : refus. Le fichier ne charge rien du réseau.
- [ ] **Étape 4 : le code, puis les tests verts.** Le rapport reprend la forme de l'infographie du
  12/11/2026 : le chiffre de tête, la charge passée et projetée, la répartition par niveau, la
  réussite selon le délai et le mode, puis « comment lire ces chiffres ».
- [ ] **Étape 5 : `test`, `lint`, `types`, `duplication`, le commit et la PR.**

### Tâche 7 : la version N

- [ ] **Étape 1 : la CI de `main` est verte, et le staging sert sa tête.**
- [ ] **Étape 2 : 👤 Edouard ouvre `/mesure` au staging sur un téléphone Android**, et relève les
  neuf durées. Elles entrent dans le document du lot. Au-delà de 300 ms pour 10 000 réponses,
  le passage d'un cours monté attend une décision.
- [ ] **Étape 3 : 👤 l'étiquette `vX.Y.Z` de la version N**, qui revient à Edouard.
- [ ] **Étape 4 : la prod sert la version N** : la tâche 8 peut partir.

### Tâche 8 : le client envoie le mode, et la notice le dit (PR 7, version N+1)

**Fichiers :**
- Modifier : `src/client/cours/useProgression.ts`, `src/client/cours/contexte-cours.ts`,
  `src/client/cours/contexte-cours.fixture.tsx`, `src/client/cours/EcranCours.tsx`
- Modifier : les appelants d'`enregistrer` et leurs composants de question :
  `src/client/cours/onglets/Cartes.tsx`, `Quiz.tsx`, `Exercices.tsx`, `Mots.tsx`, `Schemas.tsx`,
  `Textes.tsx`, `Feuilles.tsx`, `Heute.tsx`, `Examen.tsx`, `src/client/cours/questions/*.tsx`,
  `src/client/cours/feuilles/*.tsx`, `src/domaine/seances/examen.ts`, et leurs tests
- Modifier : `src/domaine/notice-gabarit.ts`, son test, `exemple-contenu/notice.yaml`,
  `docs/exploitation.md`

**Interfaces :**
- Produit : `enregistrer(unite: string, juste: boolean, mode: ModeDeReponse): Promise<boolean>`,
  le mode obligatoire à l'appel : `corepack pnpm types` nomme tout appelant oublié.
  `enregistrerExamen` reçoit le mode de chaque réponse.

- [x] **Étape 1 : les tests, qui échouent**, un par geste de M3-P2 : la carte retournée, la saisie,
  la saisie déclarée juste, le choix, les tuiles, le point touché, l'appariement, la réponse
  montrée, le bilan d'un texte, et une réponse d'examen de chaque sorte. Chaque composant de
  question dit son mode à son appelant, dans le rappel qui porte déjà le verdict (M2-P7 : un seul
  rappel par geste). À l'examen, le mode se déduit de la question : `saisie` pour une réponse
  tapée, `choix` pour une proposition, question de fiche comprise ; l'événement d'examen lui-même
  n'en porte pas.
- [x] **Étape 2 : le code, puis les tests verts.**
- [x] **Étape 3 : la notice**, en français puis en allemand : le journal note aussi la manière de
  répondre ; les réponses servent à des statistiques d'ensemble pour régler l'application ; avec
  l'accord de la personne, le responsable suit sa progression. `NOTICE_VERSION` prend la date de
  la fusion. Les valeurs de l'exemple (`exemple-contenu/notice.yaml`) suivent. Le test du gabarit
  passe.
- [x] **Étape 4 : `corepack pnpm build`, `e2e`, `e2e:mise-a-jour`** : le client de la version
  d'avant, sans mode, continue d'envoyer ses réponses au serveur neuf. Un test de la
  synchronisation prouve l'autre sens (Point de revue 8) : face à un serveur qui refuse le mode,
  la file reste entière, rien n'est perdu, et elle repart dès que le serveur accepte.
  `docs/exploitation.md` dit le seuil du retour arrière (M3-P1, M3-P3).
- [ ] **Étape 5 : `test`, `lint`, `types`, `duplication`, le commit et la PR.** Le texte de la PR
  dit ce qui revient au dépôt de données, que cette session n'ouvre pas : régénérer `notice.json`
  (`contenus:reference`), et revoir dans le `notice.yaml` de l'instance la phrase sur qui voit la
  progression. Une session ouverte dans le dépôt de données, ou Edouard, fait cette PR.
- [ ] **Étape 6 : 👤 Edouard prévient les personnes** du changement de la notice, comme
  `docs/exploitation.md` le demande, avant l'étiquette de la version N+1.

### Tâche 9 : la revue finale et ses corrections (PR 8)

- [ ] **Étape 1 : la revue du lot entier**, sur la tête de `main`, par un agent du modèle le plus
  capable, qui reçoit la spec, ce plan et le diff depuis le commit d'avant la tâche 1. Elle cherche
  aussi, dans tout le dépôt, ce que le lot périme : « les poids de FSRS sont ceux par défaut »,
  « le journal ne garde que juste ou faux », la liste des algorithmes de `memoire`.
- [ ] **Étape 2 : chaque constat est classé**, sans le classer plus bas que ce qu'il coûte à une
  personne (registre, LE-14).
- [ ] **Étape 3 : les corrections, dans une PR, test d'abord.**
- [ ] **Étape 4 : la relecture des corrections**, par un agent qui ne les a pas écrites.

### Tâche 10 : la vérification sur Android

- [ ] **Étape 1 : le staging sert la tête de `main`.**
- [ ] **Étape 2 : 👤 Edouard répond, sur un téléphone Android au staging**, à une carte retournée,
  à une saisie, à un choix et à un exercice, puis télécharge ses données depuis « Compte » : le
  fichier porte le mode de ces réponses. Il lit la notice, dans les deux langues.
- [ ] **Étape 3 : ce que le staging ne montre pas.** Son cours reste en Leitner : `par-chapitre`,
  les paramètres et le plafond ne sont vérifiés qu'au poste, par les tests et le bout en bout sur
  le cours d'exemple. Ils se vérifieront sur un téléphone au passage du cours de l'instance, qui
  est une PR du dépôt de données. La PR de clôture le déclare.

### Tâche 11 : la clôture du lot (PR 9)

- [ ] **Étape 1 : `docs/conception/lot-m3.md`** garde les décisions M3-P1 à M3-P8, les arbitrages
  de l'exécution, les relevés (la mutation, le poids du client, les durées de `/mesure`) et les
  suites.
- [ ] **Étape 2 : « État » de `CLAUDE.md` dit le lot** ; le README est relu d'après
  `docs/modele/documentation.md` ; le registre reçoit les constats du lot ; les trois cases de
  l'issue 11 de ce dépôt sont cochées.
- [ ] **Étape 3 : ce plan est supprimé**, et plus aucun texte du dépôt n'y renvoie.
- [ ] **Étape 4 : la PR de clôture** ferme l'issue, déclare les écarts à la spec et nomme la tête
  relue.
- [ ] **Étape 5 : 👤 l'étiquette `vX.Y.Z` de la version N+1**, qui revient à Edouard.

## Ce que le lot laisse

- **Le passage du cours de l'instance** : des PR du dépôt de données, au plus tôt une version après
  la version N. D'abord l'ajustement sur une copie de la base, puis un seul chapitre en
  `par-chapitre`, avec la date de l'examen ; trois semaines de rapports ; puis les autres.
- **L'accord de l'apprenante** pour le rapport de sa progression : Edouard le lui demande. Sans
  lui, seuls les chiffres d'ensemble se produisent.
- **Des paramètres par personne**, un tableau de bord en ligne, les éléments qui ne rentrent pas
  et le retour espacé après une faute : hors du lot.

## Exécution

Par sous-agents, une tâche à la fois : un exécutant de niveau moyen pour les tâches 1 à 6 et 8, une
revue de tâche par un agent qui n'a pas écrit le code, le modèle le plus capable pour la revue
finale. La session pilote fusionne chaque PR une fois ses contrôles verts. Les tâches 7 et 10
attendent Edouard.
