# Format des contenus

Le code fait foi : `src/domaine/contenu/schemas.ts`, `analyse.ts` et `acces-cours.ts`. Ce
document le décrit ; un écart est un bug à corriger dans la même PR.

L'ADR-0003 fixe les principes (fichiers dans le dépôt, identifiants explicites, statuts). Ce
document fixe la forme exacte des fichiers du format 1. Un changement de format passe par un
nouveau numéro de format et un script de migration.

## Règles générales

- **Écriture des valeurs** : les textes sont toujours entre guillemets doubles, et la validation
  refuse tout texte écrit autrement : sans guillemets, entre guillemets simples, en bloc `|` ou
  `>`. Sans guillemets, un `#` ouvre un commentaire et coupe le texte sans qu'aucune erreur ne
  soit levée.
  - Cela vaut pour les valeurs seulement : une clé s'écrit comme on veut.
  - Les nombres (`format`, `numero`, `x`, `y`) ne sont pas entre guillemets. Un nombre là où un
    texte est attendu est refusé, et un texte là où un nombre est attendu aussi.
  - Les booléens (`vrai` d'une affirmation) s'écrivent `true` ou `false`, sans guillemets : entre
    guillemets, c'est un texte, et il est refusé.
- **Listes de textes** : en style bloc, un élément par ligne, chacun entre guillemets doubles. Le
  style entre crochets est lu aussi, avec les mêmes guillemets.

  ```yaml
  reponses:
    - "Rezept"
    - "Rezepte"
  ```

- **Clés** : toute clé inconnue est refusée.
- **Chemins** : un chemin cité dans un fichier est relatif au dossier de ce fichier.
- **Identifiants** : 8 caractères en base 32 de Crockford, en minuscules
  (`0123456789abcdefghjkmnpqrstvwxyz`), tirés au hasard par `corepack pnpm contenus:id`, jamais
  dérivés du texte. Chaque identifiant est unique dans tout le dossier de contenu.
- **Messages d'erreur** : ils disent le fichier et, quand il existe, le lieu (le chemin de la clé,
  ou la ligne). Ils ne citent jamais un texte du cours.

## Disposition

Un **dossier de contenu** porte les cours d'une instance et les valeurs de sa notice. Il y en a deux
(S1-D2, ADR-0011), dont un seul dans ce dépôt :

- `contenu/` du dépôt de données, `ancrage-donnees`, privé : le contenu de l'instance, le vrai cours.
  Il n'entre jamais dans l'image, ni dans ce dépôt. La chaîne de déploiement en extrait un instantané
  du commit de données et le monte en lecture seule sur `/contenu` (`ANCRAGE_CONTENUS`) ;
  `VERIFIER_CONTENU` (`node dist/serveur/cli.js verifier-contenu`) le vérifie avant chaque
  déploiement ;
- `exemple-contenu/`, le cours d'exemple, inventé (S1-D11). L'image le porte
  (`ANCRAGE_EXEMPLE_CONTENU`), et le serveur le sert hors de la prod quand aucun contenu n'est
  monté. La prod ne le sert jamais : sans contenu monté, elle refuse de démarrer.

Les instantanés de référence du contenu de l'instance sont dans `references/` du dépôt de données
(voir « Commandes »). Les deux dossiers suivent les mêmes règles. Celui de l'exemple :

```
exemple-contenu/
  ids.lock
  notice.yaml                    # les valeurs de la notice de confidentialité (voir « notice.yaml »)
  kueche/
    cours.yaml
    cartes/01-geraete.yaml, 02-zutaten.yaml, 03-zubereitung.yaml
    morphologie.yaml
    schemas/herd.yaml, herd.svg, messer.yaml, messer.svg
    rezepte.yaml
    grammatik.yaml
    feuilles/blatt-01.yaml …     # une feuille par Unit (voir « Module feuille »)
    examen.yaml
```

Un cours est un dossier de premier niveau du dossier de contenu. Les règles de présence des
fichiers sont strictes :
- un dossier de premier niveau sans `cours.yaml` est une erreur. Aucun autre document ne vit donc
  dans le dossier de contenu : ni notes, ni brouillons ;
- à sa racine, aucun fichier n'est admis en dehors de `ids.lock` et de `notice.yaml`, tous deux
  obligatoires, et d'un `README.md`, qui est ignoré. Un dossier qui ne porte que ce `README.md`
  compte comme vide : le serveur le traite comme un contenu absent (S1-D3) ;
- dans un cours, tout fichier doit être référencé, par `cours.yaml` ou par un module (un SVG l'est
  par le `dessin` de son schéma). Un module cité deux fois, ou introuvable, est une erreur.

## `cours.yaml`

```yaml
format: 1
id: "<id>"
titre: "Küchenwörter (Beispielkurs)"
langue: "de"
types_de_carte:            # l'ordre est conservé
  k: "Küchengerät"
  z: "Zutat"
  # … d'autres entrées
leitner:                   # obligatoire : voir « Réglages de Leitner »
  intervalles: [0, 1, 2, 4, 8, 16]
  nouvelles_par_seance: 15
memoire:                   # facultative : voir « Réglage de la mémoire »
  algorithme: "fsrs"
  retention: 0.9
planning:                  # facultative : voir « Le planning »
  etapes:
    - titre: "Woche 1"
      semaine: 1
      modules: ["<identifiant d'un module>"]
manuels:                   # facultative : voir « Les manuels »
  - id: "<id>"
    titre: "Beispielbuch Küche"
derogation_diffusion:      # facultative : voir « Dérogation de diffusion »
  motif: "<pourquoi>"
  date: "2026-10-16"
modules:                   # dans l'ordre du cours (celui de l'affichage, hors « Les manuels »)
  - "cartes/01-geraete.yaml"
  # … les autres modules de cartes, puis :
  - "morphologie.yaml"
  - "schemas/herd.yaml"    # … les autres schémas
  - "rezepte.yaml"
  - "grammatik.yaml"
  - "feuilles/blatt-01.yaml"  # … une feuille par Unit
  - "examen.yaml"
```

**Un module par type.** Un cours a au plus un module de chacun des types `morphologie`,
`texte-annote`, `exercices` et `examen` : le client en tire un onglet chacun. Le deuxième, dans
l'ordre de `modules`, est une erreur (`Au plus un module « <type> » par cours`). Les modules de
cartes (un par chapitre), de schémas et les feuilles (une par Unit) sont aussi nombreux qu'on veut.

### Réglages de Leitner

La clé `leitner` règle la méthode des boîtes : le code ne fixe plus ces valeurs. Pour un cours en
`fsrs` (voir « Réglage de la mémoire »), `leitner.intervalles` n'est pas lu, mais reste obligatoire :
c'est ce qui permet le retour à Leitner. Pour un cours en `par-chapitre`, il est lu pour tout ce qui
n'est pas un chapitre de `chapitres` (mots, points, exercices, fiches, autres modules de cartes). `nouvelles_par_seance` vaut pour les deux algorithmes. Elle est obligatoire, ses deux clés aussi, et toute autre clé est
refusée.

