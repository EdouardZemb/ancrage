# Lot F3 — décisions et arbitrages

Le lot F3 (issue ancrage-donnees#175, milestone « Les fiches de la semaine ») répond à une remarque de
l'apprenante. Dans l'onglet « Arbeitsblätter », elle ne retrouvait pas ses résultats passés d'une
fiche. La liste ne montrait qu'un score, et le bilan d'un déroulé disparaissait au « Zurück ».

Le lot a livré :
- **la mutation en deux groupes** (ancrage-donnees#178), `domaine` et `serveur`, en parallèle. Le job le plus
  long passe de 18 min 41 s à 10 min 29 s, pour un délai de 20 minutes (ancrage-donnees#156) ;
- **le domaine** (ancrage-donnees#179) : `dernieresReponsesDatees` et `resultatsDeFeuille`, dans
  `src/domaine/feuilles/deroulement.ts`. `dernieresReponses` en devient la projection ;
- **la vue « Ergebnis »** (ancrage-donnees#180), `src/client/cours/feuilles/ErgebnisDeFeuille.tsx`. Elle est en
  lecture seule, et la liste l'ouvre par un bouton sur toute fiche entamée ou faite ;
- **la revue finale** (ancrage-donnees#181) : un second « Zurück » en bas de la vue, la classe `loesung`, des
  tests plus serrés, et l'en-tête de `Feuilles.tsx` corrigé.

Rien de nouveau n'est gardé. L'API, le journal, IndexedDB et la notice ne changent pas : la vue lit
le journal que le téléphone a déjà, hors ligne compris.

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« F3-D<n> ») ;
- les arbitrages faits pendant l'exécution (« F3-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** La spécification est l'issue ancrage-donnees#175. Le nom « F3 » paraît aussi dans
`src/domaine/journal/temps.test.ts`, pour un autre sujet : ce lot n'emploie que « F3-D<n> » et
« F3-R<n> ».

## Les décisions du plan (03-04/11/2026)

Le 03/11/2026, Edouard a pris les défauts du cadrage : la vue d'abord, puis la spec de F4 (ancrage-donnees#176),
puis F2 (ancrage-donnees#91). Le 04/11/2026, il a validé le plan (ancrage-donnees#177) avec les défauts de ses quatre
questions :
- la mutation en deux groupes, en premier dans le lot ;
- la date en AAAA-MM-JJ ;
- les textes allemands tels quels, puis relus avec ancrage-donnees#80 ;
- l'exécution par sous-agents.

1. **F3-D1, le périmètre** : celui de ancrage-donnees#175. Restent hors du lot :
   - la liste des passages, qui viendra avec F4 (ancrage-donnees#176) ;
   - ce que la personne avait répondu, que le journal ne garde pas (ADR-0007) ;
   - le trou fautif d'une phrase à plusieurs trous, car le journal juge la phrase entière (F1-D5) ;
   - séparer les réponses de la fiche de celles du Quiz et de la Prüfung ;
   - le Fortschritt et l'Übersicht (F1-D12), ancrage-donnees#106, et le bouton « signaler » (ancrage-donnees#92) ;
   - « Fehler wiederholen » depuis la vue, que la liste et le bilan offrent déjà.
2. **F3-D2, la dérivation, dans `deroulement.ts`**, un fichier déjà muté :
   - `dernieresReponsesDatees` refait la boucle de `dernieresReponses`. Elle part de
     `journalSansDoublon`, où le premier événement d'un `id` fait foi, et écarte les examens. La
     dernière réponse dans l'ordre du journal l'emporte, par l'instant puis par l'`id`. La fonction
     garde aussi `repondu_a` ;
   - `dernieresReponses` la projette, sans changer de signature. Le verdict, le score et l'état
     d'une fiche viennent donc du même parcours du journal ;
   - `resultatsDeFeuille` rend chaque tâche avec le titre de sa partie, dans l'ordre du papier.
     Chaque élément porte sa dernière réponse, ou `null` s'il n'a jamais été répondu. Une tâche
     sans élément disparaît, comme dans `tachesADerouler` : c'est le cas d'un genre inconnu
     (F1-D11).
3. **F3-D3, ce que la vue montre de chaque genre.** Chaque élément a une ligne : l'énoncé, puis
   « Lösung: … », puis le verdict.

   | Genre | Énoncé | Lösung |
   |---|---|---|
   | `appariement` | `terme` | `cible` |
   | `classement` | `terme` | `categorie` |
   | `qcm` | `question` | `reponse` |
   | `vrai-faux` | `affirmation` | « Richtig » ou « Falsch », puis `correction` en dessous, s'il y en a une |
   | `trous` | `texte`, avec ses `___` | `reponses`, jointes par « · », dans l'ordre des trous |
   | `orthographe` | `fautif` | `reponse` |
   | `ouverte` | `question` | `reponse`, la réponse modèle |

   Le libellé « Lösung: » lève l'ambiguïté du vrai/faux. Une ligne peut dire « Lösung: Falsch »,
   puis donner le verdict « Richtig · … ».
4. **F3-D4, le verdict.** Il se dit en texte, dans une pastille, et la couleur ne fait que le
   doubler : « Richtig · {datum} » (`.pill.ok`), « Falsch · {datum} » (`.pill.ko`), « Noch nicht
   beantwortet » (`.pill.offen`).
   - Une tâche `ouverte` dit, sous sa consigne, que son verdict vient de la personne elle-même.
   - La vue dit une fois que les réponses du Quiz et de la Prüfung comptent (F1-D3).
5. **F3-D5, la date** : le jour de la dernière réponse, `jourDe(reponduA)`, au format AAAA-MM-JJ.
   C'est le jour local de l'appareil qui a répondu, comme pour les examens du Fortschritt.
   - La vue n'emploie pas `formaterDate`, qui relit l'instant dans le fuseau du téléphone et ajoute
     l'heure.
   - Un format suisse, JJ.MM.AAAA, se ferait pour les deux écrans à la fois, dans un autre lot.
6. **F3-D6, l'état de l'écran.**
   - **La sous-clé.** L'écran vit sous `` `${CLE_FEUILLES}/ergebnis` `` (`CLE_ERGEBNIS`, dans
     `Feuilles.tsx`), de type `string | null` : l'`id` de la fiche affichée.
   - **Jamais une séance.** La clé n'a pas de prédicat de séance : la vue n'en est jamais une
     (2a-D3), et elle ne retient pas la mise à jour.
   - **Aucune collision.** « ergebnis » contient un i, qu'aucun identifiant de contenu n'a. La
     sous-clé ne croise donc jamais celle d'une tâche.
   - **Ouvrir et revenir.** Ouvrir la vue oublie `CLE_FEUILLES` et ses sous-clés, puis range
     l'`id`. « Zurück » appelle `ouvrir(null)`, qui oublie le tout.
   - **Après un détour.** La vue se retrouve après un changement d'onglet, comme le déroulé
     (F1-D10). Rien n'y est figé.
   - **Une fiche retirée.** Si le contenu n'a plus la fiche, la liste revient.
7. **F3-D7, le bouton** : « Ergebnis », en classe `ghost`, après les autres boutons de la ligne.
   - La liste l'offre quand la fiche n'est pas neuve.
   - Il n'entre pas dans `boutonsDeFeuille`, dont chaque bouton déroule la fiche : `ListeDesFeuilles`
     reçoit un rappel à part, `voir(feuille)`.
8. **F3-D8, les textes**, en allemand seulement, dans le bloc « Arbeitsblätter » de
   `textes-cours.ts` :
   - `feuilles_ergebnis` ;
   - `feuilles_ergebnis_hinweis` ;
   - `feuilles_ergebnis_selbst` ;
   - `feuilles_ergebnis_loesung` ;
   - `feuilles_ergebnis_richtig` ;
   - `feuilles_ergebnis_falsch` ;
   - `feuilles_ergebnis_offen`.

   Ils sont dans la liste de relecture d'Edouard (ancrage-donnees#80), textes 267 à 273.
9. **F3-D9, la durée de la mutation (ancrage-donnees#156)** : le job se fait en deux groupes parallèles.
   - Chaque groupe prend dans `stryker.config.json` les globs de son dossier, par
     `scripts/mutation-groupe.mjs`. La liste reste unique.
   - Chaque groupe est tenu à 90 %, ce qui est plus strict qu'un seuil global.
10. **F3-D10, la version** : F3 sort avec l'étiquette qui suit sa clôture, avec l'accord d'Edouard.
    C'est la `v0.11.0` si la `v0.10.0` des Units 2 et 3 est posée avant.

## Le relevé de la mutation (04/11/2026)

| PR | Groupe | Fichiers | Mutants | Score | Détail | Durée |
|---|---|---|---|---|---|---|
| ancrage-donnees#178 | domaine | 7 | 521 | 98,46 % | 506 tués, 5 délais, 8 survivants | 10 min 29 s |
| ancrage-donnees#178 | serveur | 4 | 253 | 98,02 % | 247 tués, 4 survivants, 1 sans couverture | 3 min 38 s |
| ancrage-donnees#179 | domaine | 7 | 532 | 98,11 % | 517 tués, 3 délais, 10 survivants | 9 min 36 s |

- À ancrage-donnees#178, les fichiers mutés n'avaient pas changé depuis ancrage-donnees#166 : 11 fichiers et 774 mutants, comme
  alors.
- À ancrage-donnees#179, `deroulement.ts` passe de 83 à 94 mutants, dont 92 tués.
  - Aucun mutant nouveau ne survit.
  - Les 2 survivants sont antérieurs au lot : la garde `never` de `garderLesElements`, en
    `ConditionalExpression` et `BlockStatement`.
- À ancrage-donnees#179, deux survivants de plus paraissent à `src/domaine/journal/evenement.ts:61`, en `Regex`.
  - Le lot ne touche pas ce fichier.
  - À ancrage-donnees#178, ces mutants comptaient comme délais dépassés : 5 délais, contre 3 à ancrage-donnees#179.
  - Leur sort dépend de la charge de la machine.
- Ni ancrage-donnees#180 ni ancrage-donnees#181 ne lancent la mutation : elles ne touchent aucun fichier muté.

## Les arbitrages de l'exécution (04/11/2026)

- **F3-R1, le script de groupe n'a pas de test unitaire.** Le plan le vérifiait en l'exécutant
  contre la configuration, puis contre une copie modifiée (`--config`). La CI le vérifie aussi par
  ses comptes de fichiers et de mutants.
  - Un glob qu'aucun groupe ne muterait sort en code 1, avec `::error::`.
  - Il en va de même d'un groupe inconnu ou vide, et d'une configuration illisible.
- **F3-R2, le script entre dans les `paths` du workflow** : il décide de ce qui est muté, comme
  `stryker.config.json`.
- **F3-R3, un échec du script arrête le job** (revue de la tâche 1). La première version écrivait
  `echo "fichiers=$(node …)"`.
  - Dans l'argument d'`echo`, le code de sortie du script se perdait, et le job aurait lancé
    Stryker avec une liste vide.
  - L'affectation se fait donc seule sur sa ligne, que `bash -e` arrête.
- **F3-R4, `resultatsDeFeuille` part de `tachesADerouler(feuille, 'tout', new Map())`**, puis lit
  les éléments de chaque tâche par `elementsDeTache`.
  - Le plan disait « sur `elementsDeTache` ». Partir du déroulé hérite de l'ordre du papier et du
    retrait des tâches sans élément, sans recopier `garderLesElements`.
  - En mode `'tout'`, le troisième argument ne sert pas.
- **F3-R5, le score de la vue se compte sur les résultats** : les éléments dont la dernière réponse
  est juste, sur leur total.
  - Il vaut celui de la liste par construction, et `ergebnis_compte_comme_la_liste` le tient.
  - Le journal n'est parcouru qu'une fois, sous `useMemo`.
- **F3-R6, le bout en bout attend la première liste `.cours .resultats`**, car la vue en a une par
  tâche : 15 pour la vraie Unit 1. `ongletDansLaMarge` mesure toujours toutes les listes.
- **F3-R7, la vague de la revue finale** (ancrage-donnees#181). La revue du lot entier n'a trouvé aucun constat
  critique ni important. Six points mineurs ont été corrigés :
  - **un second « Zurück » en bas de la vue** : les vraies fiches comptent de 80 à 93 éléments, et
    il fallait tout remonter pour revenir. Le bouton du haut garde le focus ;
  - **l'en-tête de `Feuilles.tsx`**, qui ne disait pas qu'une fiche faite offre aussi « Ergebnis » ;
  - **la classe `loesung`** sur la ligne « Lösung ». Le CSS ne vise plus qu'elle, et l'énoncé et la
    correction retrouvent leurs marges ;
  - **trois tests plus serrés** :
    - la liste de chaque exercice est nommée par sa consigne ;
    - « Ergebnis » est le dernier bouton ;
    - une réponse arrivée d'ailleurs change aussi la date.

## Les limites

- **La date** est le jour local de l'appareil qui a répondu, en AAAA-MM-JJ (F3-D5).
- **La vue ne dit pas ce que la personne avait répondu** (ADR-0007), ni quel trou d'une phrase
  était faux (F1-D5).
- **Un rechargement ou une mise à jour au retour** oublie la vue ouverte. Elle n'est pas une séance
  (F3-D6), et c'est voulu.
- **« Une réponse donnée ailleurs »**, c'est une réponse synchronisée depuis un autre appareil, ou
  donnée dans le Quiz ou la Prüfung avant de revenir à la vue. L'application ne montre qu'un onglet
  à la fois. La vue se dérive à chaque rendu et la montre aussitôt.
- **Le contraste des pastilles en mode clair** est sous 4,5:1 : environ 4,1:1 pour `.offen`, 3,8:1
  pour `.ok` et 4,3:1 pour `.ko`. Les deux dernières existaient avant le lot : c'est un défaut des
  jetons de couleur.
- **Les « ___ » d'un texte à trous** gardent leur forme dans la vue, que TalkBack lit mal. Le
  déroulé, lui, nomme chaque trou « Lücke n ».
- **Au retour à la liste**, le focus ne revient pas sur le bouton « Ergebnis ». Le déroulé fait de
  même.

## Les suites

- **Dans « Au prochain passage » (ancrage-donnees#156)** :
  - le contraste des pastilles, à corriger dans les jetons de couleur ;
  - le focus au retour à la liste ;
  - un nom accessible pour chaque trou de la vue ;
  - quatre remarques mineures des revues :
    - l'option inconnue du script de groupe ;
    - un journal de test dans le désordre pour `resultatsDeFeuille` ;
    - un commentaire sur le `new Map()` de F3-R4 ;
    - les branches `qcm` et `ouverte` de la vue, identiques.
- **👤 La vérification sur Android, au staging.**
- **👤 L'étiquette** (F3-D10), avec l'accord d'Edouard, puis un message court à l'apprenante.
- **La suite de la milestone** : la spec de F4 (ancrage-donnees#176), puis F2 (ancrage-donnees#91).
