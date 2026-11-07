import { reponsesAcceptees, type UniteDeCarte } from '../cartes/unites.js';
import type {
  Exercice,
  FamilleExercices,
  Jeton,
  Mot,
  TexteAnnote,
  TirageExamen,
} from '../contenu/modele.js';
import { egalStrict, juger } from '../correction.js';
import type { CoursPrepare, ModuleServiDe } from '../cours/prepare.js';
import { entier, type Hasard, melanger, tirerPondere, uniquesPar } from '../hasard.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { choisirExercice } from './exercices.js';
import {
  type ElementTirable,
  elementsTirables,
  GENRES_TIRABLES,
  idDeLElement,
  optionsDeLElement,
  reponseDeLElement,
  saisieJuste,
  type Tirable,
} from './feuilles.js';
import { poidsSelonReponses } from './poids.js';
import { optionsQcm } from './quiz.js';
import { tacheDeSchema } from './schemas.js';
import { jetonsDuModule, jetonsDuTexte, optionsDeJeton } from './textes.js';

/*
 * L'examen blanc (« Probeprüfung »), repris du prototype (H:1932-1991, H:1694) sans changer son
 * comportement. Ses réglages, que le prototype écrivait dans le code, viennent du module `examen`
 * du cours : tailles, durée, seuils du tirage. La composition tire des questions sans doublon dans
 * les chapitres choisis ; la correction compte les points, la note suisse, les groupes et les
 * réponses à journaliser (décision 8).
 *
 * Le prototype n'avait pas de feuilles. Le lot F1 y ajoute les éléments qui se répondent en une
 * fois : un QCM, un vrai/faux, une phrase à un trou ou un mot à corriger (F1-D5, F1-D6). Ce qu'ils
 * sont (leur identifiant, leur réponse, leurs options, le jugement d'une saisie) est dans
 * `feuilles.ts`, que le Quiz partage (R18) ; ici, seulement leur place dans la composition.
 */

/** Les tentatives de tirage au plus, comme le prototype : un cours trop petit n'en bloque pas. */
const ESSAIS_MAX = 5000;

export type QuestionExamen =
  /** Sans `options` : à taper. Seule une carte inverse se tape. */
  | { genre: 'carte'; chapitre: string; unite: UniteDeCarte; options?: string[] }
  | { genre: 'mot'; mot: Mot; options: string[] }
  /** `point` est l'indice dans `schema.points` ; `options` sont les termes proposés. */
  | { genre: 'schema'; schema: ModuleServiDe<'schema'>; point: number; options: string[] }
  | { genre: 'jeton'; texte: TexteAnnote; jeton: Jeton; options: string[] }
  /** Sans `options` : à taper. */
  | { genre: 'exercice'; famille: FamilleExercices; exercice: Exercice; options?: string[] }
  /**
   * Sans `options` : à taper, pour une phrase sans liste ou un mot à corriger. Un vrai/faux a pour
   * options les codes `VRAI` et `FAUX` (F1-D7).
   */
  | {
      genre: 'feuille';
      feuille: ModuleServiDe<'feuille'>;
      element: ElementTirable;
      options?: string[];
    };

export interface ChoixExamen {
  /** Les identifiants des modules de cartes. */
  chapitres: readonly string[];
  taille: number;
  /** Mêler des schémas, des textes annotés, des exercices et des feuilles aux cartes. */
  avecModules: boolean;
  chrono: boolean;
}

export interface Examen {
  questions: QuestionExamen[];
  /**
   * Les chapitres du choix que le cours connaît, dans l'ordre du cours. Leur nombre est celui de
   * l'événement `examen` (H:1988).
   */
  chapitres: string[];
  /** La durée accordée, en minutes, au moins `minutesMinimum` ; sans effet si `chrono` est faux. */
  minutes: number;
  chrono: boolean;
}