- `intervalles` : exactement 6 entiers, un par boîte de 0 à 5. Ce sont des nombres de jours : une
  réponse juste monte la carte d'une boîte, à revoir après l'intervalle de sa nouvelle boîte.
  Aucun n'est plus petit que le précédent : deux intervalles égaux sont permis. Le premier, celui
  de la boîte 0 (les cartes neuves), vaut 0. Il n'est jamais lu : une réponse juste mène au moins
  en boîte 1, et une carte neuve n'est jamais due, elle entre dans une séance parmi les
  `nouvelles_par_seance`.
- `nouvelles_par_seance` : un entier de 1 à 100. Dans Karteikarten, c'est la taille d'une série de
  cartes neuves. Dans la séance du jour (« Heute »), c'est un plafond par jour : les cartes déjà
  découvertes aujourd'hui, c'est-à-dire dont la première réponse date d'aujourd'hui, où qu'elle ait
  été donnée, en sont retirées. Sans planning, les neuves y viennent du choix fait dans
  Karteikarten ; avec un planning, elles viennent des modules ouverts, à un rythme que ce plafond
  borne (voir « Le planning »). Elles prennent la place que laissent les dues : les dues passent
  d'abord, la séance en garde 20 au plus.

Le cours de terminologie reprend ceux du prototype : `[0, 1, 2, 4, 8, 16]` et 15.

### Réglage de la mémoire

La clé `memoire` choisit l'algorithme de répétition espacée du cours. Elle est facultative, et toute
autre clé que celles ci-dessous est refusée.

```yaml
memoire:
  algorithme: "par-chapitre"
  retention: 0.9
  parametres: [0.2120, 1.2931, 2.3065, …]   # les 21 poids de FSRS-6
  examen: "2027-06-30"
  chapitres: ["<identifiant d'un module de cartes>"]
```

- `algorithme` : `"leitner"`, `"fsrs"` ou `"par-chapitre"`. Obligatoire dans `memoire`. Toute autre
  valeur est refusée. Avec `par-chapitre`, les cartes des modules de `chapitres` suivent FSRS ; tout
  le reste du cours (les autres cartes, les mots, les points, les exercices, les fiches) reste en
  Leitner.
- `retention` : sans effet avec `leitner`. Un nombre de 0,80 à 0,95, bornes comprises, la part des cartes que l'apprenante doit
  encore savoir au moment de les revoir. Facultatif : 0,90 par défaut.
- `parametres` : les 21 poids de FSRS-6, ceux que l'ajustement sur le journal d'un cours rend.
  Facultatif : sans eux, les poids par défaut de FSRS-6. Exactement 21 nombres, tous dans les bornes
  du modèle (`checkFSRS6Parameters` de `ts-fsrs`) : 20 ou 22 poids, un poids hors bornes ou qui n'est
  pas un nombre sont refusés. Admis avec `fsrs` et `par-chapitre`, refusé avec `leitner`.
- `examen` : une date `AAAA-MM-JJ` qui existe, entre guillemets doubles. Facultatif. Une réponse
  donnée `n` jours avant elle reçoit une échéance d'au plus la moitié de `n` jours (arrondie vers le
  bas, un jour au moins) ; le jour de l'examen et après, rien ne la plafonne. Admis avec `fsrs` et
  `par-chapitre`, refusé avec `leitner`. « Heute » en tire aussi un compte à rebours (voir « Le
  planning »).
- `chapitres` : une liste d'identifiants de modules de cartes du cours, sans doublon. Obligatoire et
  non vide avec `par-chapitre`, refusée avec tout autre algorithme. Un identifiant qui n'est pas celui
  d'un module de cartes du cours est refusé, avec le fichier et la clé dans le message.

Le calcul applique ces clés : les poids de `parametres` à la place de ceux par défaut, le plafond de
`examen` sur l'échéance rendue (jamais sur la stabilité que garde FSRS), et, avec `par-chapitre`, FSRS
sur les cartes des modules de `chapitres` seulement. Le cours d'exemple (`exemple-contenu/kueche/`)
est en `par-chapitre`, avec son premier module de cartes en FSRS et un `examen` lointain et inventé.

Sans `memoire`, le cours n'a pas de réglage : la clé est absente du cours analysé, de la forme servie
et de l'instantané de référence, et rien ne change pour lui. Il en va de même de chacune des trois
clés facultatives : absente, elle n'est ni dans la forme servie ni dans l'instantané. Le client qui
reçoit une valeur qu'il ne connaît pas (un autre algorithme, une rétention hors bornes, des poids ou
une date invalides, `par-chapitre` sans chapitres) ignore le réglage, donc calcule en Leitner, sans
refuser le cours.

**Un appareil resté à la version précédente** ne connaît pas les trois clés :
- avec `par-chapitre`, il ne comprend pas la valeur et retombe sur Leitner pour tout le cours, y
  compris les chapitres en FSRS : c'est le repli sûr ;
- avec `fsrs` et `parametres` ou `examen`, il retire ces clés, qu'il ne connaît pas, et calcule avec
  les poids par défaut, sans plafond : ses échéances diffèrent de celles des appareils à jour jusqu'à
  sa mise à jour, au lancement suivant.

**Un cours ne reçoit `memoire` qu'une version après celle qui la connaît, et chacune de ses clés de
même.** Le schéma du manifeste est strict : l'image précédente, que le retour arrière remet en
service, refuserait un manifeste qui porte une clé qu'elle ignore (invariant 8). Un serveur d'avant
cette version refuse donc de démarrer sur un manifeste qui porte `parametres`, `examen`, `chapitres`
ou `par-chapitre` : après le premier manifeste neuf, on ne redescend plus sous la version qui les
connaît. Exception : le cours d'exemple vit dans l'image, et l'image précédente garde le sien.

### Le planning

La clé `planning` ouvre les modules d'un cours par étapes : « Heute » ne tire ses cartes neuves que
des modules ouverts. Elle est facultative, et toute autre clé que celles ci-dessous est refusée,
dans `planning` comme dans une étape.

```yaml
planning:
  etapes:
    - titre: "Woche 1"
      semaine: 1             # ou seance: "2030-03-04"
      genre: "cours"         # facultatif : "cours" (défaut) ou "revision"
      modules: ["<identifiant d'un module>"]
```

