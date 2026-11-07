# Lot S1 — décisions et arbitrages

Le lot S1 (issue ancrage-donnees#184, milestone « La scission ») est le premier des trois lots de la scission
d'ancrage. M-0006 § 7 la prévoit : un dépôt d'avant M-0006 ne passe pas en public, il se scinde
en un dépôt de code public et un dépôt de données privé. S1 sort le cours de l'image ; S2 (ancrage-donnees#185)
nettoiera ce qui passera au public, et S3 (ancrage-donnees#186) fera la scission. La spec des trois lots, validée
par Edouard le 04/11/2026, est hors du dépôt, sur le poste d'Edouard (§ 4 pour S1).

Le lot a livré, en cinq PR :
- **A (ancrage-donnees#188)** : la commande `verifier-contenu` de la CLI de l'image, et la CLI de contenu qui
  prend ses dossiers en option ;
- **B (ancrage-donnees#189)** : la notice en gabarit dans le code, ses valeurs d'instance dans `notice.yaml`,
  servies par `GET /api/notice` et gardées dans IndexedDB ;
- **C (ancrage-donnees#190)** : le repli sur un cours d'exemple hors de la prod (`exemple-contenu/kueche/`), les
  tests qui passent dessus, et la section `diffusion` de l'instantané de référence ;
- **D (ancrage-donnees#191)** : la bascule. Le cours vit dans `instance/contenu/`, ses instantanés dans
  `instance/references/`, et la chaîne du modèle le monte sur `/contenu` après
  `VERIFIER_CONTENU` (ADR-0011) ;
- **E (ancrage-donnees#192)** : plus de nom réel dans les tests, et le garde-fou des chemins de données ;
- **la revue finale** (ancrage-donnees#193) : le garde-fou ancré, l'e2e isolé de l'environnement du
  poste, des tests et des textes plus justes.

Pour l'apprenante, rien ne change : la notice reste mot pour mot la même, et le cours servi aussi.

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« S1-D<n> ») ;
- les arbitrages faits pendant l'exécution (« S1-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.**

## Les décisions du plan (04/11/2026)

Edouard a validé la spec, puis le plan (ancrage-donnees#187) et son exécution par sous-agents, le 04/11/2026.

1. **S1-D1, le périmètre** : celui de ancrage-donnees#184. Restent hors du lot :
   - la scission elle-même (S3, ancrage-donnees#186) ;
   - le nettoyage des docs et la liste d'inclusion du dépôt public (S2, ancrage-donnees#185) ;
   - tout changement de fond de la notice ;
   - les noms réels des tests gérés par le modèle (`tests/deploiement/`), qui sont au modèle.

   Rien ne change dans la base, le journal ni les droits.
2. **S1-D2, la disposition.** `git mv contenus instance/contenu` et
   `git mv tests/contenus instance/references`, dans un commit à part : l'historique suit. La
   racine d'un dossier de contenu admet `ids.lock`, `notice.yaml` (obligatoire) et `README.md`,
   ignoré : le gabarit du dépôt de données de S3 en sèmera un, et la chaîne compte un dossier qui
   ne porte que lui comme absent. La version de schéma que M-0006 § 5 demande est le `format: 1`
   de chaque `cours.yaml` et de `notice.yaml`. Il n'y a pas de manifeste à la racine : la spec en
   prévoyait un, le plan l'a écarté.
3. **S1-D3, le dossier servi se résout au démarrage** (`resoudreContenu`,
   `src/serveur/demarrage.ts`).
   - `ANCRAGE_CONTENUS` est facultative, sans défaut. `ANCRAGE_EXEMPLE_CONTENU` vaut
     `exemple-contenu` par défaut. L'image pose `ANCRAGE_CONTENUS=/contenu` et
     `ANCRAGE_EXEMPLE_CONTENU=/app/exemple-contenu`, ce que tient `src/serveur/image.test.ts`.
   - Un dossier est vide s'il manque, ou s'il ne porte rien hors d'un `README.md` à sa racine.
   - En prod, un dossier vide refuse le démarrage, code 1. Ailleurs (`dev`, `ci`, `staging`, ou
     sans `ANCRAGE_ENV`), l'exemple est servi, et une ligne le dit.
   - `lireConfig` ne touche pas au disque : les autres commandes de la CLI tournent comme avant
     dans des conteneurs sans `/contenu`.
4. **S1-D4, `verifier-contenu`.** `node dist/serveur/cli.js verifier-contenu <dossier> [<en
   service>]` charge le dossier comme le démarrage et compare son `ids.lock` à celui du dossier en
   service, par `comparerVerrous`, sans git. Ses codes : 0 conforme, 2 non conforme (une ligne par
   erreur), 64 usage, 1 exception. Elle n'ouvre pas la base, ne lit pas `ANCRAGE_ENV` et n'écrit
   rien. C'est la commande `VERIFIER_CONTENU` de `deploiement/projet.env`, que la chaîne lance dans
   un conteneur jetable.
5. **S1-D5, la CLI de contenu prend ses dossiers en option** : `--contenu` et `--references`,
   dont les défauts sont dans `src/serveur/contenus/dossiers.ts`, `--base` relatif au dossier du
   contenu, `reference --verifier`, et `client <dossier> [--exclure <nom>]…`. Un chemin donné se
   lit depuis le dossier courant, un défaut depuis la racine du dépôt.
6. **S1-D6, le vrai contenu se contrôle par la CLI, en CI.** Aucun test vitest ne lit
   `instance/`. Les 33 tests sur le vrai cours ont été classés un par un :
   - 25 comportements du code : 24 passent sur l'exemple, par
     `src/serveur/contenus/exemple.disque.fixture.ts`, et le dernier était le doublon d'un test de
     `servi.test.ts` ;
   - 1 règle générale, déjà dans l'analyse ;
   - 6 faits du vrai cours, supprimés une fois tenus par l'instantané de référence ou par
     `contenus:verifier` (voir S1-R6).

   Le test de la liste blanche du contenu servi que cite F1-R3 (`docs/conception/lot-f1.md`)
   vivait dans `terminologie.test.ts`. Il vit désormais dans `src/serveur/contenus/servi.test.ts`.
7. **S1-D7, le gabarit et les valeurs de la notice.** Le texte est dans
   `src/domaine/notice-gabarit.ts` (`GABARIT_DE_NOTICE`), que le client et la CLI de contenu
   importent ; le serveur n'importe jamais `src/client/`. Les dix trous sont `CLES_DE_NOTICE`
   (`src/domaine/notice.ts`). `notice.yaml` porte `format: 1`, une `date`, `fr`, `de` et les
   `liens`, dont la cible commence par `https://` ou `mailto:` (`estUneCibleAdmise`, une seule
   règle pour l'analyse et l'écran). Une puce vide disparaît, et la date affichée est la plus
   récente de `NOTICE_VERSION` et de `date`. Les durées que l'instance ne règle pas restent dans le
   gabarit.
8. **S1-D8, la notice se charge par `GET /api/notice`**, route `public`, `no-store`, qui ne dit
   rien d'un cours (invariant 1). Le client la charge au démarrage et à l'ouverture de l'écran, et
   en garde la dernière copie dans IndexedDB (`etat`/`notice`), que la déconnexion efface. Une
   copie qui ne correspond plus au gabarit n'est pas relue. Sans copie ni réseau, l'écran dit
   qu'il attend le réseau. Le service worker ne voit toujours pas `/api/*` (2a-R8), et rien de
   l'API n'entre dans un cache (décision 11). Cela remplace en partie 1e-D15 : la notice lit ses
   valeurs du serveur.
9. **S1-D9, le texte nouveau**, `notice_hors_ligne` : « Cette page s'affiche quand l'appareil est
   en ligne. » / « Diese Seite erscheint, wenn das Gerät online ist. » L'allemand a été relu
   contre le français (même sens, aucune correction).
10. **S1-D10, la notice ne change pas, et l'instantané le prouve.** Le premier commit de la PR B
    a écrit `notice.json` depuis la constante d'avant, seul. Depuis, `contenus:reference
    --verifier` compare la notice composée à cet instantané, qui n'a plus bougé. La revue finale
    l'a revérifié contre la constante de la `v0.10.0`. `NOTICE_VERSION` ne change pas.
11. **S1-D11, le cours d'exemple**, `exemple-contenu/kueche/`, « Küchenwörter (Beispielkurs) » :
    écrit à la main, sur la cuisine, en allemand de Suisse, sans nom de personne. Il porte tout ce
    que l'e2e demande (les 7 types de module, une feuille aux 7 genres, un examen de 20
    questions, un élément « à vérifier » et une dérogation). Aucun fragment de 12 caractères de
    ses textes n'est commun avec le vrai cours. Son `notice.yaml` reprend les valeurs factices de
    `exempleDeCours()`, et un test les compare.
12. **S1-D12, l'image et sa porte.** Le `Dockerfile` copie `exemple-contenu` et non le cours, et
    `.dockerignore` exclut `instance`. Le job `image` de `ci.yml` extrait le `/app` de l'image
    construite et y cherche, avant l'e2e, les textes du cours et les valeurs de la notice. Un essai
    au poste, le cours copié dans l'image, l'a fait échouer comme prévu. `projet-env.test.ts` garde
    sa lecture de `docs/exploitation.md`, qui passera au public en S2.
13. **S1-D13, les tests sans nom réel** : le prénom devient `Testa`, la graine tirée du code de la
    classe `4242`, le domaine `ancrage.exemple.test`. La porte de confidentialité est passée de 34
    avertissements à 0 dans `src/`, `e2e/` et `vitest.config.ts`. Le garde-fou des chemins de
    données est `src/outillage/garde-fou-donnees.test.ts` (M-0006 § 4).
14. **S1-D14, ADR-0011**, « Le contenu de l'instance hors de l'image ». Il amende ADR-0003,
    ADR-0005 et 1e-D15, et l'invariant 3 gagne : « Le contenu de l'instance n'entre jamais dans
    l'image. »
15. **S1-D15, la mutation** : `src/domaine/notice.ts` rejoint le groupe `domaine`.
16. **S1-D16, la mise en ligne.** La `v0.11.0` est le premier couple avec un commit de données :
    son déploiement n'a pas de `/en-service`. Le retour vers la `v0.10.0` revient au couple « - »,
    qui ne monte rien. **Avant S3, la prod devra avoir une deuxième version d'après S1** (spec,
    § 6.5, étape 0) : sans elle, un retour arrière pendant S3 ramènerait une version qui ne monte
    aucun contenu.

## Les arbitrages de l'exécution (04-05/11/2026)

1. **S1-R1, les tâches 3 et 4 dans la même PR (B).** Après la tâche 3 seule, le client n'aurait
   plus eu de notice à rendre. L'instantané est resté le premier commit, seul.
2. **S1-R2, la liste d'exceptions du garde-fou.** Il interdit `instance/`, `tests/contenus` et
   tout chemin vers l'ancien dossier `contenus/`, mais pas un import du module de code
   `./contenus/…`. Une seule exception, justifiée : `documentation-seule.test.ts`, qui classe des
   chemins sans les lire. Le garde-fou est une heuristique textuelle : un chemin construit par
   morceaux lui échappe, et son commentaire le dit.
3. **S1-R3, le serveur fait foi pour la notice.** Une réponse valide remplace toujours la copie de
   l'appareil, même plus ancienne : après un retour arrière des données, l'appareil ne doit pas
   garder des valeurs qui ne sont plus en vigueur.
4. **S1-R4, la prod refuse aussi le dossier de l'exemple** quand `ANCRAGE_CONTENUS` le désigne :
   « la prod ne sert jamais l'exemple » vaut à la lettre.
5. **S1-R5, la notice d'exemple garde des tournures de la vraie.** S1-D11 vise les textes du
   cours, qui viennent du matériel d'une enseignante. Les valeurs de la notice décrivent la chaîne
   (tiers, durées), comme le gabarit, et ce qui identifie (nom, pays, contact, domaine) y est
   inventé.
6. **S1-R6, la section `diffusion` de l'instantané** porte, par cours, `aVerifier`, `derogation`
   (motif et date, ou `null`) et `statuts`, le nombre d'éléments de chaque statut par module,
   compté par `statutsDuModule` (`src/domaine/contenu/acces-cours.ts`), dont `coursAVerifier` se
   sert aussi. Sans elle, aucun contrôle ne verrait plus la perte de la dérogation du vrai cours,
   qui couperait l'accès de la classe (invariant 9), ni un passage à `source` dans les chapitres
   qui n'en ont aucun (ADR-0003). La règle écrite de `docs/format-des-contenus.md` est amendée en
   conséquence. L'instantané bouge donc à chaque relecture, ce qui est voulu ; deux changements
   de sens contraire dans un même module ne s'y voient pas. Le motif de la dérogation y est
   recopié : l'instantané est du côté des données.
7. **S1-R7, `removeComments` dans `tsconfig.serveur.json`.** Un commentaire du domaine citait le
   nom d'un onglet, qui est aussi un titre du vrai cours, et la porte de l'image le trouvait dans
   `dist/`. Reformuler ce seul commentaire aurait laissé le piège au suivant. Un texte du cours
   collé dans un commentaire ne serait donc plus vu par la porte de l'image : la relecture de S2
   le verrait.
8. **S1-R8, le numéro 0011.** Les docs d'ancrage citent « ADR-0010 » pour celui de
   creche-planner : un ADR-0010 local les rendrait ambiguës.
9. **S1-R9, la preuve du verrou de la PR D.** `contenus:verifier --base` lit `ids.lock` relatif au
   dossier du contenu, que la base n'avait pas encore : la comparaison passait d'office. La preuve
   a été le renommage pur de `ids.lock` (`git diff -M`, 0 ligne changée).
10. **S1-R10, l'e2e est isolé du poste.** Le serveur de l'e2e et l'amorçage ne reçoivent pas
    `ANCRAGE_CONTENUS` : une variable restée au poste ne peut pas le faire tourner sur un autre
    contenu que l'exemple. La base de l'e2e de mise à jour reste sous le dossier de sortie de
    Playwright, jetable et ignoré par git.
11. **S1-R11, `contenus:client` ne fige plus `dist/client` dans `package.json`**, pour que la
    porte de l'image lui passe son propre dossier. `dist/client` reste le défaut de la CLI.

## Ce qui reste

- **Dans ancrage-donnees#156** (« Au prochain passage ») :
  - les propriétés de tirage (au moins 4 options par QCM, par morphème, par schéma ; des examens
    complets) ne sont plus vérifiées sur le vrai cours, seulement sur l'exemple : une vérification
    « tirages » dans `contenus:verifier`, lancée sur `instance/contenu` en CI ;
  - `src/domaine/contenu/acces-cours.ts`, la moitié contenu de l'invariant 9, à faire entrer dans
    la mutation, avec des tests à plat et un cas de feuille ;
  - le commentaire d'en-tête de `instance/contenu/ids.lock`, qui nomme encore `contenus/`, laissé
    pour garder le renommage pur ;
  - les `ECONNREFUSED` vers `:3000` que `pnpm test` écrit sans échouer.
- **Pour S2 et S3** : la condition de S1-D16 ; les noms réels de `docs/` et de `CLAUDE.md` ; la
  lecture de `docs/exploitation.md` par `projet-env.test.ts`.
