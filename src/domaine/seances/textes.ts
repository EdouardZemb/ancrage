import type { Jeton, Question, TexteAnnote } from '../contenu/modele.js';
import type { ModuleServiDe } from '../cours/prepare.js';
import { type Hasard, melanger, uniquesPar } from '../hasard.js';

/*
 * Les textes annotés (« Berichte »), repris du prototype (H:1660-1672, H:2113-2170) sans changer
 * leur comportement : traduire les termes marqués, puis répondre aux questions sur le texte.
 */

/** Les jetons d'un texte, dans l'ordre où le texte les porte. */
export function jetonsDuTexte(texte: TexteAnnote): Jeton[] {
  return texte.segments.flatMap((segment) => ('jeton' in segment ? [segment.jeton] : []));
}

/**
 * `REPORT_TOKENS` (H:1666) : tous les jetons de tous les textes du module, dans l'ordre. Les
 * options d'un jeton (`optionsDeJeton`) en sont tirées, d'où qu'il vienne.
 */
export function jetonsDuModule(module: ModuleServiDe<'texte-annote'>): Jeton[] {
  return module.textes.flatMap(jetonsDuTexte);
}

/**
 * `isAbbr` : une forme avec un point, de 2 à 6 majuscules, chiffres ou tirets, ou finissant en
 * « -Ca ».
 */
export function estAbreviation(forme: string): boolean {
  return forme.includes('.') || /^[A-ZÄÖÜ0-9-]{2,6}$/.test(forme) || /-Ca$/.test(forme);
}

/**
 * `tokenOptions` : le sens du jeton et jusqu'à trois autres, mélangés. Les autres sens viennent des
 * jetons de `tous` (ceux du module), de préférence de même nature (abréviation ou mot), sans
 * répéter un sens ni reprendre celui de la réponse.
 */
export function optionsDeJeton(jeton: Jeton, tous: readonly Jeton[], hasard: Hasard): string[] {
  const abreviation = estAbreviation(jeton.forme);
  const autres = tous.filter((x) => x.sens !== jeton.sens);
  const memeNature = melanger(
    autres.filter((x) => estAbreviation(x.forme) === abreviation),
    hasard,
  );
  const autreNature = melanger(
    autres.filter((x) => estAbreviation(x.forme) !== abreviation),
    hasard,
  );
  const fausses = uniquesPar([...memeNature, ...autreNature], (x) => x.sens)
    .slice(0, 3)
    .map((x) => x.sens);
  return melanger([jeton.sens, ...fausses], hasard);
}

/** Les options d'une question sur le texte : la réponse et ses trois distracteurs, mélangés. */
export function optionsDeQuestion(question: Question, hasard: Hasard): string[] {
  return melanger([question.reponse, ...question.distracteurs], hasard);
}

/**
 * Le texte est réussi si la part de réponses justes atteint `reussite` (H:2166 : 0,8). Les
 * résultats réunissent ceux des jetons et ceux des questions. Sans réponse, il n'est pas réussi.
 */
export function texteReussi(resultats: readonly boolean[], reussite: number): boolean {
  return resultats.length > 0 && resultats.filter(Boolean).length / resultats.length >= reussite;
}