- `etapes` : au moins une étape, écrites dans l'ordre : une séance ou une semaine n'est jamais avant
  celle de l'étape d'avant (l'égalité est admise).
- `titre` : un texte non vide. C'est un texte du cours : il n'entre jamais dans le client construit.
- `seance` ou `semaine`, jamais les deux ni aucun, et toutes les étapes d'un planning de la même
  forme. `seance` est une date `AAAA-MM-JJ` qui existe, entre guillemets doubles. `semaine` est un
  entier de 1 à 520, sans guillemets (`"2"` est un texte, refusé). La première étape d'un planning
  relatif est en semaine 1.
- `genre` : `cours` (défaut) ou `revision`.
- `modules` : des identifiants de modules du cours, de tout type. Vide pour une étape `revision`
  seulement, jamais pour une étape `cours`. Un module est cité une fois au plus dans tout le
  planning. Les `modules` d'une étape `revision` sont ceux qu'on y révise : ils s'ouvrent avec elle,
  comme ceux d'une étape `cours`, et rien d'autre ne les distingue pour « Heute ».

**Quand une étape est ouverte.** Une étape datée s'ouvre le jour de sa séance (`seance` au plus
égale à aujourd'hui). Une étape relative s'ouvre au jour `départ + 7 × (semaine − 1)`. Le départ est
le jour, sur l'appareil, du premier événement du journal du cours, quel que soit son genre ; il n'est
jamais après aujourd'hui, et sans événement c'est aujourd'hui : la semaine 1 est donc toujours
ouverte. Limite : le départ peut bouger d'un jour entre deux appareils de fuseaux différents, et
avancer si les premières réponses sont abandonnées à une déconnexion.

**Quand un module est ouvert.** Dès qu'une étape ouverte le cite, ou qu'aucune étape ne le cite.
Sinon il est fermé. Rien n'est gardé : tout se dérive du manifeste, du journal et du jour.

**Ce que « Heute » en fait.** Ce qui est dû reste dû, même d'un module fermé. Pour les cartes
neuves, la règle dépend du planning.

- **Sans planning** (ou avec un planning que le client ne comprend pas), rien ne change : les cartes
  neuves viennent du choix fait dans Karteikarten, chapitre et sens, et leur nombre est au plus le
  plafond `nouvelles_par_seance` moins les cartes découvertes aujourd'hui.
- **Avec un planning**, elles viennent des modules ouverts, dans l'ordre du planning : les modules
  des étapes ouvertes, étape après étape et dans l'ordre où chacune les cite, puis les modules
  qu'aucune étape ne nomme, dans l'ordre du cours. Dans un module, les cartes dans le sens direct
  d'abord, dans l'ordre du cours, puis les mêmes dans le sens inverse : à un rythme bas, les deux
  sens d'une carte ne tombent pas le même jour. Le sens choisi dans Karteikarten joue encore dans
  « Heute » ; le chapitre qu'on y choisit n'y joue plus, il garde son rôle dans Karteikarten et dans
  le quiz. La séance prend ses cartes neuves parmi les premières de cet ordre, autant que le nombre
  du jour, puis les mélange ; quand les dues lui laissent moins de place, elle tire au hasard parmi
  ces premières : l'ordre ne vaut qu'au grain du nombre du jour.

Aucun autre onglet ne change : Karteikarten, le quiz et les autres onglets proposent tout le cours.

**Le rythme.** Avec un planning, « Heute » ne pose pas toutes les cartes neuves que le plafond
admet : il répartit ce qui est ouvert sur les jours qui restent.

- `R`, les cartes neuves du matin, au sens choisi dans Karteikarten, chaque sens d'une carte
  comptant pour une : celles des modules ouverts que l'ordonnanceur laisse en boîte 0, plus celles
  de ces modules découvertes aujourd'hui (la première réponse date d'aujourd'hui). `R` ne bouge pas
  quand on répond dans la journée : le rythme compte les cartes du jour, pas celles d'une séance.
- `J`, le nombre de jours d'aujourd'hui, compris, à l'horizon, exclu ; un jour au moins.
- Le rythme est `min(nouvelles_par_seance, ⌈R / J⌉)`, arrondi vers le haut : à ce pas, tout ce qui
  est ouvert est vu avant l'horizon, une carte au moins par jour tant qu'il en reste.
- Le nombre de cartes neuves du jour est au plus le plus petit de deux restes : le plafond moins
  toutes les cartes du cours découvertes aujourd'hui, où qu'elles l'aient été, et le rythme moins
  les cartes de `R` découvertes aujourd'hui. Il n'est jamais négatif, et les dues passent d'abord
  dans les 20 places de la séance.

**Poser un planning sur un cours déjà commencé** change « Heute » dès que le client le lit : à jour
ou en avance sur le planning, l'apprenante y reçoit moins de cartes neuves qu'avec le seul plafond,
et aucune quand tout ce qui est ouvert est vu (Karteikarten reste libre pour prendre de l'avance) ;
en retard, elle en reçoit jusqu'au plafond, les étapes les plus anciennes d'abord, jusqu'à ce que le
retard soit vu.

**L'horizon** est la première ouverture d'une étape, de tout genre, strictement après aujourd'hui.
S'il n'y en a plus, c'est la dernière ouverture plus sept jours, le pas d'un planning relatif. Si
`memoire.examen` tombe après aujourd'hui et avant cet horizon, c'est l'examen. Un horizon
d'aujourd'hui ou passé vaut un jour. Une étape relative suit la même règle, sur ses ouvertures
calculées depuis le départ : l'horizon bouge avec lui, dans la limite dite plus haut. Une étape
`revision` compte comme une autre pour l'horizon, et ses modules comme ceux de toute étape ouverte ;
ce qu'elle mêle d'autre à la séance n'est pas encore décidé. Pendant un trou du planning (aucune
étape ne s'ouvre avant longtemps), `J` est grand et le rythme bas, et rien ne s'ouvre de plus.

**Le retard** n'a pas de calcul à lui : ce qui reste neuf dans une étape ouverte avant la dernière
ouverture passée est dans `R`, se répartit sur les jours qui restent jusqu'à l'horizon, et passe en
premier dans l'ordre où « Heute » prend ses cartes neuves, puisque cet ordre met les modules des
étapes les plus anciennes d'abord. Un jour manqué relève donc le rythme des jours qui restent ; à la
veille d'une ouverture, il peut atteindre le plafond, jamais le dépasser. Les modules de cartes
qu'aucune étape ne nomme sont ouverts depuis le premier jour et comptent dans `R` dès lors : un
cours dont de gros modules ne sont nommés par aucune étape est au plafond dès le premier jour, et le
reste jusqu'à ce qu'ils soient vus.

**Un exemple**, sur le cours d'exemple (planning relatif, plafond de 15) et un compte neuf, au
jour 1 : seul le premier module de cartes est ouvert, avec ses 9 cartes dans les deux sens, soit 18
unités ; la semaine 2 s'ouvre dans 7 jours, donc `R = 18`, `J = 7`, et le rythme est `⌈18 / 7⌉ = 3`
cartes neuves ce jour-là, à comparer aux 15 d'avant le rythme. Si l'apprenante a découvert le même
jour, dans Karteikarten, une carte du premier module, il en reste 2 pour « Heute » (3 pour une carte
d'un module fermé, qui ne pèse que sur le plafond).

**La clé du jour** de la séance ne change pas : le rythme y entre par les cartes neuves et leur
nombre, qu'elle porte déjà. Avant le premier geste d'une séance, une clé qui change recompose la
séance ; après, la séance ne bouge plus.

**Le compte à rebours** ne dépend pas du planning : « Heute » dit « Noch {n} Tage bis zur Prüfung »
dès que `memoire.examen` est écrit, sur la séance, sur l'écran de fin et sur « Heute ist nichts
fällig », tant qu'il reste zéro jour ou plus (à un jour : « Noch 1 Tag bis zur Prüfung » ; le jour
même : « Heute ist die Prüfung »). Après
l'examen, rien ne s'affiche. Un cours en `leitner` n'a pas d'`examen`, donc pas de compte à rebours.

**Le pré-test** (lot M4, partie B ; ADR-0014). Trois jours avant l'ouverture d'une étape de cours,
« Heute » propose cinq questions à choix sur ses cartes. Il ne demande aucune clé de manifeste : ses
valeurs (la fenêtre, le nombre de questions) sont des constantes du code.

- **L'étape** : la première étape `cours`, dans l'ordre du planning, qui s'ouvre dans un à trois
  jours, datée ou relative. Le jour de son ouverture, l'étape est ouverte : plus de pré-test. Ni une
  étape `revision`, ni la semaine 1 d'un planning relatif, toujours ouverte. Le pré-test ne porte
  que sur les modules que l'étape ouvre, ceux qu'aucune étape ouverte plus tôt ne cite (à ouverture
  égale, l'étape placée avant l'emporte) : une étape qui n'ouvre aucun module n'a pas de pré-test.
  Il faut encore deux réponses distinctes au moins parmi leurs unités directes, pour qu'une question
  à choix ait des options, et une unité directe neuve au moins.
- **Une seule fois** : dès la première réponse, le pré-test de l'étape est fait, même abandonné ; il
  ne revient pas. Tant qu'il n'est pas commencé, l'offre revient chaque jour de la fenêtre. Après un
  pré-test fini, l'offre d'une autre étape de la même fenêtre peut paraître.
- **Les questions** : au plus cinq, tirées au hasard parmi les cartes neuves des modules que l'étape
  ouvre (une par carte), au moment où la personne commence. Chacune montre la carte au sens direct,
  avec jusqu'à quatre options tirées dans ces mêmes modules. Le tirage diffère d'un appareil à
  l'autre : « fait » se lit dans le journal.
- **L'écran** : l'offre est un cadre en tête de « Heute », avant le premier geste de la séance, sur
  l'écran de fin et sur « Heute ist nichts fällig » ; jamais en pleine séance. Le pré-test commencé
  prend la place de la séance du jour, qui reste gardée, et « Zur Tagesrunde » y ramène à tout
  moment. Une erreur n'y est pas une faute : la bonne option est en vert, l'option choisie, si elle
  est fausse, garde le style neutre d'un choix, et aucun compte de justes ne se dit.
- **Au journal** : chaque réponse est un événement `reponse` sur l'unité directe de la carte, avec
  `resultat: { juste, mode: 'pretest' }`. Rien de ce qui se dérive du journal ne la compte :
  `journalDesRevisions` la retire de l'état de Leitner, de FSRS, de la projection et de
  l'ajustement, des découvertes du jour et des réponses par jour (donc de la série). Une carte
  pré-testée reste neuve, et sa première vraie réponse est sa découverte ; une faute de pré-test ne
  rend rien due. La comptent, en revanche, le départ d'un planning relatif (tout événement),
  l'export, la suppression et la purge d'un compte, et le pré-test lui-même, qui lit le journal pour
  savoir s'il est fait.
- **Rien n'est gardé** : l'offre, l'étape et ce qui est fait se dérivent du journal, du manifeste et
  du jour (invariant 5).

**Sans `planning`**, la clé est absente du cours analysé, de la forme servie et de l'instantané de
référence : tout est ouvert, comme avant. Le client qui reçoit un planning qu'il ne comprend pas (un
genre inconnu, une semaine hors bornes, une date mal formée) l'ignore : tout est ouvert, et le cours
reste utilisable.

**Un cours monté ne reçoit `planning` qu'à partir de la version qui suit la `v0.16.0`.** Le schéma du
manifeste est strict : l'image précédente, que le retour arrière remet en service, refuserait un
manifeste qui porte une clé qu'elle ignore (invariant 8). Exception : le cours d'exemple vit dans
l'image, et l'image précédente garde le sien. Le cours d'exemple a un planning relatif : son premier
module de cartes en semaine 1, le deuxième en semaine 2, le troisième en semaine 3.

### Les manuels

La clé `manuels` nomme les livres dont viennent les chapitres d'un cours. Chaque module de cartes dit
alors son manuel, son numéro de chapitre dans ce manuel et sa Unit, et un schéma peut dire son
manuel. Elle est facultative, et toute autre clé que celles ci-dessous est refusée.

```yaml
manuels:
  - id: "<id>"
    titre: "Beispielbuch Küche"
  - id: "<id>"
    titre: "Beispielheft Geräte"
```

- `manuels` est une liste, pour que l'ordre des divisions soit celui de l'écriture. Elle a au moins un
  manuel.
- `id` : un identifiant du format, tiré par `contenus:id`, inscrit dans `ids.lock` et unique dans
  tout le contenu (invariant 4).
- `titre` : un texte non vide, unique parmi les manuels du cours. C'est un texte du cours : il
  n'entre jamais dans le client construit, et `contenus:client` le cherche dès douze caractères
  (sous douze, un texte n'est pas cherché).

**Les clés des modules.** Un module de cartes admet `manuel` (l'identifiant d'un manuel du cours),
`chapitre` (un entier positif, son numéro dans ce manuel) et `unit` (un entier positif). Un schéma
admet `manuel`. Les autres types de module n'en admettent aucune. `numero` reste obligatoire et
unique dans le cours : il garde son rôle dans l'instantané, et sert de numéro quand le cours n'a pas
de manuels. Un entier s'écrit sans guillemets (`"3"` est un texte, refusé).

**Tout ou rien.** Un cours qui écrit `manuels` donne les trois clés à chacun de ses modules de
cartes ; un cours qui ne l'écrit pas n'en donne aucune, ni `manuel` à un schéma. Chaque clé qui
manque, ou qui est de trop, est une erreur à elle, dans le fichier du module.

**Les contrôles.** Deux manuels n'ont pas le même titre. Un `manuel` désigne un manuel du cours, et
deux modules de cartes n'ont pas le même chapitre du même manuel. Un manuel qu'aucun module ne cite
est admis, et ne se montre pas : un cours peut nommer un manuel avant d'y ranger un module.

**Ce qu'en font les écrans.**
- « Übersicht » se divise : une division par manuel, dans l'ordre de `manuels`, puis « Übungen »,
  toujours la dernière. Une division de manuel range ses chapitres dans l'ordre du livre (`chapitre`
  croissant), puis ses schémas dans l'ordre du cours, sur une ligne « Schemata » ; « Übungen » reçoit
  les chapitres sans manuel lisible, puis, à leur place d'avant, la morphologie, la ligne des
  schémas sans manuel lisible, les textes, les exercices et les feuilles. Une division vide ne se montre pas. Une étiquette « Unit {n} » suit le titre d'un
  chapitre. « Üben » d'une ligne de schémas ouvre un schéma de cette ligne.
- Le choix du chapitre (Karteikarten, Quiz) a un groupe par division qui a des chapitres, ses options
  libellées « {n} · {titre} », puis « Alle Kapitel ». La valeur d'une option reste l'identifiant du
  module : les préférences gardées ne changent pas.
- La Prüfung range ses cases par division, « Alle » et « Keine » valant pour tous les chapitres.
- Le numéro d'un chapitre à l'écran est son `chapitre` quand il a un manuel lisible, sinon son
  `numero` : pastille, options, cases, étiquette « Kap. n » d'une carte. Le groupe « Kapitel n » du
  résultat de la Prüfung dit aussi son manuel (« Kapitel {n} · {manuel} »).
- Le mode des divisions s'allume dès qu'un chapitre ou un schéma a un manuel lisible. Sinon chaque
  écran s'affiche comme avant : « Kapitel », puis « Weitere Übungen ».

**Le client lit sans rigueur.** Une liste de manuels qu'il ne comprend pas (pas une liste, vide, un
manuel sans `id` ou sans `titre`, un `id` en double) laisse le cours en mode plat ; un module dont le
manuel ou le chapitre est illisible va dans « Übungen ». Rien ne bloque le cours.

