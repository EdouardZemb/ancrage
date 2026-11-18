# Lot M4 — décisions et arbitrages

Le lot M4 (issue ancrage#30, milestone « Le parcours et la mémoire ») donne à un cours son
planning : la suite de ses étapes, avec pour chacune sa séance, les modules qu'elle couvre et son
genre. L'application s'en sert pour ne proposer que ce qui a été vu, pour répartir les cartes
neuves, pour préparer l'étape à venir et pour montrer où en est la personne. C'est le quatrième lot
de la suite ouverte par ancrage-donnees#106, après le moteur (M1), la séance du jour (M2) et la
mémoire d'un cours réel (M3). Le lot a livré :
- **la clé `planning` du manifeste**, en étapes datées ou relatives, et le compte à rebours de
  « Heute » (tranche A1, `v0.16.0`) ;
- **les manuels** : la clé `manuels`, et pour chaque module de cartes son manuel, son chapitre et
  sa Unit ; « Übersicht » se divise par manuel (tranche A2) ;
- **le rythme des cartes neuves** d'après l'étape, et **le pré-test** d'une étape à venir, sous un
  mode du journal à lui, `pretest` (tranche B, en deux versions, ADR-0014) ;
- **le « Lernplan »**, un onglet qui montre les étapes, leur état et le retard, et **les
  révisions** qu'une étape `revision` mêle à la séance du jour (tranche C) ;
- **les corrections de la revue finale**.

Ses cinq plans (un plan maître, quatre plans de tranche) ont été supprimés à la clôture, comme le
veut la méthode. Ce document en garde les décisions, avec leurs numéros, parce que le code y
renvoie : « M4-C<n> » pour le cadrage du lot, « A1-D<n> », « A2-D<n> », « B-D<n> » et « C-D<n> »
pour les tranches. Il garde aussi les arbitrages de l'exécution (« M4-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** La spécification est le texte de ancrage#30. Les formes écrites et les limites vues par
l'auteur d'un cours sont dans `docs/format-des-contenus.md` (« Le planning », « Les manuels »,
« Le pré-test », « Le « Lernplan » », « Les révisions »).

## Le cadrage du lot (15/11/2026)

Edouard l'a accepté le 15/11/2026.

1. **M4-C1, le lot se fait en tranches.** La première PR de l'issue est coupée en deux : A1 (la
   clé `planning`, « Heute », le compte à rebours), puis A2 (les manuels, la Unit, « Übersicht »),
   ajoutés à l'issue le 14/11/2026.
2. **M4-C2, une étape liste ses modules par identifiant.** Elle porte sa séance (une date) ou sa
   semaine, son genre (`cours` ou `revision`) et un titre libre. Elle ne se déduit pas de la Unit
   des modules : A1 ne dépend pas de A2.
3. **M4-C3, un module qu'aucune étape ne nomme est toujours ouvert.** Un cours dont le planning ne
   couvre qu'une partie reste utilisable pour le reste. C'est un écart à la spec (voir « Les
   écarts à la spec »).
4. **M4-C4, hors de « Heute », rien n'est bloqué.** Un chapitre à venir reste lisible dans tous les
   onglets, et Karteikarten reste libre.
5. **M4-C5, le compte à rebours lit `memoire.examen`.** Le planning ne porte pas de seconde date.
6. **M4-C6, l'ordre des versions.** A1 fusionnée, Edouard pose la `v0.16.0`. Le planning du cours
   de l'instance est une PR du dépôt de données, qui n'entre en prod qu'avec la version suivante
   du code (invariant 8).

## Tranche A1 : la clé `planning`, « Heute » et le compte à rebours

