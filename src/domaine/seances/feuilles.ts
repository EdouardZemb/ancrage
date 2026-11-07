import type {
  Affirmation,
  MotACorriger,
  PhraseATrous,
  QuestionAChoix,
  Tache,
} from '../contenu/modele.js';
import type { ModuleServiDe } from '../cours/prepare.js';
import { egalOrthographe, FAUX, optionsDeQcm, trouJuste, VRAI } from '../feuilles/correction.js';
import { type Hasard, tirerPondere } from '../hasard.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { poidsDeQuiz } from './quiz.js';

/*
 * Les éléments de feuille que le Quiz et la Prüfung tirent : ceux qui se répondent en une fois,
 * d'un choix ou d'une saisie (R18). Le Quiz n'en prend que les questions fermées, la Prüfung tous.
 * Le domaine parle en codes pour le vrai/faux (F1-D7). La composition de l'examen, elle, reste dans
 * `examen.ts`.
 */

/**
 * Un élément tirable, marqué par le genre de sa tâche. Une phrase n'y a qu'un trou (F1-D5), et
 * porte la liste de mots de sa tâche, si elle en a une. Les paires, les éléments à classer et les
 * questions ouvertes n'y viennent pas : ils ne se répondent ni d'un choix ni d'un mot.
 */
export type ElementTirable =
  | { genre: 'qcm'; question: QuestionAChoix }
  | { genre: 'vrai-faux'; affirmation: Affirmation }
  | { genre: 'trous'; phrase: PhraseATrous; liste?: readonly string[] }
  | { genre: 'orthographe'; mot: MotACorriger };

export type GenreTirable = ElementTirable['genre'];

/** Une question fermée, qui se répond d'un clic : celles du Quiz. */
export type ElementFerme = ElementDeGenre<'qcm' | 'vrai-faux'>;

/** Les genres du Quiz : les questions fermées (F1-D7). */
export const GENRES_FERMES = ['qcm', 'vrai-faux'] as const satisfies readonly GenreTirable[];

/** Les genres de la Prüfung : tous les genres tirables. */
export const GENRES_TIRABLES = [
  'qcm',
  'vrai-faux',
  'trous',
  'orthographe',
] as const satisfies readonly GenreTirable[];

/** Les éléments tirables des genres `G`. */
export type ElementDeGenre<G extends GenreTirable> = Extract<ElementTirable, { genre: G }>;

/** Un élément tirable, avec la feuille qui le porte. */
export interface Tirable<E extends ElementTirable = ElementTirable> {
  feuille: ModuleServiDe<'feuille'>;
  element: E;
}

/** Les éléments tirables d'une tâche, dans l'ordre du papier. */
function elementsDeLaTache(tache: Tache): ElementTirable[] {
  switch (tache.genre) {
    case 'qcm':
      return tache.questions.map((question) => ({ genre: 'qcm', question }));
    case 'vrai-faux':
      return tache.affirmations.map((affirmation) => ({ genre: 'vrai-faux', affirmation }));
    case 'trous': {
      const { liste } = tache;
      return tache.phrases
        .filter((phrase) => phrase.reponses.length === 1)
        .map((phrase) => ({ genre: 'trous', phrase, ...(liste === undefined ? {} : { liste }) }));
    }
    case 'orthographe':
      return tache.mots.map((mot) => ({ genre: 'orthographe', mot }));
    case 'appariement':
    case 'classement':
    case 'ouverte':
      // Stryker disable next-line ArrayDeclaration: une valeur sans `genre` est écartée par le
      // filtre de genre d'`elementsTirables`, le seul appelant (équivalent).
      return [];
    default: {
      // Un nouveau genre doit dire ici s'il est tirable : `pnpm types` échoue tant que ce n'est pas
      // fait. Une tâche d'un genre inconnu, servie par une version suivante, ne l'est pas (F1-D11).
      const _exhaustif: never = tache;
      // Stryker disable next-line ArrayDeclaration: écartée de même par le filtre (équivalent).
      return [];
    }
  }
}

