# Lot M5 : la réponse écrite sur une carte (ancrage#33)

**Objectif.** Finir la réponse écrite : une faute de frappe est tolérée et signalée, le cours choisit
la pose de ses cartes dans son manifeste, et « Heute » laisse revenir à la carte retournée pour une
séance.

**Le constat de départ.** L'essentiel de l'issue existe depuis le prototype : sur le sens
« définition vers terme » (l'unité inverse), la carte se pose avec un champ, la saisie est cochée
par défaut sur chaque appareil, « Heute » la pose de même, la bonne réponse s'affiche après la
saisie, « Meine Antwort war auch richtig » corrige le verdict, et le journal dit `saisie` ou
`corrigee`. Le sens direct, aux longues définitions, reste en carte retournée. Le lot n'ajoute donc
aucun mode au journal, et rien n'attend une version de plus (invariant 8).

**Les décisions** (« M5-D<n> », accordées par Edouard le 17/11/2026 avec les défauts du cadrage) :

- **M5-D1.** Une saisie à une lettre d'une réponse admise d'au moins six caractères (une lettre
  changée, en trop ou en moins ; distance de Levenshtein de 1 sur les formes canoniques) est
  comptée juste, et l'écran le signale avec la bonne graphie. Deux lettres échangées restent
  « Fast » : fausse, avec le bouton de correction.
- **M5-D2.** La tolérance ne joue pas quand la saisie est la réponse admise d'une autre carte du
  cours : deux termes voisins d'une lettre ne se confondent pas.
- **M5-D3.** Au journal, une faute tolérée est une réponse `saisie` juste : aucun mode nouveau.
- **M5-D4.** La Prüfung garde son jugement strict (`juger(…).juste`) : une faute de frappe y reste
  fausse.
- **M5-D5.** La clé facultative `pose_des_cartes` du manifeste vaut `ecrite` ou `retournee`.
  Absente, elle vaut `ecrite`, le comportement d'aujourd'hui. Elle donne la valeur par défaut de la
  case « Begriffe eintippen » ; le choix gardé sur l'appareil l'emporte. Un cours monté ne la reçoit
  qu'une version après celle qui la connaît.
- **M5-D6.** Dans « Heute », sous une carte à saisir, un lien passe la séance en cartes retournées,
  et un autre y revient. Le choix vit dans l'état de la séance : il ne touche pas la préférence, et
  finit avec la séance.

**Les commandes de vérification**, pour chaque tâche, une à la fois, après la dernière
modification, avec les nombres dans le rapport : `corepack pnpm test`, `corepack pnpm types`,
`corepack pnpm lint`, `corepack pnpm duplication`.

## Mécanismes annoncés

- `src/domaine/correction.ts:31` — `export function juger` — juge une saisie contre les réponses
  admises, et dit « presque » sans jamais compter juste une faute de frappe
- `src/domaine/correction.ts:35` — `g.length >= 4` — le « presque » d'aujourd'hui : à une lettre
  près dès quatre caractères, à deux près au-delà de neuf
- `src/domaine/cartes/unites.ts:99` — `export function reponsesAcceptees` — les réponses admises
  d'une unité, d'après l'index du cours
- `src/domaine/cartes/unites.ts:29` — `IndexDesReponses` — pour chaque question inverse, ses
  réponses admises, tous modules confondus
- `src/client/cours/questions/QuestionCarte.tsx:44` — `saisieAttendue` — la saisie ne se pose que
  sur une unité inverse, quand `saisie` est vrai
- `src/client/cours/questions/QuestionCarte.tsx:91` — `onReponse(true, 'corrigee')` — la personne
  corrige un verdict faux, et le journal le dit
- `src/client/cours/preferences.ts:44` — `saisie: true` — la saisie est cochée par défaut
- `src/client/cours/onglets/Heute.tsx:406` — `saisie={preferences.cartes.saisie}` — « Heute » suit
  la préférence de Karteikarten
- `src/client/cours/onglets/Heute.tsx:249` — `useEtatDOnglet<EtatDeHeute>` — l'état de la séance du
  jour, gardé d'un onglet à l'autre
- `src/domaine/contenu/schemas.ts:620` — `schemaDeCours = z.strictObject` — le manifeste est
  strict : une version qui ne connaît pas une clé la refuse
- `src/domaine/cours/servi.ts:320` — `export function versCoursServi` — ce qui part au téléphone,
  en liste blanche
- `src/domaine/cours/servi.ts:532` — `const coursServi = z.object` — le contrôle du cours reçu
  n'est pas strict : un champ de plus ne casse pas un client d'avant
- `src/domaine/seances/examen.ts:436` — `reponsesAcceptees(question.unite, cours.index)).juste` —
  la Prüfung ne lit que `juste`
- `src/domaine/journal/evenement.ts:33` — `'saisie'` — le mode d'une réponse tapée existe déjà

## Outils et cas limites

- Stryker — il ne retrouve pas un test placé dans un `describe` — les tests de
  `src/domaine/cartes/saisie.test.ts` s'écrivent sans `describe`, et le groupe `domaine` tient 90 %
- Levenshtein (`distance`) — deux lettres échangées valent 2, pas 1 — un test dit qu'un échange
  reste « presque »

## Effets cherchés

- Une faute de frappe comptée juste (M5-D1, M5-D3) — le journal, donc l'ordonnanceur et
  `memoire:rapport`, qui lisent une `saisie` juste — un test de `QuestionCarte` dit le mode et le
  verdict envoyés ; `evenement.ts` ne change pas
- La clé `pose_des_cartes` (M5-D5) — le cours monté du dépôt de données, que la version en prod
  refuserait avec la clé — `docs/format-des-contenus.md` dit « une version après » ; absente, la clé
  vaut `ecrite`, et le cours de l'instance n'a rien à changer
- `poseDesCartes` dans le cours servi — le client précaché de la version d'avant, et le cours gardé
  dans IndexedDB — un test de `servi` : le champ absent est admis, le champ présent aussi
- `frappe` dans l'état d'une carte, et le choix de la séance dans l'état de « Heute » (M5-D6) — une
  séance gardée par la version d'avant, relue par celle-ci — des tests de `seances-en-cours` : un
  état sans ces champs se relit
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

La règle : `juger(saisie, reponsesAcceptees(unite, index))` d'abord ; s'il dit juste, `frappe` est
faux. Sinon, avec `g = canonique(saisie)` : s'il existe une réponse admise `x` avec
`x.length >= LONGUEUR_TOLEREE` et `distance(g, x) === 1`, et si `g` n'est la réponse admise d'aucune
autre question de l'index (toute entrée dont la clé n'est pas `canonique(unite.question)`), le
jugement est `{ juste: true, presque: false, frappe: true }`. Sinon, c'est celui de `juger`, avec
`frappe: false`.

