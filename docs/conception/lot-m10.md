# Lot M10 : une explication après une faute (ancrage#34)

Le lot M10 (issue ancrage#34, milestone « Le parcours et la mémoire ») fait lire à la personne
pourquoi sa réponse est fausse, et pas seulement quelle était la bonne. Une question à choix, une
phrase à trous et une paire d'appariement d'une fiche peuvent porter une explication, et la question
à choix une explication par distracteur. C'est le dixième lot de la suite ouverte par
ancrage-donnees#106, et il vient après le lot M9 (ancrage#74), dont il reprend la règle : une
explication paraît après une faute, ou à un rebelle (`montrerLAide`).

Son plan, à tâches et sans tranches, a été supprimé à la clôture, comme le veut la méthode. Ce
document en garde les décisions sous leurs libellés, parce que le code et les docs renvoient à
« M10-C<n> » et « M10-D<n> ». **Le comportement, lui, est fixé par le code et les tests.** Le lot ne
change ni le journal, ni les routes, ni le manifeste, ni l'ordonnanceur, ni la notice : rien de neuf
n'est gardé (invariant 5), et l'API n'a que des champs ajoutés au contenu servi. Le plan est
ancrage#88 ; le format, le domaine et les outils sont ancrage#90 (PR 1) ; l'affichage est ancrage#91
(PR 2) ; la revue finale a corrigé ses textes par ancrage#92.

## Les décisions

M10-C1 à M10-C11 sont les arbitrages d'Edouard du 27/11/2026 (« OK pour les défauts ») ; certaines
reçoivent une précision tirée du code, dite comme telle. M10-D1 à M10-D13 sont du plan.

- **M10-C1. Les genres couverts** : le `qcm`, la phrase à trous (`trous`) et l'appariement des
  fiches, seulement. Le texte annoté n'a pas d'écran de verdict (`Textes.tsx:264`), l'exercice a
  déjà sa `regle`, le classement va aux pistes (`docs/pistes.md`).
- **M10-C2. Les clés** : `explication` pour la bonne réponse d'une question `qcm`, pour une phrase à
  trous et pour une paire d'appariement ; sur une question `qcm`, en plus,
  `explications_distracteurs`, un objet « distracteur → texte », partiel admis mais non vide, lu par
  `Object.hasOwn`. `distracteurs` ne change pas de type : le client de la version précédente le lit
  encore. Précision du plan : le modèle et le contenu servi les nomment `explication` et
  `explicationsDistracteurs`, comme `confondu_avec` devient `confonduAvec`.
- **M10-C3. La validation** : la règle de l'`aide` d'une carte (un texte non vide, d'une ligne, sans
  espace de bord, de 300 caractères au plus, `LONGUEUR_MAXIMALE_D_UNE_AIDE`) ; une clé de
  `explications_distracteurs` qui ne nomme pas un distracteur de la question est refusée. Précision
  du plan, d'après le code : une clé est un texte du cours, et aucun message de l'analyse ne cite un
  texte (`analyse-feuilles.ts:59`) ; une erreur sous `explications_distracteurs` se situe par le
  rang de la clé dans l'ordre où le YAML l'écrit (M10-D2).
- **M10-C4. Les clés existantes** : la `correction` du vrai-faux reste telle quelle, sans
  `explication`, et n'est pas resserrée. Aucune migration de contenu. Précision du plan : une
  `explication` écrite sur une affirmation, un élément à classer, un mot ou une question ouverte
  reste refusée comme clé inconnue (les schémas sont stricts).
- **M10-C5. Quand l'explication paraît** : celle du distracteur choisi, juste après ce choix ; celle
  de la bonne réponse, ou d'une phrase, ou d'une paire, selon `montrerLAide` (après une faute, ou à
  un rebelle), dans l'onglet comme dans « Heute ». « Ergebnis » montre toujours celle de la bonne
  réponse, et celles des distracteurs, chacune avec son distracteur, quand la dernière réponse est
  fausse. Le journal ne change pas : il ne garde que `juste` et `mode`.
- **M10-C6. Le Quiz, la Prüfung et le pré-test** : aucune explication, comme l'aide au lot M9.
  Précision du plan, d'après le code : le pré-test ne tire que des cartes (`pretest.ts:79`) et ne
  peut pas poser de QCM ; le Quiz ne passe pas la question du modèle à sa question à choix ; la
  Prüfung a son propre rendu. Rien n'y change de code ; deux gardes.
- **M10-C7. À l'écran** : un seul bloc, titré « Erklärung », d'abord l'explication du choix, puis
  celle de la bonne réponse, dans la carte, avant « Weiter » (la leçon de la PR 84). Un test de bout
  en bout mesure au Pixel 7 que le bas du bloc et « Weiter » restent dans l'écran. `role="status"`
  quand l'explication répond à un geste seul (« Heute », un QCM de l'onglet) ; rien pour les trous
  et l'appariement (« Prüfen » en fait paraître plusieurs d'un coup), ni dans « Ergebnis ».
  Précisions du plan : la mesure se fait dans Arbeitsblätter ; dans « Heute », voir E1
  (l'emplacement, et l'ordre seul vérifié) ; dans « Ergebnis », l'ordre suit la même règle, ce qui
  est faux d'abord : les explications des distracteurs, puis celle de la bonne réponse (M10-D6).
