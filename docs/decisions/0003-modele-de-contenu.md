# ADR-0003 — Modèle de contenu : des fichiers versionnés, des identifiants explicites

- **Statut** : accepté le 2026-10-15 ; amendé le 2026-11-05 par l'ADR-0011 sur un seul point, la
  disposition : `contenus/` est devenu `instance/contenu/`, monté sur `/contenu`, hors de l'image
- **Contexte amont** : brief §2 point 5, §4 point 3, §7 ; réponse 6 du 15/10 (l'enseignante
  relit sans éditer, pour l'instant)

## Contexte

Le prototype a deux sources de contenu :

- `fiches/karten.json` : 956 cartes en 13 chapitres, sous la forme `[type, recto, verso]` ;
- des constantes écrites dans le HTML : morphèmes et mots du Wortbaukasten, 6 schémas SVG avec
  leurs points, 13 comptes rendus (syntaxe `[[jeton|sens]]` et questions), exercices de grammaire
  (5 familles), liste des chapitres.

Deux défauts doivent disparaître :

1. **Tous les identifiants sont tirés du texte.** Une carte est `chapitre:recto` (et `|r` pour le
   sens inverse), un mot est le mot lui-même, un point de schéma est `schéma:libellé`. Corriger
   une faute de frappe efface la progression de l'élément corrigé.
2. **Rien ne marque les réponses complétées par l'IA.** Dans les chapitres 6, 7, 11 et 12, une
   partie des réponses n'est pas tirée du livre, et on ne sait pas lesquelles sans lui.

Ajouter un cours doit consister à ajouter du contenu, pas à modifier le code. L'édition directe
par l'enseignante viendra plus tard.

## Options

- **A. Fichiers dans le dépôt.** Relecture par pull request, historique, validation en CI,
  différences lisibles. On ne peut éditer que par Git : c'est acceptable aujourd'hui.
- **B. Base de données et éditeur web.** Nécessaire le jour où l'enseignante éditera. Trop tôt :
  il faudrait l'éditeur, le versionnage et la validation dans l'application.
- **C. Un dépôt de contenu séparé.** Isolation propre, mais deux chaînes à tenir. Prématuré.

## Décision

**Option A.** C'est le **format** qui fait contrat, pas l'endroit où il est stocké.

- **Disposition** :
  - `contenus/<cours>/cours.yaml` décrit le cours : identifiant, titre, langue, modules, options,
    version du format ;
  - un fichier par module typé : `cartes`, `morphologie` (le Wortbaukasten), `schema` (un fichier
    SVG et ses points), `texte-annote` (les comptes rendus), `exercices` (la grammaire), `examen`
    (composition et barème suisse 1–6), `fiche` (Markdown).
- **Validation** : un schéma par type de module. La CI refuse un contenu invalide, et le serveur
  refuse de démarrer avec.
- **Identifiants** :
  - chaque élément porte un `id` explicite et opaque (8 caractères en base 32), unique dans tout
    le dépôt ;
  - un identifiant n'est jamais tiré du texte, jamais modifié, jamais réutilisé ;
  - `contenus/ids.lock` liste tous les identifiants jamais émis. La CI échoue si l'un d'eux
    disparaît sans être marqué `retiré`, ou si un nouvel identifiant en recouvre un ancien.
- **Unités d'apprentissage** : un élément et un sens. Le sens inverse se dérive de l'identifiant
  (`<id>:inverse`), pas du texte.
- **Statut de chaque élément** :
  - `source` : tiré du livre, sans doute particulier ;
  - `à vérifier` : complété par l'IA ou fictif ;
  - `vérifié` : relu par l'enseignante, avec la date.

  Au départ, les chapitres 6, 7, 11 et 12 sont entièrement « à vérifier », puisqu'on ne peut pas
  isoler les réponses complétées. Les 13 comptes rendus fictifs aussi. L'interface affiche un
  repère discret sur ces éléments. ADR-0001 en tire la règle de diffusion.
- **Langue** : `cours.yaml` déclare la langue du cours (`de` pour la terminologie), et l'interface
  du cours l'adopte. L'interface commune (connexion, liste des cours) existe en allemand et en
  français, au choix de chaque personne. Aucune langue n'est supposée par le code.
- **Migration du prototype** :
  - un script unique produit les fichiers et leurs identifiants ;
  - un **test d'équivalence** compare la sortie du nouveau chargeur à ce que calculait le
    prototype. Il vérifie les mêmes 956 cartes, les mêmes unités inverses, les mêmes réponses
    acceptées, les mêmes mots, points, jetons, questions et exercices ;
  - les assertions de `outils-build/test_app.js` deviennent des tests unitaires.

  Aucune progression n'est à reprendre (réponse 4 du 15/10). Une fois la migration faite,
  `karten.json` dans le dossier du prototype devient périmé, comme l'indique l'index des projets.

## Conséquences

- **Ajouter un cours** : un dossier et une pull request. Le déploiement suivant le publie.
- **Modifier un contenu** : Edouard, avec Claude, par pull request. L'enseignante signale, elle
  n'édite pas encore. Son éditeur fera l'objet d'un ADR à part. L'écriture passera
  vraisemblablement en base, avec un export en fichiers ; le format et les identifiants resteront
  le contrat.
- **Droits d'auteur** : les fichiers sont des résumés reformulés d'un manuel protégé (Juventus).
  Le dépôt et les images sont privés, et l'accès est restreint aux personnes autorisées.
- **Difficile à changer** : les identifiants, qui sont définitifs, et la forme des modules. Elle
  est versionnée (`format: 1`), et tout changement de format passe par un script de migration.

## Révision

À rouvrir quand l'éditeur de l'enseignante est entrepris, ou quand un contenu ne rentre dans
aucun type de module.