1. **A1-D1, la forme écrite.** `planning.etapes` est une liste d'au moins une étape. Une étape
   porte `titre` (texte non vide), `semaine` ou `seance`, `genre` (facultatif : `cours`, le
   défaut, ou `revision`) et `modules` (une liste d'identifiants de modules). `planning` et chaque
   étape sont des objets stricts. `modules` peut être vide pour une étape `revision`, jamais pour
   une étape `cours`. L'alternative entre `seance` et `semaine` s'écrit par deux champs facultatifs
   et un `superRefine`, comme les règles de `memoire`, pour que chaque refus ait son message en
   français.
2. **A1-D2, la séance, la semaine, l'ordre.** Une étape porte `seance` (une date `AAAA-MM-JJ`) ou
   `semaine` (un entier positif, 520 au plus), jamais les deux ni aucune. Toutes les étapes d'un
   planning ont la même forme. Elles s'écrivent dans l'ordre : une séance ou une semaine n'est
   jamais avant celle de l'étape d'avant (l'égalité est admise). La première étape d'un planning
   relatif est en semaine 1 : sinon, un compte sans réponse n'aurait jamais de carte neuve.
3. **A1-D3, un module est cité une fois au plus** dans tout le planning, et c'est un module du
   cours, quel que soit son type.
4. **A1-D4, une étape datée s'ouvre le jour de sa séance** : elle est ouverte si
   `seance <= aujourd'hui`.
5. **A1-D5, une étape relative s'ouvre au jour `départ + 7 × (semaine − 1)`.** Le départ est le
   jour du premier événement du journal du cours, dans l'ordre du journal sans doublon et quel que
   soit son genre ; il n'est jamais après aujourd'hui, et sans événement c'est aujourd'hui. La
   semaine 1 est donc toujours ouverte. Limite admise et écrite dans la doc : le départ peut bouger
   d'un jour entre deux appareils de fuseaux différents, et avancer si les premières réponses sont
   abandonnées à une déconnexion.
6. **A1-D6, un module est ouvert** dès qu'une étape ouverte le cite, ou qu'aucune étape ne le cite
   (M4-C3). Il est fermé sinon. Sous A1-D3 cela revient à « cité par une étape fermée », mais la
   règle tient si une version suivante laisse citer un module deux fois.
7. **A1-D7, « Heute » ne tire pas de carte neuve d'un module fermé.** Les candidates aux cartes
   neuves sont celles du choix de Karteikarten dont le module n'est pas fermé ; si le chapitre
   choisi est fermé, il n'y a pas de carte neuve. Ce qui est dû reste dû, même d'un module fermé.
   Aucun autre onglet ne change (M4-C4). Avec un planning, la tranche B remplace la première phrase
   (B-D2).
8. **A1-D8, le compte à rebours** lit `memoire.examen` (M4-C5). Un cours en Leitner pur n'en a pas :
   le schéma refuse `examen` avec `leitner`. Il s'affiche sur les trois écrans de l'onglet (la
   séance, la fin d'une séance, « Heute ist nichts fällig ») quand il reste zéro jour ou plus, en
   allemand : « Noch {n} Tage bis zur Prüfung », « Noch 1 Tag bis zur Prüfung », « Heute ist die
   Prüfung ». Après l'examen, rien ne s'affiche.
9. **A1-D9, le client lit le planning sans rigueur.** Un planning qu'il ne comprend pas (un genre
   inconnu, une semaine hors bornes, une date mal formée) vaut « pas de planning » : tout est
   alors ouvert, et le cours reste utilisable. C'est le repli de `memoire`.
10. **A1-D10, le cours d'exemple porte un planning relatif** : semaine 1, le premier module de
    cartes ; semaine 2, le deuxième ; semaine 3, le troisième. Un compte neuf n'y trouve de cartes
    neuves que dans le premier chapitre.
11. **A1-D11, le titre d'une étape est un texte du cours.** Il entre dans `textesDuCours`, que
    lisent `contenus:client` et le hook `scripts/cours-absent.ts`.
12. **A1-D12, l'instantané de référence** range le planning dans `cours`, après `memoire`.

## Tranche A2 : les manuels, la Unit et les divisions de « Übersicht »

1. **A2-D1, la forme écrite.** `manuels` est une liste d'au moins un manuel, chacun un objet strict
   `{ id, titre }`. Une liste, pour que l'ordre des divisions soit celui de l'écriture : un objet
   JavaScript range d'abord les clés qui s'écrivent comme des entiers. `id` est un identifiant du
   format, tiré par `contenus:id`, inscrit dans `ids.lock` et unique dans tout le contenu : le
   format renvoie partout par identifiant, et un identifiant ne se tire jamais du texte
   (invariant 4). `titre` est un texte non vide, unique parmi les manuels du cours.
2. **A2-D2, trois clés par module de cartes.** `manuel` (l'identifiant d'un manuel du cours),
   `chapitre` (un entier positif, son numéro dans ce manuel) et `unit` (un entier positif), toutes
   facultatives. Un schéma admet une seule clé facultative, `manuel`. Les autres types de module
   n'en admettent aucune. `numero` reste obligatoire et unique dans le cours ; il garde son rôle
   dans l'instantané et sert de numéro quand le cours n'a pas de manuels.
3. **A2-D3, tout ou rien, au niveau du cours.** Un cours qui écrit `manuels` donne les trois clés à
   chacun de ses modules de cartes ; un cours qui ne l'écrit pas n'en donne aucune, ni `manuel` à
   un schéma. Chaque clé qui manque, ou qui est de trop, est une erreur à elle, dans le fichier du
   module, au lieu de la clé.
4. **A2-D4, les contrôles croisés** vont dans `src/domaine/contenu/analyse-manuels.ts`, comme ceux
   des feuilles dans `analyse-feuilles.ts`, pour que `analyse.ts` reste sous 1000 lignes. Deux
   manuels n'ont pas le même titre. Dans un cours qui nomme ses manuels, `manuel` désigne l'un
   d'eux, et deux modules de cartes n'ont pas le même chapitre du même manuel. Un manuel qu'aucun
   module ne cite est admis, et ne se montre pas.
5. **A2-D5, les divisions.** Une par manuel, dans l'ordre de `manuels`, puis « Übungen », toujours
   la dernière. Une division de manuel range ses modules de cartes dans l'ordre du livre
   (`chapitre` croissant), puis ses schémas dans l'ordre du cours. « Übungen » reçoit, dans l'ordre
   du cours, les modules de cartes et les schémas sans manuel lisible ; « Übersicht » y ajoute la
   morphologie, les textes, les exercices et les feuilles, à leur place d'avant. Une division vide
   ne se montre pas.
6. **A2-D6, le mode des divisions** s'allume dès qu'un module de cartes ou un schéma a un manuel
   lisible. Sinon, chaque écran s'affiche exactement comme avant : « Kapitel », puis « Weitere
   Übungen ». Une seule condition tient la promesse « un cours sans ces clés s'affiche comme
   avant ».
7. **A2-D7, le numéro d'un chapitre** (`numeroAffiche`) est son `chapitre` quand il a un manuel
   lisible, sinon son `numero`. Il remplace `numero` partout où le client montre le numéro d'un
   chapitre : la pastille d'« Übersicht », les options du choix, les cases de la Prüfung,
   l'étiquette « Kap. n » d'une carte et le groupe « Kapitel n » du résultat de la Prüfung. Ce
   groupe dit aussi son manuel, « Kapitel {n} · {manuel} » : deux manuels peuvent avoir chacun un
   chapitre n. Le cadrage ne nommait que la pastille ; le plan a tranché pour « partout », pour
   qu'un chapitre n'ait qu'un numéro à l'écran.
8. **A2-D8, « Übersicht » en mode divisions.** Un intertitre `h2` par division (le titre du
   manuel, ou « Übungen »), avec son `id` (`apercu-manuel-<id>`, `apercu-uebungen`), puis la liste
   `ul.chapters` qu'il nomme (`aria-labelledby`). La ligne d'un chapitre garde sa forme ; une
   étiquette « Unit {n} » (`span.pill.unit`) suit son titre quand il a une Unit lisible, en mode
   divisions seulement. Les schémas d'une division partagent une ligne « Schemata » : leurs titres
   joints par « · », les points de ces seuls schémas. La légende des boîtes vient une fois, juste
   avant la dernière section, ou à la fin s'il n'y en a pas : sa place d'avant.
9. **A2-D9, « Üben » d'une ligne de schémas** ouvre l'onglet sur un schéma de cette ligne : si le
   schéma choisi n'en est pas, le premier de la ligne devient le choix. En mode plat, rien ne
   change.
10. **A2-D10, le choix du chapitre** (Karteikarten, Quiz) en mode divisions : un `optgroup` par
    division qui a des chapitres, ses options dans l'ordre de la division, libellées
    « {n} · {titre} » ; puis « Alle Kapitel », puis « Arbeitsblätter » dans le Quiz, hors des
    groupes. La valeur d'une option reste l'identifiant du module : les préférences gardées ne
    changent ni de forme ni de sens. Ni choix « tout un manuel », ni Unit dans le libellé : la
    liste reste courte sur un téléphone.
11. **A2-D11, les cases de la Prüfung** en mode divisions : un `fieldset` par division qui a des
    chapitres, nommé par sa `legend`, avec sa grille `.checks`. « Alle » et « Keine » valent pour
    tous les chapitres ; les chapitres gardés restent dans l'ordre du cours.
12. **A2-D12, le client lit sans rigueur.** `lireManuels` rend `[]` pour ce qu'il ne comprend pas
    (pas une liste, une liste vide, un manuel sans `id` ou sans `titre` texte, deux fois le même
    `id`). `rangementDuChapitre` ne garde `manuel` et `chapitre` que si `manuel` nomme un manuel lu
    et que `chapitre` est un entier positif, et `unit` que si c'est un entier positif. Un schéma
    n'a de manuel que si sa valeur nomme un manuel lu. Rien ne lève : un module illisible va dans
    « Übungen », et des manuels illisibles laissent le cours en mode plat.
13. **A2-D13, les titres des manuels sont des textes du cours** : ils entrent dans
    `textesDuCours`.
14. **A2-D14, l'instantané de référence.** `manuels` va dans `cours`, après `planning` ; une entrée
    de `chapitres` porte `manuel`, `chapitre` et `unit` après `titre`, une entrée de `schemas`
    porte `manuel` après `titre`, chacun seulement s'il est écrit. L'instantané d'un cours sans ces
    clés ne change pas.
15. **A2-D15, trois libellés**, en allemand, dans `textes-cours.ts` : « Übungen », « Unit {n} »,
    « Kapitel {n} · {manuel} ».
16. **A2-D16, le cours d'exemple** nomme deux manuels inventés, « Beispielbuch Küche » puis
    « Beispielheft Geräte ». L'ordre du livre y diffère de celui du cours, deux manuels ont un
    chapitre 1, `herd` est dans le Beispielheft, `messer` sans manuel : chaque sorte de division
    s'y montre.
17. **A2-D17, un cours monté reçoit `manuels` et les clés de ses modules une version après celle
    qui porte A2** : les schémas stricts d'une image précédente les refuseraient (invariant 8).
    Seul le cours d'exemple, que l'image porte, les reçoit d'emblée. A2 est entrée dans la
    `v0.17.0`, avec la première PR de B : `docs/format-des-contenus.md` date la clé de cette
    version.

## Tranche B : le rythme des cartes neuves et le pré-test

1. **B-D1, sans planning lisible, rien ne change.** Pas de clé, ou un planning que `lirePlanning`
   ne comprend pas (A1-D9) : les cartes neuves de « Heute » viennent du choix de Karteikarten
   (M2-P10), le quota est le plafond moins les cartes découvertes aujourd'hui (M2-P9), et aucun
   pré-test ne se propose. Des empreintes figées de la clé et de la file de « Heute » le tiennent.
2. **B-D2, les cartes neuves viennent des modules ouverts, dans l'ordre du planning.** Les modules
   des étapes ouvertes, étape après étape et dans l'ordre où chacune les cite, puis ceux qu'aucune
   étape ne nomme (M4-C3), dans l'ordre du cours ; dans un module, les unités directes dans l'ordre
   du cours, puis les inverses. Le sens choisi dans Karteikarten filtre ces unités ; le chapitre
   choisi ne joue plus dans « Heute » et garde son rôle dans Karteikarten et dans le Quiz (M4-C4).
   Les candidates passées à `composerSeance` sont les `quota` premières unités neuves de cet ordre ;
   quand les dues laissent moins de places que le quota, `composerSeance` tire au hasard parmi
   elles, si bien que « le plus ancien d'abord » ne vaut qu'au grain de la coupe. Avec un
   planning, cette règle remplace la première phrase d'A1-D7 et M2-P10, ce qui rattrape un retard
   et supprime le silence d'A1 sur un chapitre choisi fermé.
3. **B-D3, le rythme et le quota.** `U` est l'ensemble des unités de B-D2 ; `N`, celles que
   l'ordonnanceur laisse en boîte 0 ; `Dp`, celles de `U` découvertes aujourd'hui ; `Dc`, les cartes
   du cours découvertes aujourd'hui, où qu'elles l'aient été. `R = |N| + Dp` ; `J` est le nombre de
   jours d'aujourd'hui, compris, à l'horizon, exclu, et vaut 1 au moins. Alors
   `rythme = min(nouvelles_par_seance, ⌈R / J⌉)` et
   `quota = max(0, min(nouvelles_par_seance − Dc, rythme − Dp))`. À ce rythme, tout ce qui est
   ouvert est vu avant l'horizon, une carte au moins par jour tant qu'il en reste. `R` ne bouge pas
   quand on répond aujourd'hui : le rythme compte les cartes du jour, pas celles d'une séance.
   Exemple, sur le cours d'exemple et un compte neuf : 18 unités en semaine 1, `J = 7`, un rythme
   de 3.
4. **B-D4, l'horizon** : la première ouverture d'une étape, de tout genre, strictement après
   aujourd'hui ; s'il n'y en a plus, la dernière ouverture plus `JOURS_APRES_LA_DERNIERE_ETAPE`
   (7) jours ; puis, si `memoire.examen` tombe après aujourd'hui et avant ce jour, l'examen. Un
   horizon d'aujourd'hui ou passé donne `J = 1`. L'issue répartit les cartes « entre sa séance et la
   suivante » : la dernière étape n'a pas de suivante, et sept jours sont le pas d'un planning
   relatif. Un écart à la spec (voir « Les écarts à la spec »).
5. **B-D5, le retard** : ce qui reste neuf dans une étape ouverte avant la dernière ouverture
   passée, et, depuis le début, dans un module qu'aucune étape ne nomme. Il n'a pas de calcul à
   lui : il est dans `R`, se répartit sur les jours qui restent jusqu'à l'horizon et passe en tête
   de la séance (B-D2). Un jour manqué relève le rythme des jours qui restent, jamais au-delà du
   plafond. Un cours dont de gros modules ne sont nommés par aucune étape est au plafond dès le
   premier jour. La tranche C, qui montre le retard, reprend cette définition (C-D5).
6. **B-D6, une étape relative suit la même règle**, sur ses ouvertures calculées depuis le départ
   (A1-D5). Une étape `revision` compte comme une autre pour l'horizon (elle est « la suivante »),
   et ses modules comme ceux de toute étape ouverte ; ce qu'elle mêle à la séance est l'affaire de
   la tranche C. Pendant un trou du planning, `J` est grand et le rythme bas, et rien ne s'ouvre de
   plus.
7. **B-D7, la clé du jour** (`cleDuJour`) ne change pas : le rythme y entre par les candidates et
   le quota. Avant le premier geste, une clé qui change recompose la séance ; après, plus rien
   (M2-P6). Une réponse de pré-test ne la change pas (B-D9).
8. **B-D8, un dixième mode, `pretest`.** `resultat: { juste, mode: 'pretest' }`, sur l'unité
   directe de la carte posée, `type: 'reponse'`, `v` à 1. Il se pose toujours en choix, au sens
   direct, si bien que le mode dit aussi le geste. `resultat` est le JSON que le dépôt, l'export et
   la relecture recopient tel quel (M3-P1) ; un `type` nouveau aurait changé le format de
   l'ADR-0004. L'ADR-0014 le décide et précise l'ADR-0013, dont il déroge à « le geste et non
   l'onglet ».
9. **B-D9, rien de ce qui se dérive du journal ne compte une réponse `pretest`.** Une seule
   fonction, `journalDesRevisions` (`src/domaine/progression/etat.ts`), rend le journal sans
   doublon et sans elles ; elle sert à l'état de Leitner et de FSRS, à la projection et à
   l'ajustement, aux découvertes du jour et aux réponses par jour (donc à la série et à l'activité
   de « Fortschritt »). Une carte pré-testée reste neuve, et sa première vraie réponse est sa
   découverte ; une faute de pré-test ne rend rien dû. Le rapport de suivi ne la met dans aucune
   case, et l'ajustement la compte parmi les réponses écartées. La comptent : le départ du
   planning (A1-D5), l'export, la suppression et la purge d'un compte, et le pré-test lui-même
   (B-D12). Une règle, un seul lieu, et une notice qui peut dire que le pré-test ne compte pas
   dans la progression.
10. **B-D10, deux versions, deux PR** (invariant 8, ADR-0013). La PR 1 fait la version N : le
    serveur et le domaine acceptent `pretest` et l'ignorent partout, le rythme et l'ordre de B-D2
    entrent dans « Heute », l'ADR-0014 est écrit ; le client n'émet pas le mode. La PR 2 fait la
    version N+1 : le pré-test, son écran, son émission, la notice et le seuil du retour arrière.
    Elle ne se fusionne qu'une fois N en prod et les personnes prévenues du changement de la
    notice (ADR-0007) ; Edouard ne pose N+1 qu'une fois `/api/sante` à N, pour que
    `deployer.sh --retour` revienne à N, et non à N−1, qui refuserait les pré-tests. N est la
    `v0.17.0`. L'issue promet trois PR d'implémentation pour le lot : la tranche B en prend deux,
    comme A (M4-R1).
11. **B-D11, l'étape du pré-test.** La première étape `cours`, dans l'ordre du planning, qui
    s'ouvre dans un à trois jours (`FENETRE_DU_PRETEST`, 3), datée ou relative, dont les unités
    directes ont au moins deux réponses distinctes, dont une unité directe au moins est neuve, et
    dont le pré-test n'est pas fait (B-D12). Le jour de son ouverture, l'étape est ouverte : plus
    de pré-test. Ni une étape `revision`, ni la semaine 1 d'un planning relatif (toujours
    ouverte). Une étape relative a son jour d'ouverture, qui tient lieu de séance.
    `optionsQcm` écarte les réponses égales à la bonne : une seule carte, ou deux cartes de même
    verso, ne font pas une question à choix. Un écart à la spec.
