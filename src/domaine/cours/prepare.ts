import {
  type IndexDesReponses,
  indexerReponses,
  type UniteDeCarte,
  unitesDeCartes,
} from '../cartes/unites.js';
import { idsDeFeuille } from '../contenu/feuille.js';
import type { CoursServi, ModuleServi } from './servi.js';

/*
 * Le cours servi, préparé une fois pour les séances : les unités de cartes (`ITEMS`), l'index des
 * réponses acceptées (`ACCEPT`), les chapitres et les modules à un seul exemplaire. Rien n'y
 * change tant que le cours ne change pas, si bien que le client le calcule au chargement.
 */

/** Un module de cartes, tel que le prototype listait ses chapitres. */
export interface Chapitre {
  /** L'identifiant du module de cartes. */
  id: string;
  numero: number;
  titre: string;
}

/**
 * Les écrans d'un cours : l'aperçu est à `/cours/<id>`, chacun des autres à `/cours/<id>/<onglet>`
 * (décision 20) ; « Heute », la séance du jour, est à `/cours/<id>/heute` (M2-P1). `feuilles` montre toutes les feuilles du cours (F1-D1).
 */
export type Onglet =
  | 'heute'
  | 'apercu'
  | 'cartes'
  | 'quiz'
  | 'mots'
  | 'schemas'
  | 'textes'
  | 'exercices'
  | 'feuilles'
  | 'examen'
  | 'progression';

export type ModuleServiDe<T extends ModuleServi['type']> = Extract<ModuleServi, { type: T }>;

export interface CoursPrepare {
  cours: CoursServi;
  unites: UniteDeCarte[];
  index: IndexDesReponses;
  chapitres: Chapitre[];
  morphologie?: ModuleServiDe<'morphologie'>;
  schemas: ModuleServiDe<'schema'>[];
  textes?: ModuleServiDe<'texte-annote'>;
  exercices?: ModuleServiDe<'exercices'>;
  examen?: ModuleServiDe<'examen'>;
  /** De la plus récente à la plus ancienne : par `numero` décroissant. */
  feuilles: ModuleServiDe<'feuille'>[];
  /** Toute unité qui peut recevoir une réponse dans le contenu actuel (décision 8). */
  unitesConnues: ReadonlySet<string>;
}

function modulesDe<T extends ModuleServi['type']>(cours: CoursServi, type: T): ModuleServiDe<T>[] {
  return cours.modules.filter((module): module is ModuleServiDe<T> => module.type === type);
}

/**
 * Prépare le cours pour les séances. Les unités qui reçoivent une réponse (`unitesConnues`) sont
 * celles de la décision 8 : les cartes dans chaque sens, les mots, les points des schémas, les
 * textes annotés entiers et les exercices, puis les éléments des feuilles (F1-D2). Les jetons et
 * les questions d'un texte n'y sont pas : ils ne produisent pas d'événement. Les tâches d'une
 * feuille non plus.
 *
 * Un cours a au plus un module `morphologie`, `texte-annote`, `exercices` ou `examen` (le chargeur
 * le garantit) : le premier est pris. Il a autant de feuilles qu'on veut.
 */
export function preparerCours(cours: CoursServi): CoursPrepare {
  const modulesDeCartes = modulesDe(cours, 'cartes');
  const unites = unitesDeCartes(modulesDeCartes);
  const [morphologie] = modulesDe(cours, 'morphologie');
  const schemas = modulesDe(cours, 'schema');
  const [textes] = modulesDe(cours, 'texte-annote');
  const [exercices] = modulesDe(cours, 'exercices');
  const [examen] = modulesDe(cours, 'examen');
  // `modulesDe` rend une liste neuve : la trier laisse le cours servi dans son ordre.
  const feuilles = modulesDe(cours, 'feuille').sort((a, b) => b.numero - a.numero);

  const unitesConnues = new Set<string>([
    ...unites.map((unite) => unite.id),
    ...(morphologie?.mots.map((mot) => mot.id) ?? []),
    ...schemas.flatMap((schema) => schema.points.map((point) => point.id)),
    ...(textes?.textes.map((texte) => texte.id) ?? []),
    ...(exercices?.familles.flatMap((famille) => famille.exercices.map((e) => e.id)) ?? []),
    ...feuilles.flatMap((feuille) => idsDeFeuille(feuille)),
  ]);

  return {
    cours,
    unites,
    index: indexerReponses(unites),
    chapitres: modulesDeCartes.map(({ id, numero, titre }) => ({ id, numero, titre })),
    morphologie,
    schemas,
    textes,
    exercices,
    examen,
    feuilles,
    unitesConnues,
  };
}

/**
 * Les onglets du cours, dans l'ordre du prototype (décision 19), « Heute » en tête (M2-P1) : « Heute »,
 * l'aperçu et la progression toujours, les cartes et le quiz s'il y a un module de cartes, puis un onglet par type de module.
 * Celui des feuilles, que le prototype n'avait pas, vient entre les exercices et l'examen (F1-D1).
 */
export function ongletsDuCours(cours: CoursPrepare): Onglet[] {
  const onglets: Onglet[] = ['heute', 'apercu'];
  if (cours.chapitres.length > 0) onglets.push('cartes', 'quiz');
  if (cours.morphologie !== undefined) onglets.push('mots');
  if (cours.schemas.length > 0) onglets.push('schemas');
  if (cours.textes !== undefined) onglets.push('textes');
  if (cours.exercices !== undefined) onglets.push('exercices');
  if (cours.feuilles.length > 0) onglets.push('feuilles');
  if (cours.examen !== undefined) onglets.push('examen');
  onglets.push('progression');
  return onglets;
}