/**
 * Les éléments tirables des feuilles dont le genre est l'un de `genres`, dans l'ordre des feuilles,
 * des parties et des tâches : `GENRES_FERMES` pour le Quiz, `GENRES_TIRABLES` pour la Prüfung.
 */
export function elementsTirables<G extends GenreTirable>(
  feuilles: readonly ModuleServiDe<'feuille'>[],
  genres: readonly G[],
): Tirable<ElementDeGenre<G>>[] {
  const garder = (tirable: Tirable): tirable is Tirable<ElementDeGenre<G>> =>
    (genres as readonly GenreTirable[]).includes(tirable.element.genre);
  return feuilles
    .flatMap((feuille) =>
      feuille.parties.flatMap((partie) =>
        partie.taches.flatMap((tache) =>
          elementsDeLaTache(tache).map((element): Tirable => ({ feuille, element })),
        ),
      ),
    )
    .filter(garder);
}

/** L'identifiant de l'élément, qui reçoit la réponse au journal (F1-D3). */
export function idDeLElement(element: ElementTirable): string {
  switch (element.genre) {
    case 'qcm':
      return element.question.id;
    case 'vrai-faux':
      return element.affirmation.id;
    case 'trous':
      return element.phrase.id;
    case 'orthographe':
      return element.mot.id;
  }
}

/**
 * La bonne réponse : le texte d'un QCM, `VRAI` ou `FAUX` pour une affirmation (F1-D7), la réponse
 * du trou d'une phrase, la graphie juste d'un mot à corriger.
 */
export function reponseDeLElement(element: ElementTirable): string {
  switch (element.genre) {
    case 'qcm':
      return element.question.reponse;
    case 'vrai-faux':
      return element.affirmation.vrai ? VRAI : FAUX;
    case 'trous':
      return element.phrase.reponses[0];
    case 'orthographe':
      return element.mot.reponse;
  }
}

/** Les options d'une question fermée : celles du QCM, mélangées, ou `[VRAI, FAUX]` dans cet ordre. */
function optionsDeChoix(element: ElementFerme, hasard: Hasard): string[] {
  return element.genre === 'qcm' ? optionsDeQcm(element.question, hasard) : [VRAI, FAUX];
}

/**
 * Les options d'un élément : celles d'une question fermée, ou la liste d'une phrase, dans son
 * ordre. `null` : l'élément se tape (une phrase sans liste, un mot à corriger).
 */
export function optionsDeLElement(element: ElementTirable, hasard: Hasard): string[] | null {
  switch (element.genre) {
    case 'qcm':
    case 'vrai-faux':
      return optionsDeChoix(element, hasard);
    case 'trous':
      return element.liste === undefined ? null : [...element.liste];
    case 'orthographe':
      return null;
  }
}

/**
 * Une saisie tapée pour un élément (F1-D4) : le trou d'une phrase se juge comme une carte
 * (`canonique`) sans liste, à l'identique avec ; un mot à corriger strictement (`egalOrthographe`).
 * Une question fermée se répond d'un choix : une saisie n'y répond pas.
 */
export function saisieJuste(element: ElementTirable, saisie: string): boolean {
  switch (element.genre) {
    case 'trous':
      return trouJuste(saisie, element.phrase.reponses[0], element.liste !== undefined);
    case 'orthographe':
      return egalOrthographe(saisie, element.mot.reponse);
    case 'qcm':
    case 'vrai-faux':
      return false;
  }
}

/**
 * Une question fermée de `elements`, pour le Quiz : trois fois plus souvent si elle n'est pas
 * encore sue (boîte inférieure à 4), comme `questionDeQuiz`, avec ses options.
 *
 * @throws RangeError si `elements` est vide.
 */
export function questionFermee(
  elements: readonly Tirable<ElementFerme>[],
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): { element: ElementFerme; options: string[] } {
  const { element } = tirerPondere(
    elements,
    (x) => poidsDeQuiz(etatDe(etats, idDeLElement(x.element))),
    hasard,
  );
  return { element, options: optionsDeChoix(element, hasard) };
}