12. **B-D12, une seule fois.** Le pré-test d'une étape est fait dès que le journal porte une
    réponse `pretest` à une unité, directe ou inverse, d'un module qu'elle ouvre : un module de
    l'étape qu'aucune étape d'ouverture antérieure ne cite. Une étape qui n'ouvre aucun module n'a
    pas de pré-test (un écart à la spec). Commencé puis quitté, il ne revient pas ; tant qu'il
    n'est pas commencé, l'offre revient chaque jour de la fenêtre. Le journal est la seule mémoire
    admise (invariant 5).
13. **B-D13, les questions.** Au plus `TAILLE_DU_PRETEST` (5), tirées par le hasard de l'onglet
    parmi les unités directes neuves des modules que l'étape ouvre (une par carte), au moment où
    la personne commence ; elles sont alors figées dans l'état de l'onglet. Une question est la
    carte au sens direct, avec les options d'`optionsQcm` tirées parmi les unités directes des
    mêmes modules : quatre au plus, deux au moins. Le tirage diffère d'un appareil à l'autre :
    « fait » se lit dans le journal. Voir le terme avant sa définition est l'ordre de la classe, et
    la question à choix est la forme de pré-test la plus étudiée.
14. **B-D14, l'écran.** L'offre est un cadre en tête de l'onglet, sur la séance avant le premier
    geste, sur l'écran de fin et sur « Heute ist nichts fällig » ; jamais en pleine séance. Il dit
    l'étape par son titre, porte la phrase sur l'effet de pré-test et le bouton « Vortest
    starten ». Le pré-test commencé prend la place de la séance du jour, qui reste gardée telle
    quelle, et « Zur Tagesrunde » y ramène à tout moment. Après le choix, la bonne option en vert,
    l'option choisie, si elle est fausse, dans le style neutre `sel`, jamais en rouge, et « Jetzt
    kennst du die Antwort. » ; aucun compte de justes. Une erreur de pré-test n'est pas une faute,
    et l'écran ne la montre jamais comme telle.