- **M10-C8. Fortschritt** : l'explication de la bonne réponse sert d'aide à un QCM rebelle dans la
  liste « Schwierige Begriffe – nochmal ansehen » (`question-et-reponse.ts`), sous « Merkhilfe ».
- **M10-C9. La mutation** : une fonction pure, `src/domaine/feuilles/explications.ts`, décide ce qui
  se montre après tel choix, donne les lignes d'« Ergebnis » et lit sans rigueur. Elle entre dans
  Stryker, groupe `domaine`. Le client reste hors de Stryker, avec des mutants posés à la main.
- **M10-C10. Le découpage** : un plan à tâches, sans tranches ; deux PR d'implémentation, (1) le
  format et les outils, (2) l'affichage ; puis la revue finale et la clôture.
- **M10-C11. La mise en ligne** : une `v0.22.0`, à Edouard, sans étiquette de données. Le cours de
  l'instance ne reçoit les clés qu'à partir de la version qui suit la première étiquette posée après
  la version courante, la `v0.21.0` (invariant 8) ; les explications s'écriront ensuite au dépôt de
  données, hors périmètre. Précision du plan : l'étiquette qui compte est la première `vX.Y.Z` qui
  contient la PR 1, celle du format ; un cours monté reçoit les clés à partir de la version qui la
  suit. Ce peut être une autre que celle qui porte tout le lot : une étiquette posée entre la PR 1
  et la PR 2 contient déjà le format. Aucune étiquette ne contient la PR 1 à la clôture (la plus
  haute est la `v0.21.0`) : les textes la désignent comme « la première étiquette posée après la
  `v0.21.0` ». Une fois posée, une PR la nomme (« la version qui suit la `vX.Y.Z` ») dans
  `docs/format-des-contenus.md` et dans `CLAUDE.md`.
- **M10-D1. Le schéma** (`src/domaine/contenu/schemas.ts`). Une règle `explication`, à côté de
  `texteDeCarte`, d'au plus `LONGUEUR_MAXIMALE_D_UNE_AIDE` caractères. `paireAppariee`,
  `questionAChoix` et `phraseATrous` gagnent `explication` facultative ; `questionAChoix` gagne
  `explications_distracteurs: z.record(z.string(), z.unknown()).optional()`. Les valeurs ne se
  contrôlent pas dans zod : l'erreur d'une valeur porterait la clé dans son chemin, et le lieu
  l'écrirait. Un objet qui n'en est pas un (une liste, un texte) reste refusé par zod. Une fonction
  exportée, `messagesDExplication(valeur: unknown): string[]`, rend les messages de la règle, en
  français, `[]` pour une explication admise.
