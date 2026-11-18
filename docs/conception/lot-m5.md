# Lot M5 : la réponse écrite sur une carte (ancrage#33)

Le lot M5 (issue ancrage#33, milestone « Le parcours et la mémoire ») finit la réponse écrite sur
une carte : une faute de frappe est tolérée et signalée, le tréma écrit « ue » est admis, le cours
choisit la pose de ses cartes dans son manifeste, et « Heute » laisse revenir à la carte retournée
pour une séance. C'est le cinquième lot de la suite ouverte par ancrage-donnees#106, après le moteur
(M1), la séance du jour (M2), la mémoire d'un cours réel (M3) et le planning (M4).

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde les décisions,
avec leurs numéros, parce que le code y renvoie : « M5-D<n> ». **Le comportement, lui, est fixé par
le code et les tests.** Les formes écrites sont dans `docs/format-des-contenus.md` (« La pose des
cartes »).

## Le constat de départ

L'essentiel de l'issue existait depuis le prototype : sur le sens « définition vers terme » (l'unité
inverse), la carte se pose avec un champ, la saisie est cochée par défaut sur chaque appareil,
« Heute » la pose de même, la bonne réponse s'affiche après la saisie, « Meine Antwort war auch
richtig » corrige le verdict, et le journal dit `saisie` ou `corrigee`. Le sens direct, aux longues
définitions, reste en carte retournée. Le lot n'a donc ajouté aucun mode au journal, et rien n'y
attend une version de plus (invariant 8). Il a ajouté trois choses : la tolérance de la faute de
frappe et du tréma, la clé `pose_des_cartes`, et le lien de « Heute ».

## Les décisions

D'après les défauts du cadrage, accordés par Edouard le 17/11/2026, et la revue du plan. Elles sont
dites d'après le code à la tête du lot.

- **M5-D1.** Une saisie à une lettre d'une réponse admise d'au moins six caractères (une lettre
  changée, en trop ou en moins : distance de Levenshtein de 1) est comptée juste, et l'écran le
  signale. Deux lettres échangées valent 2 : elles gardent le jugement d'avant, faux, et « Fast »
  seulement quand la saisie dépasse neuf caractères (`LONGUEUR_TOLEREE`,
  `src/domaine/cartes/saisie.ts`).
- **M5-D2.** La tolérance ne joue pas quand la saisie est une réponse admise d'une carte de
  l'index du cours : deux termes voisins d'une lettre ne se confondent pas.
- **M5-D3.** Au journal, une faute tolérée est une réponse `saisie` juste : aucun mode nouveau.
- **M5-D4.** La Prüfung garde son jugement strict (`juger(…).juste`) : elle n'admet ni la faute de
  frappe, ni « ue » pour « ü », ni le tréma oublié.
- **M5-D5.** La clé facultative `pose_des_cartes` du manifeste vaut `ecrite` ou `retournee`. Absente,
  elle vaut `ecrite`. Elle donne la valeur de la case « Begriffe eintippen » tant que la personne
  n'a pas touché la case sur cet appareil ; ensuite, son choix l'emporte. Dans le cours servi, le
  champ est `unknown` et `poseDuCours` (`src/domaine/cours/servi.ts`) le lit : une valeur inconnue
  vaut `ecrite`, et le cours reste admis.
- **M5-D6.** Le choix de la case n'est gardé comme un choix que depuis ce lot (`saisieChoisie`,
  `src/client/cours/preferences.ts`). Une case décochée avant lui n'a pas de marque : elle reprend
  une fois la valeur du cours, et se décoche de nouveau d'un geste.
- **M5-D7.** Dans « Heute », sous une carte à saisir, un lien passe en cartes retournées, et un
  autre y revient (`heute/pose`, `src/client/cours/onglets/Heute.tsx`). Le choix vit dans la
  mémoire des onglets, à part de la séance : il tient d'une série à la suivante, ne touche pas la
  préférence, et se perd au rechargement. Chaque lien a sa `key`, pour que le focus ne reste pas sur
  le bouton réutilisé : Espace retourne la carte après le geste. Il complète M2-P4
  (`docs/conception/lot-m2.md`).