15. **B-D15, huit libellés**, en allemand, dans `textes-cours.ts`, orthographe suisse, sans « ß » :
    l'offre, la phrase sur l'effet de pré-test (« zählen nicht als Fehler »), le bouton, la ligne
    « Vortest · Frage {i} von {n} », « Jetzt kennst du die Antwort. », « Vortest geschafft! »,
    la phrase de fin et « Zur Tagesrunde ». Un neuvième libellé, `heute_pretest_richtig`, nomme la
    bonne réponse aux lecteurs d'écran.
16. **B-D16, le pré-test vit dans l'état d'onglet** `heute/pretest`, `null` tant qu'il n'est pas
    commencé. Un pré-test qui a une réponse et une question qui reste est une séance en cours
    (`pretestEnCours`, du genre `journalisee`) : il retient la mise à jour de l'application
    (2a-D3). Chaque réponse va au journal à son geste ; la dernière rangée, `finDeSeance`
    synchronise, comme à la fin d'une séance du jour.
17. **B-D17, la notice dit le mode nouveau, dans la PR 2 seulement** : elle décrit ce que
    l'application fait (M3-P8). Elle gagne, parmi les manières de répondre, la réponse à un
    pré-test, donnée avant d'avoir appris l'élément, qui ne compte pas dans la progression, en
    français et en allemand. `NOTICE_VERSION` prend la date de fusion de la PR 2, le 17/11/2026
    (ADR-0007).
