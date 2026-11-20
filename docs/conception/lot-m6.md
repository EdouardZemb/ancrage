# Lot M6 : les éléments rebelles (ancrage#32)

Le lot M6 (issue ancrage#32, milestone « Le parcours et la mémoire ») repère les éléments qu'une
personne rate encore et encore, d'après le journal seul. Un tel élément ne repasse qu'une fois par
jour dans « Heute », porte une marque, montre une aide tirée du contenu, et figure dans une liste
« à reprendre » de Fortschritt hors de toute séance. Le rapport de suivi les compte par chapitre.
C'est le sixième lot de la suite ouverte par ancrage-donnees#106, après le moteur (M1), la séance du
jour (M2), la mémoire d'un cours réel (M3), le planning (M4) et la réponse écrite sur une carte
(M5).

Son plan maître et ses deux plans de tranche ont été supprimés à la clôture, comme le veut la
méthode. Ce document en garde les décisions sous leurs libellés, parce que le code et la doc y
renvoient : « M6-C<n> » (le cadrage), « T1-D<n> » (la tranche 1) et « T2-D<n> » (la tranche 2).
**Le comportement, lui, est fixé par le code et les tests.** Les formes écrites sont dans
`docs/format-des-contenus.md` (« Les éléments rebelles » et « Module `cartes` »).

Rien de nouveau n'est gardé (invariant 5) : aucun mode nouveau au journal, et la notice ne change
pas. Le journal ne garde pas la réponse donnée (ADR-0007) : « confondu avec » ne vient que du
contenu, jamais d'une observation.

## La règle : un élément rebelle ne revient pas

Cette section est celle que citent `docs/conception/lot-m2.md` (M2-P3) et
`docs/conception/lot-m4.md` (C-D11).

La règle de M2-P3, « une faute revient une fois en fin de file », a une réserve depuis le lot M6 :
**un élément rebelle manqué ne revient pas**. Il sort de la file de « Heute », ne revient ni en fin
de ronde ni dans « Nächste Runde », et revient le lendemain. Elle tient en trois points.

- **Pour « Heute » seulement.** L'ordonnanceur ne change pas : un rebelle manqué reste dû toute la
  journée pour lui. C'est l'onglet qui écarte du jour les rebelles qui ont déjà une réponse
  aujourd'hui (hors pré-test), avant tout calcul de ce qui est dû (M6-C3, T2-D3). Une révision
  manquée à une étape de révision (M4) suit la même règle.
- **Aucun autre écran ne change** : Karteikarten, le Quiz, la Prüfung et les autres onglets posent
  un rebelle comme avant (T2-D4). Seul le compte « heute zu wiederholen » d'Übersicht, qui est celui
  de « Heute », retire les écartés.
- **La projection du rapport de suivi ne modélise pas cette règle** : elle ne simule pas les
  rebelles écartés du jour, et surestime d'autant la charge. La limite est dite dans la page et dans
  `docs/exploitation.md`.

## Le cadrage

Accepté par Edouard le 18/11/2026.

- **M6-C1.** Tout élément que pose « Heute » peut être rebelle : une carte (chaque sens à part), un
  mot, un point de schéma, un exercice, une question fermée de fiche.
- **M6-C2.** Le seuil est un nombre de fautes après le premier succès, réglable par la clé
  facultative `rebelles.fautes` du manifeste. Le cadrage le fixait à 4 par défaut, et T1-D1 de
  même ; T2-D1 l'a porté à **5**, d'après la mesure de M6-C8. Le défaut vaut 5 dans le code.
- **M6-C3.** « Une fois par séance du jour » veut dire une fois par jour : un rebelle manqué ne
  revient ni en fin de ronde ni dans « Nächste Runde ». Il revient le lendemain.
- **M6-C4.** L'aide s'affiche après la réponse, juste ou fausse, et toujours dans la liste.
- **M6-C5.** Une carte reçoit deux clés facultatives : `aide` (une phrase libre) et `confondu_avec`
  (l'identifiant d'une autre carte, dont on montre le recto et le verso). Les autres genres n'ont
  pas de clé nouvelle : on réemploie les morceaux du mot, la `regle` d'un exercice, la `correction`
  d'une affirmation et la `note` d'un schéma.
- **M6-C6.** La liste « à reprendre » remplace « Schwierige Karten » dans Fortschritt, pour tous
  les genres, avec la réponse et l'aide ; « Heute » y renvoie par un lien quand elle n'est pas
  vide.
- **M6-C7.** Trois réponses justes de suite sortent un élément de la liste, tous gestes confondus,
  Prüfung comprise, pré-test exclu. Ensuite, il ne redevient rebelle qu'en repassant le seuil.
- **M6-C8.** La mesure : la tranche 1 livre le calcul et la case du rapport. Edouard lance alors le
  rapport d'une personne sur une copie de la base de prod, avec la date de son accord. Le cadrage
  prévoyait qu'il ne rapporte à la session que le seuil retenu ; en fait, le rapport a été lu en
  conversation, à la demande d'Edouard et avec l'accord de la personne, qu'il a relayé. Aucun
  chiffre de la personne n'entre au dépôt : seul le seuil qui en découle, 5 par défaut (T2-D1).
- **M6-C9.** Le lot se fait en deux tranches d'implémentation : le calcul, la clé du manifeste et le
  rapport (PR 63) ; puis « Heute », la marque, l'aide et la liste (PR 66).
- **M6-C10.** La marque est une étiquette « schwierig » sur la question, dans « Heute » et dans les
  onglets.

## La tranche 1 : le calcul, la clé `rebelles` et le rapport

- **T1-D1.** La forme écrite, dans `cours.yaml` : `rebelles:` avec `fautes: <entier>`. `rebelles`
  est un objet strict ; `fautes` y est obligatoire, un entier de 2 à 20. Sans la clé, le seuil vaut
  le défaut (`FAUTES_PAR_DEFAUT`, 4 à la tranche 1, 5 depuis T2-D1).
- **T1-D2.** Une unité est celle du journal : une carte et son sens inverse sont deux unités
  (M6-C1).
- **T1-D3.** Le rejeu d'une unité lit ses verdicts dans l'ordre de `revuesDuJournal`, donc sans
  doublon ni pré-test, et tient deux nombres qui ne dépendent pas du seuil : `fautes` et `suite`, à
  0 au départ. L'unité est rebelle quand `fautes` vaut le seuil ou plus : rien d'autre n'est tenu
  (`src/domaine/progression/rebelles.ts`).
  - Une réponse juste : `suite` augmente de 1. Quand `suite` atteint 3 (`SUCCES_DE_SORTIE`),
    `fautes` revient à 0, que l'unité soit rebelle ou non (M6-C7, T1-D5).
  - Une réponse fausse : `suite` revient à 0, toujours. Elle compte comme une faute si l'unité a
    déjà eu une réponse juste, et si aucune faute de cette unité n'a déjà compté ce jour-là
    (T1-D4) ; alors `fautes` augmente de 1.
- **T1-D4.** Une unité compte une faute par jour au plus. Sans cela, la faute de la ronde et celle
  de son retour, le même jour, en feraient deux, et deux mauvais jours suffiraient au seuil. Le jour
  est celui que rend `revuesDuJournal`, qui ne recule jamais pour une unité. Le jour compté ne
  s'oublie pas à la remise à 0 : une faute, trois succès, puis une faute, le même jour, laissent
  `fautes` à 0. Les réponses justes, elles, comptent toutes.
- **T1-D5.** Trois succès de suite remettent `fautes` à 0 pour toute unité, pas seulement pour un
  rebelle : sans cela, une unité enfin sue garderait ses vieilles fautes, et redeviendrait rebelle à
  la première erreur. Le premier succès reste acquis. Conséquence voulue : le nombre de rebelles ne
  peut que baisser quand le seuil monte.
- **T1-D6.** Le client et le rapport lisent le seuil sans rigueur : une valeur qui n'est pas un
  objet portant un entier `fautes` de 2 à 20 vaut le défaut, et le cours reste utilisable
  (`lireSeuilDesRebelles`, `seuilDesRebelles`).
- **T1-D7.** Dans l'instantané de référence, `rebelles` va dans `cours`, après `poseDesCartes`, et
  seulement si le cours l'écrit.
- **T1-D8.** Le cours d'exemple écrit `rebelles: { fautes: 3 }`, pour qu'une valeur autre que le
  défaut traverse toute la chaîne.
- **T1-D9.** Le rapport gagne une section « Les éléments rebelles », après celle des boîtes.
  - Le chapitre d'un élément est son module, par `modulesDesPosables` ; les chapitres viennent dans
    l'ordre des modules du cours, sous leur titre. Seuls les éléments que pose « Heute » comptent.
  - Le titre d'un module est un texte du cours : il passe par `echapper`.
  - Le rapport compte sur les réponses que `mesures` garde déjà (`reponsesDe`, qui écarte aussi un
    mode inconnu), pour que toutes ses sections lisent les mêmes réponses.
  - Rapport d'une personne : un tableau « chapitre, éléments, rebelles », en nombres, avec une
    ligne pour chaque chapitre qui a des éléments, même sans rebelle ; et un tableau « selon le
    seuil », qui donne le nombre de rebelles du cours pour chaque seuil de 2 à 8, plus la ligne du
    seuil du cours s'il dépasse 8. Le seuil du cours y est marqué.
  - Rapport d'ensemble : la case d'un chapitre est le nombre de rebelles de chaque personne dans ce
    chapitre. Elle passe par `admise` ; une case refusée se fond dans « autres chapitres », omise
    si elle est encore refusée. Une case admise affiche un pourcentage entier : les rebelles de
    toutes les personnes, sur le nombre d'éléments du chapitre fois le nombre de personnes.
  - Rapport d'ensemble encore : ni tableau « selon le seuil », ni total du cours. La ligne d'un
    seuil est la somme des cases de chapitre : affichée, elle laisserait retrouver par soustraction
    une case refusée (LE-26). Quand aucune case de chapitre n'est affichée, la section dit
    « omis », jamais « aucun » : ce serait dire quelque chose d'une personne.
  - Limite à écrire dans la doc : une case de chapitre demande trois personnes qui y ont un
    rebelle, et vingt rebelles en tout ; la plupart des cases d'un rapport d'ensemble peuvent être
    omises.
- **T1-D10.** Le rapport lit le seuil dans le manifeste du contenu donné par `--contenu`. Il n'a pas
  d'option de seuil : le tableau « selon le seuil » sert à le choisir.
- **T1-D11.** Les écarts à l'issue de la tranche 1 : la PR 63 en a déclaré cinq ; l'entrée en
  plusieurs jours, que le plan listait déjà, ne l'a été que par la PR 67 (voir « Les écarts à la
  spec »).