/**
 * Le choix « avec modules » (`ChoixExamen.avecModules`) a un effet : le cours a au moins un schéma,
 * un texte annoté, un module d'exercices ou un élément de feuille à poser, les seules questions que
 * ce choix mêle aux cartes. Les mots de la morphologie, eux, viennent avec leurs chapitres, que les
 * modules soient demandés ou non : un cours qui n'a que la morphologie n'a rien à mêler. L'écran ne
 * propose le choix que dans ce cas, pour que la case et le tirage ne divergent pas.
 */
export function examenAvecModulesPossible(cours: CoursPrepare): boolean {
  return (
    cours.schemas.length > 0 ||
    cours.textes !== undefined ||
    cours.exercices !== undefined ||
    (feuillesTirees(cours) && elementsTirables(cours.feuilles, GENRES_TIRABLES).length > 0)
  );
}

/**
 * Le tirage laisse une part aux feuilles : `tirage.feuille` dépasse `tirage.exercice`. Le contenu
 * mis en cache par la version précédente n'a pas `tirage.feuille` : aucune fiche (F1-D6).
 */
function feuillesTirees(cours: CoursPrepare): boolean {
  const tirage = cours.examen?.tirage;
  return tirage !== undefined && seuilDesFeuilles(tirage) > tirage.exercice;
}

/** Le seuil des feuilles, qui vaut celui des exercices s'il est absent (F1-D6). */
function seuilDesFeuilles(tirage: TirageExamen): number {
  return tirage.feuille ?? tirage.exercice;
}

/** L'indice de l'option choisie, la saisie, ou rien. */
export type ReponseExamen = number | string | undefined;

export interface CorrectionExamen {
  /** Les bonnes réponses. */
  points: number;
  questions: number;
  /** La note suisse, de 1 à 6. */
  note: number;
  /** Le nombre de chapitres de l'examen (celui de `Examen.chapitres`). */
  chapitres: number;
  /**
   * Clé : l'identifiant du chapitre, ou `'mots'`, `'schemas'`, `'textes'`, `'exercices'`,
   * `'feuilles'`. Les chapitres viennent dans l'ordre du cours, puis les modules ; un groupe sans
   * question est absent.
   */
  parGroupe: ReadonlyMap<string, { justes: number; total: number }>;
  /** Les questions fausses ou sautées, avec ce qui a été répondu (`undefined` : rien). */
  fautes: { question: QuestionExamen; donnee: string | undefined }[];
  /**
   * Les réponses à journaliser (décision 8), dans l'ordre des questions, une par unité : les
   * questions sur les jetons n'en produisent aucune, et une question sans réponse est fausse.
   */
  reponses: { unite: string; juste: boolean }[];
}

/** `swissGrade` (H:1694) : de 1 à 6 par demi-points ; 6 pour toutes les réponses justes. */
export function noteSuisse(points: number, questions: number): number {
  // Le prototype donnait NaN sans question : la note la plus basse, rien n'ayant été réussi.
  if (questions <= 0) return 1;
  return Math.max(1, Math.min(6, Math.round(((5 * points) / questions + 1) * 2) / 2));
}

/** La réponse juste à une question : le texte de l'option juste, ou la saisie attendue. */
export function reponseAttendue(question: QuestionExamen): string {
  switch (question.genre) {
    case 'carte':
      return question.unite.reponse;
    case 'mot':
      return question.mot.sens;
    case 'schema':
      return question.schema.points[question.point].terme;
    case 'jeton':
      return question.jeton.sens;
    case 'exercice':
      return question.exercice.reponse;
    case 'feuille':
      return reponseDeLElement(question.element);
  }
}

/** Le groupe de la question dans le résultat : son chapitre, ou le module dont elle vient. */
export function groupeDeQuestion(question: QuestionExamen): string {
  switch (question.genre) {
    case 'carte':
      return question.chapitre;
    case 'mot':
      return 'mots';
    case 'schema':
      return 'schemas';
    case 'jeton':
      return 'textes';
    case 'exercice':
      return 'exercices';
    case 'feuille':
      return 'feuilles';
  }
}

/**
 * L'unité qui reçoit la réponse (décision 8) ; les jetons n'en ont pas. Un élément de feuille la
 * reçoit sous son propre identifiant, et compte pour le score de sa feuille (F1-D3).
 */