18. **B-D18, le seuil du retour arrière** s'écrit dans `docs/exploitation.md`, « Revenir en
    arrière », à côté de celui de la `v0.14.0` : une fois la version qui émet `pretest` en ligne,
    le serveur ne redescend plus sous la `v0.17.0`. Un serveur plus ancien refuse tout lot qui
    porte `pretest`, et la file reste entière jusqu'au retour d'un serveur qui l'accepte. Sous N,
    l'application remise en service compterait en plus chaque réponse `pretest` comme une réponse
    ordinaire.
19. **B-D19, le cours d'exemple ne change pas** : son planning relatif et son plafond de 15 donnent
    un rythme de 3 à un compte neuf. Le bout en bout de la séance du jour attend ce rythme, puis,
    l'horloge du navigateur figée cinq jours plus tard, passe le pré-test de la semaine 2.

## Tranche C : le Lernplan et les révisions

1. **C-D1, sans planning lisible, rien ne change.** `ongletsDuCours` rend la liste d'avant,
   « Heute » compose la même séance sous la même clé (les empreintes figées restent sans
   retouche), et « Übersicht » se rend à l'identique, sa barre des boîtes ayant déménagé (C-D6).
2. **C-D2, la vue est un onglet à elle**, `planning`, à `/cours/<id>/planning`, libellé
   « Lernplan », juste après « Heute », présent seulement quand `planningDuCours` lit un planning.
   Sur un cours sans planning, ou sur un appareil d'une version d'avant, cette adresse mène à
   l'aperçu (décision 20 du lot 1d). Le cours a deux axes : « Übersicht » suit le manuel,
   « Heute » et le planning suivent le calendrier.
3. **C-D3, l'étape en cours** : la dernière étape ouverte, dans l'ordre du planning, tant
   qu'aujourd'hui précède l'horizon du rythme (B-D4) ; sinon aucune (avant la première ouverture,
   ou à partir de la dernière ouverture plus sept jours). L'examen ne termine jamais une étape : il
   n'entre dans l'horizon que tant qu'il est après aujourd'hui. À ouverture égale, l'étape placée
   après est en cours. Une exception : la dernière étape, quand elle est de genre `revision` et
   que `memoire.examen` tombe à sa date plus sept jours ou après, reste en cours jusqu'au jour de
   l'examen compris ; le rythme des cartes neuves ne change pas. Une dernière étape de révision
   annonce la préparation de l'examen, et la couper au bout de sept jours laisserait sans révision
   les semaines qui le précèdent. Le plan listait deux conditions de plus ; le code les a
   retirées, la revue de la tranche et la revue finale ont prouvé qu'elles étaient impliquées par
   les autres (M4-R3). La doc ne décrit que le cas où l'examen tombe sept jours ou plus après
   l'ouverture ; une dernière étape de révision dont l'examen tombe plus tôt reste en cours jusqu'à
   sept jours après son ouverture, donc encore après l'examen (constat de la revue finale, conforme
   à la lettre).
4. **C-D4, les éléments d'une étape et son état.** Ses éléments sont les posables de ses modules :
   les cartes dans les deux sens, quel que soit le sens choisi dans Karteikarten, comme
   « Übersicht » compte un chapitre, puis les mots, les points de schéma, les exercices et les
   questions fermées de fiche. Son état : `sure` si elle a au moins un élément et que tous sont
   sûrs (boîte 4 ou 5, `BOITE_SURE`), même avant son ouverture ; sinon `a-venir` si son ouverture
   est après aujourd'hui ; sinon `ouverte`. Pour un module de cartes, le Lernplan et « Übersicht »
   disent le même compte « sicher » ; une étape apprise d'avance dans Karteikarten se dit sûre.
