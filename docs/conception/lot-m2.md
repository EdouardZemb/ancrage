# Lot M2 — décisions et arbitrages

Le lot M2 (issue ancrage#14, milestone « Le parcours et la mémoire ») a donné au cours sa séance du
jour, « Heute » : une seule file qui mêle tout ce qui est dû aujourd'hui, quel que soit son type,
puis quelques cartes neuves. C'est le deuxième lot de la suite ouverte par ancrage-donnees#106. Il
met à l'écran l'échéance que l'ordonnanceur du lot M1 calcule pour toute unité répondue. Le lot a
livré :
- **le domaine de la séance** (ancrage#16) : `src/domaine/seances/heute.ts` liste ce qui se pose
  seul dans un cours, en tire les dues du jour, compose la file et la fait avancer ;
- **les écrans de question communs** (ancrage#17) : la question de cinq onglets sort dans
  `src/client/cours/questions/`, sans changement à l'écran ;
- **l'onglet « Heute »** et sa preuve de bout en bout (ancrage#18) : premier de la barre, et
  l'écran sur lequel l'accueil et le compte ouvrent le cours ;
- **les corrections de la revue finale** (ancrage#19) ;
- **deux décisions sur les cartes neuves**, prises après la revue (ancrage#20).

Son plan (ancrage#15) a été supprimé à la clôture, comme le veut la méthode. Ce document en garde
les décisions, avec leurs numéros (« M2-P<n> »), parce que le code y renvoie, et les arbitrages de
l'exécution (« M2-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** La spécification est le texte de ancrage#14.

## Les décisions du cadrage (12/11/2026)

Edouard a pris les défauts des huit questions du cadrage, puis a validé la spec et le plan, le
12/11/2026. La spec les porte : les types qui entrent dans la séance (les cartes dans leurs deux
sens, les mots, les points de schéma, les exercices et les questions fermées de fiche), les 20
éléments au plus, les dues avant les nouveautés, la faute qui revient une fois, le cours de
l'instance qui reste en Leitner.

## Les décisions du plan

1. **M2-P1, le chemin.** `/cours/<id>` reste l'aperçu (décision 20 du lot 1d). « Heute » est à
   `/cours/<id>/heute`, premier dans la barre, et c'est là que mènent l'accueil et le lien du
   compte (`cheminDOuverture`). Un onglet inconnu retombe toujours sur l'aperçu.
2. **M2-P2, les plus en retard.** Les dues sont mélangées, puis triées par échéance croissante,
   d'un tri stable : à échéance égale, le hasard départage, sans avantager un type. Les 20
   premières sont gardées, puis mélangées à nouveau pour l'ordre de passage.
3. **M2-P3, une faute.** L'élément manqué va en fin de file une fois. Manqué une seconde fois, il
   sort de la file : il reste dû, et la séance suivante le reprend.
4. **M2-P4, le geste dans « Heute ».** Une carte se retourne, ou se tape si elle est inverse et
   que la préférence de saisie des cartes est cochée. Un mot se décompose ou se bâtit, au hasard.
   Un point de schéma se nomme parmi quatre propositions. Un exercice et une question de fiche se
   posent comme dans leur onglet.
5. **M2-P5, l'aperçu.** Son chiffre « à revoir aujourd'hui » est celui de « Heute ». La ligne de
   chaque chapitre garde son compte de cartes.
6. **M2-P6, la séance se fige à la première réponse.** Le cours s'ouvre sur « Heute » : sa séance
   se compose donc avant tout geste. Tant qu'aucune réponse n'y est donnée, elle se recompose
   quand sa clé change : le jour, les dues, les cartes neuves du choix, le quota du jour. Après la
   première réponse, elle ne suit plus le journal, comme une séance de cartes. Une séance finie
   se recompose le lendemain (M2-R4).
7. **M2-P7, une écriture par geste.** L'état d'un onglet s'écrit d'un bloc (`useEtatDOnglet` n'a
   pas de forme fonctionnelle) : un composant de question n'appelle jamais deux rappels dans le
   même geste. Quand un geste change la question et la juge, un seul rappel porte les deux.
8. **M2-P8, les touches.** Les touches d'une question sortent de l'onglet avec son composant :
   « Heute » les a aussi.
9. **M2-P9, un plafond par jour.** Dans « Heute », `nouvelles_par_seance` est un plafond par jour.
   Une carte est découverte aujourd'hui si sa première réponse au journal est du jour, où qu'elle
   ait été donnée (`decouvertesLe`). Le plafond atteint, une séance suivante ne reprend que les
   dues. Dans Karteikarten, la clé reste la taille d'une série de neuves.
10. **M2-P10, l'origine des cartes neuves.** Elles viennent du chapitre et du sens choisis dans
    Karteikarten (`unitesDuChoix`), le premier chapitre tant que rien n'est choisi. Quand ce choix
    n'a plus de carte neuve, « Heute » n'en propose plus. Les dues viennent de tout le cours.

M2-P9 et M2-P10 sont deux écarts à la spec, qui promettait des nouveautés « dans la limite
`nouvelles_par_seance` » sans dire d'où elles viennent. Edouard les a décidés le 12/11/2026, après
la revue finale : sans plafond par jour, chaque séance suivante rajoutait des cartes neuves, et un
tirage dans tout le cours faisait découvrir des chapitres que la classe n'a pas encore vus.

## Les relevés (12/11/2026)

- **La mutation** de `src/domaine/seances/heute.ts` : 95,05 %. Les cinq mutants qui survivent sont
  dans le comparateur des échéances, où le tri ne lit que le signe.
- **Le poids du client construit**, scripts et styles : 136 058 octets gzip avant le lot,
  138 078 après, soit 2 020 de plus.
- **Les tests** : 2 190 avant l'onglet, 2 243 à la revue finale ; le parcours de bout en bout
  déroule une séance mêlée sur le cours d'exemple.

## Les arbitrages de l'exécution (12/11/2026)

1. **M2-R1, la relecture du plan avant l'exécution** a rendu douze constats, dont un bloquant : la
   séance n'était pas tenue pour en cours pendant le verdict de la première réponse, la file
   n'avançant qu'à la suite. `heuteEnCours` lit donc aussi le verdict en attente. M2-P6, M2-P7 et
   M2-P8 viennent de cette relecture.
2. **M2-R2, le parcours de bout en bout vit dans la suite des deux versions**
   (`e2e/mise-a-jour/seance-du-jour.spec.ts`), pas dans la suite principale : celle-ci n'a qu'un
   lien de propriétaire, que le parcours de compte consomme, et le parcours de la séance veut un
   compte neuf sur une base à lui.
3. **M2-R3, le résultat compte les éléments, pas les réponses.** Un élément manqué puis réussi à
   son retour donne « 1 sur 1 » (`bilanDuJour`). La première version comptait les réponses, comme
   Karteikarten ; la spec dit « combien d'éléments sont passés ».
4. **M2-R4, la fin de séance.** Elle dit s'il reste des dues, sans compter un élément que la
   séance vient de réussir et que le journal n'a pas encore rangé. Sans due restante, elle dit la
   journée faite et mène à l'aperçu. Une application restée ouverte sur cet écran compose une
   séance neuve le lendemain.
5. **M2-R5, le bouton de suite ne nomme pas un genre** dans « Heute » : l'élément suivant peut
   être d'un autre genre que celui qu'on quitte. Dans son onglet, chaque question garde son
   libellé.
6. **M2-R6, un test qui dépendait du hasard.** Le test du premier geste de « Heute » dans l'écran
   du cours semait des mots parmi ses dues ; un mot se bâtit une fois sur deux, et le geste du
   test ne sait pas le bâtir. Il passait au poste et en CI, et a échoué sous Stryker. Ses dues
   n'ont plus de mot (registre, LE-15).
7. **M2-R7, les revues.** Chaque tâche a été relue par la session qui menait le lot, qui ne
   l'avait pas écrite. La revue finale, par un agent du modèle le plus capable, sur la tête de
   `main`, n'a rien trouvé de bloquant ; ses constats sont corrigés dans ancrage#19, sauf les deux
   décisions qui revenaient à Edouard (M2-P9, M2-P10).

## Les limites

- **Le cours de l'instance reste en Leitner.** « Heute » y lit des échéances plafonnées à 16
  jours : la charge de révision croît avec le volume du cours.
- **Les nouveautés ne sont que des cartes.** Un mot, un schéma ou un exercice se découvre dans son
  onglet, puis revient dans « Heute ».
- **Quand le chapitre choisi n'a plus de carte neuve**, « Heute » n'en propose plus et ne le dit
  pas : on change de chapitre dans Karteikarten.
- **Les appariements, les classements, les questions ouvertes et les textes annotés** restent dans
  leur onglet : ils ne se posent pas seuls.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-15, le test qui dépendait du hasard (M2-R6).
- **Dans « Au prochain passage » (ancrage#11)** : le double appui entre deux questions de genres
  différents ; le silence de « Heute » quand le chapitre choisi est épuisé ; les tests écrits
  après leur code ; la place du parcours de bout en bout.
- **La vérification sur Android** : faite par Edouard le 12/11/2026, au staging, sans remarque
  rapportée.
- **Le lot suivant** (ancrage#21) : FSRS pour un cours réel, ajusté sur le journal et suivi dans
  la durée.