## La tranche 2 : « Heute », la marque, l'aide et la liste

- **T2-D1.** `FAUTES_PAR_DEFAUT` passe de 4 à 5, d'après la mesure de M6-C8 faite sur le rapport de
  suivi. Le cours d'exemple garde 3.
- **T2-D2.** Les rebelles sont les posables du cours dont `estRebelle(fautes, seuil)` est vrai : une
  unité retirée, ou un élément que « Heute » ne pose pas, n'en est jamais. Le contexte du cours les
  calcule une fois par journal, et tout l'écran lit le même ensemble.
- **T2-D3.** « Heute », une fois par jour (M6-C3) :
  - un rebelle qui a déjà une réponse aujourd'hui (hors pré-test), dans « Heute » ou dans un
    onglet, est « écarté pour aujourd'hui ». L'onglet retire les écartés de ses posables avant tout
    calcul : ce qui est dû, la clé de la séance, les comptes affichés et la composition. Un rebelle
    manqué reste dû pour l'ordonnanceur ; il ne l'est plus pour « Heute » ;
  - l'onglet tient aussi les rebelles auxquels il a lui-même fait répondre aujourd'hui, et les
    écarte de même : la réponse peut ne pas être encore au journal, ou ne jamais y entrer si son
    écriture échoue. Cet ensemble vaut pour le jour : il vit dans l'état de l'onglet, avec le jour
    qu'il concerne, il n'est pas vidé à la composition d'une ronde, et il survit à un changement
    d'onglet. Il se perd au rechargement de la page, comme la séance elle-même : le journal fait
    alors foi ;
  - pendant la séance, un rebelle manqué ne revient pas en fin de file : il sort. L'onglet lit si
    l'élément de tête est rebelle au geste qui juge, avant d'écrire la réponse, garde ce verdict
    dans son état jusqu'au passage à la suite, et le donne à `apresReponseDuJour` par un
    paramètre (`sansRetour`). Un élément qui devient rebelle par sa réponse du moment revient donc
    encore une fois, même si le journal a rangé la réponse avant le passage à la suite ;
  - `revisionsDuJour` garde les posables entiers : elle écarte déjà tout élément répondu
    aujourd'hui, et son compte des éléments répondus ne doit pas baisser ;
  - le bilan de la séance ne change pas : un rebelle manqué compte pour un élément passé, faux.