**Les tests, d'abord** (sans `describe`, avec des termes inventés, jamais un texte du cours) :

- une saisie exacte : juste, sans `frappe` ;
- une lettre changée, une lettre en trop, une lettre en moins sur un terme de six caractères :
  juste, `frappe` ;
- la même faute sur un terme de cinq caractères : fausse, `presque` ;
- deux lettres échangées sur un terme long : fausse, `presque` ;
- deux termes de l'index voisins d'une lettre : saisir l'un pour l'autre est faux, `presque` ;
- la tolérance joue sur une réponse admise par `reponses`, pas seulement sur le recto ;
- une saisie vide : fausse, ni `presque` ni `frappe` ;
- le mutant de la valeur : `LONGUEUR_TOLEREE` à 5 puis à 7 fait échouer un test (à dire dans le
  rapport).

**Vérification.** Les quatre commandes ; puis
`corepack pnpm mutation --mutate "src/domaine/cartes/saisie.ts"`, score donné dans le rapport.

### Tâche 2 : la carte saisie signale la faute tolérée

**Fichiers.** Modifier `src/client/cours/questions/QuestionCarte.tsx` et son test,
`src/client/cours/textes-cours.ts`, `src/client/cours/seances-en-cours.ts` et son test si l'état
d'une carte y est contrôlé.

**Ce que la tâche produit.**

