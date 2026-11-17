# Lot M5 : la réponse écrite sur une carte (ancrage#33)

**Objectif.** Finir la réponse écrite : une faute de frappe est tolérée et signalée, le tréma écrit
« ue » est admis, le cours choisit la pose de ses cartes dans son manifeste, et « Heute » laisse
revenir à la carte retournée pour une séance.

**Le constat de départ.** L'essentiel de l'issue existe depuis le prototype : sur le sens
« définition vers terme » (l'unité inverse), la carte se pose avec un champ, la saisie est cochée
par défaut sur chaque appareil, « Heute » la pose de même, la bonne réponse s'affiche après la
saisie, « Meine Antwort war auch richtig » corrige le verdict, et le journal dit `saisie` ou
`corrigee`. Le sens direct, aux longues définitions, reste en carte retournée. Le lot n'ajoute donc
aucun mode au journal, et rien n'attend une version de plus (invariant 8).

**Les décisions** (« M5-D<n> », d'après les défauts du cadrage accordés par Edouard le 17/11/2026
et la revue du plan) :

- **M5-D1.** Une saisie à une lettre d'une réponse admise d'au moins six caractères (une lettre
  changée, en trop ou en moins ; distance de Levenshtein de 1) est comptée juste, et l'écran le
  signale. Deux lettres échangées valent 2 : elles gardent le jugement d'aujourd'hui, faux, et
  « Fast » seulement quand la saisie dépasse neuf caractères.
- **M5-D2.** La tolérance ne joue pas quand la saisie est une réponse admise de l'index du cours :
  deux termes voisins d'une lettre ne se confondent pas. Limite : une carte sans unité inverse
  n'est pas dans l'index.
- **M5-D3.** Au journal, une faute tolérée est une réponse `saisie` juste : aucun mode nouveau.
- **M5-D4.** La Prüfung garde son jugement strict (`juger(…).juste`) : ni la faute de frappe ni
  « ue » n'y sont admis.
- **M5-D5.** La clé facultative `pose_des_cartes` du manifeste vaut `ecrite` ou `retournee`.
  Absente, elle vaut `ecrite`, le comportement d'aujourd'hui. Elle donne la valeur de la case
  « Begriffe eintippen » tant que la personne n'a pas touché la case sur cet appareil ; ensuite son
  choix l'emporte. Un cours monté ne la reçoit qu'une version après celle qui la connaît.
- **M5-D6.** Le choix de la case n'est gardé comme un choix que depuis ce lot. Une case décochée
  avant lui n'a pas de marque : elle reprend une fois la valeur du cours, et se décoche de nouveau
  d'un geste.
- **M5-D7.** Dans « Heute », sous une carte à saisir, un lien passe en cartes retournées, et un
  autre y revient. Le choix vit dans la mémoire des onglets, à part de la séance : il tient d'une
  série à la suivante, ne touche pas la préférence, et se perd au rechargement.
- **M5-D8.** « ue » tapé pour « ü » est admis comme « ae » et « oe » le sont déjà. Le repli se fait
  dans le jugement de la carte, pas dans `canonique` : les réponses admises et les instantanés ne
  changent pas.
- **M5-D9.** Après une faute tolérée, l'écran montre le recto de la carte, même si la saisie était
  proche d'une autre réponse admise de `reponses`.

**Les commandes de vérification**, pour chaque tâche, une à la fois, après la dernière
modification, avec les nombres dans le rapport : `corepack pnpm test`, `corepack pnpm types`,
`corepack pnpm lint`, `corepack pnpm duplication`.

## Mécanismes annoncés

- `src/domaine/correction.ts:31` — `export function juger` — juge une saisie contre les réponses
  admises, et dit « presque » sans jamais compter juste une faute de frappe
- `src/domaine/correction.ts:35` — `g.length >= 4` — le « presque » d'aujourd'hui : à une lettre
  près dès quatre caractères, à deux près au-delà de neuf
- `src/domaine/cartes/reponses.ts:14` — `.replace(/ae/g, 'ä')` — `normaliser` replie « ae » et
  « oe », pas « ue »
- `src/domaine/cartes/unites.ts:99` — `export function reponsesAcceptees` — les réponses admises
  d'une unité, d'après l'index du cours
- `src/domaine/cartes/unites.ts:29` — `IndexDesReponses` — pour chaque question inverse, ses
  réponses admises, tous modules confondus
- `src/client/cours/questions/QuestionCarte.tsx:44` — `saisieAttendue` — la saisie ne se pose que
  sur une unité inverse, quand `saisie` est vrai
- `src/client/cours/questions/QuestionCarte.tsx:91` — `onReponse(true, 'corrigee')` — la personne
  corrige un verdict faux, et le journal le dit
- `src/client/cours/preferences.ts:44` — `saisie: true` — la saisie est cochée par défaut
- `src/client/cours/preferences.ts:150` — `export function ecrirePreferences` — l'objet entier est
  écrit à chaque changement : `saisie` est gardé même si la personne n'a jamais touché la case
- `src/client/cours/onglets/Heute.tsx:406` — `saisie={preferences.cartes.saisie}` — « Heute » suit
  la préférence de Karteikarten
- `src/client/cours/EcranCours.tsx:215` — `memoireDesOnglets` — la mémoire des onglets est une
  `Map` en mémoire : elle ne survit pas à un rechargement, donc pas à une mise à jour
- `src/client/cours/clavier.ts:41` — `TOUCHES_D_ACTIVATION` — Espace et Entrée restent au bouton
  qui a le focus
- `src/domaine/contenu/schemas.ts:620` — `schemaDeCours = z.strictObject` — le manifeste est
  strict : une version qui ne connaît pas une clé la refuse
- `src/domaine/cours/servi.ts:320` — `export function versCoursServi` — ce qui part au téléphone,
  en liste blanche
- `src/domaine/cours/servi.ts:355` — `export function memoireDuCours` — un champ facultatif du
  cours servi n'est pas contrôlé avec le cours : il est `unknown`, lu par une fonction
- `src/domaine/seances/examen.ts:436` — `reponsesAcceptees(question.unite, cours.index)).juste` —
  la Prüfung ne lit que `juste`
- `src/domaine/journal/evenement.ts:33` — `'saisie'` — le mode d'une réponse tapée existe déjà

## Outils et cas limites

- Stryker — il ne retrouve pas un test placé dans un `describe` — les tests de
  `src/domaine/cartes/saisie.test.ts` s'écrivent sans `describe`, et le groupe `domaine` tient 90 %
- Levenshtein (`distance`) — deux lettres échangées valent 2, pas 1 — deux tests : un échange sur
  une saisie de dix caractères ou plus reste « presque », et sur six à neuf caractères il est faux
  sans « presque »
- Preact — il réutilise le même `<button>` pour deux liens rendus au même endroit, qui garde alors
  le focus — chaque lien de « Heute » a sa `key`, et un test dit qu'Espace retourne la carte après
  le geste

## Effets cherchés

- Une faute de frappe comptée juste (M5-D1, M5-D3) — le journal, donc l'ordonnanceur et
  `memoire:rapport`, qui lisent une `saisie` juste — un test de `QuestionCarte` dit le mode et le
  verdict envoyés ; `evenement.ts` ne change pas
- La clé `pose_des_cartes` (M5-D5) — le cours monté du dépôt de données, que la version en prod
  refuserait avec la clé — `docs/format-des-contenus.md` dit « une version après » ; absente, la clé
  vaut `ecrite`, et le cours de l'instance n'a rien à changer
- `poseDesCartes` dans le cours servi — le client précaché de la version d'avant, et un client de
  ce lot devant une valeur d'une version suivante — le champ est `unknown`, lu par `poseDuCours` ;
  un test : absent ou inconnu, il vaut `ecrite`, et le cours reste admis
- La marque du choix de la case (M5-D5, M5-D6) — les préférences déjà gardées sur un appareil, sans
  marque — des tests de `preferences` : sans marque, la valeur du cours ; avec, le choix gardé
- La Prüfung reste stricte (M5-D4) — `src/domaine/seances/examen.ts` — ses tests, inchangés, passent

## Revues

- Revue de chaque tâche : Tâche 1, Tâche 2, Tâche 3, Tâche 4
- Revue finale du lot : Tâche 5
- Relecture des corrections : Tâche 6

---

### Tâche 1 : le jugement d'une carte saisie, dans le domaine

**Fichiers.** Créer `src/domaine/cartes/saisie.ts` et `src/domaine/cartes/saisie.test.ts` ;
modifier la liste des fichiers mutés (`stryker.config.json`, et la phrase de `corepack pnpm
mutation` dans `CLAUDE.md`).

**Ce que la tâche produit.**

```ts
export interface JugementDeCarte {
  juste: boolean;
  /** Fausse de peu. Jamais vrai si `juste`. */
  presque: boolean;
  /** Comptée juste malgré une lettre fausse (M5-D1). Jamais vrai si la saisie est exacte. */
  frappe: boolean;
}
export const LONGUEUR_TOLEREE = 6;
export function jugerLaCarte(
  saisie: string,
  unite: UniteDeCarte,
  index: IndexDesReponses,
): JugementDeCarte;
```

La règle, dans cet ordre, avec `plier(s) = canonique(s).replace(/ue/g, 'ü')`, `g = plier(saisie)`
et `A` les réponses de `reponsesAcceptees(unite, index)`, chacune pliée :

1. `juger(saisie, reponsesAcceptees(unite, index))` dit juste : juste, sans `frappe` ;
2. `g` est non vide et dans `A` (M5-D8) : juste, sans `frappe` ;
3. il existe `x` dans `A` avec `x.length >= LONGUEUR_TOLEREE` et `distance(g, x) === 1`, et `g`
   n'est dans aucune entrée de l'index, chaque réponse pliée (M5-D2) :
   `{ juste: true, presque: false, frappe: true }` ;
4. sinon, le jugement de `juger`, avec `frappe: false`.

**Les tests, d'abord** (sans `describe`, avec des termes inventés, jamais un texte du cours) :

- une saisie exacte : juste, sans `frappe` ;
- « ue » pour « ü » : juste, sans `frappe`, sur un terme court comme sur un long ;
- une lettre changée, une lettre en trop, une lettre en moins sur un terme de six caractères :
  juste, `frappe` ;
- la même faute sur un terme de cinq caractères : fausse, `presque` ;
- deux lettres échangées : sur une saisie de dix caractères ou plus, fausse, `presque` ; sur six à
  neuf caractères, fausse, sans `presque` ;
- deux termes de l'index voisins d'une lettre : saisir l'un pour l'autre est faux, `presque` ;
- la tolérance joue sur une réponse admise par `reponses`, pas seulement sur le recto ;
- une saisie vide : fausse, ni `presque` ni `frappe` ;
- le mutant de la valeur : `LONGUEUR_TOLEREE` à 5 puis à 7 fait échouer un test (à dire dans le
  rapport).

**Vérification.** Les quatre commandes ; puis
`corepack pnpm mutation --mutate "src/domaine/cartes/saisie.ts"`, score donné dans le rapport.

### Tâche 2 : la carte saisie signale la faute tolérée

**Fichiers.** Modifier `src/client/cours/questions/QuestionCarte.tsx` et son test,
`src/client/cours/textes-cours.ts`, et le commentaire de tête de
`src/client/cours/onglets/Cartes.tsx`, qui dit encore « presque juste (une faute de frappe) ».

**Ce que la tâche produit.**

- `EtatDeCarte.verdict` devient `{ juste: boolean; presque: boolean; frappe?: boolean; donnee: string } | null`.
- `verifier` appelle `jugerLaCarte(donnee, unite, cours.index)`.
- Avec `frappe` : le bloc `verdict ok`, le texte `t.cartes_frappe` (« Richtig – achte auf die
  Schreibweise »), la saisie barrée puis `unite.reponse` en gras (M5-D9), et pas de bouton « Meine
  Antwort war auch richtig ». « Weiter » envoie `onReponse(true, 'saisie')`.

**Les tests, d'abord.** Une faute tolérée affiche le texte, la saisie barrée et la réponse, sans
bouton de correction, et « Weiter » appelle `onReponse(true, 'saisie')` ; une saisie exacte
n'affiche pas la saisie barrée ; une saisie fausse garde le bouton et `corrigee`.

**Vérification.** Les quatre commandes.

### Tâche 3 : la pose des cartes dans le manifeste

**Fichiers.** Modifier `src/domaine/contenu/schemas.ts`, `modele.ts`, `analyse.ts`,
`src/domaine/cours/servi.ts`, `src/serveur/contenus/reference.ts`,
`src/client/cours/preferences.ts`, `src/client/cours/onglets/Cartes.tsx`, leurs tests, et
`docs/format-des-contenus.md`.

**Ce que la tâche produit.**

- `pose_des_cartes: z.enum(['ecrite', 'retournee']).optional()` dans `schemaDeCours`, après
  `manuels`, avec un message d'erreur en français ; `poseDesCartes?: 'ecrite' | 'retournee'` dans
  `Cours`.
- Dans `CoursServi`, `poseDesCartes?: unknown`, que `versCoursServi` n'écrit que présente, et
  `export function poseDuCours(cours: CoursServi): 'ecrite' | 'retournee'`, qui rend `retournee`
  pour cette valeur et `ecrite` pour tout le reste. Le schéma `coursServi` ne change pas.
- L'instantané de référence porte `poseDesCartes` après `manuels` quand le cours l'écrit, et ne
  change pas sans elle.
- `Preferences.cartes` reçoit `saisieChoisie: boolean`. `preferencesParDefaut` donne
  `saisie: poseDuCours(cours.cours) === 'ecrite'` et `saisieChoisie: false`. `lirePreferences` ne
  rend le `saisie` gardé que si `saisieChoisie` gardé vaut `true` ; sinon, la valeur par défaut. La
  case de Karteikarten écrit `saisie` et `saisieChoisie: true`.
- `docs/format-des-contenus.md` : la clé dans l'exemple de `cours.yaml`, et une section « La pose
  des cartes » après « Les manuels » : ses deux valeurs, son défaut, le choix de l'appareil qui
  l'emporte une fois fait (M5-D5, M5-D6), et « un cours monté ne la reçoit qu'une version après
  celle qui la connaît ».
- Le cours d'exemple ne change pas.

**Les tests, d'abord.** Le manifeste admet les deux valeurs et l'absence, refuse une troisième ;
le cours servi porte le champ ou non ; `poseDuCours` rend `ecrite` sans champ et pour une valeur
inconnue, et un cours servi qui porte une valeur inconnue reste admis ; le défaut de la préférence
suit la clé ; une préférence gardée sans marque suit le cours, dans les deux sens ; avec la marque,
le choix gardé l'emporte, dans les deux sens ; cocher la case pose la marque ; l'instantané de
l'exemple est inchangé.

**Vérification.** Les quatre commandes, puis `corepack pnpm build` et `corepack pnpm
contenus:client`.

### Tâche 4 : revenir à la carte retournée, dans « Heute »

**Fichiers.** Modifier `src/client/cours/onglets/Heute.tsx` et son test, et
`src/client/cours/textes-cours.ts`.

**Ce que la tâche produit.**

- Un état d'onglet à part, `useEtatDOnglet<boolean>('heute/pose', () => false, …)`, sur le modèle
  de `'heute/pretest'` : vrai, la séance pose ses cartes retournées. `QuestionCarte` reçoit
  `saisie={preferences.cartes.saisie && !retournees}`. `EtatDeHeute` ne change pas.
- Sous une carte d'unité inverse, quand la préférence `saisie` est vraie et qu'aucun verdict n'est
  affiché, un bouton `linkbtn` avec sa `key` : `t.heute_retourner` (« Lieber umdrehen ») passe en
  cartes retournées ; en cartes retournées, tant que la carte n'est pas retournée,
  `t.heute_saisir` (« Lieber eintippen »), avec une autre `key`, y revient. Le geste ne répond pas
  à la carte, n'écrit rien au journal et ne touche pas la préférence. Après lui, le focus n'est
  plus sur le lien : Espace retourne la carte.
- Le choix tient à une recomposition de la séance et à « Nächste Runde ».
- Sans préférence `saisie`, ou sur une unité directe, aucun lien.

**Les tests, d'abord.** Le lien paraît sous une carte à saisir et pas ailleurs ; le geste pose une
carte à retourner, sans écrire au journal ni changer la préférence ; Espace retourne alors la
carte ; la carte suivante reste retournée, et la série suivante aussi ; le lien de retour rend la
saisie.

**Vérification.** Les quatre commandes, puis `corepack pnpm build`, `corepack pnpm e2e` et
`corepack pnpm e2e:mise-a-jour`.

### Tâche 5 : la revue finale du lot

Un relecteur, en lecture seule, relit toute la branche contre l'issue ancrage#33 et ce plan :
chaque critère d'acceptation, chaque décision M5-D, chaque ligne d'« Effets cherchés » là où l'effet
arrive, les textes allemands, et ce qu'un changement transversal périme ailleurs (les mots
« presque », « saisie », « Begriffe eintippen » dans les docs et la notice). Il rend ses constats
classés, avec fichier et ligne.

### Tâche 6 : la relecture des corrections

Les corrections de la revue finale se font, puis un relecteur relit leur diff contre les constats,
sur la tête qui part.

### Tâche 7 : la clôture du lot

La PR de clôture :

- supprime ce plan ;
- écrit `docs/conception/lot-m5.md` (les décisions M5-D, les limites, les suites) et le paragraphe
  du lot dans `CLAUDE.md`, section « État » ; elle y corrige aussi ce que le paragraphe du lot M4 et
  `docs/conception/lot-m4.md` disent encore de la prod, qui a la `v0.18.0` et le planning depuis le
  17/11/2026 ;
- relit le README d'après `docs/modele/documentation.md` ;
- porte au registre les leçons du lot encore sans ligne ;
- porte les suites sans urgence dans ancrage#11 (l'allemand non relu, la vérification sur
  appareil) ;
- porte « Closes #33 » et la ligne `Tête relue : <SHA complet>`.

La vérification sur un téléphone Android, au staging, revient à Edouard avant l'étiquette.
