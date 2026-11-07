# Lot F1 — décisions et arbitrages

Le lot F1 (issue ancrage-donnees#90, milestone « Les fiches de la semaine ») fait entrer dans ancrage les fiches
d'exercices de chaque Unit, les « Arbeitsblätter ». L'apprenante les reçoit chaque semaine. Elles reprennent
le format de l'examen de module de la formation.

Ce que le lot a livré :
- **un type de module de contenu `feuille`**, avec sept genres de tâche : appariement, classement,
  QCM, vrai/faux, texte à trous, orthographe et question ouverte ;
- **un onglet « Arbeitsblätter »** : la liste des fiches et leur score, le déroulé dans l'ordre du
  papier, et « Fehler wiederholen » ;
- **l'appariement et le classement** par un vrai glisser-déposer au doigt, et en « toucher puis
  toucher » pour le clavier et le lecteur d'écran ;
- **la Unit 1**, passée de « Grammatik » à sa feuille, avec ses identifiants ;
- **le Quiz et la Prüfung**, qui tirent aussi des fiches ;
- **deux points de ancrage-donnees#79** : le contenu servi en liste blanche, et la garde de `resoudreModule` ;
- **la compétence `/feuille`**, pour transcrire la fiche de chaque semaine.

Le plan a été supprimé à la clôture, comme le veut la méthode. Ce document garde, avec leurs
numéros, ce à quoi le code et les tests renvoient :
- les décisions du plan (« F1-D<n> ») ;
- les arbitrages faits pendant l'exécution (« F1-R<n> », souvent cités « R<n> » dans les commits et
  les PR).

**Le comportement, lui, est fixé par le code et les tests.**

La spécification est l'issue ancrage-donnees#90 : son corps, et son commentaire « Cadrage du 23/10/2026 », qui
donne les sources lues, les décisions d'Edouard et le design approuvé.

## Les décisions du plan (23/10/2026)

1. **F1-D1, les noms.**
   - Le type de module est `feuille`, l'onglet `feuilles`, l'adresse `/cours/<id>/feuilles`. Le
     libellé est « Arbeitsblätter ».
   - Les genres sont `appariement`, `classement`, `qcm`, `vrai-faux`, `trous`, `orthographe` et
     `ouverte`.
   - L'onglet se place entre « Grammatik » et « Prüfung ».
2. **F1-D2, les statuts.** Une tâche a un identifiant, mais pas de statut. Chaque élément a son
   identifiant, et peut surcharger le statut de la feuille.
3. **F1-D3, la dernière réponse.** Elle se dérive du journal (`dernieresReponses`), dans l'ordre
   de `etatsDesUnites`.
   - Le score d'une fiche est le nombre de ses éléments dont la dernière réponse est juste.
   - Une réponse donnée dans le Quiz ou la Prüfung compte aussi pour la fiche.
4. **F1-D4, les comparaisons.**
   - Orthographe : la casse et les accents comptent.
   - Trou sans liste : `canonique`, qui confond c, k et z. Ainsi, « c » est jugé juste pour une
     phrase à trou sur la prononciation de la lettre c, dont la réponse est une autre lettre de même
     son (voir F1-R19).
   - Trou avec liste, et tout choix : égalité exacte.
5. **F1-D5, les trous.**
   - La marque d'un trou est `___`.
   - Une phrase est un seul élément du journal. Elle est juste si tous ses trous le sont, jugés trou
     par trou, dans l'ordre.
   - La Prüfung ne tire que les phrases à un trou.
6. **F1-D6, `tirage.feuille`.**
   - Il est obligatoire dans `examen.yaml` (`exercice ≤ feuille ≤ 1`), et facultatif dans la forme
     servie.
   - Absent, il vaut `exercice` : la Prüfung ne tire alors aucune question de fiche.
7. **F1-D7, le vrai/faux.** Le domaine dit `vrai` et `faux`, le client affiche « Richtig » et
   « Falsch ».
8. **F1-D8, `main` reste livrable à chaque PR.** Aucune feuille n'est entrée dans le contenu réel
   avant que tous les genres de la Unit 1 s'affichent (ancrage-donnees#101).