**Dans l'instantané de référence,** `manuels` va dans `cours`, après `planning` ; une entrée de
`chapitres` porte `manuel`, `chapitre` et `unit` après `titre`, et une entrée de `schemas` porte
`manuel` après `titre`, chacun seulement s'il est écrit. **Sans ces clés,** elles sont absentes du
cours analysé, de la forme servie et de l'instantané : l'instantané d'un cours qui n'en a pas ne
change pas.

**Retirer un manuel.** On le retire de `manuels`, et chaque module qui le nomme change de place : un
schéma perd sa clé `manuel` ou en nomme un autre ; un module de cartes nomme un autre manuel du
cours, avec son `chapitre` dans celui-ci (« Tout ou rien »). Retirer le dernier manuel, c'est retirer
la clé `manuels` et, de chaque module, `manuel`, `chapitre` et `unit`. Puis l'on marque sa ligne
d'`ids.lock` `<id> retiré` : jamais on ne la supprime.

**Un cours monté ne reçoit `manuels`, ni les clés `manuel`, `chapitre` et `unit` de ses modules, qu'à
partir de la version qui suit la `v0.17.0`**, la première qui les connaît. Les schémas stricts du manifeste et des modules de l'image précédente, que le retour
arrière remet en service, les refuseraient (invariant 8). Exception : le cours d'exemple vit dans
l'image, et l'image précédente garde le sien. Le cours d'exemple nomme deux manuels inventés,
« Beispielbuch Küche » puis « Beispielheft Geräte », et range ses trois modules de cartes dans leur
ordre à lui, différent de celui du cours.