- **M5-D8.** « ue » tapé pour « ü » est admis, comme « ae » et « oe » le sont déjà. Le repli se fait
  dans le jugement de la carte (`plier`), pas dans `canonique` : les réponses admises et les
  instantanés ne changent pas.
- **M5-D9.** Après une faute tolérée, l'écran montre le recto de la carte, même si la saisie était
  proche d'une autre réponse admise de `reponses`.
- **M5-D10.** Un ou plusieurs trémas oubliés ou en trop sont comptés justes et signalés, quelle que
  soit la longueur, sous la garde de M5-D2. Pas sur une carte dont la saisie ou une réponse
  s'écrit avec « ae », « oe » ou « ue » (« a » pour « ae » confondrait deux formes latines), et sans
  cumul avec la faute de frappe.
- **M5-D11.** Une saisie juste qui n'est pas le recto (une autre réponse admise) s'affiche, non
  barrée, avant le recto.

## Le déroulement

- **PR 59** : le plan, avec les corrections de sa revue.
- **PR 60** : les quatre tâches (le jugement de la carte saisie, son signalement à l'écran, la pose
  des cartes dans le manifeste, le lien de « Heute »), avec les corrections des deux revues de
  tâche, de la revue finale et de sa relecture.
- **La PR de clôture** : ce document, `CLAUDE.md`, le registre.

Aucune étiquette n'est posée à la clôture : la version qui porte le lot est la prochaine `vX.Y.Z`,
à Edouard. La prod est en `v0.18.0`.

## Les écarts à la spec

Déclarés dans la PR 60, avec la promesse qu'ils touchent et l'accord d'Edouard.

- **La faute de frappe n'est tolérée qu'à partir de six caractères** (M5-D1). Accord du
  17/11/2026.
- **Elle ne joue pas quand la saisie est la réponse admise d'une autre carte** (M5-D2). Accord du
  17/11/2026.
- **Une fois la case « Begriffe eintippen » touchée, le choix de l'appareil l'emporte sur le
  manifeste et dure au-delà d'une séance**, et une case décochée avant le lot se recoche une fois
  (M5-D5, M5-D6). Accord du 18/11/2026.

La PR 60 avait d'abord écrit « Aucun. » : la revue finale a vu que ces décisions restreignaient des
critères de l'issue (`docs/registre.md`, LE-23).

## Les limites

- **Les deux tolérances ne se cumulent pas** : un tréma oublié et une lettre fausse dans la même
  saisie restent faux.
- **Le tréma oublié ne joue pas** sur une carte dont la saisie ou une réponse s'écrit avec « ae »,
  « oe » ou « ue ». Une réponse admise venue d'une autre carte à la même question n'est pas lue en
  brut pour ce digramme.
- **Une carte sans unité inverse n'est pas dans l'index**, donc ne protège pas son terme voisin
  (M5-D2).
- **M5-D2 ne compare qu'à l'identique** : une saisie à une lettre d'un terme de l'index, mais qui
  n'est pas ce terme, reste tolérée.
- **Après un retour arrière vers la version précédente**, la marque du choix de la case se perd :
  l'ancien client réécrit les préférences sans elle, et la case reprend la valeur du cours.
- **Le choix de « Heute » se perd au rechargement** (M5-D7), donc à une mise à jour.
- **Le focus après le lien de « Heute »** n'est prouvé que sous happy-dom.
- **Le cours de l'instance n'a rien à changer** : la clé absente vaut `ecrite`. Un cours monté ne
  reçoit `pose_des_cartes` qu'une version après celle qui porte le lot (le manifeste est strict).
- **Non vérifié à la clôture** : le téléphone Android, et l'allemand des trois textes nouveaux
  (`cartes_frappe`, `heute_retourner`, `heute_saisir`), qu'aucune personne germanophone n'a relus.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-22, un cadrage posé sans lire le code ; LE-23, des
  décisions de plan qui restreignent l'issue sans être déclarées comme écarts ; LE-24, une
  correction de revue qui ajoute une règle sans être pesée.
- **Dans « Au prochain passage » (ancrage#11)**, section « Les suites du lot M5 » : la liste y est.
- **La vérification sur Android et la mise en prod** : à Edouard, au staging d'abord, avant
  l'étiquette.
- **Parmi les lots suivants** : le rejeu d'une seule unité (ancrage#31).
