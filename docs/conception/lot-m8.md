# Lot M8 : le rapport de suivi lit une fenêtre de jours (ancrage#73)

Le lot M8 (issue ancrage#73, milestone « Le parcours et la mémoire ») donne à `memoire:rapport`
l'option `--depuis <AAAA-MM-JJ>` : les tableaux de réussite (les moments et les modes) et les
reprises du jour ne comptent que les réponses de ce jour local et des suivants, pour mesurer
l'application telle qu'elle est aujourd'hui. C'est le huitième lot de la suite ouverte par
ancrage-donnees#106, et il précède le lot qui changera la promotion après une reprise du jour
(ancrage#74) : il lui donne sa mesure.

Le constat de l'issue : le rapport lisait tout le journal, or l'application a changé en cours de
route (« Heute » ne redonne une faute qu'une fois, le journal note le mode, un élément rebelle ne
revient pas le jour même). Les tableaux mêlaient donc des réponses d'avant et d'après ces
changements, et la part « sans mode » le montrait.

Son plan, à tâches, a été supprimé à la clôture, comme le veut la méthode. Ce document en garde les
décisions sous leurs libellés, parce que le code et la page renvoient à « M8-D<n> ». **Le
comportement, lui, est fixé par le code et les tests.** Le lot est un outil du poste, hors de
l'image : rien ne change pour l'apprenante, aucune étiquette n'est à poser, et la vérification sur
un téléphone Android ne s'applique pas (M8-D9). Rien de nouveau n'est gardé (invariant 5).

## Les décisions

M8-D1 à M8-D10 sont les décisions du pilote ; M8-D2, M8-D5, M8-D6 et M8-D7 ont reçu une précision
tirée du code ou de la revue du plan, dite comme telle ; M8-D4 a été tranchée par le plan.

- **M8-D1. La borne est un jour local entier**, celui que le rapport emploie déjà pour ranger une
  réponse dans un jour (`jourDe`, le début de l'horodatage, avec son décalage). Une réponse est
  dans la fenêtre si son jour est `depuis` ou un jour suivant (`dansLaFenetre`, une comparaison de
  chaînes `AAAA-MM-JJ`). Les réponses d'un couple (élément, jour) ont toutes le même jour : la
  borne ne coupe jamais un jour en deux. La fenêtre n'a pas de fin : une réponse d'après le jour du
  rapport y compte, comme avant.
- **M8-D2. La fenêtre borne ce qui compte des réponses, et rien d'autre.**
  - Les moments et les modes : une réponse compte dans `delais` et dans `modes` si son jour est
    dans la fenêtre.
  - Les reprises du jour : une reprise (rang, espacement, mode) compte si le jour de son couple est
    dans la fenêtre ; un couple compte dans la répartition si son jour y est.
  - L'effet au lendemain compte si le jour de faute est dans la fenêtre **et** si la réponse
    mesurée, la première d'un autre jour, y est aussi. Précision du plan : la seconde condition ne
    joue que pour un jour local qui recule sous la borne (M7-D1). Sans elle, la porte de
    croisement retrancherait d'une ligne de moment ou de mode une réponse que cette ligne ne
    compte pas.
  - Le suivi voit toutes les réponses : le couple ouvert, son dernier verdict, ses réponses après
    la faute et l'indice de sa dernière réponse se tiennent sur tout le journal ; seul le compte
    est borné. **L'espacement d'une reprise compte donc les autres réponses de tout le journal**
    entre les deux, dans la fenêtre ou non (un test le garde).
- **M8-D3. Ce qui est un état reste dérivé de tout le journal** : le moment d'une réponse (sa boîte
  d'avant, « première réponse », « redonnée le jour même », par `delaiDe` sur toutes les réponses
  d'avant de l'unité), les boîtes, les éléments dus, les parts vue et sûre, les éléments rebelles,
  l'état d'où part la projection et la population des personnes actives d'un rapport d'ensemble.
  Une réponse de la fenêtre peut donc être « à l'échéance, depuis la boîte 3 » d'après des réponses
  d'avant la fenêtre.
- **M8-D4. La charge passée et les minutes ne changent pas**, et la page le dit. `parJour` fixe,
  dans un rapport d'ensemble, les jours affichés, donc la période de l'en-tête, les semaines
  passées et la durée de « Les limites » : les borner changerait des textes qui décrivent le
  journal, non l'application. La forme de `Mesures` ne change pas.
- **M8-D5. La projection lit la réussite de la fenêtre**, pour les deux algorithmes : la réussite
  par boîte d'avant (Leitner), celle d'une première réponse et celle d'une réponse redonnée le jour
  même (la simulation commune, FSRS compris), et la réussite observée à l'échéance de la puce FSRS.
  L'état de départ vient du journal entier (M8-D3). C'est l'écart E1.
- **M8-D6. La page dit la fenêtre**, en tête et dans « Comment lire ces chiffres », et ce qu'elle ne
  borne pas ; **sans `--depuis`, elle est identique à l'octet près**, le rapport limité compris, ce
  que garde un test d'empreinte de quatre pages (`rapport-fenetre.test.ts`). Un paragraphe de tête,
  « N réponses, dont M dans la fenêtre » (« dont aucune » pour zéro) dans le rapport d'une
  personne, une puce « La fenêtre. » juste après « Une réponse », suivie dans un rapport d'ensemble
  de la population et de la limite de M8-D8. Précision de la revue du plan : le rapport limité
  (moins de trois personnes actives) dit la fenêtre **en une ligne** et ne change rien d'autre. Les
  phrases « observée dans le journal » restent telles quelles, non conditionnées à la fenêtre : la
  puce les précise.
- **M8-D7. Les dates refusées.** Une date mal formée (pas un jour du calendrier `AAAA-MM-JJ`, vide,
  ou absente après `--depuis`) ou future rend le code 64, avant toute lecture de la base et du
  contenu ; « future » veut dire après le jour du rapport, comme pour `--accord`. Ce jour est celui
  de la commande, le **jour UTC du poste** : peu après minuit, à une heure locale en avance sur UTC,
  la date locale du jour est encore refusée. Arbitrage d'Edouard du 20/11/2026 : la limite se dit
  dans la doc, un test la tient, et elle va en suite (ancrage#11), sans correction. Le jour du
  rapport lui-même est accepté. Une fenêtre sans aucune réponse : le rapport s'écrit et le dit. Le
  rapport d'une personne dit « dont aucune dans la fenêtre » et ses phrases « Aucune reprise… » ;
  **un rapport d'ensemble ne dit pas « aucune »** (un zéro pour chaque personne, une case que
  `caseAdmise` refuse) : ses tableaux disent « omis ». Le test « refusée avant de lire la base »
  prend une date impossible du passé (`2026-02-30`) : « hier » se classe après le jour du rapport
  et serait refusé comme futur, sans prouver l'ordre des contrôles.
- **M8-D8. Le rapport d'ensemble.** Chaque case des tableaux bornés passe `caseAdmise` sur la
  fenêtre ; la règle ne change pas. La porte de croisement de M7 joue sur les tableaux de la
  fenêtre, grâce à la précision de M8-D2. Une personne active sans réponse dans la fenêtre reste
  dans la population et ne compte dans aucune case. **Limite nouvelle** : deux rapports d'ensemble
  à deux fenêtres, ou avec et sans fenêtre, peuvent se comparer ; faits le même jour, ils ont la
  même population et le même état, et leur différence peut donner une case refusée.
- **M8-D9. `memoire:ajuster` ne change pas** : il n'appelle pas `mesures`. Aucune étiquette, aucune
  vérification sur un téléphone.
- **M8-D10. La mutation.** Les fichiers de `src/outillage/memoire/` restent hors de Stryker
  (`mutation-groupe.mjs` n'admet que `src/domaine/` et `src/serveur/`). Chaque valeur ou branche
  gardée par un test est éprouvée par un mutant posé à la main, et la revue en cherche d'autres.
- **M8-D11. Les fichiers.** `cellules.ts` porte `dansLaFenetre`, partagé par `mesures.ts` et
  `reprises.ts` sans qu'ils s'importent. `mesures(…, depuis?)`, `suivreLesReprises(depuis?)`,
  `reponsesDansLaFenetre`, `DonneesDuRapport.depuis` ; `cli-rapport.ts` lit `--depuis`.
  `reprises.fixture.ts` gagne un décalage en jours (`journauxAuxReprises(n, cours, décalage)`) et
  `journauxSurDeuxSemaines`.
- **M8-D12. Les tests.** Des journaux inventés sur le cours d'exemple. Les assertions portent sur
  des textes exacts de la page ou sur les clés exactes des mesures. Le journal « qui recule » répond
  au 05 local, au 04 local (décalage de −3 000 minutes, plus tard dans le temps), puis **au 07**
  (et non au 06).
- **M8-D13. Les écarts à l'issue** : voir plus bas.
- **M8-D14. Les cases de ancrage#11.** La case du commentaire d'en-tête de `rapport.ts` (suites du
  lot M3) est réglée par le lot (`rapport.ts:58`, le critère des 70 %) et cochée à la clôture. Les
  autres restent ouvertes, dont
  « Pas assez de réponses pour comparer la réussite » : une fenêtre la montre plus souvent, mais la
  régler changerait la page sans `--depuis`.

## Le déroulement

Un plan à tâches : la PR de plan (ancrage#75), la PR d'implémentation (ancrage#76), la PR de revue
finale (ancrage#77) et celle-ci. Chaque tâche a été faite par un agent, puis relue par un autre.

- **La revue du plan** a corrigé le plan seize fois, avant toute ligne de code (les précisions de
  M8-D2, M8-D5, M8-D6 et M8-D7 viennent du code ou de cette revue).
- **La revue des tâches** a trouvé deux promesses sans test : l'espacement qui compte tout le
  journal, et le rapport d'ensemble qui lit la fenêtre (ses lignes de mode et sa projection).
- **La revue finale** a trouvé le rapport limité absent de l'empreinte (M8-D6 le promettait) et une
  assertion fragile (la part sûre d'un ensemble, dans un sens qui n'était pas celui annoncé : elle
  est remplacée par les « réponses par jour », plus basses avec la fenêtre).
- **La relecture des corrections** n'a trouvé aucun constat.

## Les écarts à la spec

Accordés par Edouard le 20/11/2026 ; la PR d'implémentation les a déclarés chacun.

- **E1**, critère 2 de l'issue (« seule la fenêtre des tableaux change ») : la projection, pour les
  deux algorithmes, et la réussite observée à l'échéance lisent la réussite de la fenêtre (M8-D5),
  et ce qui en dérive (le titre de la page et celui de la charge, les tuiles, le tableau des
  nouveautés, les lignes projetées), alors que leur état de départ ne change pas.
- **E2**, critère 4 (« chaque case passe `caseAdmise` sur la fenêtre ») : les jours et les semaines
  de la charge passée, et l'écart des minutes, ne sont pas bornés (M8-D4) : leurs cases passent la
  règle sur tout le journal. Les boîtes et les chapitres sont des états : pas un écart.

## Les limites

- **Le jour du rapport est le jour UTC du poste** (M8-D7), aussi pour `--accord` : peu après
  minuit, à une heure locale en avance sur UTC, la date locale du jour est refusée comme future.
- **Deux rapports d'ensemble à deux fenêtres**, ou avec et sans fenêtre, peuvent se comparer
  (M8-D8) : une différence peut donner une case refusée.
- La porte générale de LE-26 reste à écrire (ancrage#11) : le lot n'ajoute pas de croisement, mais
  n'en garde pas non plus.
- La page garde « Les taux mêlent les modes d'avant, dont les réponses sans mode », que la fenêtre
  peut exclure : elle n'a pas été conditionnée à la fenêtre.

## Ce qui n'a pas été vérifié

- `--depuis` sur des journaux réels : tout est éprouvé sur des journaux inventés.
- Les tests de la commande (`cli-rapport.test.ts`) n'ont pas été vus rouges avant le code, un par
  un : le fichier ne se chargeait pas (une erreur d'analyse dans le bloc inséré) avant sa
  correction ; chacun est tué par au moins un mutant.
- La porte générale de LE-26, toujours à écrire.
- La vérification sur un téléphone Android ne s'applique pas (outil du poste).

## Les suites

- **Au registre** (`docs/registre.md`) : LE-30, des promesses de la page ou des décisions sans
  mutant dans la liste du plan (2e constat du motif de LE-29). Les autres leçons :
  - LE-23 et LE-27 (écarts à l'issue) : leur critère est atteint par ce lot (le plan listait ses
    écarts, ni la revue finale ni la clôture n'en ont trouvé d'autre) ; leur état ne change pas
    ici, la décision de les fermer revient au responsable ;
  - LE-28 : aucun constat de déduction à la revue finale, mais la porte générale reste à écrire :
    ouverte ;
  - LE-29 : critère non atteint, d'où LE-30.
- **Dans « Au prochain passage » (ancrage#11)**, section « Les suites du lot M8 » : le jour UTC du
  poste, le rapport sur des journaux réels, la phrase sur les modes d'avant, `dansLaFenetre` et
  `mesures.ts` hors de Stryker, la reprise des quatre empreintes par tout lot qui change la page,
  `lesTroisPages` qui porte quatre pages, et les tableaux vides plus fréquents sous une fenêtre.
- **Parmi les lots suivants de la milestone** : le rejeu d'une seule unité (ancrage#31), et la
  promotion après une reprise du jour (ancrage#74).
