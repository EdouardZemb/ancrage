# ADR-0004 — Progression : un journal de réponses auquel on ne fait qu'ajouter, synchronisé depuis le téléphone

- **Statut** : accepté le 2026-10-15 ; précisé le 2026-10-18 par l'ADR-0008 sur un seul point, le
  mécanisme du contenu hors-ligne
- **Contexte amont** : brief §2 point 7 (hors-ligne, synchronisation), §6 (FSRS plus tard)

## Contexte

Le prototype garde toute la progression d'une personne dans **un seul objet JSON** : boîtes
Leitner par carte, jours de révision, examens, scores par exercice. Il le réécrit en entier à
chaque sauvegarde. Si deux appareils sauvegardent, le dernier écrase l'autre et des révisions se
perdent. L'objet ne garde pas non plus l'historique des réponses. Or FSRS, envisagé pour plus
tard, en a besoin.

L'usage principal est la révision dans les transports, donc souvent sans réseau.

## Options

- **A. Un document d'état par personne et par cours**, réécrit à chaque fois, comme le
  prototype. Simple, mais conflit entre appareils et aucun historique.
- **B. Un état par élément**, mis à jour par le serveur. Pas d'historique, et une fusion à
  inventer pour les modifications faites hors-ligne.
- **C. Un journal où l'on ne fait qu'ajouter.** Chaque réponse est un événement, et tout état en
  est dérivé. Pas de conflit possible (on fait l'union des événements), l'historique est complet,
  et le renvoi d'un même événement est sans effet. Coût : recalculer l'état, ce qui reste
  négligeable à cette échelle (quelques milliers d'événements par personne et par an).

## Décision

**Option C.**

- **Événement** :
  - champs remplis par le téléphone : `id` (UUIDv7 créé sur l'appareil), `cours`, `unite`,
    `type` (`reponse` ou `examen`), `resultat`, `repondu_a` (date de l'appareil avec son décalage
    horaire), `appareil` (identifiant aléatoire), `v` (version du format) ;
  - champs ajoutés par le serveur : `personne`, tirée de la session et jamais du message, et
    `recu_a`.
- **Ce qui n'est pas stocké** : le texte saisi par l'apprenant (minimisation, ADR-0007).
  L'apprentissage par l'erreur pourra rouvrir la question (`docs/pistes.md`).
- **Serveur** :
  - un envoi par lots, où un `id` déjà connu est ignoré ;
  - une lecture « depuis tel curseur » pour récupérer ce qu'un autre appareil a envoyé.
- **Téléphone** :
  - IndexedDB garde une file d'envoi et la copie locale des événements ;
  - l'état est recalculé par des fonctions pures du domaine. Les événements sont triés par
    `repondu_a` puis par `id`.
  - La file d'envoi est rattachée à une personne : elle n'est envoyée que sous sa session.
- **Règles reprises du prototype** :
  - intervalles de 0, 1, 2, 4, 8 et 16 jours ;
  - 15 nouvelles cartes par séance ;
  - une erreur renvoie en boîte 1, à revoir le jour même.

  Les séries de jours et les statistiques se dérivent du journal. Un examen blanc produit un
  événement résumé : score et note.
- **Préférences** (chapitre choisi, sens, mode) : elles restent propres à chaque appareil à
  l'étape 1.
- **Hors-ligne** :
  - Le service worker met en cache l'application et le contenu des cours autorisés (ADR-0001).
  - Tout fonctionne sans réseau, sauf trois choses : accepter une invitation, se connecter, et
    recevoir un contenu mis à jour.
  - La synchronisation se fait au démarrage, au retour du réseau et en fin de séance. Sur
    Android, la synchronisation en arrière-plan prend le relais quand elle est disponible.
- **Session expirée hors-ligne** : on continue à réviser. Au retour du réseau, l'application
  demande de se reconnecter sans perdre la file d'envoi.
- **Déconnexion** : elle tente d'abord une synchronisation, puis vide le cache et IndexedDB.

## Conséquences

- **FSRS plus tard** : il suffira de rejouer le journal avec un autre algorithme, sans rien
  perdre. Le choix pourra même se faire cours par cours.
- **Coût** : la route de synchronisation, la file d'envoi locale, et le portage des fonctions de
  calcul du prototype. Un test fait réviser deux appareils hors-ligne puis les synchronise ; ils
  doivent aboutir au même état.
- **Limite assumée** : une horloge de téléphone fausse donne des échéances fausses. `recu_a` sert
  au diagnostic.
- **Difficile à changer** : le format des événements, qui n'évolue que par ajouts sous `v`, et le
  principe que tout état est dérivé.

## Révision

À rouvrir si le recalcul devient lent. On ajouterait alors des instantanés, sans changer le
journal.