- **T2-D4.** Les onglets ne changent pas de règle : Karteikarten, le Quiz, la Prüfung et les autres
  posent un rebelle comme avant. Dans Übersicht, le compte « heute zu wiederholen », qui est celui
  de « Heute », retire les écartés ; la ligne « fällig » de chaque chapitre ne change pas, puisque
  Karteikarten pose encore ces cartes.
- **T2-D5.** La marque (M6-C10) est une étiquette « schwierig », de la classe `meta`, sur la
  question d'un rebelle, avant la réponse : dans « Heute », Karteikarten, Wortbaukasten, les
  schémas, les exercices, et sur les questions fermées d'une fiche dans Arbeitsblätter. Elle ne
  s'affiche ni dans le Quiz ni dans la Prüfung, qui sont des épreuves.
- **T2-D6.** Une carte admet deux clés facultatives :
  - `aide` : un texte d'une ligne, sans espace de bord (la règle des textes d'une carte), non vide,
    de 300 caractères au plus, comptés comme JavaScript les compte ;
  - `confondu_avec` : l'identifiant d'une autre carte du même cours, de n'importe quel module de
    cartes. Sont refusés, chacun avec son message en français : un identifiant qui n'est pas celui
    d'une carte du cours (une carte retirée en est un cas, sans message à elle), et celui de la
    carte elle-même.
  Le lien n'est pas réciproque d'office : chaque carte écrit le sien. Le contrôle se fait une fois
  tous les modules lus, la cible pouvant être dans un module suivant.
