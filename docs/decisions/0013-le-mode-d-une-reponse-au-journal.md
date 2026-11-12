# ADR-0013 — Le mode d'une réponse au journal : le geste, et rien d'autre

- **Statut** : accepté le 2026-11-12
- **Contexte amont** : issue 21 du dépôt (`ancrage#21`, lot M3) ; ADR-0004 (le journal, auquel on ne
  fait qu'ajouter, et son format qui n'évolue que par ajouts) ; ADR-0007 (§1, ce que l'application
  collecte, et sa « Difficile à changer » : une donnée de plus oblige à modifier la notice et à
  prévenir les personnes) ; ADR-0012 (FSRS). Il précise l'ADR-0007 sur un seul point, ce que le
  journal des réponses garde, sans réécrire cet ADR.

## Contexte

- **Ce que le journal collecte aujourd'hui.** L'ADR-0007 liste « journal des réponses » parmi ce qui
  est collecté, et « texte saisi par l'apprenant » parmi ce qui ne l'est pas. Une réponse est un
  événement qui porte une unité, un instant, un appareil et un verdict, `resultat: { juste }`
  (ADR-0004). L'application n'y garde donc que juste ou faux.
- **Ce que ce verdict mêle.** Une carte retournée est jugée par la personne elle-même, une saisie
  est jugée par l'application, un choix parmi des propositions se devine à moitié. Un taux de
  réussite qui mêle ces gestes ne dit pas la même chose d'une réponse à l'autre.
- **Pourquoi cela compte maintenant.** Le lot M3 règle FSRS sur le journal d'un cours réel (ADR-0012,
  qui note que la précision de la note binaire est inconnue) et en suit l'effet. Ajuster les poids
  sur des réponses de natures différentes, ou lire une réussite qui mêle un jugement de soi et une
  saisie stricte, ne permet ni d'ajuster ni de suivre.
- **La contrainte de format.** Le serveur valide chaque événement par un schéma strict, dont `v` est
  un littéral : un serveur d'une version précédente refuse tout événement qui porte une clé qu'il ne
  connaît pas ou un autre `v`, et refuse alors le lot entier.

## Options

1. **Ne rien ajouter.** Aucune notice à changer, mais ni l'ajustement ni le suivi ne distinguent les
   gestes : ce qu'ils mesurent est un mélange.
2. **Noter le mode de chaque réponse**, un mot parmi neuf, qui dit le geste. Une donnée de plus,
   mais qui ne dit rien de la personne ni de ce qu'elle a répondu.
   - **Dans `resultat`**, sans colonne ni migration : `resultat` est déjà un JSON que le dépôt, la
     relecture et l'export recopient tel quel.
   - **Dans une colonne** : une migration, et une écriture de plus pour chaque lecture du journal.
3. **Noter aussi la réponse donnée et la durée.** Elles permettraient des analyses plus fines
   (erreurs fréquentes, hésitation). Mais la réponse tapée est précisément ce que l'ADR-0007 refuse
   de collecter, et la durée dit des choses d'une personne (son rythme, ses interruptions) que le
   lot n'utilise pas.

## Décision

**Option 2, dans `resultat`** : `resultat: { juste, mode? }`, le mode facultatif. Les neuf modes
disent le geste et non l'onglet : `retournee`, `saisie`, `corrigee`, `choix`, `assemblage`,
`pointage`, `association`, `montree`, `lecture` (`MODES_DE_REPONSE`, dans
`src/domaine/journal/evenement.ts`).

- **Rien d'autre** : ni la réponse donnée, ni la durée. Le texte saisi n'entre jamais dans un
  événement, comme avant (ADR-0007).
- **Un schéma toujours strict.** Le mode est une énumération fermée : un mode inconnu refuse
  l'événement, comme toute autre clé. Le résultat d'un examen n'en porte pas : une réponse d'examen
  porte le mode de sa question, dans son propre événement de réponse.
- **`v` reste à 1.** Un autre `v` serait refusé par le serveur d'avant, alors que la clé est
  facultative et que tout événement d'avant reste valide sans elle.
- **Deux versions** (invariant 8). La version N accepte : le serveur et le domaine valident un
  `mode` facultatif, et le client n'en envoie pas. La version N+1 émet : le client note le mode de
  chaque réponse, et la notice change.
- **Le seuil du retour arrière.** Dès qu'un client de la version N+1 a pu émettre, le serveur ne
  redescend plus sous la version N : un serveur d'avant refuserait le lot, et la file du cours
  resterait bloquée, sans perte, jusqu'au retour d'un serveur qui accepte. Tant que la version N+1
  n'est pas en ligne, le retour arrière reste libre.
- **La notice change à la version qui émet**, pas avant : elle décrit ce que l'application fait. Elle
  dit, en français et en allemand, que le journal note aussi la manière de répondre, que les
  réponses servent à des statistiques d'ensemble pour régler l'application, et qu'avec l'accord de
  la personne le responsable suit sa progression. Les personnes sont prévenues du changement avant
  l'étiquette de la version N+1, comme l'ADR-0007 le demande.

## Conséquences

- **Le journal garde une donnée de plus par réponse**, qui ne nomme personne et ne dit rien de ce qui
  a été répondu. L'export d'une personne la rend avec le reste (ADR-0007 §2), et la suppression d'un
  compte l'efface avec son journal.
- **Les réponses d'avant restent sans mode**, et les outils du lot les traitent comme telles : un
  ajustement ou un rapport ne prête pas un mode à une réponse qui n'en a pas.
- **Aucune migration ni colonne.** Le dépôt range et relit `resultat` en JSON tel quel ; seuls des
  tests le prouvent (`routes-journal.test.ts`, `export.test.ts`, `journal-local.test.ts`).
- **Ce qui reste interdit** : la réponse donnée et la durée. Les ajouter est une nouvelle décision, un
  nouvel ADR, une notice changée et des personnes prévenues.
- **Difficile à changer** :
  - la liste des modes : un mode retiré rendrait invalide, pour un serveur d'après, un événement déjà
    rangé ; un mode ajouté ne passe que par une version qui l'accepte avant qu'un client l'émette ;
  - le seuil du retour arrière, une fois la version N+1 en ligne ;
  - la promesse de la notice : elle dit ce que le journal garde.

## Révision

À rouvrir si un geste nouveau d'un onglet ne rentre dans aucun des neuf modes, si l'ajustement montre
que le mode ne sépare pas des réponses de nature différente, ou si l'on veut noter la réponse donnée
ou la durée.
