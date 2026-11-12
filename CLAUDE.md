@docs/modele/methode.md

# ancrage

Application d'apprentissage **mobile d'abord** : des cours, des droits par cours, et une progression
par personne. Elle est auto-hébergée sur l'hôte de l'instance et publiée sur
`https://ancrage.<domaine>`. Le dépôt est public, tous droits réservés : il porte le code. Ce qui
fait d'une installation celle d'une personne (le cours, les valeurs, l'hôte) est dans un dépôt de
données privé, `ancrage-donnees`.

Premier cours : une terminologie médicale, pour une apprenante dont la classe et l'école sont propres à
l'instance (`CLAUDE.md` du dépôt de données). Son interface est en allemand. Le travail sur le projet se
fait en français.

## État

Ce dépôt est né de la scission d'`ancrage-donnees` (lot S3, ancrage-donnees#186) : un seul commit,
d'après le modèle `modele-projet` en v0.8.1, de nature `code`. La scission est en cours jusqu'à la mise
en prod depuis ce dépôt. Les paragraphes qui suivent racontent les lots d'avant, tels qu'ils se sont
passés dans le dépôt d'origine : leurs renvois `ancrage-donnees#NNN` désignent les issues, qui y restent,
et leurs chemins `instance/…` sont ceux d'alors.

La phase 0 (cadrage) est terminée : le cadrage, propre à l'instance (`instance/docs/cadrage.md` d'alors,
`docs/cadrage.md` du dépôt de données), est un document figé. Le lot 1a est en
ligne depuis le 16/10/2026. C'est le squelette livré de bout en bout : serveur, base, image, CI,
déploiement et sauvegardes.
- La prod suit la plus haute étiquette `vX.Y.Z` sur `https://ancrage.<domaine>` ; la version en ligne se lit sur `/api/sante`.
- Le staging suit `main` sur `https://ancrage-staging.<domaine>`.

Le lot 1b est fait. Le contenu du premier cours est dans `contenu/terminologie/` du dépôt de données
(`instance/contenu/terminologie/` avant S3) depuis le lot S1 ; le serveur le valide au démarrage et la CI le contrôle.

Le lot 1c a livré la connexion et les droits :
- connexion par passkey, sur invitation ;
- groupes et droits par cours ;
- une administration minimale, en français.

Le compte propriétaire se crée par une commande sur le serveur (voir « Exploitation »).

Le lot 1d a livré l'application du prototype :
- les 9 onglets du cours, en Preact, dans la langue du cours ;
- la progression, en journal synchronisé depuis le téléphone (ADR-0004) ;
- l'installation et le hors-ligne : service worker, contenu dans IndexedDB (ADR-0008).

Ses décisions et ses arbitrages numérotés, auxquels le code renvoie (« décision N », « R<n> »,
« H:<ligne> »), sont dans `docs/conception/lot-1d.md`.

Le lot 1e a livré les droits des personnes et l'ouverture à l'apprenante :
- l'export, le changement du nom affiché et la suppression du compte, par la personne ou par le
  propriétaire ;
- le registre des suppressions, rejoué à chaque restauration (`rejouer-suppressions`) ;
- la notice de confidentialité, en allemand et en français (`/confidentialite`) ;
- la purge, et des journaux sans donnée personnelle (ADR-0009).

Ses décisions et ses arbitrages (« 1e-D<n> », « 1e-R<n> ») sont dans `docs/conception/lot-1e.md`.