9. **F1-D9, la Unit 1 garde ses identifiants.** 74 des 75 exercices de la famille `unit-1` (ancrage-donnees#95)
   sont devenus des éléments de la feuille. Un identifiant est marqué `retiré`.
10. **F1-D10, pas de préférence stockée pour l'onglet.** Son état vit dans
    `useEtatDOnglet('feuilles')`.
11. **F1-D11, une tâche d'un genre inconnu** est ignorée par la vue, par le score et par la
    Prüfung. La forme servie la laisse passer.
12. **F1-D12, l'onglet « Fortschritt » ne change pas.** L'aperçu gagne une ligne
    « Arbeitsblätter ».

## Les arbitrages de l'exécution (23/10/2026)

L'exécution s'est faite par sous-agents : une PR par palier, une revue par tâche, puis une revue
finale. À la demande d'Edouard, la session a fusionné elle-même chaque PR.

- **F1-R1** : l'aiguillage par genre de l'onglet porte une garde `never`. Les genres pas encore
  écrits y avaient un `case` explicite, qui sautait la tâche.
- **F1-R2** : `/feuille` sur la Unit 2 (tâche 14) attend l'export de la Unit 2, corrigée en classe
  le 28/10/2026. La revue finale a porté sur les tâches 1 à 13.
- **F1-R3** : le test « liste blanche = liste noire » sur le cours réel vit côté serveur
  (`terminologie.test.ts`), car un test du domaine n'importe pas une fixture du serveur.
- **F1-R4, F1-R5, F1-R7** : des tâches liées sont parties ensemble, chaque paire en une seule
  dispatch : 1 et 2, 3 et 4, 6 et 7. Pour 3 et 4, c'était obligatoire : ajouter le type casse les
  gardes `never` que la tâche 4 remplit.
- **F1-R6** : le contrôle « orthographe identique » de l'analyse compare comme le jugement
  (`egalOrthographe`).
- **F1-R8** : « 1 Arbeitsblatt » au singulier (`apercu_feuille_une`).
- **F1-R9** : remplacé par F1-R15.
- **F1-R10** : la barre d'onglets mesure par `getBoundingClientRect`, et arrondit vers
  l'extérieur. Avec dix onglets, « Fortschritt » dépassait de 0,52 px.
- **F1-R11** : chaque consigne commence par le numéro et le titre du papier (« Aufgabe n:
  <titre du papier>. … »), car l'apprenante compare avec la correction de classe. Le compteur dit
  « Schritt n von N », pour ne pas se confondre avec ces numéros.
- **F1-R12, limite connue** : une phrase à deux trous dont les réponses se donnent dans un ordre
  libre attend la première langue, puis la seconde. L'ordre inverse, juste lui aussi, est compté
  faux. La solution du papier donne l'ordre inverse de celui du contenu, et l'élément est
  « à vérifier ». Piste : des trous à l'ordre libre.
- **F1-R13** : trois réponses modèles de la partie D ont été corrigées. Le plus important : un
  exemple de la réponse modèle était trompeur, puisque dans ce cours le terme cité désigne aussi
  un second organe.
- **F1-R14** : un commit écrit par un sous-agent Sonnet le nomme dans sa ligne Co-Authored-By.
- **F1-R15** (remplace F1-R9) : l'aperçu affiche le même score que l'onglet (F1-D3).
- **F1-R16** : « Prüfen » reste inactif tant qu'une case, un champ ou un mot de la tâche est vide.
  Une saisie vide n'est jamais enregistrée.
- **F1-R17** : chaque élément s'enregistre dès qu'il est jugé. Le plan voulait un enregistrement en
  fin de tâche : une sortie en cours de tâche perdait alors les réponses déjà vues.
- **F1-R18** : une seule taxonomie des éléments tirables, dans `src/domaine/seances/feuilles.ts`
  (muté). Le Quiz et la Prüfung la partagent.
- **F1-R19, limite connue** : un trou sans liste se juge en `canonique`, qui confond c, k et z.
  Ainsi « c » est accepté pour une phrase à trou sur la prononciation de la lettre c, dont la
  réponse est une autre lettre de même son. Donner une liste à cette tâche s'écarterait du papier.
  Piste : une comparaison exacte, trou par trou.
- **F1-R20** (après la clôture, 24/10/2026) : une fiche entamée se reprend par « Weitermachen », qui
  ne déroule que les éléments jamais répondus (le journal, F1-D3), puisque le déroulé ne survit ni à
  « Zurück » ni au rechargement (F1-D10). « Neu beginnen » refait toute la fiche. Une fiche neuve
  garde « Bearbeiten » ; une fiche faite offre « Neu beginnen ». Une fiche entamée ou faite offre
  aussi « Fehler wiederholen » quand elle a une erreur.

La revue finale a conclu « With fixes » : quatre points importants, aucun critique. Les arbitrages
F1-R15 à F1-R18 en viennent, et ses corrections sont dans ancrage-donnees#104.

## Les mesures

Sur un Pixel 7 (412 × 839), pendant un glisser, la réserve et toutes les zones des tâches 1, 2 et 5
de la Unit 1 tiennent dans l'écran. Il n'y a donc pas de défilement automatique. À l'ouverture de
la tâche 1, il faut défiler d'environ 150 px pour voir ses dernières zones.

## Les suites

- **`/feuille` sur la Unit 2** (tâche 14), dès que son export est déposé.
- **Avant l'ouverture à la classe (ancrage-donnees#9)** : la relecture allemande des textes nouveaux de
  l'interface (ancrage-donnees#80).
- **Les remarques mineures des revues** qui restent ouvertes, à reprendre au prochain passage
  (ancrage-donnees#81) :
  - dans l'appariement et le classement, le verdict par terme et par zone ne se lit qu'à la
    couleur ;
  - l'extraction de `/feuille` : les diapositives sont numérotées par fichier et non dans l'ordre de
    la présentation, un PDF sans couche texte donne un texte vide, et les éléments imbriqués sont
    émis deux fois ;
  - `analyse.ts` dépasse 1000 lignes ;
  - un toucher de TalkBack peut être avalé une fois après un glisser au doigt ;
  - l'option « sens » du Quiz reste active sur « Arbeitsblätter ».
- **Les lots suivants de la milestone** : F2 (ancrage-donnees#91, le quiz calibré), la réflexion « signaler »
  (ancrage-donnees#92), les Units 7 à 22 (ancrage-donnees#93).
