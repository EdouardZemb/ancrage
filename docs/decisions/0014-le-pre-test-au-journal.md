# ADR-0014 — Le pré-test au journal : un mode à lui, que rien de ce qui se dérive ne compte

- **Statut** : accepté le 2026-11-15
- **Contexte amont** : issue 30 du dépôt (`ancrage#30`, lot M4, partie B) ; ADR-0004 (le journal, auquel
  on ne fait qu'ajouter) ; ADR-0007 (ce que l'application collecte, et sa « Difficile à changer ») ;
  ADR-0013 (le mode d'une réponse, qu'il précise). Il déroge à un point de l'ADR-0013, « le geste et
  non l'onglet », expliqué plus bas.

## Contexte

- **Ce que l'issue demande.** Trois jours avant l'ouverture d'une étape du planning, « Heute » propose
  un pré-test de cinq questions sur ses cartes : l'apprenante répond avant d'avoir appris. L'effet de
  pré-test est connu : voir une question avant d'en apprendre la réponse fait mieux retenir cette
  réponse ensuite, même quand la réponse donnée était fausse. Les réponses vont au journal « sous un
  mode à elles ».
- **Ce que le journal sait déjà.** Une réponse porte un mode, qui dit le geste (ADR-0013) : `retournee`,
  `saisie`, `choix`… Le mode est une énumération fermée, et le schéma d'un événement est strict.
- **Le risque.** Tout ce qui se dérive du journal prend une réponse pour une révision : Leitner la met
  en boîte 1 ou la monte, FSRS la rejoue, la série et les découvertes du jour la comptent, le rapport
  de suivi et l'ajustement des paramètres la prennent pour une mesure. Or une réponse donnée avant
  d'avoir appris n'est pas une révision : une faute y est attendue, et ne rend rien dû ; une réponse
  juste n'apprend rien à l'ordonnanceur. Si le journal la mêle aux autres, une carte pré-testée
  cesserait d'être neuve, et les statistiques mesureraient autre chose que la mémoire.
- **La contrainte de format.** Comme pour le mode (ADR-0013), un serveur d'une version précédente
  refuse un lot dont une réponse porte un mode qu'il ne connaît pas, et le lot entier est alors
  refusé.

## Options

1. **Un dixième mode, `pretest`**, dans `resultat: { juste, mode: 'pretest' }`, sur l'unité directe de
   la carte posée, `type: 'reponse'`. Aucune colonne, aucune migration : `resultat` est un JSON que le
   dépôt, l'export et la relecture recopient tel quel.
2. **Un `type` nouveau.** Un client d'avant ignorerait de lui-même ce qu'il ne connaît pas, mais le
   format de l'ADR-0004 change, ainsi que chaque lieu qui distingue une réponse d'un examen.
3. **Un champ à côté du mode.** Même coût de validation qu'un mode, et deux champs qui disent
   presque la même chose.
4. **Ne rien écrire au journal.** Aucune notice à changer, mais « Heute » ne saurait plus qu'un
   pré-test a été fait, et l'état n'a pas d'autre mémoire admise (invariant 5).

## Décision

**Option 1.** `pretest` est le dixième mode : `MODES_DE_REPONSE` vaut les neuf gestes
(`MODES_DE_REVISION`) puis `MODE_PRETEST` (`src/domaine/journal/evenement.ts`).

- **Une seule règle, en un seul lieu : rien de ce qui se dérive du journal ne compte une réponse de
  pré-test.** `journalDesRevisions` (`src/domaine/progression/etat.ts`) rend le journal sans doublon
  et sans elles ; l'état de Leitner, FSRS, la projection et l'ajustement, les découvertes du jour et
  les réponses par jour (donc la série et l'activité) le lisent. Il s'ensuit qu'une carte pré-testée
  reste neuve, dans Karteikarten comme dans « Heute », et que sa première vraie réponse est sa
  découverte. Le rapport de suivi ne la met dans aucune case, et l'ajustement la compte parmi les
  réponses écartées.
- **Ce qui la compte, parce que c'est le journal tout entier** : le départ du planning (tout
  événement), l'export, la suppression et la purge d'un compte, et le pré-test lui-même, qui lit
  dans le journal s'il est fait.
- **Il déroge à « le geste et non l'onglet » (ADR-0013).** `pretest` nomme un moment, avant
  d'avoir appris, et non un geste. La dérogation ne perd rien : le pré-test se pose toujours en choix
  parmi des propositions, au sens direct de la carte, si bien que son mode dit aussi son geste.
- **Deux versions** (invariant 8, comme l'ADR-0013). La version N accepte : le serveur, le domaine et le
  client valident `pretest` et toute dérivation l'ignore ; aucun écran ne l'émet. La version N+1
  émet : le pré-test, son écran, l'envoi du mode, et la notice, qui dit le mode nouveau. N+1 ne se
  pose qu'une fois N en service en prod.
- **`v` reste à 1**, le mode reste facultatif, et rien d'autre n'entre dans l'événement : ni la
  réponse donnée, ni la durée.

## Conséquences

- **Un appareil d'avant la version N** (l'application précachée d'avant, jusqu'à sa mise à jour
  au prochain lancement, retour ou navigation) range une réponse de pré-test sans la valider, et son
  rejeu la compte comme une réponse ordinaire : un pré-test raté met la carte en boîte 1, due le jour
  même. Rien ne casse, et l'appareil n'écrit rien de faux.
- **Le seuil du retour arrière.** Une fois la version N+1 en ligne, le serveur ne redescend plus sous
  la version N : un serveur d'avant refuserait tout lot qui porte `pretest`, et la file resterait
  entière, sans perte, jusqu'au retour d'un serveur qui accepte. Sous la version N, l'application
  remise en service compterait en plus chaque réponse de pré-test comme une réponse ordinaire. Le
  retour arrière revient au dernier couple déployé avant le courant : N+1 ne se pose donc qu'une fois
  N en service en prod, pour que ce retour revienne à N (`docs/exploitation.md`, « Revenir en
  arrière »).
- **La notice change à la version N+1**, pas avant : elle décrit ce que l'application fait. Les
  personnes sont prévenues avant l'étiquette (ADR-0007).
- **L'export d'une personne** rend ses réponses de pré-test avec leur mode, comme toute réponse
  (ADR-0007, § 2) ; la suppression de son compte les efface avec son journal.
- **Aucune migration ni colonne.** Seuls des tests le prouvent (`routes-journal.test.ts`,
  `export.test.ts`).
- **Les outils du poste** : le rapport de suivi n'a pas de case `pretest`, et l'ajustement écarte
  les pré-tests et les compte parmi les réponses écartées.
- **Difficile à changer** :
  - la valeur `pretest` : retirée, elle rendrait invalide, pour un serveur d'après, un événement
    déjà rangé ;
  - la règle qu'aucune dérivation ne la compte : la lever changerait l'état de chaque carte
    pré-testée, rejoué à chaque lecture du journal ;
  - le seuil du retour arrière, une fois la version N+1 en ligne.

## Révision

À rouvrir si le pré-test change de forme (une question hors du choix, un sens inverse), si un
lecteur du journal doit compter une réponse de pré-test, ou si une mesure montre que le pré-test ne
change rien à ce que l'apprenante retient.