Le lot 1f a soldé les suites du lot 1e (ancrage-donnees#65), sans rien changer pour l'apprenante :
- l'additivité des migrations, dérivée de la base d'avant (`verifierAdditivite`), et le démarrage
  du serveur testable (`demarrerServeur`) ;
- une porte de duplication en CI (`duplication`), et la mutation étendue à l'export, à la purge et
  à la suppression ;
- un magasin de limitation de débit qui oublie l'adresse à la fin de sa fenêtre, et de petites
  corrections de l'administration, du filet et des textes.

Ses décisions et ses arbitrages (« 1f-D<n> », « 1f-R<n> ») sont dans `docs/conception/lot-1f.md`.

Le lot 1g a clos l'étape 1 (ancrage-donnees#76), sans changer l'application.
- Dependabot surveille aussi npm, chaque lundi.
- Les suites des lots 1b à 1e sont triées, et le cadrage de ancrage-donnees#76 garde le tri.

L'étape suivante est la 2, la classe (milestone « Étape 2 — La classe ») :
- l'accord de l'enseignante est donné, à l'oral, le 19/10/2026 (ancrage-donnees#7). Reste l'ouverture (ancrage-donnees#9) ;
- le cours s'ouvre à la classe sans relecture préalable, par décision d'Edouard du 02/11/2026 : la
  dérogation de diffusion est écrite dans `contenu/terminologie/cours.yaml` du dépôt de données (invariant 9).
  Les relectures de l'enseignante (ancrage-donnees#8) et de l'allemand (ancrage-donnees#80) ne précèdent plus l'ouverture : les
  corrections suivront les remontées ;
- la mise à jour de la notice pour la classe (ancrage-donnees#85) est faite par le lot 2d ; le lot 2c a soldé
  ancrage-donnees#79. Restent, avant l'ouverture, la `v0.9.0` et les gestes de ancrage-donnees#9.

Le lot F1 a livré les « Arbeitsblätter », les fiches d'exercices de chaque Unit (ancrage-donnees#90, milestone
« Les fiches de la semaine ») :
- un type de module `feuille`, en sept genres de tâche, et l'onglet « Arbeitsblätter » ;
- l'appariement et le classement par glisser-déposer au doigt ;
- la Unit 1 en feuille, et des questions de fiche dans le Quiz et la Prüfung ;
- deux points de ancrage-donnees#79 : le contenu servi en liste blanche, et la garde de `resoudreModule` ;
- la compétence `/feuille`, pour transcrire la fiche de chaque semaine.

Ses décisions et ses arbitrages (« F1-D<n> », « F1-R<n> ») sont dans `docs/conception/lot-f1.md`.

Le lot F3 a livré la vue « Ergebnis » d'une fiche (ancrage-donnees#175) :
- sur toute fiche entamée ou faite, un bouton ouvre une vue en lecture seule. Elle montre, dans
  l'ordre du papier, chaque élément, sa « Lösung », et le verdict de sa dernière réponse avec sa
  date (`src/client/cours/feuilles/ErgebnisDeFeuille.tsx`) ;
- elle se dérive du journal du téléphone (`dernieresReponsesDatees` et `resultatsDeFeuille`, dans
  `src/domaine/feuilles/deroulement.ts`). Rien de nouveau n'est gardé, et la vue n'est jamais une
  séance ;
- le job de mutation se fait en deux groupes parallèles, `domaine` et `serveur` (ancrage-donnees#156).

Ses décisions et ses arbitrages (« F3-D<n> », « F3-R<n> ») sont dans `docs/conception/lot-f3.md`.
La milestone continue : la fiche à venir, faite avant sa correction (F4, ancrage-donnees#176), le quiz calibré
(F2, ancrage-donnees#91), le bouton « signaler » (ancrage-donnees#92), les Units 7 à 22 (ancrage-donnees#93).

Le lot 2a a livré la dernière version sans vider le cache (ancrage-donnees#115) :
- l'application passe d'elle-même à une nouvelle version, au lancement, au retour ou à une
  navigation, jamais en pleine séance (`src/client/mise-a-jour.ts`) ;
- le service worker prend la main sur demande, ce qui remplace la décision 16 du lot 1d ;
- le pied de page dit la révision du téléphone quand elle diffère de celle du serveur ;
- la preuve, `corepack pnpm e2e:mise-a-jour`, tourne en CI.

Ses décisions et ses arbitrages (« 2a-D<n> », « 2a-R<n> ») sont dans `docs/conception/lot-2a.md`.

Le lot 2b a soldé ancrage-donnees#81, « Au prochain passage » (ancrage-donnees#122). Pour l'apprenante, seule la mise à jour change.
Le lot a livré :
- une PR de documentation pure ne construit plus l'image et ne lance plus le bout en bout
  (`src/outillage/documentation-seule.ts`) ;
- la note des envois fait repartir les réponses qu'une restauration aurait perdues (R17) ;
- le rechargement attend les envois, et un compte occupé ou une fiche entamée retiennent la
  version ;
- `analyse.ts`, `depot.ts`, `Admin.tsx`, `Examen.tsx` et `synchro.test.ts` sont découpés ;
- un dessin n'admet plus qu'une liste blanche d'éléments SVG, et rien qui charge hors du dessin
  (`src/domaine/contenu/dessin.ts`).

Ses décisions et ses arbitrages (« 2b-D<n> », « 2b-R<n> ») sont dans `docs/conception/lot-2b.md`.

Le lot 2c a soldé ancrage-donnees#79 avant l'ouverture à la classe. Rien ne change pour l'apprenante. Le lot a livré :
- `src/serveur/acces/index.ts`, la moitié serveur du module `acces`, est muté (ADR-0001). Stryker
  reste en 10.0.x : Dependabot écarte les 10.1, deux à trois fois plus lentes ;
- `contenus:client` décode les échappements JavaScript du client construit
  (`desechapperJs`, `src/serveur/contenus/client.ts`) avant d'y chercher les textes de cours, et
  cherche toujours les octets bruts.

Ses décisions et ses arbitrages (« 2c-D<n> », « 2c-R<n> ») sont dans `docs/conception/lot-2c.md`.

Le lot 2d a fait la seule mise à jour de la notice avant l'ouverture à la classe (ancrage-donnees#85). Après la
suppression d'un compte, ses autres appareils se vident :
- sans session, le module `acces` répond `401 {"erreur":"compte_supprime"}` quand l'en-tête
  `x-ancrage-personne` nomme un compte du registre des suppressions (100 jours). Une session valide
  l'emporte toujours ;
- le client garde le code `non_connecte` et y ajoute un drapeau, `ErreurApi.compteSupprime`. À
  l'expiration de la session, l'application demande si le compte est supprimé
  (`verifierLaSuppression`, `src/client/session-locale.ts`). Si oui, elle vide l'appareil et
  recharge la page sur la connexion, qui le dit ;
- la notice le dit, en français et en allemand, avec `NOTICE_VERSION` au 03/11/2026. La phrase sur
  l'adresse IP suit le magasin de 1f-D9.

Ses décisions et ses arbitrages (« 2d-D<n> », « 2d-R<n> ») sont dans `docs/conception/lot-2d.md`.

Le lot S1 a sorti le cours de l'image (ancrage-donnees#184, milestone « La scission »). C'est le premier des trois
lots de la scission ; rien n'y change pour l'apprenante :
- le cours vit dans `instance/contenu/` et ses instantanés dans `instance/references/` (depuis S3,
  `contenu/` et `references/` du dépôt de données). La chaîne du modèle le monte sur `/contenu`, après `VERIFIER_CONTENU` (`verifier-contenu`), et l'image
  n'embarque plus qu'un cours d'exemple écrit à la main, `exemple-contenu/kueche/` (ADR-0011) ;
- hors de la prod, sans contenu monté, le serveur sert l'exemple et le dit ; la prod refuse de
  démarrer ;
- la notice garde son texte dans le code (`src/domaine/notice-gabarit.ts`) ; ses valeurs d'instance
  sont dans `notice.yaml`, servies par `GET /api/notice` et gardées sur le téléphone ;
- les tests passent sur l'exemple, sans nom réel, et un garde-fou tient les chemins de données
  (`src/outillage/garde-fou-donnees.test.ts`). L'instantané de référence porte la diffusion du
  cours : son état « à vérifier », sa dérogation et les statuts par module.

Ses décisions et ses arbitrages (« S1-D<n> », « S1-R<n> ») sont dans `docs/conception/lot-s1.md`.

Le lot S2 a rendu publiable l'arbre qui entrera au dépôt public (ancrage-donnees#185). C'est le
deuxième lot de la scission, et rien n'y change pour l'apprenante :
- ce qui nomme l'instance était sous `instance/` : la part de `CLAUDE.md` propre à l'instance, le
  brief, le cadrage et les valeurs du runbook ;
- `scripts/naissance/inclure.txt` disait ce qui entre dans l'arbre, et `naissance:verifier` le
  construisait depuis `HEAD`, puis le passait à la porte en régime code. Ils ont servi à la
  naissance de ce dépôt, et n'y sont pas ;
- les docs de l'arbre disent des rôles (S2-D6), et leurs renvois s'écrivent `ancrage-donnees#NNN`
  ou `modele-projet#NNN` (S2-D8) ;
- le job `arbre-publiable` de `ci.yml` refusait, à chaque PR, un nom, un renvoi nu ou un texte du
  cours dans l'arbre (S2-R9). Il est parti avec la naissance : au public, la porte du socle, en
  régime code, prend le relais, et la recherche du cours revient au hook `scripts/cours-absent.ts` et
  à la CI du dépôt de données (S3-D5, S3-D6).

Ses décisions et ses arbitrages (« S2-D<n> », « S2-R<n> ») sont dans `docs/conception/lot-s2.md`,
avec ce qui restait pour S3 (ancrage-donnees#186), la scission.

Le lot S3 a séparé le code et les données (ancrage-donnees#186). C'est le troisième lot de la
scission, et rien n'y change pour l'apprenante :
- ce dépôt, public, naît d'un seul commit, d'après le modèle en v0.8.1, de nature `code`, en mode
  `fusion: session`. Il porte le code, le cours d'exemple, `deploiement/` et les docs en rôles. Il n'a
  ni cours réel, ni nom d'instance, ni secret chiffré, ni licence d'usage : tous droits réservés (S3-D2), ce que dit `LICENSE` depuis la mise à jour du
  modèle en v0.10.0 ;
- le dépôt de données, `ancrage-donnees`, reste privé, de nature `donnees`. Il garde l'historique, les
  issues, le cours (`contenu/`), ses instantanés (`references/`), la part de l'instance de
  `CLAUDE.md`, le brief, le cadrage, `/feuille`, les secrets chiffrés et l'env de chaque
  environnement ;
- la chaîne passe à deux dépôts : la prod suit la plus haute étiquette `vX.Y.Z` d'ici et la plus haute
  `donnees-AAAA.MM.JJ.n` des données (« Exploitation ») ;
- la CLI de contenu lit `exemple-contenu` par défaut, et `reference` exige `--references` (S3-D4) ;
- la recherche du cours dans le code est un hook de `.claude/settings.json`, `scripts/cours-absent.ts`,
  et la CI du dépôt de données (S3-D5, S3-D6).

Le lot M1 a donné à chaque cours son ordonnanceur de révisions (ancrage#5, milestone « Le parcours et
la mémoire »). Rien ne change pour l'apprenante, dont le cours reste en Leitner :
- `ordonnanceurDe` (`src/domaine/progression/ordonnanceur.ts`) choisit Leitner ou FSRS d'après la clé
  facultative `memoire` du manifeste, et le client l'appelle. Sans la clé, c'est Leitner ;
- FSRS-6 rejoue le journal par `ts-fsrs`, sans hasard et en note binaire
  (`src/domaine/progression/fsrs.ts`, ADR-0012). Les six « Fächer » se dérivent de la stabilité ;
- le cours d'exemple est en `par-chapitre` : son premier module de cartes suit FSRS, avec un examen
  lointain et inventé, et le reste suit Leitner (M3). Un cours monté ne reçoit `memoire` qu'une
  version après celle qui connaît la clé (invariant 8, `docs/format-des-contenus.md`).

Ses décisions et ses arbitrages (« M1-D<n> », « M1-R<n> ») sont dans `docs/conception/lot-m1.md`.

Le lot M2 a donné au cours sa séance du jour, « Heute » (ancrage#14) :
- « Heute » est le premier onglet, à `/cours/<id>/heute`, et l'écran sur lequel l'accueil et le
  compte ouvrent le cours (`src/client/cours/onglets/Heute.tsx`). L'adresse nue du cours reste
  l'aperçu ;
- la séance mêle, en 20 éléments au plus, tout ce qui est dû aujourd'hui d'après `ordonnanceurDe`
  (cartes, mots, points de schéma, exercices, questions fermées de fiche), les plus en retard
  d'abord, puis des cartes neuves (`src/domaine/seances/heute.ts`). Une faute revient une fois ;
- les cartes neuves viennent du chapitre choisi dans Karteikarten, et `nouvelles_par_seance` y est
  un plafond par jour ;
- la question de chaque onglet est un composant commun (`src/client/cours/questions/`), que l'onglet
  et « Heute » posent tous deux. Ni l'API, ni le manifeste, ni le journal n'ont changé.

Ses décisions et ses arbitrages (« M2-P<n> », « M2-R<n> ») sont dans `docs/conception/lot-m2.md`.
Le lot suivant de la milestone est FSRS pour un cours réel, ajusté et suivi (ancrage#21).

Les suites sans urgence d'un lot vont dans une issue « Au prochain passage »
(ancrage-donnees#81 est fermée ; celle des lots 2c, 2d, F3, S1 et S2 est ancrage-donnees#156 ; celle
des lots M1 et M2 est ancrage#11). Une
PR qui touche un fichier de cette liste regarde sa case, et la coche si elle la règle.

Le déploiement est aligné sur la cible `serveur` de `modele-projet` (l'alignement date du lot 2 du
modèle, en v0.3.0 ; mis à jour en v0.10.0 le 12/11/2026) : `deploiement/` et `tests/deploiement/`
sont gérés par le modèle (voir « Exploitation »). Ce dépôt est de nature `code` (M-0006) : la porte
de confidentialité y refuse tout constat, au hook comme en CI. L'ancien dépôt, devenu le dépôt de
données, est de nature `donnees` (il reste le dépôt de données), et la scission s'est faite en trois lots (S1, S2, S3). La migration du tunnel s'est faite en trois versions (N, N+1, N+2),
jusqu'à la v0.7.2 du 27/10/2026 : `docs/exploitation.md`, « Le tunnel commun ». Les deux anciens
tunnels sont supprimés dans Cloudflare depuis le même jour.

La suite est dans les issues GitHub.

## Commandes

Sur le poste, `pnpm` s'appelle par `corepack pnpm …` ; en CI, `corepack enable` suffit.

- `corepack pnpm test` : tests unitaires et d'intégration (vitest).
- `corepack pnpm test:deploiement [fichier.bats]` : tests bats des scripts de déploiement, dans une
  image Docker de test (Docker est requis). C'est `sh tests/deploiement/lancer.sh`, le banc du
  modèle, que l'on peut aussi lancer tel quel dans Git Bash ; la CI lance la même commande.
- `corepack pnpm lint` : Biome.
- `corepack pnpm duplication` : jscpd sur `src/`, `e2e/` et `scripts/`, tests compris (réglages dans
  `.jscpd.json`). Il refuse toute copie de 10 lignes ou plus (et d'au moins 50 jetons, le seuil par
  défaut de jscpd). Les déclarations `import` ne comptent pas : deux fichiers voisins peuvent avoir
  les mêmes. Une autre copie voulue se marque `// jscpd:ignore-start — <raison>` …
  `// jscpd:ignore-end` ; sinon, on la retire (fixture ou aide partagée).
- `node scripts/cours-absent.ts [--donnees <dossier>] [--commit <réf>]` : cherche les textes du cours
  de `<donnees>/contenu` (par défaut `ANCRAGE_DONNEES`, sinon `ancrage-donnees` à côté du clone principal,
  même depuis un worktree) dans les fichiers
  suivis de `<réf>` (`HEAD` par défaut), sauf ceux de `<donnees>/textes-toleres.txt`. Codes : 0 aucun
  texte ; 1 la recherche n'a pas pu tourner ; 2 un texte du cours ; 64 usage. Avec `--hook`, il lit
  l'entrée JSON de `PreToolUse` et n'agit que sur un `git push` (S3-D6).
- `corepack pnpm types` : TypeScript, client, service worker et serveur.
- `corepack pnpm dev:serveur` : serveur en rechargement automatique.
- `corepack pnpm dev:client` : client Vite.
- `corepack pnpm build` : client, serveur et migrations dans `dist/`.
- `corepack pnpm start` : sert `dist/` (après `build`).
- `dev:serveur` et `start` servent le cours d'exemple (`exemple-contenu/`), et le disent au
  démarrage, sauf si `ANCRAGE_CONTENUS` désigne un autre dossier, par exemple
  `ANCRAGE_CONTENUS=../ancrage-donnees/contenu` : le vrai cours n'est servi que s'il est désigné
  (S1-D3).
- `corepack pnpm e2e` : tests de bout en bout Playwright (Pixel 7), sur le serveur construit (après
  `build`) ou sur `E2E_URL`. Le lien du propriétaire, pour le parcours de compte, est créé par
  `cli.js` (`e2e/amorcage.ts`) ; avec `E2E_URL`, il est lu dans `E2E_LIEN_PROPRIETAIRE`.
- `corepack pnpm e2e:mise-a-jour` : le test des deux versions (2a-D8), après `build`. Il construit
  deux clients (`dist-e2e/a` et `dist-e2e/b`), puis les sert l'un après l'autre avec le serveur
  construit sur `http://localhost:3100`, hors séance et en séance. `pnpm e2e` ne le lance pas.
  La suite porte aussi le parcours de la séance du jour (`e2e/mise-a-jour/seance-du-jour.spec.ts`,
  lot M2), qui a besoin d'un compte neuf sur une base à lui : la suite principale n'a qu'un lien
  de propriétaire, que le parcours de compte consomme.
- `corepack pnpm mutation` : tests de mutation (Stryker) de `src/domaine/acces.ts`, de
  `src/domaine/journal/*.ts` (tests exclus), de `src/domaine/progression/etat.ts`, `fsrs.ts`, `ordonnanceur.ts` et `reglages.ts`, de
  `src/domaine/feuilles/deroulement.ts` et `correction.ts`, de `src/domaine/seances/feuilles.ts` et `heute.ts`, de
  `src/domaine/notice.ts` et, côté serveur, de `src/serveur/acces/index.ts` (la moitié serveur du
  module `acces`, ADR-0001), de `src/serveur/comptes/export.ts`, `purge.ts` et `suppression.ts`.
  Échoue sous un score de 90 % ; rapport dans `reports/mutation/`. Les tests de ces fichiers n'ont
  pas de `describe` (Stryker ne retrouve pas un test placé dans une suite). En CI, la passe se fait
  en deux groupes parallèles, `domaine` et `serveur`, tirés de la même liste (`mutation.yml`), et
  chacun échoue sous 90 %. Un seul groupe, au poste :
  `corepack pnpm mutation --mutate "$(node scripts/mutation-groupe.mjs domaine)"`.
- `corepack pnpm base:generer` : génère une migration Drizzle.
- La CLI de contenu (`corepack pnpm contenus:…`) lit `exemple-contenu/` par défaut ; toute commande
  accepte `--contenu <dossier>`. Celle du vrai cours se lance depuis le clone du code, avec le dépôt
  de données à côté (S3-D4), par exemple
  `corepack pnpm contenus:verifier --contenu ../ancrage-donnees/contenu --base origin/main` (`../ancrage-donnees` est le clone
  principal des données ; pour une PR de contenu en worktree, `<clone ou worktree des
  données>/contenu`), où la base
  se lit dans le dépôt du contenu. Depuis le clone des données : `cd ../ancrage && corepack pnpm …`
  (`--dir` est refusé par corepack).
- `corepack pnpm contenus:verifier [--base <réf>]` : contrôle tout le dossier de contenu ; avec
  `--base`, compare aussi `ids.lock` à celui de `<réf>`, lu dans le dépôt du contenu (c'est ce que
  fait la CI du dépôt de données).
- `corepack pnpm contenus:id [n]` : tire `n` identifiants neufs (un par défaut).
- `corepack pnpm contenus:verrouiller` : ajoute à `ids.lock` les identifiants du contenu qui n'y
  sont pas.
- `corepack pnpm contenus:a-verifier [dossier]` : écrit la liste imprimable des éléments « à
  vérifier » de chaque cours, en HTML et en PDF (Chromium de Playwright), dans `dossier`
  (`dist/a-verifier` par défaut). Elle est en allemand, pour la relecture sur papier : les cartes et
  la morphologie en tableau, les autres éléments en cadres.
- `corepack pnpm contenus:reference --references <dossier>` : régénère l'instantané
  `<cours>.reference.json` de chaque cours, et celui de la notice composée, `notice.json`, dans
  `<dossier>`. `--references` est obligatoire, sans défaut : sans lui, code 64. Au dépôt de données, ce
  dossier est `references/`. Avec `--verifier`, il compare sans écrire.
- `corepack pnpm contenus:client [dossier] [--exclure <nom>]… [--toleres <fichier>]` : cherche des
  textes de cours, bruts et sous leurs échappements JavaScript, avec les blancs ramenés à une espace
  et sans la ponctuation finale, dans le client construit `dist/client` (après `build`) par
  défaut, service worker compris, où il ne doit y en avoir aucun (invariant 3). Il y cherche aussi
  les valeurs de la notice (`notice.yaml` du contenu), qui ne sortent que par
  `GET /api/notice`. La CI de ce dépôt le lance sur l'exemple. Celle du dépôt de données le lance avec
  le cours de l'instance, sur le client construit et sur le `/app` de l'image `:main`, hors de
  `node_modules` (S1-D12, S3-D5).
- `node dist/serveur/cli.js verifier-contenu <dossier> [<en service>]`, dans l'image : charge un
  dossier de contenu comme le démarrage, et compare son `ids.lock` à celui de `<en service>` s'il en
  a un ; 0 conforme, 2 non conforme, 64 usage. C'est `VERIFIER_CONTENU` de `deploiement/projet.env`.
- `node scripts/icones.mjs` : régénère les icônes PNG de l'application installée à partir de
  `src/client/public/icone.svg`, avec le Chromium de Playwright. Les PNG sont versionnés.

## Ce qui fait foi

- **Le comportement** : le code et les tests. Un document qui contredit le code est un bug, à
  corriger dans la même PR.
- **Les décisions difficiles à défaire** : `docs/decisions/` (ADR). Un ADR ne se réécrit pas ; un
  nouvel ADR le remplace.
- **Les décisions d'un lot**, auxquelles le code renvoie : `docs/conception/lot-<n>.md`, écrit à
  la clôture, quand le plan disparaît.
- **La feuille de route** : les issues GitHub, avec une milestone par étape. Celles d'avant la
  scission restent au dépôt de données, et une PR de ce dépôt les cite en
  `EdouardZemb/ancrage-donnees#NNN` (spec § 6.7). Les nouvelles issues de code s'ouvrent ici. Les
  pistes non engagées sont dans `docs/pistes.md`.
- **L'exploitation** : `docs/exploitation.md` ; pour le serveur et ses fichiers hors dépôt,
  `NOTICE.md` et `REGISTRE.md` du dépôt `serveur`. Les valeurs de l'instance sont dans le dépôt de
  données.
- **Le contenu des cours** : `contenu/` du dépôt de données, le contenu de l'instance, et
  `exemple-contenu/`, le cours d'exemple que porte ce dépôt (ADR-0011). Leur format est décrit dans `docs/format-des-contenus.md` ; si ce
  document et le code de `src/domaine/contenu/` divergent, le code fait foi.

## Invariants — ne jamais violer

1. Une personne ne reçoit **aucune** information sur un cours où elle n'a pas de droit : ni dans
   la liste, ni contenu, ni statistique, ni export, pas même son existence. (ADR-0001)
2. Le contrôle des droits se fait côté serveur, à chaque requête, dans le seul module `acces`.
   (ADR-0001)
3. Le contenu d'un cours ne sort que par l'API, après contrôle. Jamais comme fichier statique,
   jamais dans le code envoyé au navigateur. Le contenu de l'instance n'entre jamais dans l'image.
   (ADR-0001, ADR-0011)
4. Un identifiant de contenu n'est jamais tiré du texte, jamais modifié, jamais réutilisé ;
   `contenu/ids.lock`, du dépôt de données, le garantit. (ADR-0003)
5. La progression est un journal auquel on ne fait qu'ajouter. Tout état (boîtes, échéances,
   séries) en est dérivé. (ADR-0004) Deux exceptions, voulues : la suppression d'un compte efface
   son journal, et une déconnexion bloquée peut abandonner les réponses pas encore envoyées, après
   confirmation (lot 1e, 1e-D4 et 1e-D11).
6. Une personne est identifiée par un identifiant opaque. Aucune donnée personnelle ne sert de
   clé, et l'e-mail n'est pas collecté. (ADR-0002, ADR-0007)
7. Aucune donnée personnelle réelle dans le dépôt, les tests ou le staging : uniquement des
   données factices écrites à la main. (ADR-0010 de creche-planner, §3)
8. Une migration de base laisse fonctionner l'image précédente : on ajoute avant d'enlever. Il en va
   de même de `deploiement/compose.yml`, de `deploiement/compose.projet.yml` et de `env/*.env` du
   dépôt de données, que le retour arrière utilise avec l'image précédente : une variable nouvelle
   ne devient obligatoire (`${…:?}`) qu'une version plus tard. (ADR-0006, invariant 4 de
   `docs/modele/methode.md`)

   Il en va de même de l'API, que l'application précachée de la version précédente appelle encore.
   Une route ou un champ de réponse ne s'enlève qu'une version plus tard. Un en-tête ne devient
   obligatoire sur une route existante qu'une version plus tard. D'ici là, un contrôle nouveau ne
   joue que si l'en-tête est présent. (ADR-0008)
9. Un cours qui contient des éléments « à vérifier » n'est pas ouvert à un groupe sans dérogation
   écrite dans son manifeste. La règle joue à chaque contrôle : un droit de groupe déjà donné est
   suspendu tant que le cours en contient sans dérogation. (ADR-0001, ADR-0003)

## Contenus

Les règles du format sont dans `docs/format-des-contenus.md`.

- **Où vit le contenu** (ADR-0011) :
  - le vrai cours est au dépôt de données, dans `contenu/`, ses instantanés de référence dans
    `references/`. Il n'entre jamais dans l'image : la chaîne de déploiement monte
    l'instantané du commit de données (la tête de la branche des données en staging, la plus haute
    étiquette `donnees-…` en prod) en lecture seule sur `/contenu`,
    après l'avoir vérifié par `VERIFIER_CONTENU` dans un conteneur jetable ;
  - le cours d'exemple, inventé, est dans `exemple-contenu/`, que l'image porte. Hors de la prod,
    sans contenu monté (un dossier absent, ou qui ne porte que son `README.md`), le serveur le sert
    et l'écrit : `contenu : l'exemple (<chemin>), aucun contenu monté`. C'est le cas au poste, en
    CI et dans les tests de bout en bout ;
  - la prod ne sert jamais l'exemple : sans contenu monté, elle refuse de démarrer, code 1
    (`docs/exploitation.md`, « Voir ce qui est en ligne ») ;
  - aucun test vitest ne lit le cours de l'instance : ils lisent l'exemple, ou `exempleDeCours()`.
- **Les PR de contenu se font au dépôt de données**, et leurs commandes partent du clone du code,
  voisin (S3-D4) : voir « Commandes ». Ce dépôt ne reçoit que le cours d'exemple.
- **Avant de pousser une PR de contenu**, sur une branche du dépôt de données à jour de `origin/main`
  (après `git fetch` et un rebase), depuis le clone du code :
  `corepack pnpm contenus:verifier --contenu ../ancrage-donnees/contenu --base origin/main` (avec
  `<clone ou worktree des données>/contenu` à la place de `../ancrage-donnees/contenu` quand la PR
  vit dans un worktree des données). La CI du
  dépôt de données fait le même contrôle contre la base de la PR.
- **Ajouter un élément** : `contenus:id` tire son identifiant, puis `contenus:verrouiller`
  l'inscrit dans `ids.lock`.
- **Retirer un élément** : supprimer l'élément, et marquer sa ligne `<id> retiré` dans `ids.lock`.
  Ne jamais supprimer une ligne de `ids.lock`.
- **Conflit sur `ids.lock`** entre deux PR de contenu : garder les deux côtés, car le fichier ne
  fait que grandir. Puis relancer `contenus:verifier`.
- **Toute modification** : lancer `contenus:reference`, puis relire dans la PR la différence de
  l'instantané `references/terminologie.reference.json` du dépôt de données
  (`contenus:reference --references ../ancrage-donnees/references --contenu ../ancrage-donnees/contenu`,
  ces chemins visant le clone principal des données ou, pour une PR en worktree, ce worktree).
- **La fiche de la semaine** (les Arbeitsblätter d'une Unit, après sa correction en classe) :
  `/feuille <zip de la Unit>`, compétence du dépôt de données (`.claude/skills/feuille/`), qui ouvre
  sa PR là-bas. Le zip et les fichiers de l'enseignante restent hors des dépôts.
- **Relecture de l'enseignante** : la liste imprimable se génère par
  `corepack pnpm contenus:a-verifier`. Puis passer l'élément en `statut: "vérifié"`, avec
  `verifie_le` dans le même objet.

## Méthode

Le cycle d'un lot, la définition de « Fini », les commits et les questions groupées sont dans
`docs/modele/methode.md`, importé en tête de ce fichier. Ce qui suit est propre à `ancrage`.

- **Une PR = un changement.**
- **`main` est protégée par une règle de GitHub** (dépôt public), et le garde de Claude refuse toujours
  de pousser sur `main`. Ne fusionner qu'après avoir vérifié que `gh pr checks` est entièrement vert.
- **Fini**, pour `ancrage`, comprend en plus : vérifié sur un téléphone Android.
- **Les rôles** : un texte de ce dépôt, public, ne nomme ni l'apprenante, ni la classe, ni l'école,
  ni l'enseignante, ni l'hôte, ni le domaine (S2-D6). Il les appelle par leur rôle ; les noms vivent
  au dépôt de données.
- **Le cours** : un texte de ce dépôt ne cite aucun texte du cours (S2-R9). Un exemple ou
  une fixture prend le cours d'exemple, ou un texte inventé, jamais une variante d'un élément du
  cours. Le hook `PreToolUse` `scripts/cours-absent.ts` (`.claude/settings.json`) le tient à
  l'envoi : il refuse tout `git push` dont le commit porte un texte du cours du dépôt de données
  voisin, et refuse aussi quand la recherche ne peut pas tourner. Sans dépôt de données à cet
  endroit (une session à distance), il avertit et laisse passer (S3-D6).
- **Les renvois** : `ancrage-donnees#NNN` pour une issue ou une PR d'avant la scission, qui restent au
  dépôt de données, et `modele-projet#NNN` pour le modèle, jamais un `#NNN` nu dans un texte durable
  (S2-D8). Dans le texte d'une PR ou d'un commit, le renvoi au dépôt de données s'écrit
  `EdouardZemb/ancrage-donnees#NNN` en toutes lettres. La porte du socle, en régime code, refuse un nom
  de l'instance : la correction est un rôle, un renvoi complet ou un texte inventé, jamais un
  contournement.

## Serveur partagé

L'hôte héberge aussi d'autres projets. On n'y crée et on n'y modifie que ce qui appartient à ancrage,
et la liste complète de ce qui lui appartient, avec la façon de s'y connecter, est dans le `CLAUDE.md`
du dépôt de données : l'hôte, ses dossiers et ses clés y sont nommés. Tout le reste est en lecture
seule, sauf accord explicite d'Edouard. Lire `NOTICE.md` et `REGISTRE.md` du dépôt `serveur` avant
d'intervenir sur l'hôte. Personne n'écrit sur le serveur (invariant 3 de `docs/modele/methode.md`) :
tout y arrive par git.

## Exploitation

Le pas-à-pas est dans `docs/exploitation.md`. L'essentiel :

- **La mécanique est celle du modèle** (`modele-projet`, cible `serveur`) : `deploiement/` et
  `tests/deploiement/`, les deux actions `.github/actions/modele-image-*` et
  `.github/workflows/modele-version.yml` sont gérés, et ne se modifient pas ici (un défaut se
  corrige dans `modele-projet`, puis `copier update`). Ses décisions : M-0003 à M-0006, dans
  `docs/modele/decisions/`. Après chaque déploiement réussi, `deployer.sh` fait le ménage des
  images du projet (`docs/exploitation.md`, « Les images »), et refuse un dossier de données vide
  ou changé (« Débloquer un déploiement »). Ce qui est à ancrage :
  - `deploiement/projet.env` : les commandes de la CLI, `SAUVEGARDER`, `VERIFIER` et `REPORTER`
    (le rejeu du registre des suppressions), `REPORTER_SECTION`, et `VERIFIER_CONTENU` (le contenu
    de l'instance, monté sur `/contenu`, depuis le dépôt de données). Un test (`src/serveur/projet-env.test.ts`) tient le
    report et son titre dans le runbook, et `VERIFIER_CONTENU` ; le job `image` de `ci.yml` exerce
    le report dans l'image ;
  - `deploiement/compose.projet.yml` (l'ancien tunnel en est sorti à la version N+1), les `.cles` des
    secrets (`TUNNEL_TOKEN` en est sorti à la version N+2), les jobs `verifier`, `deploiement` et `image` de `ci.yml`.
  - La CLI (`src/serveur/cli.ts`) garde ses formes sur fichier tant qu'un instantané d'avant
    l'alignement peut servir : l'ancien `restaurer.sh` s'en sert.
- **Deux dépôts** (M-0004, § 8) : ce dépôt porte le code, `ancrage-donnees` l'instance (`env/`,
  `secrets/`, `.sops.yaml`, `cles/`, `contenu/`). Le serveur clone les deux.
- **Mise en ligne** :
  - le staging suit `main` ici et la branche des données que nomme son env : il se met à jour à chaque
    fusion sur l'un ou l'autre ;
  - la prod suit la plus haute étiquette annotée `vX.Y.Z` d'ici, **avec l'accord d'Edouard**
    (`modele-version.yml` publie l'image), et la plus haute étiquette `donnees-AAAA.MM.JJ.n` du dépôt
    de données, elle aussi à Edouard ;
  - dans les deux cas, la sonde déploie en 5 minutes au plus.
- **Version qui échoue** : la précédente est remise en service, et la version ratée n'est jamais
  retentée. On corrige, puis on pose une nouvelle étiquette. D'ici là, Healthchecks reste
  « down » : c'est voulu.
- **Retour arrière** : `bash ~/ancrage/deploiement/deployer.sh prod --retour`. Le retour vers le
  couple d'avant la scission (une image `v0.11.x` avec le commit d'un dépôt unique) n'est pas pris
  en charge : une étiquette de ce dépôt ne peut viser une version d'avant sa naissance. On corrige,
  puis on pose une nouvelle étiquette.
- **Restauration** : `bash ~/ancrage/deploiement/restaurer.sh prod <dossier> --oui`. Pour une
  archive du Drive, ajouter `--cle /dev/stdin` : la clé hors ligne ne touche jamais le disque du
  serveur.
  - Le report rejoue le registre des suppressions de la base remplacée sur l'instantané
    (`cli.js rejouer-suppressions --dossiers`), pour que les comptes supprimés depuis
    l'instantané ne reviennent pas.
  - Si le report échoue (base en service illisible, ou sans aucun compte, image qui ne connaît pas
    la commande), la restauration est abandonnée sans rien changer. `--sans-report`, qui remplace
    `--sans-registre`, la force : les comptes supprimés depuis l'instantané reviennent, et le rejeu
    à la main est alors obligatoire (`docs/exploitation.md`, « Rejouer le registre à la main »).
  - Données en service vides (serveur perdu) : rien à reporter, les comptes supprimés depuis
    l'instantané reviennent ; même rejeu à la main.
  - Un instantané d'avant l'alignement (un fichier `.sqlite`) se restaure par l'ancien
    `restaurer.sh`, tiré de l'historique du dépôt de données (`ceb8048`, qui n'existe pas dans ce
    dépôt public ; il demande l'historique complet du clone des données, sinon l'archive se tire du
    poste) : `docs/exploitation.md`, « Restaurer un instantané d'avant l'alignement ».
- **Secrets** : ils se refont sur le poste, depuis le clone du dépôt de données, par
  `scripts/modele/secrets.ps1 refaire`, puis une PR du dépôt de données ; leurs `.cles` restent ici.
  Un changement de secret n'entre en service en prod qu'avec l'étiquette de données suivante.
- **Comptes** :
  - le compte propriétaire se crée par `docker exec <conteneur> node dist/serveur/cli.js proprietaire` ;
  - un téléphone perdu se remplace par `secours-proprietaire` ;
  - les deux commandes écrivent un lien qui est un secret. Edouard les lance lui-même, et le lien
    ne passe jamais par une conversation.
- **Exercice de restauration distante** et **échéances** : propres à l'instance, voir le `CLAUDE.md` du dépôt de données.