function uniteDeQuestion(question: QuestionExamen): string | undefined {
  switch (question.genre) {
    case 'carte':
      return question.unite.id;
    case 'mot':
      return question.mot.id;
    case 'schema':
      return question.schema.points[question.point].id;
    case 'jeton':
      return undefined;
    case 'exercice':
      return question.exercice.id;
    case 'feuille':
      return idDeLElement(question.element);
    default: {
      // Un nouveau genre doit dire ici qui reçoit sa réponse : `undefined` serait un oubli muet.
      const _exhaustif: never = question;
      return _exhaustif;
    }
  }
}

interface QuestionTiree {
  /** Deux questions de même clé sont un doublon (`used` du prototype). */
  cle: string;
  question: QuestionExamen;
}

/** `anatExamQ` : un point d'un schéma, à nommer parmi les termes du schéma. */
function questionDeSchema(
  cours: CoursPrepare,
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): QuestionTiree | undefined {
  const schemas = cours.schemas.filter((schema) => schema.points.length > 0);
  if (schemas.length === 0) return undefined;
  const schema = schemas[entier(schemas.length, hasard)];
  const { cible, options } = tacheDeSchema(schema, etats, hasard);
  return {
    cle: `schema:${schema.points[cible].id}`,
    question: {
      genre: 'schema',
      schema,
      point: cible,
      options: options.map((rang) => schema.points[rang].terme),
    },
  };
}

/**
 * `reportExamQ` : un jeton d'un texte, à traduire parmi les sens des jetons de tous les textes. Un
 * jeton répété (même forme, même sens) dans deux textes est la même question.
 */
function questionDeJeton(cours: CoursPrepare, hasard: Hasard): QuestionTiree | undefined {
  if (cours.textes === undefined) return undefined;
  const textes = cours.textes.textes.filter((texte) => jetonsDuTexte(texte).length > 0);
  if (textes.length === 0) return undefined;
  const texte = textes[entier(textes.length, hasard)];
  const jetons = jetonsDuTexte(texte);
  const jeton = jetons[entier(jetons.length, hasard)];
  return {
    cle: `jeton:${jeton.forme}|${jeton.sens}`,
    question: {
      genre: 'jeton',
      texte,
      jeton,
      options: optionsDeJeton(jeton, jetonsDuModule(cours.textes), hasard),
    },
  };
}

/** `gramExamQ` : un exercice de n'importe quelle famille, à choix s'il a des options, sinon à taper. */
function questionDExercice(
  cours: CoursPrepare,
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): QuestionTiree | undefined {
  const { exercices } = cours;
  if (exercices === undefined || exercices.familles.every((f) => f.exercices.length === 0)) {
    return undefined;
  }
  const { famille, exercice } = choisirExercice(exercices, etats, 'mix', hasard);
  return {
    cle: `exercice:${exercice.id}`,
    question: {
      genre: 'exercice',
      famille,
      exercice,
      ...(exercice.options === undefined ? {} : { options: [...exercice.options] }),
    },
  };
}

/**
 * Une question de feuille : un élément de n'importe quelle feuille, trois fois plus souvent s'il
 * n'est pas encore acquis, comme un exercice (`choisirExercice`).
 */
function questionDeFeuille(
  tirables: readonly Tirable[],
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): QuestionTiree | undefined {
  if (tirables.length === 0) return undefined;
  const tire = tirerPondere(
    tirables,
    (x) => poidsSelonReponses(etatDe(etats, idDeLElement(x.element))),
    hasard,
  );
  // Sans options, l'élément se tape : une phrase sans liste, un mot à corriger.
  const options = optionsDeLElement(tire.element, hasard);
  return {
    cle: `feuille:${idDeLElement(tire.element)}`,
    question: {
      genre: 'feuille',
      feuille: tire.feuille,
      element: tire.element,
      ...(options === null ? {} : { options }),
    },
  };
}

/**
 * Le sens des autres propositions d'une question de mot : trois autres sens au plus, jamais celui
 * du mot, sans répéter un sens.
 */