5. **C-D5, le retard reprend B-D5 pour les étapes** : les cartes neuves, au sens choisi, d'une
   étape dépassée, c'est-à-dire ouverte avant la dernière ouverture passée ; zéro pour l'étape en
   cours, pour une étape ouverte le même jour qu'elle, pour une étape à venir et pour une étape
   sans carte. Il suit le sens choisi, comme `R` en B-D3 : sinon les cartes inverses, que « Heute »
   ne tire jamais pour qui ne travaille que le sens direct, seraient un retard sans fin. Un module
   qu'aucune étape ne nomme n'est pas dans la vue. Un planning posé en cours de semestre affiche
   d'un coup le retard de toutes les étapes passées. Un retard dit comme une chose à faire, que
   « Heute » sert d'abord, aide sans décourager.
6. **C-D6, l'écran du Lernplan** (`Planning.tsx`) : en tête, le compte à rebours de « Heute »
   (`ligneDExamen`, sortie de `Heute.tsx` vers `composants-cours.tsx`) ; puis une liste, dans la
   forme des lignes d'« Übersicht », une ligne par étape, dans l'ordre du planning : son rang, son
   titre (texte du cours servi), « Wiederholung » pour une étape `revision`, « ab {datum} » et
   « {sures}/{total} sicher », son état en pastille (`unit` à venir, `frei` ouverte, `ok` sûre ;
   jamais `offen`, qui dit « Noch nicht beantwortet » dans l'Ergebnis d'une fiche), la barre des
   boîtes d'« Übersicht » (`Barre`, déplacée dans `composants-cours.tsx`) et la ligne du retard. La
   date s'écrit `JJ.MM.AAAA`, comme la notice allemande. L'étape en cours porte
   `aria-current="step"` et la pastille « Jetzt » ; les autres lignes n'ont pas l'attribut. Ni
   pourcentage, ni comparaison avec d'autres personnes, ni rouge, ni bouton : rien n'est bloqué
   (M4-C4). Un retour qui porte sur la tâche aide ; un score ou un rouge qui juge la personne
   décourage.
7. **C-D7, dix libellés du Lernplan**, en allemand, dans `textes-cours.ts` : « Lernplan »,
   « Kommt noch », « Freigeschaltet » (et non « Offen », qui dit déjà ce qui reste dans
   `heute_progression`), « Sicher », « Jetzt », « Wiederholung », « ab {datum} »,
   « {sures}/{total} sicher », « 1 neue Karte zum Nachholen » et « {n} neue Karten zum
   Nachholen ».
8. **C-D8, à une étape de révision**, quand l'étape en cours est de genre `revision`, la séance du
   jour mêle aux dues et aux cartes neuves des révisions : des éléments déjà vus des étapes
   ouvertes, que l'ordonnanceur ne rend pas dus aujourd'hui, et dont la moitié de l'intervalle
   courant s'est écoulée (C-D9). Les cartes neuves gardent leur rythme (B-D6). Une révision est
   une réponse comme une autre : juste, elle fait monter la boîte et repart de l'intervalle de la
   nouvelle boîte, en Leitner comme en FSRS, et ce gain reste au journal. Rappeler ce qu'on a
   appris, des jours après et en mêlant les étapes, prépare mieux un examen que la seule
   répétition à l'échéance.
9. **C-D9, les révisables.** Les posables, de tout genre, dont le module est cité par une étape
   ouverte, l'étape de révision comprise ; vus (boîte 1 au moins au journal des révisions : un
   pré-test ne rend rien révisable) ; pas dus aujourd'hui ; sans réponse aujourd'hui ; et parvenus
   à la moitié au moins de leur intervalle courant :
   `2 × joursEntre(dernière, aujourd'hui) ≥ joursEntre(dernière, échéance)`. Un module qu'aucune
   étape ne nomme n'en donne pas : l'issue dit « les étapes ». Sans ce seuil, une révision juste
   chaque jour mènerait en Leitner de la boîte 2 à la boîte 5 en trois jours, pour de bon.
10. **C-D10, l'ordre et le nombre.** Les révisables se prennent tour à tour, une étape ouverte
    après l'autre dans l'ordre du planning ; dans une étape, les plus fragiles d'abord : la boîte
    croissante, puis l'échéance croissante, puis l'ordre du cours. Le nombre du jour est
    `max(0, TAILLE_DE_SEANCE − répondus)`, `répondus` étant les éléments du cours répondus
    aujourd'hui, borné à zéro avant la coupe ; la séance n'en prend que ce que ses places laissent.
    Une séance pleine par jour, au plus, espace l'effort sur les jours, et recharger l'application
    n'apporte pas une seconde ronde.
11. **C-D11, la composition.** `composerSeance` ne change pas. `avecRevisions` prend la séance
    composée, ajoute au plus `max(0, TAILLE_DE_SEANCE − longueur de sa file)` révisions, les mêle
    aux dues par le hasard de l'onglet et laisse les cartes neuves en fin de file. Sans révision,
    il n'est pas appelé : même séance, mêmes tirages. Une révision se pose avec l'écran de son
    onglet et entre au journal sous le mode de son geste : ni mode, ni type, ni champ nouveau. Une
    révision manquée revient une fois, comme toute faute (M2-P3), et devient due. L'écran de fin ne
    propose « Nächste Runde » que pour des dues : une révision n'en relance pas.
12. **C-D12, la clé du jour** gagne les révisions en cinquième part, seulement quand il y en a :
    `…|{quota}|{révisions}` ; sans révision, la clé est celle d'avant, caractère pour caractère.
    L'état de « Heute » garde les identifiants des révisions retenues, pour les compter à l'écran.
13. **C-D13, l'écran de « Heute » avec des révisions** : la ligne de compte ajoute
    « · {n} zum Auffrischen » (et non « zum Wiederholen », qui dit déjà les dues) ; sous elle, une
    phrase dit l'étape et la raison, et ne paraît que s'il reste des révisions dans la file. Une
    phrase qui dit pourquoi la séance est plus longue aide à accepter l'effort.
