# Lot M9 : l'aide d'un élément dès la faute (ancrage#74)

Le lot M9 (issue ancrage#74, milestone « Le parcours et la mémoire ») fait montrer l'aide d'un
élément dès la première faute, qu'il soit rebelle ou non. Jusque-là, seul un élément rebelle la
recevait (lot M6), c'est-à-dire après plusieurs jours de fautes. C'est le neuvième lot de la suite
ouverte par ancrage-donnees#106, et il vient après le lot M8 (ancrage#73), dont la mesure a changé
l'objet de l'issue.

Le constat de l'issue : elle demandait d'abord qu'en Leitner une reprise du jour ne fasse plus
monter d'une boîte. Le rapport de suivi, lu sur une fenêtre de réponses récentes (`--depuis`, lot
M8), a écarté cette règle : elle ne changerait pas la réponse du lendemain d'une faute, seulement le
nom de la boîte, et ajouterait une révision à chaque élément raté. Le point faible est ce qui est
retenu au moment de la faute. L'issue a donc été réécrite autour de l'aide. Aucun chiffre de cette
mesure n'est écrit ici : elle porte sur des journaux réels, et ce dépôt est public.

Son plan, à tâches et sans tranches, a été supprimé à la clôture, comme le veut la méthode. Ce
document en garde les décisions sous leurs libellés, parce que le code et les docs renvoient à
« M9-C<n> » et « M9-D<n> ». **Le comportement, lui, est fixé par le code et les tests.** Le lot ne
change que le client : ni le journal, ni l'API, ni le manifeste, ni l'ordonnanceur, ni la notice
(rien de neuf n'est gardé, invariant 5). Il est livré par la PR d'implémentation (ancrage#81) ; le
plan l'avait précédé (ancrage#80).

## Les décisions

M9-C1 à M9-C6 sont les arbitrages d'Edouard du 21/11/2026 ; M9-C2 et M9-C4 y reçoivent une
précision tirée du code, dite comme telle. M9-D1 à M9-D12 sont du plan, corrigé après sa revue.
M9-D5 et M9-D6 portent trois réponses d'Edouard du 21/11/2026, données à la revue du plan :
l'onglet des schémas et Arbeitsblätter ne changent pas, le pré-test reste sans aide.

- **M9-C1. La carte retournée** n'a pas d'écran après le geste qui juge : l'aide s'affiche au verso
  de toute carte qui a une aide, pour tout le monde, rebelle ou non, une fois la carte retournée.
- **M9-C2. La carte saisie** : l'aide s'affiche avec le verdict d'une réponse fausse. Une réponse
  comptée juste malgré une faute de frappe ou un tréma oublié (lot M5) ne la montre pas, sauf pour
  un rebelle, comme avant. Précision du plan, d'après le code : « ue » tapé pour « ü » est juste
  (M5-D8), donc sans aide ; « Fast » (`presque`) est une réponse fausse, donc avec aide ; après
  « Meine Antwort war auch richtig », la carte se clôt, comme avant, et l'aide a déjà été montrée
  avec le verdict faux.
- **M9-C3. Les autres genres dans « Heute »** suivent la même règle : une affirmation vrai-faux
  répondue faux montre sa `correction`, un point de schéma manqué montre la `note` de son schéma. Les
  mots et les exercices montrent déjà leur aide à tous : rien n'y change.
- **M9-C4. Les onglets** : Karteikarten et les autres onglets suivent la même règle que « Heute ».
  Le Quiz et la Prüfung restent sans aide. La marque « schwierig », la liste de Fortschritt et le
  calcul des rebelles ne changent pas. Précision du plan, d'après le code : dans les onglets, seule
  la question de carte gagne une aide, donc seul Karteikarten (« Fehler als Karteikarten üben »
  compris) change ; l'onglet des schémas et Arbeitsblätter montrent déjà la leur à tous (M9-D5).
- **M9-C5. Un seul plan, sans tranches, une seule PR d'implémentation.** Seul le client change : ni
  manifeste, ni journal, ni API, ni ordonnanceur.
- **M9-C6. Aucun outil de mesure neuf** : le rapport de suivi avec `--depuis` servira après la mise
  en ligne.
- **M9-D1. Une seule règle.** `montrerLAide(rebelle: boolean, juste: boolean): boolean`, qui rend
  `rebelle || !juste`, vit dans un fichier à elle, `src/client/cours/questions/montrer-l-aide.ts`,
  avec son test. Elle ne va pas dans le fichier renommé de M9-D7 : la revue du plan a mesuré
  qu'avec elle, sa ressemblance serait tombée à 49 %, sous le seuil où git voit un renommage. Trois
  questions la lisent, une fois répondues : la carte saisie (`juste` est `verdict.juste`), la
  question à choix (l'option choisie est la réponse) et le point de schéma (le point choisi est la
  cible). La carte retournée ne la lit pas (M9-C1). « Rebelle » est ce que chaque appelant passe
  déjà : dans « Heute », le verdict lu au geste qui juge (`rebelleDeTete`, T2-D3) ; dans un onglet,
  le journal (`rebelles.has`). La limite de M6 (la marque et l'aide y suivent le journal sur l'écran
  du verdict) ne joue plus guère que par une synchronisation : parmi les onglets, seule Karteikarten
  montre une aide par cette règle, une saisie n'y entre au journal qu'à « Weiter », et une réponse
  fausse montre l'aide quel que soit le verdict rebelle.
- **M9-D2. La carte.** `QuestionCarte` calcule l'aide de toute carte (`aideDeLUnite`), et non plus
  du seul rebelle. Retournée : l'aide est au verso, entre la carte et les boutons qui jugent, une
  fois la carte retournée. Saisie : avec le verdict, si `montrerLAide(rebelle, verdict.juste)`. Une
  carte sans aide, ou dont l'aide est illisible (T2-D13), n'affiche rien. Les deux sens d'une carte
  montrent la même aide (T2-D8).
- **M9-D3. Les choix et les points.** `QuestionAChoix` et `QuestionDeSchema` gardent leur propriété
  `aide` (un texte) et la montrent une fois répondus, si `montrerLAide(rebelle, juste)`.
  `QuestionAChoix` ne calcule jamais l'aide d'une carte posée en choix : le Quiz et le pré-test
  restent sans aide sans rien changer chez eux.
- **M9-D4. « Heute » ne change pas de code.** Il passe déjà `rebelle` à chaque question,
  `aide={tete.schema.note}` au point et la `correction` à une affirmation vrai-faux, rebelle ou non :
  la règle des composants suffit. La file, la règle des rebelles (T2-D3) et le bilan ne changent pas.
- **M9-D5. Les onglets.**
  - Karteikarten suit par `QuestionCarte`, « Fehler als Karteikarten üben » compris : sa séance
    imposée passe par le même onglet.
  - L'onglet des schémas montre la note au-dessus de la question, à tous, avant la réponse (T2-D8).
    Il ne passe pas d'aide à la question, et la note n'est pas répétée après une faute (réponse
    d'Edouard du 21/11/2026).
  - Arbeitsblätter montre la correction d'une affirmation après tout choix, juste ou faux (F1), et
    sa vue « Ergebnis » la montre aussi, quel que soit le verdict (F3) ; un QCM de fiche n'a pas
    d'aide. Rien ne change (réponse d'Edouard du 21/11/2026).
    *Depuis le lot M10 : un QCM de fiche a son explication, après une faute ou à un rebelle (M10-C5,
    `docs/conception/lot-m10.md`). Il n'a toujours pas d'aide, et le reste de cette décision tient.*
  - Wortbaukasten et les exercices : rien ne change (M9-C3). La liste de Fortschritt : seul le nom
    du composant de l'aide change.
- **M9-D6. Les épreuves et le pré-test.** Le Quiz ne passe ni `rebelle` ni `aide` à sa question ; la
  Prüfung a son propre rendu, qui n'importe rien de `questions/` : ni l'un ni l'autre ne change. Le
  pré-test de « Heute » ne passe pas d'aide, et ne montre pas une faute comme une faute (B-D14) : il
  reste sans aide (réponse d'Edouard du 21/11/2026). Des tests le gardent.
- **M9-D7. Les noms suivent le sens.**
  - Le composant `AideDuRebelle` devient `AideDeLElement`. Le fichier `AideDuRebelle.tsx` devient
    `AideEtMarque.tsx`, qui garde `MarqueDeRebelle`, et son test `AideEtMarque.test.tsx`, par
    `git mv`.
  - La classe `aide-rebelle` devient `aide`. Les clés `rebelle_aide` et `rebelle_confusion`
    deviennent `aide_titre` et `aide_confusion`. Les libellés allemands ne changent pas
    (« Merkhilfe », « Nicht verwechseln mit: »).
  - `MarqueDeRebelle`, `rebelle_marque`, `p.rebelle`, `ListeDesRebelles` et `heute_rebelles` gardent
    leur nom : ils restent aux rebelles.
  - Les commentaires qui réservent l'aide aux rebelles et `docs/format-des-contenus.md` sont
    réécrits.
  - Le renommage doit survivre au squash (page du savoir « Sous un squash, renommer dans une PR,
    réécrire dans la suivante ») : la PR d'implémentation montre les deux lignes `rename`, 72 % et
    80 %.
- **M9-D8. Le test de bout en bout.**
  - Il vit dans la suite `e2e:mise-a-jour`, dans un fichier à lui,
    `e2e/mise-a-jour/aide-apres-faute.spec.ts`, sur sa base et un compte neuf : le lien du
    propriétaire de la suite principale, qui ne sert qu'une fois, reste à son parcours de compte.
  - Karteikarten, le premier module de cartes de l'exemple, le sens « Bedeutung → Begriff »
    (`inverse`), la saisie cochée : neuf unités inverses, toutes neuves, dans une série de quinze au
    plus (`nouvelles_par_seance`). Chacune reçoit une réponse fausse (« x »). Après le verdict, les
    cartes « Sieb » et « Reibe » montrent leur aide, avec la confusion pour la première ; les sept
    autres ne montrent aucun `.aide`. Une faute remet la carte en fin de file : après neuf réponses,
    chaque unité a été posée une fois.
  - À la première aide, le bloc `.aide` tient dans la largeur du Pixel 7, et la page ne défile pas
    en largeur (`sansDefilementHorizontal`, de `e2e/aide-mise-en-page.ts`).
  - Pourquoi Karteikarten, et non « Heute » : la séance du jour d'un compte neuf ne tire que
    quelques unités neuves du premier chapitre, et rien n'assure qu'une carte à aide en soit.
    « Heute » pose la même `QuestionCarte`, et ses tests vitest le tiennent.
  - Le bloc qui crée le compte (serveur, authentificateur, lien, passkey) passe dans
    `e2e/mise-a-jour/compte-neuf.ts`, que `seance-du-jour.spec.ts` appelle aussi : recopié, il
    aurait passé le seuil de jscpd.
- **M9-D9. Les tests et les mutants.**
  - Le test d'abord : chaque test d'un comportement nouveau échoue sur le code d'avant la tâche, et
    la PR le dit. Un test qui passe déjà avant le lot est une garde, avec son mutant : les absences
    après une réponse juste ou tolérée, la carte sans aide, les cas rebelles que le lot garde, et
    les épreuves (le Quiz, la Prüfung, le pré-test, l'onglet des schémas, Arbeitsblätter).
  - Le client est hors de Stryker : la liste `mutate` de `stryker.config.json` n'a aucun fichier de
    `src/client/`. Chaque promesse de M9-C1 à M9-C4 et de M9-D1 à M9-D6 a son mutant posé à la main ;
    chacun est posé, lancé, puis retiré, et la PR dit le résultat (tous tués).
  - Les textes des tests sont inventés, ceux du cours de test ou, pour le test de bout en bout,
    ceux du cours d'exemple ; jamais un texte du cours de l'instance. Les tests qui veulent un cours
    dont chaque carte porte une aide partagent une seule fixture, `coursAvecUneAideParCarte`.
  - Un test d'absence constate d'abord le verdict, puis l'absence : sans cela, il passerait sur une
    question qui n'a pas répondu.
- **M9-D10. Ce qui ne change pas.** Ni le manifeste, ni le format des contenus (seulement sa prose,
  avec une section « L'aide d'un élément »), ni le journal (aucun mode), ni l'API, ni
  l'ordonnanceur, ni la notice, ni le rapport de suivi (M9-C6), ni la liste de Stryker. Invariant 8 :
  rien à ajouter avant d'enlever ; le retour arrière remet un client qui ne montre l'aide qu'aux
  rebelles. La version qui porte le lot est la prochaine `vX.Y.Z`, à Edouard ; aucune étiquette de
  données. Pour l'apprenante, dès cette version : dans « Heute », la correction d'une affirmation et
  la note d'un schéma après une faute, si le cours de l'instance en porte ; l'aide des cartes
  n'apparaît qu'avec leur PR de données (hors périmètre).
- **M9-D11. Les écarts à l'issue.** Chaque décision a été pesée contre chaque critère de l'issue
  (LE-23, LE-27). Les critères 2 à 7 sont livrés tels quels ; les écarts sont tous contre le
  critère 1, et la PR d'implémentation les a déclarés chacun avec sa promesse et la date de son
  accord, le 21/11/2026 :
  - **E1** : une carte retournée montre l'aide au verso de toute carte qui en a une, avant le geste
    qui juge, réponse juste comprise (M9-C1) ;
  - **E2** : les morceaux d'un mot et la règle d'un exercice restent montrés à tous après toute
    réponse (M9-C3) ;
  - **E3** : dans l'onglet des schémas, la note reste montrée à tous, avant la réponse (M9-D5) ;
  - **E4** : dans Arbeitsblätter, la correction d'une affirmation reste montrée après tout choix, et
    la vue « Ergebnis » la montre aussi, quel que soit le verdict (M9-D5) ;
  - **E5** : le pré-test de « Heute » reste sans aide (M9-D6) ; promesse contre la phrase « dans
    « Heute », une réponse fausse montre l'aide ».

  Hors périmètre, tenu : la règle des boîtes, les reprises par jour des onglets, les aides du cours
  de l'instance, Leitner et FSRS.
- **M9-D12. Les cases de ancrage#11.** La PR d'implémentation a regardé les cases des fichiers
  qu'elle touche, et aucune n'est réglée par le lot : il n'écrit d'abord que ses tests, ne touche
  pas au verdict d'une carte saisie, ne change ni un jeton de couleur ni un libellé, ajoute un
  fichier à la suite des deux versions sans changer la raison de sa case, et n'a pas de vrai
  rebelle à voir sur un téléphone.

## Ce qui est livré

- `src/client/cours/questions/montrer-l-aide.ts` : la règle. `QuestionCarte.tsx`,
  `QuestionAChoix.tsx` et `QuestionDeSchema.tsx` la lisent ; `AideEtMarque.tsx` porte
  `AideDeLElement`, que sert aussi la liste de Fortschritt.
- Les appelants des trois questions, et ce que chacun montre : `QuestionCarte` dans « Heute » et
  Karteikarten (au verso, ou avec le verdict faux) ; `QuestionAChoix` dans « Heute » pour une
  question fermée de fiche (la correction après une faute), dans le Quiz et le pré-test (sans
  aide) ; `QuestionDeSchema` dans « Heute » (la note après un point manqué) et dans l'onglet des
  schémas (sans aide, la note étant au-dessus).
- `e2e/mise-a-jour/aide-apres-faute.spec.ts` et `e2e/mise-a-jour/compte-neuf.ts`.
- `docs/format-des-contenus.md`, section « L'aide d'un élément ».

## Ce que les revues ont trouvé

- La revue de l'implémentation a trouvé un mutant survivant sur une garde : l'onglet des schémas
  qui passerait la note aux seuls rebelles. La garde tourne depuis sans rebelle et avec.
- La revue finale n'a rien trouvé de bloquant, et n'a corrigé que des textes (la section « L'aide
  d'un élément » du format, deux commentaires). Elle a posé 43 mutants à la main : 42 tués. Celui
  qui survit place l'aide d'une saisie dans la carte, avant « Weiter » : la place de l'aide n'est
  pas une promesse du lot (voir « Les limites »).
- Un envoi a porté sur la PR d'implémentation trois commits intermédiaires qui contenaient un mot
  du cours de l'instance, dans une fixture ; la branche a été réécrite avant la fusion, et `main`
  ne l'a jamais porté (LE-31).

## Ce qui n'a pas été vérifié

- Le rendu sur un téléphone Android. Au staging, Edouard peut voir la correction et la note dans
  « Heute » si le cours de l'instance en porte ; il ne peut **pas** y voir l'aide d'une carte, le
  cours de l'instance n'en portant pas encore. Le test de bout en bout, au Pixel 7, dans un vrai
  navigateur, est la preuve du lot pour la carte.
- Le rendu avec un vrai rebelle : un compte de staging n'en a pas.
- L'effet sur la réponse du lendemain d'une faute : c'est ce que la mesure prévue dira.

## Les limites

- **L'aide d'une saisie fausse était sous la carte**, après « Weiter » qui a le focus : sur un
  téléphone, elle passait sous le bas de l'écran (au staging, le bloc commençait à 657 px sur une
  fenêtre de 641 px). Depuis le correctif de ancrage#11, elle est dans la carte, entre le verdict et
  « Weiter », et le test de bout en bout mesure que le bas de l'aide et de « Weiter » reste dans
  l'écran. Une carte retournée garde l'ordre carte, aide, boutons : au Pixel 7 (839 px de haut), le
  bas des boutons est à 754 px.
- Le bloc d'aide porte `role="status"` depuis le correctif de ancrage#11 ; le verdict d'une carte
  saisie n'est toujours pas annoncé (lot M5).
- La classe `.aide` est générique dans `styles.css`, et `QuestionAChoix.test.tsx` n'a pas de
  question vrai-faux en codes.
- Une saisie tolérée (faute de frappe, tréma) ne montre pas l'aide : la personne n'a pas manqué le
  terme, mais elle peut l'avoir mal retenu.

## Les suites

Elles sont dans ancrage#11, sous « Les suites du lot M9 » : les limites de rendu et d'accessibilité
ci-dessus, quelques noms et signatures à nettoyer (`verAideEtConfusion`, `poser(…)` à cinq arguments
positionnels), du code mort du rapport de suivi, un commentaire de `unites.ts`, et le hook
`scripts/cours-absent.ts`, qui doit vérifier chaque commit d'un envoi (LE-31).

La mesure de M9-C6 : `memoire:rapport --depuis <jour de la mise en ligne>`, environ deux semaines
après, une fois les aides du cours de l'instance écrites (une PR du dépôt de données, hors
périmètre). Elle dira si la réponse du lendemain d'une faute s'améliore. Si une mesure plus longue
contredit celle qui a écarté la règle des boîtes, l'issue d'origine se rouvre.

## Les arbitrages

Les trois réponses d'Edouard du 21/11/2026 à la revue du plan : l'onglet des schémas ne change pas
(la note n'est pas répétée après une faute), Arbeitsblätter ne change pas (la correction reste
montrée après tout choix), le pré-test reste sans aide. Les cinq écarts E1 à E5 portent son accord
du même jour.

La version qui porte le lot est la prochaine `vX.Y.Z`, à Edouard ; aucune étiquette de données n'est
à poser. La vérification sur un téléphone Android se fait au staging, par Edouard, avant
l'étiquette, pour la correction et la note dans « Heute ».
