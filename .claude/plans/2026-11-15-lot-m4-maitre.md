# Lot M4 : le planning d'un cours — plan maître

**Issue :** ancrage#30, avec l'ajout de périmètre du 14/11/2026 (le manuel et la Unit d'un chapitre).

**Objectif :** un cours peut porter son planning (ses étapes, leur séance, leurs modules, leur
genre) et ses manuels. L'application s'en sert pour ne proposer que ce qui a été vu, pour répartir
les cartes neuves, pour préparer la séance à venir et pour montrer où en est la personne.

**Le cadrage, accepté par Edouard le 15/11/2026 :**

- M4-C1. Le lot se fait en tranches, et la première PR de l'issue est coupée en deux : A1 (la clé
  `planning`, « Heute », le compte à rebours) puis A2 (les manuels, la Unit, « Übersicht »).
- M4-C2. Une étape liste ses modules par identifiant, avec sa séance (une date) ou sa semaine, son
  genre (`cours` ou `revision`) et un titre libre. Elle ne se déduit pas de la Unit des modules :
  A1 ne dépend pas de A2.
- M4-C3. Un module qu'aucune étape ne nomme est toujours ouvert.
- M4-C4. Hors de « Heute », rien n'est bloqué : un chapitre à venir reste lisible dans les onglets.
- M4-C5. Le compte à rebours lit `memoire.examen`. Le planning ne porte pas de seconde date.
- M4-C6. A1 fusionnée, Edouard pose la `v0.16.0`. Le planning du cours de l'instance est une PR du
  dépôt de données, qui n'entre en prod qu'avec la version suivante du code (invariant 8).

**Exécution :** chaque tranche d'implémentation a son plan, ajouté par sa propre PR de plan, et
s'exécute tâche par tâche (un agent par tâche, une relecture par tâche).

## Mécanismes annoncés

- `src/domaine/contenu/schemas.ts:526` — `export const schemaDeCours = z.strictObject({` — le
  manifeste est strict : une image qui ignore une clé refuse le manifeste qui la porte.
- `src/domaine/contenu/analyse.ts:82` — `export function analyserContenus` — le démarrage et
  `contenus:verifier` valident un dossier par cette seule fonction.
- `src/domaine/cours/servi.ts:309` — `export function versCoursServi` — rien du manifeste ne part
  vers le client sans y être nommé (liste blanche).
- `src/domaine/seances/heute.ts:140` — `export function composerSeance` — les cartes neuves de la
  séance du jour arrivent déjà choisies, dans `candidates`, avec un quota.
- `docs/format-des-contenus.md:189` — `Un cours ne reçoit` — un cours monté ne reçoit une clé
  qu'une version après celle qui la connaît ; le cours d'exemple, qui vit dans l'image, fait exception.

## Outils et cas limites

Aucun.

## Effets cherchés

- Le manifeste admet des clés nouvelles (`planning`, puis les manuels) — le retour arrière, qui
  remet l'image précédente devant le manifeste du jour — chaque tranche dit dans
  `docs/format-des-contenus.md` la version à partir de laquelle un cours monté peut les porter, et
  la PR de données qui les pose attend cette version.
- Le cours d'exemple porte un planning et des manuels — les suites vitest et de bout en bout qui
  lisent `exemple-contenu/kueche` — `corepack pnpm test`, `e2e` et `e2e:mise-a-jour` verts à chaque
  tranche.
- Le cours servi gagne des champs — l'application précachée de la version précédente, qui les
  reçoit sans les connaître — un test de `coursServiUtilisable` sur un cours servi qui les porte.
- L'instantané de référence gagne des champs — le dépôt de données, dont la CI compare
  `references/` au code de `main` — un test tient que le JSON de l'instantané d'un cours sans ces
  clés est celui d'avant.
- Les suffixes « · Unit N » des titres du cours de l'instance — le dépôt de données — ils se
  retirent dans la PR de données qui pose les clés des manuels, après A2 et sa version.

## Revues

- revue du plan de chaque tranche, avant son exécution : Tranche 1, Tranche 2, Tranche 3, Tranche 4
- revue de chaque tâche, dans la tranche qui la porte : Tranche 1, Tranche 2, Tranche 3, Tranche 4
- revue finale du lot : Tranche 5
- relecture des corrections de la revue finale : Tranche 5

---

### Tranche 1 · A1 : la clé `planning`, « Heute » et le compte à rebours

Plan : `.claude/plans/2026-11-15-lot-m4-a1.md`.

- Le manifeste admet `planning`, validée au démarrage et par `contenus:verifier`.
- Les cartes neuves de « Heute » ne viennent que des étapes ouvertes ; ce qui est dû reste dû.
- « Heute » dit le nombre de jours avant l'examen.
- Le cours d'exemple porte un planning inventé ; `docs/format-des-contenus.md` décrit la clé.
- Sortie : la `v0.16.0`, posée par Edouard, puis, une version plus tard, le planning de l'instance.

### Tranche 2 · A2 : les manuels, la Unit et les divisions de « Übersicht »

Plan à écrire à l'entrée de la tranche.

- Le manifeste nomme les manuels ; un module de cartes dit son manuel, son numéro de chapitre et sa
  Unit ; un schéma peut dire son manuel.
- « Übersicht » se divise par manuel, avec une dernière division « Übungen » ; le même rangement
  sert au choix du chapitre dans Karteikarten et aux filtres du Quiz et de la Prüfung.
- Un cours sans ces clés s'affiche comme aujourd'hui.

### Tranche 3 · B : le rythme et le pré-test

Plan à écrire à l'entrée de la tranche.

- Le nombre de cartes neuves par jour se calcule d'après l'étape, avec rattrapage d'un retard ;
  `nouvelles_par_seance` reste un plafond.
- Trois jours avant une séance, « Heute » propose un pré-test de cinq questions, sous un mode à
  lui, qui ne compte pas comme des fautes pour l'ordonnanceur.

### Tranche 4 · C : la vue du semestre et les révisions

Plan à écrire à l'entrée de la tranche.

- Une vue montre les étapes dans l'ordre, avec leur état et le retard éventuel.
- À une étape de révision, la séance du jour mêle les étapes déjà ouvertes.
- Pendant un trou du planning, aucune carte neuve au-delà des étapes ouvertes.

### Tranche 5 · La revue finale du lot et ses corrections

- Une revue de tout le lot par un agent qui n'a écrit aucune tranche, sur la tête de `main` :
  contre l'issue, les invariants 1 à 9 et les décisions M4-C1 à M4-C6.
- Une PR de corrections, puis la relecture de ces corrections par le même agent.
- La mutation des fichiers de domaine du lot, à 90 % au moins.
- La vérification sur un téléphone Android, au staging, par Edouard.

### Tranche 6 · La clôture du lot

La PR de clôture, et elle seule :

- supprime ce plan maître et les plans de tranche de `.claude/plans/` ;
- reporte ce qui doit survivre dans `docs/conception/lot-m4.md` et dans « État » de `CLAUDE.md`, et
  écrit un ADR si une décision du lot est difficile à défaire ;
- relit le README d'après `docs/modele/documentation.md` ;
- porte au registre (`docs/registre.md`) les leçons du lot encore sans ligne, et les suites sans
  urgence à l'issue ancrage#11 ;
- porte « Closes #30 », ce qui ferme l'issue ;
- nomme la tête qu'a lue sa dernière relecture, par la ligne `Tête relue : <SHA>`.
