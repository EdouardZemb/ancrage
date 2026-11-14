# Lot M3 — décisions et arbitrages

Le lot M3 (issue ancrage#21, milestone « Le parcours et la mémoire ») donne ce qu'il faut pour faire
passer un cours monté de Leitner à FSRS sans parier sur des réglages par défaut : mesurer, ajuster,
basculer chapitre par chapitre, et suivre l'effet. C'est le troisième lot de la suite ouverte par
ancrage-donnees#106, après le moteur (M1) et la séance du jour (M2). Il s'est fait en deux
versions, comme le veut l'invariant 8. Le lot a livré :
- **le mode d'une réponse au journal** (ancrage#24, ADR-0013) : le serveur l'accepte en `v0.14.0` ;
  le client l'émet, et la notice le dit, dans la version suivante (ancrage#37) ;
- **les clés `parametres`, `examen` et `chapitres` de `memoire`**, et l'algorithme `par-chapitre`
  (ancrage#25) ;
- **l'ordonnanceur qui les applique** (ancrage#26) : les poids du cours, le plafond d'avant
  l'examen, FSRS pour les chapitres nommés et Leitner pour le reste ;
- **l'écran `/mesure`** (ancrage#27), qui chronomètre le rejeu du journal sur l'appareil ;
- **deux outils du poste**, hors de l'image : `memoire:ajuster` (ancrage#28) et `memoire:rapport`
  (ancrage#29) ;
- **les corrections de la revue finale** (ancrage#38).

Son plan (ancrage#23) a été supprimé à la clôture, comme le veut la méthode. Ce document en garde
les décisions, avec leurs numéros (« M3-P<n> »), parce que le code y renvoie, et les arbitrages de
l'exécution (« M3-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** La spécification est le texte de ancrage#21.

## Les décisions du plan (12/11/2026)

Edouard a validé la spec et le plan le 12/11/2026.

1. **M3-P1, le mode vit dans `resultat`.** `resultat: { juste, mode? }` : la colonne `resultat` est
   déjà un JSON, que le dépôt, la relecture et l'export recopient tel quel. Ni migration, ni
   colonne. `v` reste à 1 : un autre `v` serait refusé par le serveur de la version précédente. Une
   fois qu'un client a pu émettre un mode, le serveur ne redescend plus sous la `v0.14.0` : un
   serveur d'avant refuserait le lot, et la file du cours resterait bloquée, sans perte, jusqu'au
   retour d'un serveur qui accepte (`docs/exploitation.md`).
2. **M3-P2, les modes.** Neuf valeurs, qui disent le geste et non l'onglet : `retournee` (carte
   retournée, jugée par la personne), `saisie` (réponse tapée, jugée par l'application), `corrigee`
   (saisie jugée fausse, puis déclarée juste par la personne), `choix` (une proposition parmi
   plusieurs, liste d'une phrase à trous comprise), `assemblage` (tuiles d'un mot), `pointage` (un
   point touché sur un dessin), `association` (appariement, classement), `montree` (réponse montrée
   puis jugée par la personne), `lecture` (le bilan d'un texte). Une réponse d'examen porte le mode
   de sa question.
3. **M3-P3, « par chapitre » est un algorithme à lui.** `memoire.algorithme` gagne la valeur
   `par-chapitre`, avec `chapitres`, la liste des modules de cartes en FSRS. Tout le reste du cours
   (les autres cartes, les mots, les points, les exercices, les fiches) reste en Leitner. Un
   appareil resté à la version précédente ne connaît pas cette valeur et retombe sur Leitner pour
   tout le cours : c'est le repli sûr. Garder `fsrs` avec une liste l'aurait fait appliquer FSRS à
   tout le cours. Le repli ne vaut que pour le client : un serveur d'avant la `v0.14.0` refuse de
   démarrer sur un manifeste qui porte une clé nouvelle. Après le premier manifeste neuf, on ne
   redescend donc plus sous cette version (`docs/format-des-contenus.md`, `docs/exploitation.md`).
4. **M3-P4, les paramètres.** `memoire.parametres` porte les 21 poids de FSRS-6, valides au sens de
   `checkFSRS6Parameters`. Sans eux, les poids par défaut. Ils valent pour `fsrs` comme pour
   `par-chapitre`. Avec `fsrs`, un appareil resté à la version précédente retire `parametres` et
   `examen`, qu'il ne connaît pas, et calcule avec les poids par défaut, sans plafond : ses
   échéances diffèrent jusqu'à sa mise à jour, au lancement suivant. C'est la limite déjà connue du
   lot M1 (M1-D6), que tient la règle « une version après ».
5. **M3-P5, le plafond.** `memoire.examen` porte une date. Pour une réponse donnée `n` jours avant
   elle, l'intervalle ne dépasse pas la moitié de `n`, arrondie vers le bas, et vaut un jour au
   moins. Le plafond porte sur l'échéance rendue, pas sur la stabilité que garde FSRS. Deux écarts
   à la spec, accordés par Edouard le 12/11/2026 : à un jour de l'examen, l'intervalle est d'un
   jour, plus que la moitié ; le jour de l'examen et après, il n'y a plus de plafond. Leitner n'est
   pas concerné : il plafonne déjà à son dernier intervalle, 16 jours dans le cours d'exemple.
6. **M3-P6, l'accord se dit à la commande.** La base n'a pas de champ d'accord, et n'en gagne pas.
   Le rapport d'une personne demande `--personne <identifiant>` et `--accord <JJ/MM/AAAA>`, la date
   où elle l'a donné, que le rapport imprime. Sans les deux, le rapport ne donne que des chiffres
   d'ensemble. Le plan fixait aussi leurs seuils, auxquels le code renvoie sous ce numéro : une
   personne est active à 20 réponses sur 28 jours ; sous trois personnes actives, le rapport
   s'arrête ; une case de moins de 20 réponses est omise. M3-R3 les a resserrés.
7. **M3-P7, la mesure sur téléphone.** Un écran de l'application, `/mesure`, fabrique en mémoire un
   journal inventé de la taille voulue et chronomètre son rejeu par chaque algorithme, sur
   l'appareil qui l'ouvre. Il ne lit ni n'écrit aucune donnée, et n'est lié depuis aucun écran. Il
   s'ouvre sans connexion, comme la notice, et ne lance une mesure qu'au bouton, la plus grande
   après un avertissement.
8. **M3-P8, la notice change avec le client qui émet**, pas avant : elle décrit ce que
   l'application fait.
9. **M3-P9, le passage d'un chapitre n'a pas de mécanisme à lui.** FSRS rejoue tout le journal :
   une unité déjà révisée garde son histoire, elle ne repart pas de zéro. Le nombre d'unités dues
   le jour du passage est donc de l'ordre de celui de Leitner la veille, et « Heute » l'étale par
   ses séances de 20. Un test compare les deux comptes sur un journal inventé d'un mois : FSRS ne
   dépasse pas une fois et demie Leitner. Au-delà, la question reviendrait à Edouard. Le pic
   réel se lira dans le rapport de suivi, au passage du cours de l'instance : celui d'une
   personne, avec son accord, ou celui d'ensemble, à trois personnes actives au moins.
10. **M3-P10, l'ajustement lit ce que le rejeu lit.** `etatsFsrs` traite chaque réponse comme une
    révision, celles d'un même jour à zéro jour d'écart. L'outil donne à l'optimiseur la même suite,
    tirée de la même fonction, pour que les paramètres ajustés soient ceux du calcul qui s'en sert.

## Les relevés

- **Le rejeu sur un téléphone Android**, par `/mesure`, au staging, le 13/11/2026, médiane de
  cinq rejeux :

  | Réponses | Leitner | FSRS | Par chapitre |
  |---|---|---|---|
  | 1 000 | 2,7 ms | 23,5 ms | 14,1 ms |
  | 10 000 | 24,9 ms | 188,8 ms | 105,3 ms |
  | 30 000 | 60,6 ms | 540,7 ms | 307,8 ms |

  Le seuil est de 300 ms pour 10 000 réponses (`docs/exploitation.md`, « Mesurer le rejeu sur un
  téléphone ») : il est tenu. À 30 000 réponses, FSRS sur tout un cours le dépasse, et le mode par
  chapitre le dépasse de peu (M3-R1).
- **La mutation**, sur la tête des corrections de la revue finale (14/11/2026) : 97,38 % pour le
  groupe `domaine`, 98,02 % pour le groupe `serveur`. `fsrs.ts`, `ordonnanceur.ts` et `reglages.ts`
  sont dans le premier.
- **Le poids du client construit**, scripts et styles : 140 997 octets gzip sur la tête du lot. Le
  lot M2 relevait 138 078 ; la mesure de ce lot a été refaite sans retrouver la commande du lot M2,
  et l'écart de 2 919 octets vaut sous cette réserve.
- **Les tests** : 2 437 passés sur la tête des corrections de la revue finale, dans 154 fichiers.

## Les arbitrages de l'exécution

1. **M3-R1, le relevé de `/mesure` ne bloque pas la `v0.14.0`** (13/11/2026). Le journal de la prod
   comptait alors environ 9 100 réponses : la ligne des 10 000 s'applique, sous le seuil. Le coût
   monte en ligne droite avec le journal, parce que chaque réponse rejoue tout. Un premier chapitre
   peut passer ; un cours entier attend que le rejeu ne recalcule que l'unité répondue (ancrage#31).
2. **M3-R2, un cours monté attend la version qui suit la `v0.14.0`.** La `v0.14.0` est la première
   à connaître `par-chapitre`, `parametres` et `examen` : un manifeste qui les porte n'entre au
   dépôt de données qu'une version plus tard (invariant 8), donc pas avant celle qui la suit.
3. **M3-R3, le rapport d'ensemble ne laisse pas déduire une personne.** La revue finale, puis trois
   relectures de ses corrections, ont chacune trouvé un moyen de retrouver quelqu'un sans son
   accord : les dates d'un compte ancien, un maximum de projection, une tuile, la différence entre
   un total et ses cases, un compte exact, la largeur d'une barre. Le rapport y répond par une
   seule règle, `caseAdmise`, pour toute case affichée : trois personnes distinctes au moins, vingt
   réponses ou vingt éléments au moins, aucune personne au-delà de 70 %. Il ne lit que les
   personnes actives au jour du rapport (vingt réponses sur les 28 jours qui finissent ce jour-là).
   Il n'imprime ni compte exact de réponses ou d'éléments par case, ni total : seuls le nombre de
   personnes actives et celui des éléments du cours sont dits, avec des pourcentages entiers. Une
   case refusée se fond (une boîte avec sa voisine, un délai ou un mode dans « autres ») ou
   disparaît (un jour, une semaine). La dernière relecture ne trouve plus de moyen de retrouver une
   case refusée.
4. **M3-R4, les limites déclarées du rapport d'ensemble.** `docs/exploitation.md`, « Le rapport de
   suivi », les écrit : un pourcentage entier laisse estimer une case fondue à quelques unités
   près ; à trois personnes, une médiane est la valeur de l'une d'elles ; les moyennes de la
   projection n'ont pas de contrôle de dominance ; deux rapports de dates voisines peuvent se
   comparer. Le seuil de trois personnes vient du plan (M3-P6) ; un seuil plus haut reste une
   question ouverte.
5. **M3-R5, l'ajustement se filtre comme le rejeu.** `memoire:ajuster` exige `--contenu` et accepte
   `--chapitre`, répétable. Il lit les cartes des chapitres donnés ; sinon celles de `chapitres` en
   `par-chapitre` ; toutes les unités en `fsrs` ; toutes les cartes sans `memoire`. Le seuil de
   1 000 révisions et la qualité avant et après se calculent sur ce filtre : la première version
   ajustait sur tout le journal des poids qui ne serviraient qu'à des cartes (M3-P10).
6. **M3-R6, une copie brute d'une base en WAL est refusée.** Le plan voulait que l'outil lise ce
   que la copie contient. Sans son fichier `-wal`, une copie brute peut être en retard de ce que le
   journal n'a pas encore rendu, sans que rien le dise. `ajuster` et `rapport` la refusent avant
   toute ouverture, sur les octets 18 et 19 de l'en-tête, et renvoient à `VACUUM INTO`. Aucun
   fichier n'est créé à côté.
7. **M3-R7, un test instable**, vu au job de mutation : deux réponses de la même
   milliseconde dans `useProgression.test.tsx`, dont l'ordre n'était pas fixé. Le test trie par
   unité avant de comparer.
8. **M3-R8, le banc de déploiement a vieilli pendant le lot.** Le 14/11/2026 à 00:00 UTC, le job
   `deploiement` est passé au rouge sur toute PR, sans qu'aucun fichier ait changé : l'horloge de
   test du banc, géré par le modèle, datait ses instantanés du 15/10/2026, et la purge de 30 jours,
   qui lit la vraie date, les retirait. Le défaut s'est corrigé au modèle (modele-projet#136), et
   le projet est passé en v0.11.1 (ancrage#39) avant la fusion des corrections.
9. **M3-R9, les revues.** Le plan a été relu avant l'exécution. Chaque tâche a été relue par un
   agent qui ne l'avait pas écrite. La revue finale, par un agent du modèle le plus capable, sur
   `25cab19`, a rendu les constats que corrige ancrage#38 ; ses corrections ont été relues trois
   fois, scénarios exécutés et une quarantaine de mutants à l'appui.

## Les limites

- **Le cours de l'instance reste en Leitner** à la clôture. `par-chapitre`, les paramètres et le
  plafond ne sont vérifiés qu'au poste, par les tests et le bout en bout sur le cours d'exemple.
  Ils se vérifieront sur un téléphone au passage du cours de l'instance, qui est une PR du dépôt
  de données.
- **Le rejeu coûte en proportion du journal** (M3-R1) : un cours entier en FSRS attend ancrage#31.
- **L'accord d'une personne est une déclaration** que l'outil ne contrôle pas (M3-P6).
- **Les paramètres valent pour tout le cours**, tous comptes confondus : il n'y en a pas par
  personne.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-16, le banc à date figée (M3-R8) ; LE-17, le rapport
  d'ensemble jugé sûr parce qu'il ne nomme personne (M3-R3) ; AM-5, le hook `cours-absent`, qui
  ne comprend pas un chemin `/c/…` dans la commande d'envoi.
- **Dans « Au prochain passage » (ancrage#11)** : les trois cases « Avant qu'un cours monté passe
  en FSRS » sont cochées. La case du hook `cours-absent` est précisée : il prend aussi une
  redirection pour une référence, et ne comprend pas un chemin `/c/…`. Cinq suites s'ajoutent :
  le seuil de trois personnes du rapport d'ensemble, sa semaine comptée « par ses personnes », le
  commentaire d'en-tête de `rapport.ts`, qui ne cite pas les 70 %, le statut de l'ADR-0012,
  complété deux fois, et la commande qui mesure le poids du client. Une sixième revient à
  Edouard : la notice ne cite pas l'appariement ni le classement parmi les
  manières de répondre, alors que le client en note le mode (`association`).
- **La vérification sur Android** : faite par Edouard le 14/11/2026, au staging, sans remarque
  rapportée. Une carte retournée, une saisie, un choix et un exercice ; l'export, qui porte le
  mode ; la notice dans les deux langues.
- **Le passage du cours de l'instance** : des PR du dépôt de données, après l'étiquette de ce lot.
  Le plan prévoyait l'ajustement d'abord, puis un seul chapitre, trois semaines de rapports, et
  les autres. Les chapitres du premier passage sont neufs : leur journal est loin des 1 000
  révisions qu'exige l'ajustement. Ils passeront donc d'abord en `par-chapitre` avec les poids
  par défaut et la date de l'examen, et l'ajustement viendra quand leur journal le permettra.
  L'ordre et le nombre de chapitres du premier passage se décident dans la PR du dépôt de données.
- **L'accord de l'apprenante** pour le rapport de sa progression : Edouard le lui demande. Sans
  lui, seuls les chiffres d'ensemble se produisent.
- **Parmi les lots suivants** : le planning d'un cours (ancrage#30), le rejeu d'une seule unité
  (ancrage#31), les éléments rebelles (ancrage#32).