### Dérogation de diffusion

Un cours qui contient au moins un élément `à vérifier` (voir « Statuts ») ne peut être ouvert à un
groupe, mais seulement à des personnes nommément (invariant 9, ADR-0001). La clé facultative
`derogation_diffusion` de `cours.yaml` lève cette limite par écrit.

- `motif` : un texte non vide, entre guillemets doubles. Un texte fait seulement d'espaces est
  vide. Le motif dit pourquoi le cours peut être diffusé sans être entièrement relu.
- `date` : une date `AAAA-MM-JJ` qui existe, entre guillemets doubles. C'est la date de la
  dérogation.
- Les deux clés sont obligatoires, et toute autre clé est refusée. La valeur de
  `derogation_diffusion` est donc toujours un objet : un simple `true` est refusé.
- L'instantané de référence (`references/<cours>.reference.json`, au dépôt de données) a une section
  `diffusion`, l'état de relecture du cours :
  - `aVerifier` : `true` si le cours compte au moins un élément `à vérifier`, selon la règle
    ci-dessous ;
  - `derogation` : le `motif` et la `date` de `derogation_diffusion`, ou `null` sans dérogation ;
  - `statuts` : pour chaque module à statut, dans l'ordre du cours, son identifiant (`module`) et le
    nombre de ses éléments de chaque statut (`source`, `aVerifier`, `verifie`). Ils se comptent
    selon la règle ci-dessous, et l'examen n'y figure pas.

  La section change quand le cours passe d'un état à l'autre (« à vérifier » ou non), quand sa
  dérogation change, motif et date compris, et quand le nombre d'éléments d'un statut change dans
  un module. L'instantané est le seul contrôle qui voit ces changements. L'accès d'un groupe en
  dépend (invariant 9), et la sincérité du statut `source` aussi (ADR-0003).
  `contenus:reference --verifier` échoue alors, et la différence se relit dans la PR. Les statuts
  des éléments n'y figurent pas un par un : seuls leurs comptes, module par module. D'où une
  limite : deux changements de sens contraire dans un même module (un élément passe de `source` à
  `vérifié`, un autre de `vérifié` à `source`) laissent les comptes égaux, et ne se voient pas.
- La règle joue à chaque requête, pas seulement au moment où l'on donne un droit. Supposons qu'un
  cours déjà ouvert à un groupe gagne un élément `à vérifier` sans dérogation. Les membres du
  groupe ne le voient plus, jusqu'à ce que l'élément soit relu ou qu'une dérogation soit écrite.
  Les droits donnés à une personne nommément ne changent pas.

Le cours est dit « à vérifier » dès qu'un seul de ses éléments l'est, dans n'importe quel module.
Un module de schéma compte pour un élément (ses points héritent de son statut). Les éléments
`source` et `vérifié` ne comptent pas. Le module `examen` n'a pas de statut : ses réglages ne sont
pas un contenu à relire, et il ne compte jamais.

La liste imprimable de ces éléments, pour la relecture sur papier, se génère par
`corepack pnpm contenus:a-verifier [dossier]` (HTML et PDF, en allemand).

## Statuts

- `type`, `id` et `titre` sont communs à tous les modules, et `statut` à tous sauf `examen`. Les
  valeurs de `statut` sont exactement `source`, `à vérifier` et `vérifié` (ADR-0003).
- Le `statut` du module est le statut par défaut de ses éléments.
- Un élément qui a un `id` peut surcharger ce statut par `statut` (et `verifie_le`) : les cartes,
  les morphèmes, les mots, les textes annotés, les exercices et les éléments des tâches d'une
  feuille (paires, éléments à classer, questions, affirmations, phrases et mots). Les jetons, les
  questions d'un texte annoté et les points de schéma héritent toujours de leur parent.
