# Lot S2 — décisions et arbitrages

Le lot S2 (issue ancrage-donnees#185, milestone « La scission ») est le deuxième des trois lots
de la scission d'ancrage (M-0006 § 7). S1 (ancrage-donnees#184) a sorti le cours de l'image. S2
rend publiable l'arbre qui entrera au dépôt public, et le garde publiable jusqu'à S3
(ancrage-donnees#186), qui fera la scission. La spec des trois lots a été validée par Edouard le
04/11/2026. Elle est hors du dépôt, sur le poste d'Edouard (§ 5 pour S2).

Le lot a livré, en cinq PR :
- **A (ancrage-donnees#197)** : ce qui est propre à l'instance passe sous `instance/`. On y
  trouve la part de `CLAUDE.md` qui nomme l'instance, le brief, le cadrage et les valeurs
  d'infrastructure du runbook ;
- **B (ancrage-donnees#198)** : la liste d'inclusion (`scripts/naissance/inclure.txt`) et la
  construction de l'arbre (`scripts/naissance/construire.ts`, `corepack pnpm naissance:verifier`) ;
- **C (ancrage-donnees#199)** : les noms deviennent des rôles dans les docs de l'arbre ;
- **D (ancrage-donnees#200)** : les renvois deviennent `ancrage-donnees#NNN` ou
  `modele-projet#NNN`, et la construction refuse un renvoi nu ;
- **E (ancrage-donnees#202)** : le job `arbre-publiable` de `ci.yml`, sur chaque PR ;
- **la revue finale** (ancrage-donnees#203) : l'image attend l'arbre publiable, le test du job se
  renforce, et quelques textes se corrigent ;
- **la correction du cours** (ancrage-donnees#205, le 06/11/2026, après la clôture) : l'arbre ne
  porte plus aucun texte du cours, et le job `arbre-publiable` l'y cherche (S2-R9 à S2-R12).

Pour l'apprenante, rien ne change : l'application, la base, l'API et la notice sont les mêmes.

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« S2-D<n> ») ;
- les arbitrages faits pendant l'exécution (« S2-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.**

## Les décisions du plan (05/11/2026)

Edouard a validé le cadrage (« ok pour les défauts »), puis le plan (ancrage-donnees#196) et son
exécution par sous-agents, le 05/11/2026.

1. **S2-D1, le périmètre** : celui de ancrage-donnees#185.
   - Restent hors du lot la naissance et la bascule (S3), et ce que le dépôt public devra changer
     pour tourner seul (« Ce qui reste pour S3 », plus bas).
   - Rien ne change dans l'application, la base, l'API ni la notice. Le code ne change que par ses
     commentaires (les renvois).
   - Les fichiers gérés par le modèle ne se modifient pas, même s'ils portent un nom : au public,
     ils viendront du `copier copy` de la naissance, rendus avec des valeurs d'exemple.
2. **S2-D2, la liste d'inclusion**, `scripts/naissance/inclure.txt`.
   - Une entrée par ligne, relative à la racine. Une entrée qui finit par `/` est un dossier, avec
     tout ce qui est suivi dessous. Pas de motif, pas de `..`, pas de chemin absolu.
   - La liste dit ce qui entre, jamais ce qui sort (M-0006 § 7). Y entrent :
     - les dossiers du code et de ses docs ;
     - quatre scripts ;
     - quatre docs ;
     - les fichiers semés par le modèle, qui appartiennent au projet ;
     - les fichiers propres au projet.
   - N'y entrent pas :
     - `instance/` ;
     - `.claude/` : `settings.json` y est identique à celui du modèle, et `/feuille` part au dépôt
       de données ;
     - `scripts/naissance/` lui-même ;
     - les fichiers gérés par le modèle.
   - Un fichier nouveau sous un dossier listé entre de lui-même et passe la porte. Un fichier
     nouveau ailleurs reste privé jusqu'à ce qu'on l'ajoute. Un oubli se voit donc à la naissance,
     et ne publie jamais rien par erreur.
3. **S2-D3, la construction**, `scripts/naissance/construire.ts`.
   - Elle est lancée par `node`, n'importe que des modules `node:`, et n'emploie que la syntaxe de
     TypeScript qui s'efface.
   - Elle lit la liste et les fichiers dans le commit (`git ls-tree -r -z`, puis chaque blob),
     jamais dans la copie de travail. Le mode 100755 se garde. Un lien symbolique ou un sous-module
     refuse.
   - Elle refuse, avant la porte :
     - une entrée qui ne vise rien ;
     - un chemin retenu qui est de l'instance, du modèle ou du privé (`estHorsArbre`).
   - Elle retire de `CLAUDE.md` la ligne `@instance/CLAUDE.md`, qui doit y être une fois et une
     seule.
   - Avec `--porte`, elle passe l'arbre à `scripts/modele/confidentialite.py --public
     --exiger-prives`, par lots de 200 chemins. La liste privée vient de `MOTIFS_INTERDITS` ou du
     poste, et la porte ne montre jamais une valeur trouvée.
   - Codes : 0 conforme ; 2 non conforme ; 64 usage, ou liste privée absente.
4. **S2-D4, `CLAUDE.md` se scinde.** `instance/CLAUDE.md` reçoit ce qui nomme l'instance :
   - le premier cours, son apprenante, sa classe et son école ;
   - les adresses de la prod et du staging ;
   - le serveur partagé ;
   - l'exercice de restauration et les échéances.

   La racine garde le reste, avec des rôles, et importe la part de l'instance juste après
   `@docs/modele/methode.md`.
5. **S2-D5, ce qui reste privé passe sous `instance/`.**
   - Le brief initial et le cadrage vont sous `instance/docs/`, par `git mv`. Sinon, le
     `copier update` de S3 les aurait supprimés sans rien dire.
   - Le runbook public remplace chaque valeur d'infrastructure par un nom entre chevrons :
     `<hôte>`, `<domaine>`, `<distant>`, `<dossier de l'exercice>`. Les valeurs sont dans
     `instance/docs/exploitation.md`, « Les valeurs de l'instance ». Une commande ne se copie donc
     plus telle quelle : on y remplace l'hôte (choix d'Edouard du 05/11).
   - `src/outillage/documentation-seule.ts` compte aussi `instance/CLAUDE.md` et
     `instance/docs/*.md` comme de la documentation (2b-D1).
6. **S2-D6, les rôles** : « l'apprenante », « la classe », « l'école », « l'enseignante »,
   « l'hôte », `<domaine>`.
   - Une ville, une adresse ou un autre nom de la liste privée devient un rôle, ou sort de la
     phrase.
   - Le nom d'Edouard reste : il n'est pas dans la liste privée, et `docs/modele/methode.md`, géré
     par le modèle, le porte de toute façon.
7. **S2-D7, les ADR expurgés.** `docs/decisions/README.md`, « Les copies expurgées », nomme les ADR
   touchés et ce qui y a changé. Ce n'est pas une réécriture : la décision et sa date ne changent
   pas, et l'original reste dans l'historique du dépôt de données.
8. **S2-D8, les renvois.**
   - Dans l'arbre, un renvoi à une issue ou à une PR d'ancrage s'écrit `ancrage-donnees#NNN`, et un
     renvoi au modèle `modele-projet#NNN`. Au public, un numéro nu viserait une issue du dépôt
     public.
   - Les fichiers privés (`instance/`, `.claude/`) gardent leurs numéros nus : ils seront au dépôt
     de données, où ces numéros sont chez eux.
   - La construction refuse un renvoi nu (`renvoisNus`). Ne comptent pas comme renvois :
     - une couleur CSS suivie de `;` ;
     - une entité HTML ;
     - un titre Markdown ;
     - un numéro collé à un nom de dépôt.
9. **S2-D9, `README.md`** perd « Projet privé » et ses liens au brief et au cadrage. Sa forme finale
   est pour S3.
10. **S2-D10, le job `arbre-publiable`.**
    - Il tourne sur chaque PR et sur chaque envoi sur `main`, sans `if:` : une PR de documentation
      pure le lance aussi, puisque les docs sont le premier risque.
    - Ses étapes : `actions/checkout` sans identifiants persistés, Node 24, puis
      `node scripts/naissance/construire.ts --porte` avec le secret `MOTIFS_INTERDITS`, complétées
      par S2-R9 (la recherche du cours).
    - Un test de `construire.test.ts` le tient.
11. **S2-D11, la version.** La `v0.11.1`, avec l'accord d'Edouard, après la clôture. Elle portera
    la fiche de la Unit 4 si elle est fusionnée d'ici là (choix d'Edouard du 05/11). C'est la
    deuxième version d'après S1 qu'exige S1-D16 avant S3.

## Les arbitrages de l'exécution (05/11/2026)

1. **S2-R1, la note des ADR en deux temps.**
   - La PR C l'écrit pour les noms devenus des rôles (ADR 0001, 0002, 0003 et 0006).
   - La PR D la complète des renvois (ADR 0008, 0009 et 0011).

   Une note ne doit pas dire une chose pas encore faite, entre deux fusions.
2. **S2-R2, des consignes faites à la main.** Chaque sous-agent a reçu les décisions, les
   contraintes et les points de revue du plan, puis sa tâche.
3. **S2-R3, l'interpréteur de la porte** est `python` sous Windows et `python3` ailleurs, plutôt
   qu'un `setup-python` dans le job : le runner a `python3`, que `ci.yml` appelle déjà. Sans lui,
   la construction rendrait 64. Elle échouerait donc fermée, sans rien laisser passer.
4. **S2-R4, la note des ADR précisée.** Elle parle des noms de personnes, de lieux et de domaine qui
   figuraient dans les ADR. Écrite d'abord « les noms des ADR », elle se lisait comme leurs titres.
5. **S2-R5, l'image attend l'arbre publiable.** `arbre-publiable` est dans les `needs` du job
   `image`, et un test le tient. ADR-0006 veut qu'aucune image ne parte d'un commit dont la CI
   échoue. Un arbre rouge bloque donc le staging jusqu'à sa correction, ce qui est voulu.
6. **S2-R6, le sigle d'une organisation professionnelle** de `docs/conception/lot-f1.md` devient un
   rôle. Son ajout à la liste privée revient à Edouard, comme tout changement de la liste. La liste
   des autres modules de la formation (`docs/pistes.md`) reste, car elle identifie peu à elle
   seule.
7. **S2-R7, les suites.**
   - Ce que la revue finale a trouvé pour S3 complète la liste ci-dessous.
   - Le reste va à ancrage-donnees#156.
   - Les renvois nus de trois fichiers gérés par le modèle ont été signalés à `modele-projet`.
8. **S2-R8, la passe de correction de la revue finale** a porté tout ce que la revue a trié « avant
   la clôture » :
   - le sens de LE-12 et de 2d-R8, que la conversion des renvois avait faussé ;
   - le sigle ;
   - les `needs` de l'image ;
   - le test du job : la ligne `run:` entière, pas de `continue-on-error`, `push:` sur `main`,
     pas de filtre de chemins ;
   - un chemin du poste ;
   - la note de l'ADR-0011 ;
   - deux détails de `CLAUDE.md`.
9. **S2-R9, le cours hors de l'arbre.** Le 06/11/2026, après la clôture, une recherche des textes
   du vrai cours dans l'arbre construit en a trouvé 103, dans 37 fichiers : les exemples de
   `docs/format-des-contenus.md`, des fixtures et des tests. La porte cherche ce qui identifie,
   pas le contenu, et `contenus:client` ne regardait que le client construit et l'image. Edouard a
   décidé le jour même : le cours reste au dépôt de données, et l'arbre n'en porte aucun texte.
   - `construire.ts --cours <dossier>` lance `contenus:client` sur l'arbre construit ; un texte
     trouvé rend 2.
   - La recherche voit aussi un texte recoupé sur plusieurs lignes, ou cité sans sa ponctuation
     finale : la revue finale en a trouvé deux ainsi, que la recherche exacte laissait passer.
   - `naissance:verifier` et le job `arbre-publiable` le lancent avec `instance/contenu`. Le job
     installe donc les dépendances.
   - Les textes trouvés sont réécrits sur le cours d'exemple, ou inventés.
10. **S2-R10, les textes tolérés.** `scripts/naissance/textes-toleres.txt` n'a qu'une ligne,
    « Wortbaukasten ». C'est le nom de l'onglet des mots dans le code, repris du prototype, et
    c'est aussi un titre du cours. Edouard relit la liste. Une ligne qui n'est plus un texte du
    cours est refusée : la liste ne vieillit pas en silence. Une PR qui touche cette liste se
    fusionne par Edouard.
11. **S2-R11, le seuil fait la ligne.**
    - Un texte de 12 caractères ou plus est réécrit, même un terme isolé.
    - Un mot plus court des fixtures (un organe, une maladie courante) reste. C'est du vocabulaire
      courant, qu'aucun outil ne distingue d'un mot du cours.
    - Un texte réécrit n'est pas une variante d'un élément du cours (un mot changé, une glose
      paraphrasée) : la revue de la tâche en a refusé, et ils ont été refaits.
    - Il prend le thème du cours d'exemple, la cuisine. Quand un test dépend d'une propriété du
      vocabulaire médical (terminaison latine, graphie germanisée d'un mot latin, c/k/z), il prend
      un mot inventé.
12. **S2-R12, le modèle.** Rien dans M-0006 ne cherche les copies des données d'une instance dans
    l'arbre du code : le défaut vaut pour toute scission. Il est remonté à `modele-projet`, qui le
    suit dans modele-projet#100.

## Ce qui reste pour S3

Ce que le dépôt public devra changer pour tourner seul. Rien de cela ne s'est fait dans S2.

- **`ci.yml`** :
  - les étapes sur le contenu de l'instance partent au dépôt de données (spec § 6.4) :
    `contenus:verifier --base`, `contenus:reference --verifier`, `contenus:client` avec ce contenu
    et la porte de l'image avec ce contenu ;
  - les tests de `/feuille` partent aussi ;
  - le job `arbre-publiable` et le script `naissance:verifier` sortent de l'arbre, comme
    `scripts/naissance/`, avec leurs lignes de `CLAUDE.md`. Au public, la porte du socle, en régime
    code, prend le relais.
- **La recherche du cours dans le code** (S2-R9). La porte du socle ne la fait pas, et le dépôt de
  code n'aura plus le cours. Elle devra tourner du côté du dépôt de données, contre la branche
  principale du dépôt de code. modele-projet#100 en donnera peut-être la forme commune.
- **La CLI de contenu** : ses défauts (`instance/contenu/`, `instance/references/`, dans
  `src/serveur/contenus/dossiers.ts`), les scripts de `package.json` et leurs lignes de `CLAUDE.md`.
- **Les renvois à `instance/`** des textes publics : `CLAUDE.md`, `docs/exploitation.md`,
  `docs/format-des-contenus.md`, et les commentaires de `deploiement/projet.env` et de `ci.yml`.
  Ils deviennent des renvois au dépôt de données, ou sortent.
- **Les phrases fausses au public**, dans `CLAUDE.md` :
  - « Le dépôt est privé » ;
  - la nature `donnees` ;
  - « `main` n'est pas protégée (dépôt privé) » ;
  - la règle des renvois, qui parle de l'arbre publiable.
- **Les règles de conduite sur l'hôte partagé**, aujourd'hui seulement dans `instance/CLAUDE.md`. Le
  dépôt de code en garde le principe : on n'y touche que ce qui appartient au projet. Le dépôt de
  données en garde la liste.
- **Le brief et le cadrage** que sème le `copier copy` de la naissance (`docs/00-brief-initial.md`,
  `docs/cadrage.md`) : les garder comme gabarits, ou les retirer.
- **`.gitignore`** se compare à celui que sème la naissance. **`README.md`** prend sa forme finale.
- **`vitest.config.ts` et `tsconfig.json`** perdent `scripts/naissance`. `documentation-seule.ts`
  perd sa règle `instance/`.
- **`instance/CLAUDE.md` et `instance/docs/`** vont à leur place au dépôt de données (spec § 6.4,
  étape 3).
- **La naissance elle-même** :
  - l'arbre se construit par `construire.ts --vers <dossier vide>`. Un refus pendant le montage y
    laisse un dossier à moitié rempli : seul un code 0 vaut ;
  - les fichiers binaires (les icônes PNG) passent la porte sans être examinés : les relire à la
    main ;
  - gitleaks et la protection des envois de GitHub passent sur l'arbre avant le premier envoi
    (spec § 6.2).