14. **C-D14, un trou du planning n'ouvre rien.** A1-D6 n'ouvre un module qu'avec une étape ouverte,
    B-D2 ne tire les cartes neuves que des modules ouverts, et B-D4 étale ce qui est ouvert
    jusqu'à l'ouverture suivante. Un test du domaine et un test de l'onglet le prouvent, et la doc
    le dit aux mots de l'issue. La matière nouvelle suit la classe ; un trou laisse la place aux
    dues. Avec l'écart de M4-C3 (voir « Les écarts à la spec »).
15. **C-D15, le cours d'exemple gagne une quatrième étape**, « Woche 4 – Wiederholung »,
    `semaine: 4`, `genre: "revision"`, sans module. Ni clé ni forme nouvelles. Son examen inventé
    (`2030-06-30`) tombe bien après : un compte de l'exemple reste en révision de sa quatrième
    semaine jusqu'à ce jour-là. La liste figée des onglets de l'exemple gagne `'planning'` après
    `'heute'`.
16. **C-D16, invariant 8.** La tranche n'ajoute ni clé de manifeste, ni route d'API, ni champ du
    cours servi, ni mode du journal. L'adresse `/cours/<id>/planning` n'existe que dans le client :
    le service worker et le serveur rendent `index.html` à toute navigation, et un client d'avant
    la lit comme un onglet inconnu, donc l'aperçu. Aucun ordre de versions. La notice ne change
    pas : une révision est une réponse ordinaire.
17. **C-D17, la cinquième PR d'implémentation.** A1, A2 et les deux PR de B en ont fait quatre
    (M4-C1, B-D10), et la tranche C fait la cinquième. L'écart se déclare dans la PR.

## Les écarts à la spec

Chacun a été déclaré dans la PR qui le porte, avec la promesse qu'il touche et l'accord d'Edouard.
Un écart se pèse contre chaque promesse de l'issue qu'il touche, pas contre la seule tranche en
cours (M4-R4).

- **Plus de trois PR d'implémentation** : cinq en tout, deux pour A, deux pour B (une par
  version), une pour C (M4-C1, B-D10, C-D17). Promesse : « Le lot se livre en trois PR
  d'implémentation ». Accord du 15/11/2026, renouvelé le 16/11/2026 pour la PR de C.
- **L'horizon du rythme s'arrête à l'examen** quand il tombe avant la séance suivante, ou avant les
  sept jours qui suivent la dernière étape (B-D4). Promesse : B, « les cartes d'une étape se
  répartissent entre sa séance et la suivante ». Accord du 15/11/2026.
- **Un module de cartes qu'aucune étape ne nomme est ouvert dès le premier jour**, donne des cartes
  neuves à « Heute » et compte dans le rythme (M4-C3, B-D5, C-D14). Promesses : A, « Les cartes
  neuves de « Heute » ne viennent que des étapes ouvertes » ; B, « les cartes d'une étape se
  répartissent entre sa séance et la suivante » ; C, « Pendant un trou du planning, aucune carte
  neuve n'est ajoutée au-delà des étapes ouvertes ». Accord du 15/11/2026. Déclaré contre B et C
  dans leurs PR, et contre A à la clôture, la revue finale ayant vu qu'il touchait aussi A.
- **Le pré-test se propose de un à trois jours avant l'étape**, et compte au plus cinq questions,
  moins quand l'étape a moins de cartes (B-D11, B-D13). Promesse : B, « Trois jours avant une
  séance, « Heute » propose un pré-test de cinq questions sur l'étape à venir ». Accord du
  15/11/2026.
- **Le pré-test ne porte que sur les modules que l'étape ouvre**, non sur tous ceux qu'elle cite :
  une étape qui n'en ouvre aucun n'a pas de pré-test (B-D12). Même promesse. Accord du 16/11/2026.

## Les relevés

- **La mutation** : groupe `domaine`, 97,72 % à A1 (`planning.ts` à 100 %), 98,05 % à A2 (les deux
  fichiers neufs à 100 %), `rythme.ts` à 100 % à la première PR de B, `pretest.ts` à 100 % (72
  mutants) à la seconde, 98,44 % à C (`semestre.ts`, 104 mutants, et `revisions.ts`, 82, à
  100 %). Les sept fichiers neufs du lot (`planning.ts`, `rythme.ts`, `pretest.ts`,
  `semestre.ts`, `revisions.ts`, `analyse-manuels.ts`, `manuels.ts`) sont dans
  `stryker.config.json`.
- **La durée du job `mutation (domaine)`** : 7 min 24 s à A1, 11 min 11 s à la seconde PR de B,
  17 min 10 s à C, puis 12 min 2 s à la PR des corrections de la revue finale, sur le même jeu de
  fichiers : elle croît avec chaque fichier ajouté, et varie du simple à une fois et demie d'un
  passage à l'autre ; voir « Les suites ».
- **La revue finale** (sur `8587582`) : 54 mutants posés à la main, 52 tués. Les deux survivants ne
  cachent pas de défaut (M4-R5). Le rendu des écrans d'un cours sans planning ni manuels, entre la
  base du lot et la tête : 46 rendus HTML identiques à l'octet.
- **Les tests** : 2 812 passés sur la tête de la tranche C (2 499 à A1, 2 595 à A2, 2 666 à la
  première PR de B, 2 727 à la seconde).

## Les arbitrages de l'exécution

1. **M4-R1, la tranche B s'est faite en deux PR, une par version** (B-D10) : la `v0.17.0` porte
   le serveur qui accepte `pretest`, avec A2 ; le pré-test qui l'émet attend l'étiquette suivante,
   qui est à Edouard. La tranche A en avait fait deux (A1 puis A2, M4-C1).
2. **M4-R2, la tranche C a été écrite sur une branche empilée.** Son plan citait le code de la PR du
   pré-test, pas encore fusionnée : la PR du plan ne pouvait pas s'ouvrir avant (EM-2).
3. **M4-R3, un agent a retiré deux conditions de C-D3** comme « impliquées », sans le prouver. La
   revue de la tranche l'a prouvé en énumérant les cas (près de 1,9 million), et la décision se lit
   désormais comme le code (LE-18).