- Les tâches d'une feuille n'ont pas de statut, et la clé y est refusée : leurs éléments prennent
  directement celui de la feuille.
- `vérifié` exige `verifie_le`, une date `AAAA-MM-JJ` qui existe. `verifie_le` est interdit sans
  `vérifié`.
- `statut` et `verifie_le` s'écrivent **ensemble, dans le même objet**. Cette règle se contrôle
  objet par objet, sans tenir compte de l'héritage : un élément ne peut pas ajouter `verifie_le`
  seul en héritant `vérifié` de son module, ni écrire `statut: "vérifié"` sans `verifie_le`.

## La description d'un module

Les modules `morphologie`, `schema`, `texte-annote` et `exercices` ont une clé `description`
facultative : le sous-titre de leur ligne dans l'aperçu du cours. Les modules `cartes`, `feuille`
et `examen` ne l'ont pas, et la clé y est refusée comme toute clé inconnue.

- C'est un texte entre guillemets doubles, qui n'est ni vide ni fait seulement d'espaces.
- Sans elle, la clé est absente du modèle et de la réponse de l'API.
- Par usage, elle se place après `statut`, avant les autres clés propres au module. Ce n'est pas
  une règle : l'ordre des clés n'est pas contrôlé.
- La `description` d'un `schema` n'est pas affichée : les schémas partagent une ligne de l'aperçu
  (une par division quand le cours nomme ses manuels, voir « Les manuels »), dont le sous-titre est
  leurs titres joints par « · ». Elle reste dans le modèle et
  dans la réponse de l'API.

Le module `texte-annote` a de plus une clé `consigne`, elle aussi facultative : le texte affiché en
tête de l'onglet des comptes rendus. Elle est distincte de la `description`, qui sous-titre la
ligne du module dans l'aperçu. C'est un texte entre guillemets doubles, ni vide ni fait seulement
d'espaces, et les autres types de module la refusent comme toute clé inconnue. (La `consigne` d'une
tâche de feuille est une autre clé, au niveau de la tâche.)

## Module `cartes`

Un module par chapitre.

```yaml
type: "cartes"
id: "<id>"
numero: 8
titre: "Vorsilben der Küche"
manuel: "<id d'un manuel de cours.yaml>"   # voir « Les manuels » : avec chapitre et unit, ou aucun
chapitre: 2
unit: 4
statut: "source"
cartes:
  - id: "<id>"
    type: "k"                # une clé de types_de_carte
    recto: "ab-, weg- (dt.)"
    verso: "weg, fort – z. B. abwaschen, abgiessen"
    # facultatifs :
    # statut: "vérifié"
    # verifie_le: "2027-01-20"
    # reponses:              # réponses acceptées explicites
    #   - "…"
```

Règles des cartes :
- `numero` est un entier positif, unique dans le cours.
- `manuel`, `chapitre` et `unit` : voir « Les manuels ».
- `type` est une clé de `types_de_carte`.
- `recto` et `verso` ne sont pas vides, ne commencent ni ne finissent par un espace, et ne
  contiennent ni tabulation ni saut de ligne.
- `recto` est unique dans le module.
- `reponses`, si elle est présente, est une liste non vide de textes non vides. Elle remplace les
  alternatives que l'on tire du recto :
  - on accepte alors `canonique(recto)` et le `canonique` de chaque réponse (la forme canonique est
    celle de `src/domaine/cartes/reponses.ts`) ;
  - elle compte aussi pour le test de fuite, qui décide si l'unité inverse de la carte existe : il
    se fait avec les mêmes réponses (`canonique(recto)` et celles de `reponses`), et non avec les
    alternatives du recto.

## Module `morphologie`

```yaml
type: "morphologie"
id: "<id>"
titre: "Wortbaukasten"
statut: "source"
chapitres: ["<id module cartes 8>", "<id … 9>", "<id … 10>"]
morphemes:
  - id: "<id>"
    categorie: "s"           # p, s ou x
    forme: "koch"
    sens: "mit Hitze garen"
mots:
  - id: "<id>"
    mot: "Kocherei"
    segments:
      - texte: "Koch"
        morpheme: "<id du morphème>"
    sens: "Ort, an dem gekocht wird"
```

Règles de la morphologie :
- `chapitres` désigne des modules `cartes` du même cours ;
- `segments[].morpheme` désigne un morphème du même module ;
- `mot` est unique dans le module ;
- la concaténation des `texte` des segments, en minuscules, est égale à `mot` en minuscules.

## Module `schema`

Un fichier YAML et son SVG.

```yaml
type: "schema"
id: "<id>"
titre: "Der Kochherd"
manuel: "<id d'un manuel de cours.yaml>"   # facultatif : voir « Les manuels »
statut: "source"
dessin: "herd.svg"
note: "…"
points:
  - id: "<id>"
    x: 211
    y: 40
    terme: "Kochplatte"
    sens: "runde Fläche, die den Topf erhitzt"
```

Le fichier SVG a exactement ce cadre. `<intérieur>` est gardé à l'octet près :

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 340">\n<intérieur>\n</svg>\n
```

Règles des schémas :
- `viewBox` est faite de 4 nombres séparés par une espace ;
- chaque point vérifie `x >= 8`, `y >= 8`, `x <= w - 8` et `y <= h - 8`, où `w` et `h` sont la
  largeur et la hauteur de la `viewBox` ;
- deux points sont distants d'au moins 19 ;
- `terme` est unique dans le schéma ;
- dans l'intérieur, le nombre de `<` est égal au nombre de correspondances de `/\/>|<\/\w+>/g`.

## Module `texte-annote`

Les comptes rendus.

```yaml
type: "texte-annote"
id: "<id>"
titre: "Berichte"
statut: "à vérifier"
description: "…"          # facultative : le sous-titre de l'aperçu
consigne: "…"             # facultative : le texte en tête de l'onglet
reussite: 0.8
textes:
  - id: "<id>"
    titre: "…"
    texte: "… [[EL|Esslöffel|<id du jeton>]] …"
    questions:
      - id: "<id>"
        question: "Ist die Suppe gesalzen?"
        reponse: "Nein"
        distracteurs:
          - "…"
          - "…"
          - "…"
```

Règles des comptes rendus :
- **Réussite** : `reussite` est obligatoire. C'est un nombre de 0 (exclu) à 1 (inclus), la part de
  réponses justes à partir de laquelle un texte est réussi. Le prototype prend 0.8.
- **Jetons** : chaque jeton s'écrit `[[forme|sens|id]]`, sans `|` ni `]` dans la forme, le sens ou
  l'identifiant. Aucun `[[` ni `]]` ne reste hors d'un jeton. L'identifiant d'un jeton est un
  identifiant comme les autres : unique, et dans `ids.lock`.
- **Questions** : exactement 3 distracteurs, distincts, dont aucun n'est égal à la réponse.

## Module `exercices`

La grammaire, matérialisée.

```yaml
type: "exercices"
id: "<id>"
titre: "Grammatik"
statut: "source"
familles:
  - code: "artikel"                               # texte libre ; voir ci-dessous
    libelle: "Artikel (Geschlecht des Nomens)"
    options:                                      # facultatif : options de la famille
      - "der"
      - "die"
      - "das"
    regle: "…"                                    # facultatif : règle de la famille
    exercices:
      - id: "<id>"
        invite: "___ Pfanne"
        reponse: "die"
        # facultatifs, ils surchargent ceux de la famille :
        # options: […]
        # regle: "Nomen auf -e: meist weiblich"