function optionsDeMot(mot: Mot, mots: readonly Mot[], hasard: Hasard): string[] {
  const autres = uniquesPar(
    melanger(
      mots.filter((x) => x.sens !== mot.sens),
      hasard,
    ),
    (x) => x.sens,
  )
    .slice(0, 3)
    .map((x) => x.sens);
  return melanger([mot.sens, ...autres], hasard);
}

/**
 * `buildExam` (H:1932-1972) : `choix.taille` questions sans doublon, tirées dans les chapitres
 * choisis. Le tirage lit deux nombres (H:1940-1943) :
 * - avec les modules, un premier nombre choisit une question de module : sous `tirage.schema` un
 *   schéma, sous `tirage.texte` un jeton, sous `tirage.exercice` un exercice, sous `tirage.feuille`
 *   un élément de feuille (F1-D6 ; absent, il vaut `tirage.exercice`, et aucune feuille n'est
 *   tirée). Un module que le cours n'a pas, ou sans matière, laisse tomber sur le second tirage ;
 * - le second choisit les mots (sous `tirage.mot`, et seulement si un chapitre choisi est dans
 *   `morphologie.chapitres`), sinon une carte : dans le sens direct sous `tirage.direct`, dans le
 *   sens inverse au-delà, et à taper à partir de `tirage.aTaper`.
 *
 * Une carte n'est posée qu'une fois, dans un sens ou dans l'autre. Quand le cours n'a plus de
 * question à poser, l'examen est plus court que `choix.taille` ; sa durée suit les questions posées.
 *
 * @throws RangeError si le cours n'a pas de module `examen`.
 */
export function composerExamen(
  cours: CoursPrepare,
  etats: ReadonlyMap<string, EtatUnite>,
  choix: ChoixExamen,
  hasard: Hasard,
): Examen {
  const reglages = cours.examen;
  if (reglages === undefined) throw new RangeError("Le cours n'a pas de module examen.");
  const { tirage } = reglages;

  const chapitres = cours.chapitres.filter((c) => choix.chapitres.includes(c.id)).map((c) => c.id);
  const pool = cours.unites.filter((unite) => chapitres.includes(unite.module));
  const directes = pool.filter((unite) => unite.sens === 'direct');
  const inverses = pool.filter((unite) => unite.sens === 'inverse');
  const { morphologie } = cours;
  const mots = morphologie?.chapitres.some((id) => chapitres.includes(id)) ? morphologie.mots : [];
  const fiches = elementsTirables(cours.feuilles, GENRES_TIRABLES);

  const vues = new Set<string>();
  const questions: QuestionExamen[] = [];
  const poser = (tiree: QuestionTiree): void => {
    if (vues.has(tiree.cle)) return;
    vues.add(tiree.cle);
    questions.push(tiree.question);
  };

  for (let essai = 0; questions.length < choix.taille && essai < ESSAIS_MAX; essai++) {
    const r = hasard();
    if (choix.avecModules) {
      const r2 = hasard();
      const deModule =
        r2 < tirage.schema
          ? questionDeSchema(cours, etats, hasard)
          : r2 < tirage.texte
            ? questionDeJeton(cours, hasard)
            : r2 < tirage.exercice
              ? questionDExercice(cours, etats, hasard)
              : r2 < seuilDesFeuilles(tirage)
                ? questionDeFeuille(fiches, etats, hasard)
                : undefined;
      if (deModule !== undefined) {
        poser(deModule);
        continue;
      }
    }
    if (mots.length > 0 && r < tirage.mot) {
      const mot = mots[entier(mots.length, hasard)];
      if (!vues.has(`mot:${mot.id}`)) {
        poser({
          cle: `mot:${mot.id}`,
          question: { genre: 'mot', mot, options: optionsDeMot(mot, mots, hasard) },
        });
      }
      continue;
    }
    const source = r < tirage.direct || inverses.length === 0 ? directes : inverses;
    if (source.length === 0) break;
    const unite = source[entier(source.length, hasard)];
    const cle = `carte:${unite.carte}`;
    if (vues.has(cle)) continue;
    const aTaper = unite.sens === 'inverse' && r >= tirage.aTaper;
    poser({
      cle,
      question: {
        genre: 'carte',
        chapitre: unite.module,
        unite,
        ...(aTaper ? {} : { options: optionsQcm(unite, pool, cours.index, hasard) }),
      },
    });
  }

  const minutes = Math.max(
    reglages.minutesMinimum,
    Math.round((questions.length * reglages.secondesParQuestion) / 60),
  );
  return { questions, chapitres, minutes, chrono: choix.chrono };
}