- **T2-D7.** `aide` est un texte du cours. Elle entre dans `textesDuCours`, dans la liste à relire
  et dans l'instantané de référence ; `confondu_avec` entre dans l'instantané et dans la liste à
  relire, avec le recto de la carte visée. Elles sont sous le statut de leur carte : ajouter une
  aide à une carte « vérifiée » est une modification de contenu comme une autre, que la PR de
  contenu juge ; aucun mécanisme ne rétrograde le statut.
- **T2-D8.** L'aide ne s'affiche que pour un rebelle, et jamais avant qu'il ait cherché (M6-C4) :
  - une carte : son `aide`, sous le titre « Merkhilfe », puis, si elle a un `confondu_avec`,
    « Nicht verwechseln mit: » suivi du recto et du verso de l'autre carte. Les deux sens d'une
    carte montrent la même aide. En saisie, elle s'affiche avec le verdict. Retournée, elle
    s'affiche au verso, une fois la carte retournée : le geste qui juge clôt la carte, il n'y a pas
    d'écran après lui ;
  - un mot : ses morceaux, que la question montre déjà à tous après la réponse ; rien ne change ;
  - un exercice : sa `regle`, déjà montrée à tous ; rien ne change ;
  - une affirmation vrai-faux, dans « Heute » : sa `correction`, après la réponse. La question
    reçoit ce texte par une propriété, l'élément ne lui étant pas passé ;
  - un point de schéma, dans « Heute » : la `note` de son schéma, après la réponse. Dans l'onglet
    des schémas, la note est déjà au-dessus de la question : elle n'est pas répétée.
  Un rebelle sans aide n'affiche rien de plus. Dans le Quiz et la Prüfung, rien ne s'affiche.
- **T2-D9.** La liste (M6-C6) est une section de Fortschritt, à la place de « Schwierige Karten ».
  Son titre, tel que la revue finale l'a fixé pour qu'elle n'ait qu'un nom, est « Schwierige
  Begriffe – nochmal ansehen » (le plan écrivait « Schwierig – nochmal ansehen »). Elle rassemble
  tous les rebelles, rangés par module dans l'ordre des modules du manifeste, sous le titre du
  module, et dans un module par nombre de fautes décroissant, l'ordre du cours départageant. Chaque
  ligne dit la question, la réponse, l'aide de T2-D8 et « {n}× falsch », où `n` est le nombre de
  fautes du rejeu. Elle est en lecture seule : on n'y répond pas. Sans rebelle, la section dit
  « Noch keine schwierigen Begriffe. ».