- **M10-D2. Les explications des distracteurs, dans l'analyse** (`analyse-feuilles.ts`,
  `analyse.ts`). `resoudreElements` passe le rang à `champs`. Le `qcm` résout `explication` si elle
  est écrite, et `explicationsDistracteurs` par `explicationsAdmises`, au lieu `…questions[rang]`.
  Elle ne garde que les entrées admises, dans l'ordre écrit, rend `undefined` s'il n'en reste
  aucune, et signale : un objet vide (« Aucune explication de distracteur : l'objet est vide. ») ;
  une clé qui ne nomme aucun distracteur de la question, la réponse comprise (« Cette clé ne nomme
  aucun distracteur de la question. ») ; une valeur refusée par `messagesDExplication`. Le lieu
  d'une clé est `….explications_distracteurs[k]`, où `k` est son rang dans l'ordre où le YAML
  l'écrit, compté depuis 0. `controlerGuillemets` compte dans le même arbre : une paire placée
  directement sous `explications_distracteurs` ne pousse pas sa clé dans le chemin, mais son rang.
  L'ordre écrit se lit dans l'arbre YAML, jamais dans l'objet lu : `document.toJS()` range d'abord
  les clés entières, par ordre croissant (« 2 » avant « 6 », quel que soit l'ordre écrit).
  `lireYaml` relève donc les clés de chaque objet dans `Analyse.ordreDesCles`, et une seule fonction
  de chemin (`cheminDeNoeud`) sert la lecture des guillemets et ce relevé. Une clé en double reste
  refusée par `yaml` (`uniqueKeys`), au lieu `ligne N`, sans la clé.
- **M10-D3. Le modèle et le contenu servi.** `modele.ts` : `explication?: string` sur
  `PaireAppariee`, `QuestionAChoix` et `PhraseATrous`, et `explicationsDistracteurs?:
  Readonly<Record<string, string>>` sur `QuestionAChoix`. `tacheServie` copie ces champs quand ils
  sont présents, l'objet des distracteurs en copie. La garde du client (`FORMES_PAR_GENRE`) ne
  change pas : comme `aide`, les clés nouvelles se lisent sans rigueur, et une valeur qui n'est pas
  un texte ne bloque pas le cours. Les fixtures (`avecExplications`, `exempleAvecExplications`,
  `coursAvecChampsDElement`, `coursAvecExplications`) sont dans la PR 1, pour que la PR 2 ne touche
  pas `src/domaine/`.
- **M10-D4. La règle des explications** (`src/domaine/feuilles/explications.ts`, mutée) :
  `explicationDe` (un texte qui n'est pas fait que d'espaces, sinon rien),
  `explicationDuDistracteur` (lue sans rigueur : `choisi` est l'un des `distracteurs`, l'objet est
  un objet non nul qui n'est pas une liste, la clé est propre, la valeur est un texte non blanc),
  `explicationsApresLeChoix` (celle du distracteur choisi, toujours ; celle de la bonne réponse si
  l'appelant passe `montrerLAide(rebelle, juste)` ; une clé absente plutôt qu'`undefined`) et
  `explicationsDErgebnis` (celle de l'élément, toujours ; celles des distracteurs d'une question
  quand la dernière réponse est fausse). Une question se reconnaît à son champ `distracteurs`, une
  liste. Le serveur et le client lisent tous deux cette règle : `contenus:a-verifier` par
  `explicationDuDistracteur`, l'écran par les autres.
- **M10-D5. Les outils de contenu.** `contenus:a-verifier` imprime un champ « Erklärung » après les
  champs de la paire, de la question et de la phrase qui en ont une ; sous une question, un champ
  « Erklärungen zu falschen Antworten », une ligne `<distracteur> – <texte>` par distracteur
  expliqué, dans l'ordre de `distracteurs`, absent sans aucune. `contenus:client` (`textesDeTache`)
  cherche aussi les explications : celle de la paire, de la question, de chaque distracteur, de la
  phrase. Le hook `scripts/cours-absent.ts` lance cette commande : il les cherche aussi, sans
  changer de code. L'instantané de référence garde les champs par exclusion : rien ne change dans
  son code, un test le tient.
- **M10-D6. Le bloc « Erklärung »** (`src/client/cours/questions/Explication.tsx`). Il rend un
  `div.explication` (`role="status"` si `annonce`), son titre, puis dans l'ordre : l'explication du
  choix, une ligne `<b>distracteur</b> – texte` par distracteur, l'explication de la bonne réponse.
  Ce qui est faux d'abord, puis la bonne réponse. Le texte vient du cours : Preact l'échappe. La clé
  `explication_titre: 'Erklärung'` s'ajoute à `textes-cours.ts`. `.aide` et `.explication` partagent
  leurs règles dans `styles.css` ; `.explication` a `overflow-wrap: anywhere`, et `.zone
  .explication` s'étire sur la largeur de la case. `AideDeLElement` ne change pas : l'aide d'une
  carte, d'une affirmation, d'un point reste sous « Merkhilfe ».
- **M10-D7. Les appelants.**
  - Le verdict rebelle se fige au geste, dans Arbeitsblätter comme dans « Heute ». Une réponse
    d'Arbeitsblätter entre au journal aussitôt, et les rebelles se recalculent : sans verdict figé,
    l'explication de la réponse d'un rebelle disparaîtrait à peine montrée, quand cette réponse est
    la troisième juste de suite. Ce qui décide de l'explication (rebelle ou non, juste ou non) se
    lit donc au geste et se garde dans la mémoire de l'onglet, jamais au journal.
  - Arbeitsblätter, QCM (`TacheAChoix`) : `Choix` gagne `rebelle`, lu au choix. Une fois la question
    répondue, dans son `fieldset`, après les options, un bloc avec `annonce`.
  - Arbeitsblätter, phrase à trous (`TacheATrous`) et appariement (`TacheAGlisser`) : à « Prüfen »,
    les identifiants rebelles à ce moment se gardent sous une sous-clé de la tâche (`…/rebelles`,
    aide partagée `useRebellesFiges`, `tache.ts`), que `oublierEtatDOnglet` oublie avec la tâche.
    Une fois jugée, la phrase ou la case montre l'explication, après sa `correction`, si
    `montrerLAide`, sans `annonce`. La case d'une paire lit sa propre paire (`Cible.paire`, remplie
    pour un appariement seulement) : un classement n'en montre aucune.
  - « Ergebnis » (`ErgebnisDeFeuille`) : `Ligne` gagne `element`, rempli pour une question, une
    phrase et une paire. Forme livrée : le bloc se place après la `correction`, avant la pastille du
    verdict (comme la `korrektur` d'une affirmation, F3), sans `annonce`. Le plan écrivait « après
    le verdict » ; le code fait foi.
  - « Heute » (`QuestionAChoix`) : une propriété `qcm`, que `Heute.tsx` passe pour un QCM de fiche.
    Une fois répondue, après l'aide et avant « Weiter », le bloc avec `annonce`. Le Quiz et le
    pré-test ne la passent pas.
  - Pourquoi `rebelles` dans les trous et l'appariement : une phrase et une paire ne sont jamais
    rebelles (les rebelles ne se comptent que parmi les posables de « Heute »), la règle reste une
    seule, `montrerLAide`, les tests forcent `contexte.rebelles` pour la tenir, et un second rendu,
    sous d'autres rebelles, tient le verdict figé.
- **M10-D8. Fortschritt.** `questionEtReponse` rend, pour un QCM, l'explication de la bonne réponse
  comme aide : la liste la montre sous « Merkhilfe », par `AideDeLElement`. Un QCM sans explication
  ne change pas.
- **M10-D9. Le test de bout en bout** (`e2e/mise-a-jour/explication-apres-faute.spec.ts`). Dans la
  suite des deux versions, sur sa base et un compte neuf, au Pixel 7, en allemand. Pourquoi
  Arbeitsblätter, et non « Heute » : un compte neuf n'a aucun QCM de fiche dû, et « Heute » ne pose
  que ce qui est dû ou des cartes neuves ; ses tests vitest n'en tiennent que l'ordre, et sa hauteur
  reste non vérifiée (E1). Le parcours pose l'appariement de la Unit 1 en dérangement complet (deux
  cases montrent l'explication de leur paire, sans `role`), le classement (aucune explication), puis
  deux QCM (le premier juste, sans rien ; le second faux, avec un bloc `role="status"`), et mesure
  le bloc et « Weiter » ; puis « Ergebnis » montre les explications de la bonne réponse et des
  distracteurs, sans `role`. La mesure passe dans `e2e/aide-mise-en-page.ts`
  (`blocEtBoutonDansLEcran`), que le test de M9 appelle aussi, avec une borne basse nouvelle : un
  bloc sorti par le haut passerait sinon.
- **M10-D10. Les tests et les mutants.** Le test d'abord : un test d'un comportement nouveau échoue
  sur le code d'avant sa tâche, et la PR le dit ; un test qui passe déjà est une garde, avec le
  mutant qui la fait échouer. Le client étant hors de Stryker, chaque promesse de M10-C5 à M10-C8 et
  de M10-D6 à M10-D8 a son mutant posé à la main, posé, lancé, puis retiré. `explications.ts` est
  muté par Stryker, la passe locale du fichier visant 100 %. Les textes des tests sont inventés.
  Chaque assertion porte sur un texte exact ou un sélecteur exact, et un test d'absence constate
  d'abord le verdict, puis l'absence.
- **M10-D11. Ce qui ne change pas.** Ni le journal et ses modes, ni les routes, ni le manifeste, ni
  la notice, ni l'ordonnanceur, ni le calcul des rebelles, ni le rapport de suivi. Invariant 8 : la
  garde du client de la version précédente lit le contenu servi qui les porte ; le retour arrière
  remet un client sans bloc devant le même journal. La version est la `v0.22.0`, à Edouard ; aucune
  étiquette de données. Pour l'apprenante, rien ne change tant que le cours de l'instance n'écrit
  pas d'explication.
- **M10-D12. Les écarts à l'issue.** Chaque décision a été pesée contre chaque critère de ancrage#34
  (LE-27) ; les critères 3 et 4 sont livrés tels quels, le critère 3 par
  `docs/format-des-contenus.md` et le cours d'exemple, le critère 4 par `contenus:a-verifier`. Les
  écarts sont déclarés plus bas.
- **M10-D13. Les cases de ancrage#11.** Les PR du lot ont regardé les cases des fichiers qu'elles
  touchent. Réglées : le commentaire « liste blanche » de `servi.test.ts` (PR 90), et la question
  vrai-faux en codes de `QuestionAChoix.test.tsx` (PR 91). Restent ouvertes : `poser(…)` à cinq
  arguments positionnels (le lot n'ajoute rien de positionnel) ; la classe générique `.aide` de
  `styles.css` (le lot pose `.explication` à côté, qui partage ses règles, et `.zone .explication`
  s'y ajoute) ; `avecDerogation` d'`analyse.test.ts` ; la durée du job `mutation (domaine)`, que la
  PR 90 a relevée à 18 min 24 s avec `explications.ts`, contre un délai de 35 minutes ;
  « Wiederholung » dans `contenus:client` et le hook ; la marque et l'aide des onglets, qui suivent
  le journal quand « Heute » fige le verdict au geste (le lot ne fige que l'explication, dans
  Arbeitsblätter) ; l'allemand non relu de `textes-cours.ts` et de `a-verifier.ts`. Correction du
  plan : « Erklärung » (`explication_titre`, `textes-cours.ts`) vient de la tâche 6 (PR 2), et
  « Erklärungen zu falschen Antworten » est dans `a-verifier.ts` (tâche 4, PR 1) : la clôture
  n'ajoute aucun libellé.

## Les écarts

**E1, M10-C7 (« dans la carte, avant « Weiter » »), dans « Heute »**, accordé par Edouard le
27/11/2026. La question à choix de « Heute » (`QuestionAChoix`) n'a pas de carte qui tienne
l'élément entier : son `div.card` ne porte que l'énoncé, et les options puis « Weiter » viennent
dessous. Le bloc s'y place là où l'aide de M9 est déjà, entre les options et « Weiter », et non dans
`div.card`, où il passerait au-dessus des options et repousserait la couleur du choix et « Weiter »
vers le bas. Ce que vise la décision (la leçon de la PR 84) tient : le bloc précède « Weiter ». Dans
Arbeitsblätter et « Ergebnis », le bloc est bien dans la carte de l'élément. Réserve : dans
« Heute », seul l'ordre est vérifié, par `compareDocumentPosition` ; la hauteur du bloc n'est pas
mesurée (voir « Ce qui n'a pas été vérifié »). La PR 91 l'a déclaré, avec sa promesse, M10-C7 du
plan.

Les écarts à l'issue ancrage#34, accordés le 27/11/2026, chacun déclaré dans la PR qui le porte :

- **I1**, critère 2 (« l'explication s'affiche après la réponse ») : après une réponse juste, celle
  de la bonne réponse ne paraît qu'à un rebelle (M10-C5). PR 91.
- **I2**, critère 2 (même promesse) : « Ergebnis » montre celle de la bonne réponse avant toute
  réponse et après une réponse juste (M10-C5). PR 91.
- **I3**, critère 2 (« dans l'onglet ») : le Quiz, un onglet qui pose les QCM des fiches, n'en
  montre aucune, ni la Prüfung, ni le pré-test (M10-C6). PR 91.
- **I4**, critère 2 (« dans la séance du jour ») : « Heute » ne pose ni phrase à trous ni paire ;
  seule l'explication d'un QCM y paraît (M10-C1, M10-C5). PR 91.
- **I5**, critère 1 (« une question à choix ») : une affirmation vrai-faux garde sa `correction`,
  sans `explication` (M10-C4). PR 90.
- **I6**, critère 1 (« une question à choix ») : un exercice à `options` garde sa `regle`, sans
  `explication` ni explication de distracteur (M10-C1). Accord du 27/11/2026, confirmé par Edouard
  le 28/11/2026. Trouvé par la revue finale, déclaré dans la PR 92.

Hors périmètre, tenu : les explications des cours existants, qui sont du contenu, au dépôt de
données.

## Ce qui est livré

- `src/domaine/feuilles/explications.ts` : la règle, mutée (groupe `domaine`). `schemas.ts`,
  `modele.ts`, `analyse.ts`, `analyse-feuilles.ts`, `analyse-commun.ts` et `servi.ts` portent les
  clés et leur validation ; `contenus:a-verifier` et `contenus:client` les lisent.
- `src/client/cours/questions/Explication.tsx` : le bloc. `TacheAChoix`, `TacheATrous`,
  `TacheAGlisser`, `ErgebnisDeFeuille` et `QuestionAChoix` (« Heute ») le posent ;
  `question-et-reponse.ts` le sert à la liste de Fortschritt.
- `e2e/mise-a-jour/explication-apres-faute.spec.ts` et `e2e/aide-mise-en-page.ts`
  (`blocEtBoutonDansLEcran`).
- `docs/format-des-contenus.md` (les clés, « Explications » et « Quand une explication paraît ») et
  le cours d'exemple, qui en porte.

## Ce que les revues ont trouvé

- Les revues de tâche ont posé des mutants et en ont trouvé un survivant : le bloc rendu sans
  attendre le choix, en « Heute ». Il a reçu son test, puis a été tué. La mesure du bout en bout
  n'avait pas de borne basse : le mutant `margin-bottom: 1000px` passait ; elle en a une.
- La revue finale a rejoué 74 mutants, tous tués, avec `explications.ts` à 100 % (70 mutants sur 70)
  et la borne basse du bout en bout. Elle a trouvé un écart non déclaré (I6, l'exercice à options),
  et six mineurs de textes ou de lisibilité, corrigés dans la PR 92 : une phrase du format qui
  imposait des guillemets à une clé de distracteur que la validation ne contrôle pas, une ligne trop
  longue, `montrerLAide` calculé deux fois dans `QuestionAChoix`, des en-têtes de composants
  incomplets, deux commentaires de plus de 100 colonnes. Elle a aussi relevé que le bloc de
  « Ergebnis » précède la pastille du verdict, ce que M10-D7 dit désormais.
- Elle a relevé hors du lot (l'issue est ancrage#93) que le hook `scripts/cours-absent.ts` ne tient
  pas un envoi de plus de deux commits (LE-32).

## Ce qui n'a pas été vérifié

- La vérification sur un téléphone Android au staging ne peut pas voir d'explication : le cours de
  l'instance n'en porte pas encore. Le test de bout en bout au Pixel 7, dans Arbeitsblätter, dans un
  vrai navigateur, est la preuve du lot.
- La hauteur du bloc dans « Heute » n'est pas mesurée (E1) : un compte neuf n'y a aucun QCM de fiche
  dû, et seul l'ordre est vérifié. Sur un écran moins haut qu'un Pixel 7, une explication longue
  (300 caractères) peut pousser « Weiter » sous le bas de l'écran.
- Le rendu avec un vrai cours : aucune explication de l'instance n'existe avant sa PR de données.
- La mise en page de `.zone .explication` au Pixel 7 : la suite principale pose les termes au
  hasard, aucune mesure déterministe n'existe. La zone est une grille d'une colonne pleine largeur
  et le bloc a `overflow-wrap: anywhere` ; le risque est faible.

## Les limites

- **La région `role="status"` d'une explication est insérée déjà remplie**, la forme de l'aide du
  lot M9 : un lecteur d'écran sur Android peut ne pas l'annoncer. À voir à la vérification sur
  Android. Les explications des trous et de l'appariement ne sont pas annoncées (M10-C7), ni celles
  d'« Ergebnis ».
- **Une phrase ou une paire n'est jamais rebelle** : les rebelles ne se comptent que parmi les
  posables de « Heute », qui ne pose ni phrase ni paire. Pour ces deux genres, l'explication ne
  paraît donc qu'après une faute, et la règle `montrerLAide` n'a de branche rebelle que pour un QCM.
  Les tests forcent `contexte.rebelles` pour tenir la règle.
- La validation ne contrôle pas les guillemets d'une clé de `explications_distracteurs` : une clé
  qui, lue, ne nomme aucun distracteur est refusée, avec un message qui ne dit pas pourquoi.
- L'explication d'un distracteur ne paraît qu'après le choix de ce distracteur : « Ergebnis », qui
  ne connaît que `juste` et `mode`, les montre tous après une dernière réponse fausse.
- Le texte annoté, le classement, l'exercice, l'affirmation vrai-faux, le mot, la carte du Quiz et
  le point de schéma n'ont pas d'explication : leurs options sont tirées du contenu, ou le genre a
  déjà sa règle (M10-C1, M10-C4).

## Les suites

Elles sont dans ancrage#11, sous « Les suites du lot M10 » : l'allemand des libellés nouveaux, non
relu (« Erklärung » de `textes-cours.ts`, « Erklärungen zu falschen Antworten » de `a-verifier.ts`)
; le rendu sur un téléphone Android avec un vrai cours (l'explication, la région annoncée, la
hauteur du bloc dans « Heute ») ; le contrôle des clés de `explications_distracteurs` ; le repli
`''` d'une clé non scalaire d'`analyse.ts`, sans commentaire ni test ; le découpage
d'`analyse.test.ts` ; `coursAvecChampsDElement`, muet sur un identifiant introuvable ; l'explication
du classement (`docs/pistes.md`). Le hook du cours est ancrage#93.

Les explications du cours de l'instance s'écriront au dépôt de données, après la règle de version
(hors périmètre).

## Les arbitrages

Les arbitrages d'Edouard du 27/11/2026 (« OK pour les défauts ») portent M10-C1 à M10-C11 et les
écarts I1 à I5, avec E1 ; celui du 28/11/2026 confirme I6.

La version attendue pour le lot est la `v0.22.0`, à Edouard ; aucune étiquette de données n'est à
poser. Un cours monté ne reçoit les clés qu'à partir de la version qui suit la première étiquette
posée après la `v0.21.0` (M10-C11, invariant 8).