```

Règles des exercices :
- **Code de famille** : le schéma accepte n'importe quel texte. Les codes `plural`, `artikel`,
  `endung`, `schreib` et `abk` sont ceux du premier cours ; un autre cours choisit les
  siens.
- **Type** : un exercice est « à choix » s'il a des options, une fois celles de la famille
  appliquées. Sinon, il est « à taper ».
- **Options** : elles sont distinctes et contiennent la réponse.

## Module `feuille`

Les fiches de la semaine (« Arbeitsblätter »), une par Unit, après leur correction en classe. Une
feuille est faite de parties, une partie de tâches, et une tâche d'éléments. Chaque élément reçoit
une réponse : il a son identifiant, et son statut.

```yaml
type: "feuille"
id: "<id>"
numero: 1                  # le numéro de la Unit
titre: "Unit 1 – In der Küche"
statut: "à vérifier"
parties:
  - titre: "Teil A: Zuordnungsaufgaben"
    taches:
      - id: "<id>"
        genre: "appariement"
        consigne: "Ordnen Sie die Begriffe den richtigen Definitionen zu."
        paires:
          - id: "<id>"
            terme: "Sieb"
            cible: "Teigwaren abgiessen"
            # facultatifs :
            # statut: "vérifié"
            # verifie_le: "2026-10-26"
```

Une tâche a un `id`, un `genre` et une `consigne`, puis les champs propres à son genre :

| Genre | Champs propres |
| --- | --- |
| `appariement` | `paires` : `id`, `terme`, `cible` |
| `classement` | `categories` (une liste de textes), et `elements` : `id`, `terme`, `categorie` |
| `qcm` | `questions` : `id`, `question`, `reponse`, `distracteurs` (exactement 3) |
| `vrai-faux` | `affirmations` : `id`, `affirmation`, `vrai` (`true` ou `false`), `correction` facultative |
| `trous` | `liste` facultative (la liste de mots), et `phrases` : `id`, `texte` avec ses `___`, `reponses` dans l'ordre des trous |
| `orthographe` | `mots` : `id`, `fautif`, `reponse` |
| `ouverte` | `questions` : `id`, `question`, `reponse` (la réponse modèle) |

Règles des feuilles :
- **Numéro** : `numero` est un entier positif, unique parmi les feuilles du cours. Une feuille peut
  porter le numéro d'un module de cartes.
- **Genres** : un genre inconnu est refusé, et une tâche n'admet que les clés de son genre.
- **Identifiants** : la feuille, chaque tâche et chaque élément ont le leur, unique et dans
  `ids.lock`.
- **Statuts** : celui de la feuille vaut pour ses éléments ; un élément peut le surcharger (voir
  « Statuts »). Une tâche n'a pas de statut.
- **Parties, tâches, éléments** : une feuille a au moins une partie, une partie au moins une tâche,
  et une tâche au moins un élément.
- **Appariement** : `terme` est unique dans la tâche, et `cible` aussi.
- **Classement** : `terme` est unique dans la tâche, chaque catégorie n'est écrite qu'une fois dans
  `categories`, et `categorie` est l'une des `categories` de la tâche.
- **QCM** : exactement 3 distracteurs, distincts, dont aucun n'est égal à la réponse.
- **Trous** : un trou s'écrit `___`, exactement trois tirets bas : une suite de quatre ou plus est
  refusée, car elle se lirait comme un trou collé à un tiret bas. Une phrase a au moins une réponse,
  et autant de trous que de `reponses`. Avec une `liste`, chaque mot n'y est écrit qu'une fois, et
  chaque réponse en est un, écrit à l'identique ; sans liste, chaque trou se tape.
- **Orthographe** : `fautif` diffère de `reponse`.

Comment l'application juge une réponse (F1-D4, F1-D5), dans l'onglet comme dans la Prüfung :
- **Orthographe** : la saisie et `reponse` se comparent en forme Unicode NFC, sans les espaces de
  bord, et les espaces internes réduits à un. La casse et les accents comptent : « kartoffel »
  est faux pour « Kartoffel ».
- **Trous sans liste** : chaque trou se compare comme une réponse de carte (`canonique`). La casse,
  les guillemets, la ponctuation de fin (`. … ! ?`), les tirets de bord, ae/ä et oe/ö ne comptent
  pas ; la virgule, les deux-points et les parenthèses comptent. Enfin, la lettre c se confond
  avec k (avec z devant e, i, y, ä, ö). Ainsi « c » est jugé juste pour un trou dont la réponse
  est « k » : une phrase qui porte sur ces lettres gagne à avoir une `liste`.
- **Trous avec liste, QCM, vrai/faux** : le choix doit être l'option, à l'identique.
- **Phrase à plusieurs trous** : c'est un seul élément, juste si chacun de ses trous l'est. Les trous
  se jugent un par un, dans l'ordre : le premier trou contre la première des `reponses`, et ainsi de
  suite. La Prüfung ne pose que les phrases à un trou.

## Module `examen`

Les réglages de l'examen blanc (« Prüfung »). Ce n'est pas un contenu à relire : le module n'a
pas de `statut`, ni de `verifie_le`, ni de `description`, et il ne compte jamais pour « à
vérifier ». Il a un `id`, verrouillé comme les autres. Au plus un par cours.

```yaml
type: "examen"
id: "<id>"
titre: "Prüfung"
tailles: [20, 30, 50]
taille_par_defaut: 30
secondes_par_question: 45
minutes_minimum: 5
note_suffisante: 4
seuil_chapitre: 0.6
tirage:
  schema: 0.10
  texte: 0.17
  exercice: 0.25
  feuille: 0.35
  mot: 0.12
  direct: 0.45
  a_taper: 0.72