- `EtatDeCarte.verdict` devient `{ juste: boolean; presque: boolean; frappe?: boolean; donnee: string } | null`.
- `verifier` appelle `jugerLaCarte(donnee, unite, cours.index)`.
- Avec `frappe` : le bloc `verdict ok`, le texte `t.cartes_frappe` (« Richtig – achte auf die
  Schreibweise »), la saisie barrée puis la bonne réponse en gras, et pas de bouton « Meine Antwort
  war auch richtig ». « Weiter » envoie `onReponse(true, 'saisie')`.
- Un état de carte gardé sans `frappe` se relit comme avant.

**Les tests, d'abord.** Une faute tolérée affiche le texte, la saisie barrée et la réponse, sans
bouton de correction, et « Weiter » appelle `onReponse(true, 'saisie')` ; une saisie exacte
n'affiche pas la saisie barrée ; une saisie fausse garde le bouton et `corrigee` ; un état gardé
sans `frappe` est admis.

**Vérification.** Les quatre commandes.

### Tâche 3 : la pose des cartes dans le manifeste

**Fichiers.** Modifier `src/domaine/contenu/schemas.ts`, `modele.ts`, `analyse.ts`,
`src/domaine/cours/servi.ts`, `src/serveur/contenus/reference.ts`,
`src/client/cours/preferences.ts`, leurs tests, et `docs/format-des-contenus.md`.

**Ce que la tâche produit.**

- `pose_des_cartes: z.enum(['ecrite', 'retournee']).optional()` dans `schemaDeCours`, avec un
  message d'erreur en français ; `poseDesCartes?: 'ecrite' | 'retournee'` dans `Cours` et dans
  `CoursServi` ; `versCoursServi` ne l'écrit que présente ; le contrôle du cours reçu l'admet
  absente, et refuse une autre valeur.
- L'instantané de référence porte la clé quand le cours l'écrit, et ne change pas sans elle.
- `preferencesParDefaut(cours).cartes.saisie` vaut `cours.cours.poseDesCartes !== 'retournee'`.
  Une préférence gardée l'emporte toujours.
- `docs/format-des-contenus.md`, une section « La pose des cartes » après « Les manuels » : la clé,
  ses deux valeurs, son défaut, la préférence de l'appareil qui l'emporte, et « un cours monté ne
  la reçoit qu'une version après celle qui la connaît ».
- Le cours d'exemple ne change pas.

**Les tests, d'abord.** Le manifeste admet les deux valeurs et l'absence, refuse une troisième ;
le cours servi porte le champ ou non ; un cours servi sans le champ est admis ; le défaut de la
préférence suit la clé ; une préférence gardée `saisie: true` l'emporte sur `retournee`, et
`saisie: false` sur `ecrite` ; l'instantané de l'exemple est inchangé.

**Vérification.** Les quatre commandes, puis `corepack pnpm build` et `corepack pnpm
contenus:client`.

### Tâche 4 : revenir à la carte retournée pour une séance, dans « Heute »

**Fichiers.** Modifier `src/client/cours/onglets/Heute.tsx` et son test,
`src/client/cours/seances-en-cours.ts` et son test, `src/client/cours/textes-cours.ts`.

**Ce que la tâche produit.**

- `EtatDeHeute` reçoit `retournees?: true`. `QuestionCarte` reçoit
  `saisie={preferences.cartes.saisie && courante.retournees !== true}`.
- Sous une carte d'unité inverse, quand la préférence `saisie` est vraie et qu'aucun verdict n'est
  affiché, un bouton `linkbtn` : `t.heute_retourner` (« In dieser Runde lieber umdrehen ») pose
  `retournees: true` ; en cartes retournées, tant que la carte n'est pas retournée,
  `t.heute_saisir` (« Wieder eintippen ») le retire. Le geste ne répond pas à la carte et ne touche
  pas la préférence.
- Une séance recomposée (clé changée) repart sans `retournees`. Une séance gardée sans le champ se
  relit ; avec le champ, elle le retrouve au retour d'un autre onglet.
- Sans préférence `saisie`, ou sur une unité directe, aucun lien.

**Les tests, d'abord.** Le lien paraît sous une carte à saisir et pas ailleurs ; le geste pose une
carte à retourner, sans écrire au journal ni changer la préférence ; la carte suivante de la séance
reste retournée ; le lien de retour rend la saisie ; l'état gardé avec et sans le champ se relit.

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