/**
 * La réponse est juste. Une question à choix attend l'indice d'une option, une question à taper
 * une saisie : une carte est jugée par `juger` (casse, accents et réponses alternatives), un
 * exercice par `egalStrict` (casse et espaces seulement), un élément de feuille par `saisieJuste`
 * (F1-D4). Tout autre cas est faux.
 */
function estJuste(cours: CoursPrepare, question: QuestionExamen, reponse: ReponseExamen): boolean {
  if (reponse === undefined) return false;
  if (typeof reponse === 'number') return question.options?.[reponse] === reponseAttendue(question);
  if (question.options !== undefined) return false;
  switch (question.genre) {
    case 'carte':
      return juger(reponse, reponsesAcceptees(question.unite, cours.index)).juste;
    case 'exercice':
      return egalStrict(reponse, question.exercice.reponse);
    case 'feuille':
      return saisieJuste(question.element, reponse);
    case 'mot':
    case 'schema':
    case 'jeton':
      // Toujours à choix : une saisie n'y répond pas.
      return false;
    default: {
      // Un nouveau genre doit dire ici comment se juge une saisie : `false` serait un oubli muet.
      const _exhaustif: never = question;
      return _exhaustif;
    }
  }
}

/** Ce qui a été répondu, en toutes lettres : le texte de l'option choisie, ou la saisie. */
function donneeDe(question: QuestionExamen, reponse: ReponseExamen): string | undefined {
  return typeof reponse === 'number' ? question.options?.[reponse] : reponse;
}

/**
 * `finishExam` (H:1973-1991) : corrige l'examen. `reponses[i]` est la réponse à la question `i` ;
 * une réponse absente est une question sans réponse, fausse. Une unité n'a qu'une réponse à
 * journaliser, la première, même si l'examen la posait deux fois.
 */
export function corrigerExamen(
  cours: CoursPrepare,
  examen: Examen,
  reponses: readonly ReponseExamen[],
): CorrectionExamen {
  let points = 0;
  const comptes = new Map<string, { justes: number; total: number }>();
  const fautes: CorrectionExamen['fautes'] = [];
  const journal = new Map<string, boolean>();

  examen.questions.forEach((question, rang) => {
    const reponse = reponses[rang];
    const juste = estJuste(cours, question, reponse);
    if (juste) points++;

    const groupe = groupeDeQuestion(question);
    const compte = comptes.get(groupe) ?? { justes: 0, total: 0 };
    compte.total++;
    if (juste) compte.justes++;
    comptes.set(groupe, compte);

    if (!juste) fautes.push({ question, donnee: donneeDe(question, reponse) });

    const unite = uniteDeQuestion(question);
    if (unite !== undefined && !journal.has(unite)) journal.set(unite, juste);
  });

  const ordre = [
    ...cours.chapitres.map((c) => c.id),
    'mots',
    'schemas',
    'textes',
    'exercices',
    'feuilles',
  ];
  const place = (groupe: string): number => {
    const i = ordre.indexOf(groupe);
    return i === -1 ? ordre.length : i;
  };
  const parGroupe = new Map([...comptes].sort(([a], [b]) => place(a) - place(b)));

  return {
    points,
    questions: examen.questions.length,
    note: noteSuisse(points, examen.questions.length),
    chapitres: examen.chapitres.length,
    parGroupe,
    fautes,
    reponses: [...journal].map(([unite, juste]) => ({ unite, juste })),
  };
}
