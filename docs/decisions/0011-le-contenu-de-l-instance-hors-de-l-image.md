# ADR-0011 — Le contenu de l'instance hors de l'image : monté sur `/contenu`, vérifié avant chaque déploiement

- **Statut** : accepté le 2026-11-05
- **Contexte amont** : issue ancrage-donnees#184 (lot S1) ; M-0006 (`docs/modele/decisions/`), § 5, le contrat de
  l'application, et § 7, la scission ; décisions S1-D2, S1-D3, S1-D7, S1-D12 et S1-D14 du lot S1.
  Il amende ADR-0003 (la disposition du contenu), ADR-0005 (la disposition du dépôt) et la décision
  1e-D15 du lot 1e (la notice), sans les réécrire.

## Contexte

Jusqu'à la v0.10.0, le cours vit dans `contenus/`, et l'image le copie dans son étape d'exécution
(`COPY contenus ./contenus`). Les valeurs propres à l'instance de la notice de confidentialité (le
responsable, les tiers, les pays, les autorités) sont dans le code du client (1e-D15).

Trois choses obligent à changer :

1. **M-0006, § 5** : l'image ne contient aucun contenu de l'instance ni aucune valeur d'instance.
   Elle lit son contenu dans `/contenu`, un montage en lecture seule, et embarque un contenu
   d'exemple. En prod, un projet qui a un contenu refuse de démarrer sans lui.
2. **La scission** (M-0006, § 7, lot S3) : ancrage, dépôt d'avant M-0006, deviendra le dépôt de
   données, et un nouveau dépôt de code naîtra d'un seul commit propre, qui pourra être public. Ce
   commit ne doit rien porter de l'instance : ni le cours, ni la notice d'Edouard.
3. **Les droits d'auteur** (ADR-0003, « Conséquences ») : le cours résume un manuel protégé. Une
   image qui l'embarque le diffuse avec elle ; une image qui ne porte que du code et un exemple
   inventé peut circuler sans lui.

La chaîne du modèle sait déjà monter un contenu (M-0004 et M-0006, mode à un dépôt) : elle extrait
`instance/contenu/` du commit de données, le vérifie par `VERIFIER_CONTENU` dans un conteneur
jetable, puis le monte. Elle exige qu'un dossier et sa commande aillent par paires.

## Options

- **A. Garder le cours dans l'image**, et ne rien déclarer. Rien à changer, mais M-0006 § 5 n'est
  pas tenu, et la scission emporterait le cours dans l'image du dépôt de code.
- **B. Le contenu monté, l'exemple dans l'image** : `instance/contenu/` est monté sur `/contenu`,
  l'image porte `exemple-contenu/`, et le serveur choisit au démarrage. C'est le contrat de M-0006,
  et la chaîne le fait déjà.
- **C. Le contenu servi par un autre service**, ou chargé à la demande depuis un dépôt. Une
  dépendance de plus au démarrage et en hors-ligne, pour un gain nul à cette échelle.

## Décision

**Option B.**

- **La disposition** (amende ADR-0003 et ADR-0005). Le contenu de l'instance passe de `contenus/`
  à `instance/contenu/` (`git mv`, l'historique suit), puis à la racine du dépôt de données,
  `contenu/`, à la scission. Ses instantanés de référence passent de `tests/contenus/` à
  `instance/references/`. Le cours d'exemple, écrit à la main et sans rien du vrai cours, est dans
  `exemple-contenu/` (S1-D11). À la racine d'un dossier de contenu, seuls `ids.lock`,
  `notice.yaml` et un `README.md` ignoré sont admis ; la version de schéma est le `format: 1` de
  chaque `cours.yaml` et de `notice.yaml`.
- **L'image** (S1-D12). Le `Dockerfile` ne copie plus le cours. Il copie `exemple-contenu/`, et
  pose `ANCRAGE_CONTENUS=/contenu` et `ANCRAGE_EXEMPLE_CONTENU=/app/exemple-contenu`.
  `.dockerignore` exclut `instance/`. **Le contenu de l'instance n'entre jamais dans l'image.**
- **Le démarrage** (S1-D3). Le serveur sert le dossier monté s'il n'est pas vide (un dossier qui ne
  porte que son `README.md` l'est). Sinon, hors de la prod, il sert l'exemple et l'écrit ; en prod,
  il refuse de démarrer, code 1, et ne sert jamais l'exemple, même désigné.
- **La vérification** (S1-D4). `deploiement/projet.env` déclare
  `VERIFIER_CONTENU=node dist/serveur/cli.js verifier-contenu`. Elle charge le dossier comme le
  démarrage et compare son `ids.lock` à celui du contenu en service : un identifiant défait refuse
  le déploiement (invariant 4). La CI la lance sur `exemple-contenu/` et sur `instance/contenu/`.
- **La notice** (amende 1e-D15, S1-D7 et S1-D8). Son texte reste dans le code, en gabarit
  (`src/domaine/notice-gabarit.ts`) ; ses valeurs d'instance sont dans `notice.yaml`, à la racine
  du contenu, et le client les lit par `GET /api/notice`. Le reste de 1e-D15 ne change pas.
- **La porte** (S1-D12). La CI extrait le `/app` de l'image construite et y cherche les textes du
  contenu de l'instance et les valeurs de sa notice, hors de `node_modules`. Le serveur est compilé
  sans ses commentaires (`removeComments`) : la porte n'y voit que ce qui s'exécute. Le client
  construit est cherché aussi, avec le contenu de l'instance et avec l'exemple (invariant 3).

## Conséquences

- **Une phrase de plus à l'invariant 3** de `CLAUDE.md` : « Le contenu de l'instance n'entre
  jamais dans l'image. »
- **Chaque couple a un commit de données**, en un seul dépôt la révision de son image. La première
  version d'après ce lot est le premier couple avec un commit : son déploiement n'a pas de contenu
  en service à comparer. Le retour vers la v0.10.0 va vers un couple « - », qui ne monte rien et
  sert le cours de son image (S1-D16).
- **Une PR de contenu change de chemins** : `instance/contenu/` et `instance/references/`. Elle se
  met en ligne comme avant, par la version suivante du code.
- **Le poste, la CI et les tests de bout en bout tournent sur l'exemple**, sauf si
  `ANCRAGE_CONTENUS` désigne le vrai cours. Aucun test vitest ne lit `instance/`.
- **Difficile à changer** :
  - le contrat de l'image : `/contenu`, `VERIFIER_CONTENU` et ses codes, que la chaîne du modèle
    lit ;
  - le refus de la prod sans contenu : l'assouplir laisserait la prod servir l'exemple, et les
    téléphones effacer leur copie du vrai cours.

## Révision

À la scission (lot S3), quand `instance/contenu/` devient `contenu/` dans le dépôt de données ; ou
quand un projet de l'écosystème doit servir plusieurs contenus d'instance à la fois.

**Le numéro.** Cet ADR suit l'ADR-0009 : il n'y a pas d'ADR-0010 dans ce dépôt, et c'est voulu.
Les documents d'ancrage citent « ADR-0010 » pour celui de creche-planner (`instance/docs/cadrage.md`,
ADR-0001, ADR-0006) : un ADR-0010 local les rendrait ambigus.