- **T2-D10.** La question et la réponse d'une ligne, par genre : une carte, l'invite et la réponse
  de son sens ; un mot, le mot et son sens ; un point, son sens et son terme, avec le titre du
  schéma ; un exercice, son énoncé et la réponse que sa question montre ; une question fermée, son
  énoncé et le libellé de sa bonne option (« Richtig » ou « Falsch » pour un vrai-faux, jamais le
  code). Une seule fonction rend ce couple (`question-et-reponse.ts`), et un seul composant rend
  l'aide (`AideDuRebelle`) : la liste et les questions les partagent.
- **T2-D11.** « Heute » renvoie à la liste (M6-C6) : sur l'écran de fin de séance et sur « Heute
  ist nichts fällig », un lien « Schwierige Begriffe ansehen ({n}) » ouvre Fortschritt, quand la
  liste n'est pas vide ; `n` est le nombre de rebelles de T2-D2.
- **T2-D12.** `cartesDifficiles`, sa constante, ses tests et les libellés qui ne servent plus qu'à
  elle disparaissent.
- **T2-D13.** Le client lit les clés d'une carte sans rigueur : la garde du cours servi ne les
  nomme pas, une `aide` qui n'est pas un texte ou un `confonduAvec` qui ne désigne aucune carte du
  cours servi ne s'affichent pas, et le cours reste utilisable.
- **T2-D14.** Le cours d'exemple reçoit deux aides inventées et un `confondu_avec`, dans son
  premier module de cartes.
- **T2-D15.** Les écarts à l'issue de la tranche 2, déclarés dans la PR 66 (voir « Les écarts à la
  spec »), et deux limites (voir « Les limites »).

## Le déroulement

- **PR 62** et **PR 65** : le plan maître avec le plan de la tranche 1, puis le plan de la
  tranche 2, avec les corrections de leur revue.