4. **M4-R4, un écart accordé n'avait été déclaré que contre deux promesses sur trois** : celui de
   M4-C3. La revue finale l'a vu, et la clôture le déclare contre la promesse de A (LE-19).
5. **M4-R5, deux mutants survivent à la revue finale.** Celui de `analyse-manuels.ts` (la clé
   `${chapitre}` sans le manuel) ne tombe que sous les tests qui lisent l'exemple sur le disque ;
   celui de `revisions.ts` (retirer `repondues.has`) est équivalent, sauf quand le jour local
   recule. Ils sont dans « Les suites ».
6. **M4-R6, le rendu de la tranche C diffère du plan** sur quatre points, tous dits dans sa PR :
   `.pill.frei` prend `--box5` et non `--accent` (le contraste AA du texte, en clair et en
   sombre) ; la liste est un `ol` et « Wiederholung » un texte de la ligne `.meta`, les pastilles
   s'empilant pour tenir à 360 px ; un hook, `usePlanningDuCours`, lit le planning pour le
   Lernplan et pour « Heute » ; l'étape en cours n'a jamais de retard, même dans un planning non
   ordonné.
7. **M4-R7, les revues.** Chaque plan a été relu avant son exécution, chaque tâche relue par un
   agent qui ne l'avait pas écrite, chaque tranche relue en entier par un agent neuf. La revue
   finale, par un agent qui n'avait écrit aucune tranche, a rendu les constats que corrige la PR de
   corrections, puis ceux que ce document et `docs/registre.md` reprennent.
8. **M4-R8, une condition de zod 4.** Le `superRefine` d'un objet tourne encore quand un champ a
   déjà été refusé par un contrôle continuable ; il revérifie chaque valeur avant de la comparer
   (revue de A1, LE-21).

## Les limites

- **Le cours de l'instance a son planning au staging, pas encore en prod**, à la clôture. Une PR
  du dépôt de données l'a posé le 17/11/2026 : le staging sert le compte à rebours, le rythme, le
  pré-test et le Lernplan. La prod, en `v0.17.0`, attend une étiquette de données pour le planning,
  et la version suivante du code pour le pré-test et le Lernplan. Le cours n'a pas de manuels, donc
  pas de divisions : ils viennent une version après la `v0.17.0` (A2-D17). Depuis : la `v0.18.0` et
  l'étiquette de données `donnees-2026.11.17.1` sont en prod le 17/11/2026, avec le planning, le
  pré-test et le Lernplan.
- **Ce qui a été vu sur un téléphone Android**, au staging, par Edouard, le 17/11/2026 : le
  Lernplan, « Heute » et son compte à rebours, l'offre de pré-test. **Ce qui n'a été vu que par
  les tests et le bout en bout**, sur le cours d'exemple, au poste : les révisions d'une étape de
  révision (la première du cours de l'instance s'ouvre en janvier 2027), un lecteur d'écran
  (TalkBack), le passage de minuit, un autre fuseau ; le mode sombre des nouvelles pastilles n'a
  pas été confirmé sur appareil. L'allemand du lot (libellés, notice) n'a pas été relu par une
  personne germanophone.
- **Un appareil resté sur une version d'avant la `v0.17.0`** compterait un pré-test synchronisé
  comme une réponse ordinaire ; aucun test ne fait tourner l'ancien client.
- **Le bout en bout de la séance du jour** tient jusqu'au 19/06/2030 inclus (l'examen inventé de
  l'exemple) ; un garde le dit.
- **Un planning posé en cours de semestre** affiche d'un coup le retard de toutes les étapes déjà
  passées (C-D5) et peut mettre « Heute » au plafond dès le premier jour (B-D5).
- **Une étape de révision rend « sicher » plus tôt** : en Leitner, un élément revu à chaque
  mi-intervalle passe de la boîte 2 à la boîte 5 en sept jours au lieu de quatorze (C-D8).
- **Le rejeu du journal coûte en proportion de sa taille** (M3-R1) : les révisions, le rythme et
  le Lernplan l'appellent, mais rien n'a changé sur ce point ; ancrage#31 reste ouvert.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-18, une condition du plan retirée sans preuve ; LE-19,
  un écart pesé contre une seule promesse ; LE-20, une vérification de tests partielle ou sous
  charge ; LE-21, le `superRefine` de zod 4 ; EM-2, un plan de tranche qui cite du code non
  fusionné.
- **Dans « Au prochain passage » (ancrage#11)**, section « Les suites du lot M4 » : le contraste
  AA de `.pill.unit` et `.pill.ok`, d'avant le lot ; la durée du job `mutation (domaine)` ; la
  projection de `memoire:rapport`, qui ignore le planning, le rythme et les révisions ; l'ordre des
  groupes du résultat de la Prüfung avec des manuels ; le titre d'étape « Wiederholung » tout
  court, refusé par `contenus:client` et le hook `cours-absent` ; le nom du test
  `chaque_morceau_de_la_meta_est_insecable_dans_son_span` ; le mutant équivalent de
  `revisions.ts` ; la vérification sur appareil, l'ancien client et l'échéance de 2030.
- **La vérification sur Android** : faite par Edouard, au staging, le 17/11/2026, avec le planning
  du cours de l'instance. Ce qu'elle n'a pas couvert est dans « Les limites » et dans ancrage#11.
- **La mise en prod** : à Edouard. La prochaine étiquette `vX.Y.Z` porte le pré-test, le Lernplan
  et les révisions ; une étiquette de données porte le planning.
- **Le passage du cours de l'instance** : des PR du dépôt de données. Le planning est posé, avec
  une étape par séance transcrite ; les séances à venir auront la leur à leur transcription. Les
  manuels viennent une version après la `v0.17.0`, avec le retrait des suffixes « · Unit N » des
  titres du cours. L'ordre du résultat de la Prüfung par manuel se règle avant la PR des manuels
  (ancrage#11).
- **Parmi les lots suivants** : le rejeu d'une seule unité (ancrage#31), les éléments rebelles
  (ancrage#32).