```

Toutes les clés sont obligatoires, et toute autre clé est refusée.

| Clé | Règle |
| --- | --- |
| `titre` | Un texte : le libellé de l'onglet. |
| `tailles` | Les nombres de questions proposés : au moins un, des entiers positifs, strictement croissants. |
| `taille_par_defaut` | L'une des `tailles`. |
| `secondes_par_question` | Un entier positif : le temps accordé par question, quand l'examen est chronométré. |
| `minutes_minimum` | Un entier positif : la durée minimale d'un examen chronométré. |
| `note_suffisante` | Un nombre de 1 à 6 : la note à partir de laquelle l'examen est réussi. |
| `seuil_chapitre` | Un nombre de 0 (exclu) à 1 (inclus) : la part de réponses justes à partir de laquelle un chapitre est réussi. |
| `tirage` | Les sept seuils ci-dessous. |

Les seuils du `tirage` sont ceux du prototype, sauf `feuille`, venu avec les feuilles (F1-D6). Ils
sont tous dans [0, 1].
- `schema`, `texte`, `exercice` et `feuille` se cumulent : `schema` ≤ `texte` ≤ `exercice` ≤
  `feuille`. Un nombre au hasard choisit une question de module : sous `schema` elle porte sur un
  schéma, sous `texte` sur un compte rendu, sous `exercice` sur un exercice de grammaire, sous
  `feuille` sur un élément d'une feuille. Seuls y viennent un `qcm`, une affirmation d'un
  `vrai-faux`, une phrase de `trous` qui n'a qu'un trou (F1-D5) et un mot d'`orthographe` ; une
  phrase avec liste se choisit dans la liste, une phrase sans liste et un mot se tapent. Avec
  `feuille` égal à `exercice`, aucune question de feuille n'est tirée.
- `mot`, `direct` et `a_taper` se lisent sur un autre nombre au hasard : sous `mot` la question
  porte sur un mot du Wortbaukasten ; sinon sur une carte, dans le sens direct sous `direct`, dans
  le sens inverse au-delà. Une carte inverse tirée à `a_taper` ou plus se tape.

`feuille` est obligatoire dans `examen.yaml`, mais facultatif dans ce que l'API sert : le contenu
mis en cache par la version précédente n'en a pas. Absent, il vaut `exercice`.

## `ids.lock`

Une ligne par identifiant jamais émis : `<id>`, ou `<id> retiré`, dans l'ordre d'émission. Les
lignes vides et les commentaires `#` (une ligne entière) sont admis.

**Ce fichier est obligatoire** : sans lui, le contenu est refusé, et `contenus:verrouiller` ne le
recrée pas. Il est lu strictement, et ces deux cas sont des erreurs (`ids.lock ligne <n> : …`) :
- une ligne mal formée : autre chose que `<id>` ou `<id> retiré`, y compris avec une espace en
  trop ou un commentaire en fin de ligne ;
- un identifiant qui figure sur deux lignes.

```
# Tous les identifiants jamais émis dans ce contenu (ADR-0003). Ce fichier ne fait que grandir.
# Une ligne par identifiant : « <id> », ou « <id> retiré » quand l'élément a été supprimé.
# Nouvel élément : pnpm contenus:id, puis pnpm contenus:verrouiller.
<id>
<id>
```

**Ce fichier ne fait que grandir.**
- Tout identifiant du contenu doit y figurer.
- Un identifiant qui disparaît du contenu sans être marqué `retiré` est une erreur. Pour
  supprimer un élément à dessein, on ajoute ` retiré` à sa ligne.
- Un identifiant `retiré` ne peut plus être utilisé, et son retrait ne s'annule pas.
- La CI compare le fichier à celui de la base de la PR (`pnpm contenus:verifier --base`) : aucune
  ligne de la base ne disparaît.

## `notice.yaml`

Les valeurs de la notice de confidentialité de l'instance (S1-D7). Le texte de la notice est un
gabarit, dans le code (`src/domaine/notice-gabarit.ts`), dont les trous `{cle}` prennent ces
valeurs. **Ce fichier est obligatoire.**

```yaml
format: 1
date: "2026-11-03"        # le dernier changement des valeurs (AAAA-MM-JJ)
fr:
  responsable: "…"        # les six premières clés remplacent un paragraphe ou une puce entière
  lieu_du_serveur: "…"
  tiers_tunnel: "…"
  tiers_sauvegardes: "…"
  transferts: "…"
  qui_ne_voit_pas: "…"
  sauvegarde_distante: "…" # les quatre dernières, un fragment d'une phrase du gabarit
  tunnel: "…"
  delai_reponse: "…"
  autorites: "…"
de:
  …                       # exactement les mêmes clés
liens:
  - texte: "…"            # une adresse du texte, rendue cliquable
    cible: "https://…"    # ou « mailto:… »
```

- `fr` et `de` portent exactement ces dix clés : une clé absente ou en trop est une erreur. Une
  valeur vide fait disparaître la puce ou le paragraphe qu'elle remplit.
- La cible d'un lien commence par `https://` ou par `mailto:` ; toute autre est une erreur.
- La notice affiche la plus récente de `date` et de la version du gabarit (`NOTICE_VERSION`).
- Une valeur s'affiche telle quelle : un `{…}` ou une balise qu'elle porte n'est ni remplacé ni
  interprété.

## Commandes

La CLI de contenu (`src/serveur/contenus/cli.ts`) est un outil du poste et de la CI. Toute commande
lit `exemple-contenu/` par défaut, ou le dossier que donne `--contenu <dossier>`. Un chemin donné se
lit depuis le dossier courant ; le défaut, depuis la racine du dépôt. Pour le cours de l'instance, on
lance la commande depuis le clone de ce dépôt, avec le dépôt de données à côté (S3-D4), par exemple
`--contenu ../ancrage-donnees/contenu`.

- `corepack pnpm contenus:id [n]` tire des identifiants neufs.
- `corepack pnpm contenus:verrouiller` ajoute à `ids.lock` les identifiants du contenu qui n'y sont
  pas.
- `corepack pnpm contenus:verifier [--base <réf>]` contrôle tout le dossier de contenu ; avec
  `--base`, il compare aussi son `ids.lock` à celui de `<réf>`, lu au même chemin, par `git -C <dossier du contenu>` : la base se lit donc dans le
  dépôt du contenu, même si on lance la commande depuis un autre dépôt.
- `corepack pnpm contenus:reference --references <dossier>` régénère l'instantané
  `<cours>.reference.json`, et celui de la notice composée, `notice.json`, dans `<dossier>` ; leur
  différence se relit dans la PR. `--references` est obligatoire, sans défaut (code 64 sans lui) : au
  dépôt de données, c'est `references/`. `--verifier` compare sans écrire (c'est ce que fait la CI du
  dépôt de données).
- `corepack pnpm contenus:client [dossier] [--exclure <nom>]… [--toleres <fichier>]` cherche les
  textes des cours et les valeurs de la notice dans `dossier` (`dist/client` par défaut), hors des
  dossiers nommés à sa racine. La CI de ce dépôt le lance sur le client construit, avec l'exemple. Celle
  du dépôt de données le lance avec le contenu de l'instance, sur le client construit et sur le
  `/app` de l'image (S1-D12, S3-D5).

Dans l'image, `node dist/serveur/cli.js verifier-contenu <dossier> [<en service>]` charge un
dossier de contenu comme le démarrage, et compare son `ids.lock` à celui de `<en service>` s'il en
a un. Elle rend 0 si le contenu est conforme, 2 sinon (une ligne par erreur), 64 en cas d'usage
refusé.