- **PR 63** : la tranche 1 (le calcul, la clé `rebelles`, le rapport).
- **PR 66** : la tranche 2 (« Heute », la marque, l'aide, la liste, le seuil à 5).
- **PR 67** : les corrections de la revue finale. Elle n'a trouvé aucun défaut de comportement,
  seulement des textes que le lot avait rendus faux ou incomplets : la réserve de M2-P3 dite partout
  où la règle l'est, la limite de la projection du rapport, un seul nom pour la liste, et un écart
  non déclaré.
- **La PR de clôture** : ce document, `CLAUDE.md`, le registre.

Aucune étiquette n'est posée à la clôture : la version qui porte le lot est la prochaine `vX.Y.Z`,
à Edouard. La prod est en `v0.19.0`.

## Les écarts à la spec

Déclarés dans les PR 63, 66 et 67, avec la promesse qu'ils touchent et l'accord d'Edouard du
18/11/2026.

- **Une faute par jour au plus** (T1-D4), critère 1 de l'issue.
- **Trois succès de suite effacent les fautes de toute unité**, pas seulement d'un rebelle
  (T1-D5), critères 1 et 5.
- **L'entrée demande au moins autant de jours que le seuil, quand la sortie peut se faire en une
  seule séance d'un onglet** (trois succès de suite), critères 1 et 5. La PR 63 ne l'avait pas
  déclaré à part : la PR 67 l'a fait.
- **Le rapport d'ensemble donne un pourcentage par chapitre admis**, omet les cases refusées, n'a ni
  tableau « selon le seuil » ni total ; « chapitre » y veut dire module (T1-D9), critère 6.
- **Seuls les éléments que pose « Heute » peuvent être rebelles** : ni les questions ouvertes d'une
  fiche, ni celles d'un texte annoté, critère 1.
- **Chaque sens d'une carte est jugé à part**, et compte pour un élément dans le rapport (T1-D2),
  critères 1 et 6.
- **« Une fois par séance du jour » ne vaut que dans « Heute »** (T2-D4), critère 2.
- **La marque est absente du Quiz et de la Prüfung**, qui sont des épreuves (T2-D5), critère 2.
- **L'aide ne s'affiche que pour un rebelle**, jamais dans le Quiz ni la Prüfung ; sur une carte
  retournée, elle est au verso, avant le geste qui juge (T2-D8), critère 3.
- **Seule une carte reçoit des clés d'aide** (`aide`, `confondu_avec`) : un mot, un point, un
  exercice et une question de fiche n'ont ni « confondu avec » ni exemple écrit pour eux (M6-C5),
  critère 3.
- **Übersicht retire de « heute zu wiederholen » les rebelles déjà répondus aujourd'hui**, alors
  que l'ordonnanceur les dit encore dus (T2-D4), critère 2.
- **La liste remplace « Schwierige Karten »** et ne montre plus une carte dès sa première faute
  (T2-D9), critère 4.

## Les limites

- **Un rebelle répondu dans un onglet pendant une séance de « Heute » déjà commencée y passe
  encore** : la file de la séance est composée au début (T2-D3, T2-D15).
- **Après une synchronisation qui apporte d'anciennes fautes, une séance commencée garde sa
  file** (T2-D15).
- **Dans les onglets, la marque suit le journal** : un élément qui devient rebelle par sa réponse
  la gagne sur l'écran du verdict.
- **Le seuil par défaut de 5 joue pour le cours de l'instance sans PR de données** : il n'écrit pas
  la clé `rebelles`. Pour l'apprenante, un élément n'entre dans la liste qu'à cinq fautes, comptées
  après un premier succès, une par jour au plus, là où « Schwierige Karten » montrait toute carte
  fausse dès la première.
- **La projection du rapport de suivi ne modélise pas les rebelles** et surestime d'autant la
  charge (voir « La règle »).
- **Le rapport d'ensemble omet la plupart des cases de chapitre** : trois personnes qui y ont un
  rebelle, vingt rebelles en tout (T1-D9).
- **Le calcul des rebelles relit le journal une fois de plus à chaque changement** ; le coût va aux
  suites.
- **Un cours monté ne reçoit `rebelles`, puis `aide` et `confondu_avec`, qu'à partir de la version
  qui suit la première étiquette posée après la `v0.19.0`** : le manifeste est strict, et le retour
  arrière remettrait l'image précédente devant le contenu du jour (invariant 8). Seul le cours
  d'exemple, dans l'image, les porte.
- **Cinq mutants d'avant le lot survivent** dans `reglages.ts` (la garde des poids de FSRS) et cinq
  dans le tri par échéance de `heute.ts`. Ceux de `heute.ts` ne sont pas équivalents : il leur
  manque un test. Tous vont aux suites.

## Ce qui n'a pas été vérifié

- **Le rendu sur un téléphone Android avec un vrai élément rebelle.** Un compte de staging n'en a
  pas : la marque, l'aide et la liste remplie se verront d'abord en prod.
- **La largeur de la liste remplie, à 412 px.** Le test de bout en bout ne mesure que la section
  vide ; la relecture du CSS ne voit pas de débordement.
- **L'allemand des libellés nouveaux** (« schwierig », « Merkhilfe », « Nicht verwechseln mit: »,
  le titre de la liste, son état vide et le lien de « Heute »), qu'aucune personne germanophone n'a
  relus.
- **Le rapport sur des journaux réels** : la mesure de M6-C8 a été lue en conversation, à la
  demande d'Edouard et avec l'accord de la personne, qu'il a relayé ; seul le seuil qui en découle
  entre au dépôt. Aucune autre personne n'a été mesurée.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-25, une règle qui retire un élément d'un écran sans
  chercher les autres lecteurs de son état dérivé ; LE-26, un total à côté de cases filtrées d'un
  rapport d'ensemble (3e constat du mécanisme de LE-17, avec une porte à écrire) ; LE-27, des
  écarts à l'issue non déclarés (3e constat du mécanisme de LE-19 et LE-23, avec une porte) ;
  EM-3, le délai du job de mutation du groupe `domaine`, porté à 35 minutes.
- **Dans « Au prochain passage » (ancrage#11)**, section « Les suites du lot M6 » : la liste y
  est, dont le groupe `domaine` de la mutation à couper en deux et la porte de LE-26.
- **Parmi les lots suivants de la milestone** : le rejeu d'une seule unité (ancrage#31) ; et le
  rapport de suivi qui mesure les reprises du jour (ancrage#64, livré par le lot M7).
- **La vérification sur Android et la mise en prod** : à Edouard, au staging d'abord, avant
  l'étiquette.
