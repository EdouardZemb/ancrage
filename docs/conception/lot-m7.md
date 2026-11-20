# Lot M7 : le rapport de suivi mesure les reprises du jour (ancrage#64)

Le lot M7 (issue ancrage#64, milestone « Le parcours et la mémoire ») donne au rapport de suivi de
quoi juger ce que valent les réponses redonnées à un élément le jour même : leur réussite selon leur
rang dans la journée, selon les autres réponses qui les précèdent et selon leur mode ; combien de
fois un élément revient dans une journée ; et ce que devient, un autre jour, un élément repris après
une faute. La mesure servira à décider d'une règle de reprise, dans un lot à part. C'est le septième
lot de la suite ouverte par ancrage-donnees#106, après M1 à M6.

Son plan, à tâches, a été supprimé à la clôture, comme le veut la méthode. Ce document en garde le
cadrage et les décisions sous leurs libellés, parce que le code renvoie à « M7-D6 » et « M7-D14 » :
« M7-C<n> » (le cadrage) et « M7-D<n> » (les décisions). **Le comportement, lui, est fixé par le
code et les tests.** Le lot est un outil du poste, hors de l'image : rien ne change pour
l'apprenante, aucune étiquette n'est à poser, et la vérification sur un téléphone Android ne
s'applique pas (M7-C9, M7-D12). Rien de nouveau n'est gardé (invariant 5) : tout se dérive du
journal.

## Le cadrage

Accepté par Edouard le 18/11/2026 (« ok pour les défauts »).

- **M7-C1.** Une reprise est toute réponse à un élément déjà répondu le même jour local, comme la
  case « Redonnée le jour même », qui ne distingue pas ; chaque tableau sépare « après une faute »
  et « après une réponse juste » (la réponse d'avant de l'élément, ce jour-là).
- **M7-C2.** Le rang : première, deuxième, troisième, quatrième reprise et au-delà ; c'est le nombre
  de réponses déjà données ce jour-là à l'élément.
- **M7-C3.** La répartition compte des couples (élément, jour) selon leur nombre de reprises : 0, 1,
  2, 3, 4 et plus.
- **M7-C4.** L'espacement : le nombre d'autres réponses (du même journal, pré-test écarté) entre la
  réponse d'avant de l'élément et la reprise, en cinq classes : 0, 1 à 2, 3 à 5, 6 à 10, 11 et plus.
  Pas de classes en minutes.
- **M7-C5.** Un tableau de la réussite des reprises selon le mode de la reprise.
- **M7-C6.** Un ajout à l'issue, non un écart : l'effet au lendemain, la réussite à la première
  réponse d'un autre jour selon le nombre de reprises faites le jour d'une faute (M7-D3). Les
  moitiés de M7-C1 sont aussi un ajout.
- **M7-C7.** Rapport d'ensemble : les mêmes tableaux en pourcentages entiers, chaque case par
  `caseAdmise`, ni total ni ligne ou tuile qui soit une somme de cases (LE-26), « omis » sinon.
  Rapport d'une personne : des nombres.
- **M7-C8.** Un seul plan à tâches : PR de plan, PR d'implémentation, revue finale, PR de clôture.
- **M7-C9.** Aucune étiquette : outil du poste, hors de l'image.
- **M7-C10.** Hors périmètre : la règle de reprise de « Heute » et des onglets, et la projection du
  rapport, ne changent pas.

## Les décisions

- **M7-D1. Les définitions.**
  - Les réponses sont celles que le rapport compte déjà (`reponsesDe`) : ni doublon, ni pré-test
    (ADR-0014), ni mode inconnu de cette version, dans l'ordre du journal.
  - Un élément est une unité du journal : une carte et son sens inverse en font deux. Toutes les
    unités comptent, pas seulement celles que pose « Heute » ni celles du cours.
  - Le jour est le jour local de la réponse (`jourDe`).
  - Un couple (élément, jour) est une suite de réponses d'un élément dont chacune, sauf la
    première, a pour réponse d'avant de l'élément une réponse du même jour local. Une réponse dont
    la réponse d'avant est d'un autre jour ouvre un couple, même si ce jour a déjà été vu (un jour
    qui recule entre deux décalages horaires).
  - Une reprise est une réponse qui n'ouvre pas son couple : exactement celles que `delaiDe` range
    dans `meme-jour`. Un test tient l'accord.
  - Le rang est le nombre de réponses du couple avant la reprise (clés `rang-1` à
    `rang-4-et-plus`) ; l'espacement, l'écart des indices dans la liste des réponses moins un (clés
    `ecart-0` à `ecart-11-et-plus`) ; le mode, celui de la reprise (`CLES_DE_MODE`, `sans-mode`).
- **M7-D2. La répartition** compte des couples, pas des réponses : clés `reprises-0` à
  `reprises-4-et-plus`. Ses moitiés suivent le verdict de la première réponse du couple.
- **M7-D3. Après un jour de faute.** Un jour de faute est un couple qui porte une réponse fausse.
  Son nombre de reprises est celui des réponses du couple qui suivent sa première faute (clés
  `apres-faute-0` à `apres-faute-3-et-plus`). La réponse mesurée est la première du couple suivant
  de l'élément, donc la première réponse d'un autre jour, même plus ancien. Un jour de faute sans
  couple suivant, et un couple sans faute, ne comptent pas. Le délai jusqu'à cette réponse n'est pas
  mesuré : il suit l'ordonnanceur et l'assiduité. Ce tableau n'a pas de moitiés.
- **M7-D4. Les fichiers.** `cellules.ts` (`Cellule`, `CLES_DE_MODE`, `CLES_DE_DELAI`, les aides de
  cellule, réexportés par `mesures.ts`), `reprises.ts` (les clés, la forme, le suivi, la somme) et
  `reprises.fixture.ts`, dans `src/outillage/memoire/`. `Mesures` gagne `reprises`. Le rendu reste
  dans `rapport.ts`.
- **M7-D5. Une passe.** `mesures` crée un suivi (`suivreLesReprises`), lui passe chaque réponse avec
  son indice et son moment, et range le résultat dans `resultat.reprises`. Les réponses « d'un autre
  jour » sont comptées aussi par moment et par mode (`apresParMoment`, `apresParMode`), pour la
  porte de M7-D6.
- **M7-D6. Le rapport d'ensemble : des lignes qui couvrent tout, nommées par plage, et une promesse
  fermée.** C'est le risque principal du lot (LE-17, LE-26).
  - Chaque ligne affichée passe `caseAdmise`. Les tableaux ordonnés (rang, espacement, répartition,
    après un jour de faute) fondent une case refusée avec sa voisine par `regrouperLesBoites`, puis
    les groupes deviennent des plages sans trou (`regrouperEnPlages`), nommées par leurs bornes,
    jamais par la liste de leurs cases (« 3e reprise et au-delà », « de la 2e à la 3e reprise »,
    « Toutes les reprises »). Pour le mode, une case refusée se fond dans « Autres modes »
    (`couvrirLesModes`), qui ne dit pas quels modes elle réunit.
  - La forme d'un tableau à moitiés : ses deux moitiés si chacune passe la règle, sinon réuni si le
    tout la passe, sinon omis (la page dit « omis »). Jamais les deux formes ensemble. Le rang,
    l'espacement et le mode partagent la même forme (`formeDesReprises`). Ni compte, ni total, ni
    tuile : des pourcentages entiers.
  - **Ce qui est gardé, liste fermée.** (1) Chaque ligne affichée passe `caseAdmise`. (2) À
    l'intérieur d'un même tableau des reprises, les plages et « Autres modes » : les lignes
    partagent exactement les réponses du tableau ou de sa moitié, et le rang, l'espacement et le
    mode font de « Redonnée le jour même » leur réunion exacte. (3) La porte de croisement, dans ses
    deux sens, entre un tableau des reprises (le mode, ou l'après-faute) et un tableau de la section
    des moments et des modes (les moments, ou les modes), par réunions de lignes.
    - Sens direct : pour toute réunion V de lignes affichées du tableau de la section des moments et
      des modes, soit U la réunion des lignes affichées des reprises que V contient ; V - U est vide
      ou passe `caseAdmise`.
    - Sens inverse : pour toute réunion W de lignes affichées d'un même tableau des reprises, soit T
      la réunion des lignes d'un même tableau de la section des moments et des modes que W
      contient entièrement, personne par personne ; W - T est vide ou passe la règle.
    - Le lemme : pour toute partie S de ces lignes, X - S = (X - Y) union (Y - S), réunion disjointe
      d'un ensemble vide ou admis et de lignes admises, donc admise (une réunion de cases admises
      disjointes l'est).
    - Un mode des reprises ne s'affiche seul que si ce même mode s'affiche seul à la section des
      moments et des modes, sinon il rejoint « Autres modes ».
    - Si la règle échoue : si une ligne de l'après-faute est contenue dans la réunion qui échoue,
      tout ce tableau est omis, même quand le reste refusé vient des modes ; sinon le moins fourni
      des modes seuls rejoint « Autres modes » et on revérifie ; puis le tableau de l'après-faute,
      puis celui des modes, sont omis (la page dit qu'un croisement en est la raison). Au-delà de 12
      lignes pour le mode, on replie sans énumérer. En fin de repli, le tableau de l'après-faute
      omis est remis si la porte passe avec le tableau des modes final.
    - Le sens inverse énumère les réunions d'un seul tableau des reprises à la fois, pas leurs
      combinaisons : ce n'est pas une symétrie complète.
  - **Tout autre croisement n'est pas gardé** : une case refusée peut s'y retrouver, avec des
    effectifs que la page ne donne pas, sauf un 0 %, un 100 % ou des rapports de poids qu'elle
    laisse estimer. Exemples connus : (a) le rang, l'espacement et le mode des reprises entre eux
    (« Réponse tapée » moins « 4e reprise et au-delà » donne la 2e reprise, fondue dans une plage) ;
    (b) le rang ou l'espacement contre un mode ou un moment de la section des moments et des modes,
    autre que « Redonnée le jour même » ; (c) la répartition contre un autre tableau des reprises ;
    (d) une ligne des reprises ou de l'après-faute contre une ligne de moment rapprochée d'une ligne
    de mode (« Réponse tapée » moins « Réponse tapée » des reprises moins « boîte 2 » donne la
    boîte 1) ; (e) la réunion de lignes du mode des reprises et de l'effet au lendemain, contre une
    ligne de la section des modes.
  - La porte générale de LE-26, pour tout le rapport, reste à écrire (M7-D14).
- **M7-D7. Le rapport d'une personne** : les mêmes tableaux, toujours en deux moitiés, en nombres.
  Aucune règle de case : chaque case non vide a sa ligne. Une moitié sans reprise le dit et l'autre
  s'affiche ; le dernier tableau, vide, dit « Aucun jour de faute suivi d'une réponse un autre
  jour ».
- **M7-D8. La section** « Les reprises du jour » suit celle des moments et des modes. Ses cinq
  tableaux ont des titres de niveau 3 ; les libellés sont des constantes, sans texte du cours. Son
  texte ne cite pas le libellé « Redonnée le jour même » : un test existant veut ce libellé absent
  d'une page où la ligne est refusée. Les textes qui énumèrent les cases nomment la reprise et le
  couple.
- **M7-D9. Les tests.** Des journaux écrits à la main sur le cours d'exemple (`reponseDecalee`,
  `journeeDeMotifs`, `journauxAuxReprises(n)`) ; les assertions portent sur les noms exacts des
  lignes de `tablesDesReprises` ou sur le `<th>` exact de la page. Le test de structure recalcule
  les comptes depuis les mesures, sans lire `ligne.comptes`, et les deux sens de la porte.
- **M7-D10. La mutation.** `cellules.ts`, `reprises.ts` et le rendu restent hors de Stryker
  (`mutation-groupe.mjs` n'admet que `src/domaine/` et `src/serveur/`, et le job `mutation
  (domaine)` frôle sa limite, EM-3). Chaque valeur gardée par un test est éprouvée par un mutant
  posé à la main.
- **M7-D11. Les textes.** `docs/exploitation.md`, « Le rapport de suivi » ; la ligne
  `memoire:rapport` de `CLAUDE.md` ; la section « État » à la clôture.
- **M7-D12. Ni étiquette ni appareil** (M7-C9). `isolation.test.ts` tient que ni le serveur, ni le
  domaine, ni le client n'importent les outils de mémoire.
- **M7-D13. Les écarts** : voir plus bas.
- **M7-D14. La porte de LE-26.** La case de `rapport.ts` dans « Au prochain passage » (ancrage#11)
  demande un test qui refuse, dans tout le rapport d'ensemble, toute ligne ou tuile qui laisse
  obtenir une case refusée par différence. Le lot ne l'écrit pas pour tout le rapport : il applique
  la règle à ses propres tableaux (M7-D6), et le test de structure la tient. La case reste ouverte.
  Les boîtes ont encore le défaut de nom que M7-D6 corrige pour les reprises (« Jamais vus +
  Boîte 1 » liste les boîtes non vides d'un groupe) : une suite.

## Le déroulement

- **PR 69** : le plan, avec les corrections de sa revue.
- **PR 70** : l'implémentation (les mesures, la section, les textes). Trois passes de corrections
  ont eu lieu avant sa fusion, chacune rouvrant la même garantie : d'abord une case refusée
  obtenue par différence entre la section des reprises et celle des moments et des modes (une
  ligne à la fois),
  puis par une réunion de lignes, puis par le sens inverse. La promesse de M7-D6 est passée de «
  aucune case refusée ne s'obtient par différence » à la liste fermée ci-dessus.
- **PR 71** : les corrections de la revue finale, qui n'a trouvé aucun bloquant : le test du sens
  inverse « lendemain contre les moments », le plafond de 12 lignes, le choix des moitiés du sens
  inverse, et la remise du tableau de l'après-faute quand la porte passe avec les modes finals ; les
  textes alignés sur la porte.
- **La PR de clôture** : ce document, `CLAUDE.md`, le registre, la suppression du plan.

## Les écarts à la spec

Déclarés dans la PR 70, avec la promesse de l'issue qu'ils touchent. Accord d'Edouard du 19/11/2026
pour E1 à E5 ; la forme générale de E5 (« hors de la porte, aucun croisement n'est gardé ») a été
confirmée par Edouard le 20/11/2026. L'exemple (e), que la revue finale a trouvé après cet accord,
entre dans cette clause ; la PR de clôture le déclare.

- **E1, critère 2** : la répartition compte des couples (élément, jour), pas des éléments ; un
  élément répondu trois jours compte trois fois (M7-C3, M7-D2).
- **E2, critères 1, 2 et 3** : un élément est une unité du journal ; toutes les unités comptent ;
  les réponses sont celles que le rapport compte, sans pré-test, doublon ni mode inconnu (M7-D1).
- **E3, critères 1 à 4** : dans un rapport d'ensemble, des pourcentages entiers, sans compte ; une
  case refusée se fond en une plage ou dans « Autres modes » ; un tableau est omis quand même sa
  forme réunie ne passe pas la règle, ou quand un croisement avec les moments et les modes
  l'écarte (M7-D6).
- **E4, critères 1, 2 et 3** : dans un rapport d'ensemble, le rang, l'espacement, le mode et la
  répartition se donnent en deux moitiés quand les deux passent la règle, réunis sinon.
  Sous la forme réunie, l'espacement ne sépare plus les reprises qui suivent une faute : le
  critère 3 n'y est livré que mêlé aux reprises
  après une réponse juste. Il est livré tel quel par la moitié « après une faute », dans le rapport
  d'une personne et dans un rapport d'ensemble aux deux moitiés.
- **E5, critère 4** : hors de la porte de croisement de M7-D6, les croisements entre tableaux ne
  sont pas gardés dans un rapport d'ensemble ((a) à (e)) ; une case refusée s'y retrouve avec des
  effectifs que la page ne donne pas, sauf un 0 %, un 100 % ou des rapports de poids qu'elle laisse
  estimer.

L'effet au lendemain et les moitiés ne sont pas des écarts : ce sont des ajouts, dits comme tels.

## Les limites

- **Le rapport d'ensemble omet ou réunit la plupart des tableaux** dès que la règle de case les
  refuse : trois personnes, vingt réponses, aucune au-delà de 70 %.
- **Les croisements non gardés** (M7-D6, (a) à (e)), et la porte générale de LE-26 : pas écrite.
- **Le tableau des modes peut être omis seul**, comme celui de l'après-faute, par un croisement avec
  la section des moments et des modes ; la page le dit.
- **Le sens inverse est exponentiel** dans le nombre de lignes du mode (jusqu'à 2^12 - 1 réunions) ;
  au-delà de 12 lignes, la porte replie sans énumérer.
- **Le délai jusqu'à la réponse d'un autre jour n'est pas mesuré** (M7-D3).
- **Un mode absent**, sans ligne « Autres modes », vaut zéro pour chaque personne.
- **La projection du rapport et la règle de reprise de « Heute » ne changent pas** (M7-C10).

## Ce qui n'a pas été vérifié

- **Le rendu de la section dans un navigateur**, sur ordinateur ou sur téléphone : elle n'est
  vérifiée que par les tests sur le HTML.
- **Le rapport sur des journaux réels** : aucun journal réel n'a servi, ni pour écrire les tests ni
  pour juger la section.
- **Le temps de calcul de la porte près du plafond** de 12 lignes, sur un cours réel : le plus gros
  jeu de test (`journauxAuxReprises`) reste sous la seconde.
- **Le mutant presque équivalent « omettre toujours le lendemain d'abord »** : l'étape qui omet le
  lendemain dès qu'une de ses lignes est contenue dans la réunion qui échoue est tenue par des cas,
  mais le mutant qui l'applique sans condition survit : il ne diffère du code qu'en des cas
  qu'aucun test ne construit.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-28, une porte d'anonymat jugée ligne à ligne qui se
  contourne par une réunion de lignes, puis par le sens inverse (4e constat du mécanisme de LE-13,
  LE-17 et LE-26) ; LE-29, des valeurs gardées sans test ni mutant, trouvées encore à la revue
  finale. LE-23 et LE-27 (écarts à l'issue) ne reçoivent pas de ligne : le plan listait ses écarts,
  et la PR de clôture n'en a pas trouvé d'autre, mais l'exemple (e), trouvé par la revue finale
  après l'accord du 20/11/2026 sur la forme générale de E5, entre dans cette clause et la PR de
  clôture le déclare : leur critère de sortie reste à juger.
- **Dans « Au prochain passage » (ancrage#11)**, section « Les suites du lot M7 » : les croisements
  non gardés, la porte générale de LE-26 (déjà une case de M6), le sens inverse à énumérer sur les
  deux tableaux des reprises réunis, le défaut de nom des boîtes, le temps de calcul, le rendu, le
  rapport sur des journaux réels, le mutant presque équivalent, et les fichiers du rapport hors de
  Stryker.
- **Parmi les lots suivants de la milestone** : le rejeu d'une seule unité (ancrage#31), et la règle
  de reprise, que la mesure de ce lot doit éclairer.
