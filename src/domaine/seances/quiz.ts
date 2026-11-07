import { canonique } from '../cartes/reponses.js';
import { type IndexDesReponses, reponsesAcceptees, type UniteDeCarte } from '../cartes/unites.js';
import { type Hasard, melanger, tirerPondere, uniquesPar } from '../hasard.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';

/*
 * Le quiz à choix multiple, repris du prototype (H:1821-1859) sans changer son comportement.
 */

/** La boîte à partir de laquelle une unité est sue : elle sort moins souvent. */
const BOITE_SUE = 4;

/** Le poids d'une unité dans le quiz : 1 si elle est sue (boîte 4 et plus), 3 sinon. */
export function poidsDeQuiz(etat: EtatUnite): number {
  return etat.boite >= BOITE_SUE ? 1 : 3;
}

/**
 * `mcOptions` : la bonne réponse et jusqu'à trois autres, mélangées.
 *
 * Les autres réponses viennent d'unités du même sens, de préférence du même type de carte, sans
 * répéter un texte. Pour une unité inverse, on écarte aussi toute réponse que sa question accepte
 * (deux cartes peuvent avoir la même question) : elle serait juste. Avec trop peu d'unités dans
 * `pool`, il y a moins de quatre options, comme dans le prototype.
 */
export function optionsQcm(
  unite: UniteDeCarte,
  pool: readonly UniteDeCarte[],
  index: IndexDesReponses,
  hasard: Hasard,
): string[] {
  // Seule une inverse écarte les réponses que sa question accepte (`acc` du prototype).
  const acceptees: ReadonlySet<string> =
    unite.sens === 'inverse' ? reponsesAcceptees(unite, index) : new Set();
  const ecartee = (x: UniteDeCarte): boolean =>
    x.reponse === unite.reponse || acceptees.has(canonique(x.reponse));
  const memeSens = pool.filter((x) => x.sens === unite.sens && !ecartee(x));
  const memeType = melanger(
    memeSens.filter((x) => x.type === unite.type),
    hasard,
  );
  const autres = melanger(
    memeSens.filter((x) => x.type !== unite.type),
    hasard,
  );
  const fausses = uniquesPar([...memeType, ...autres], (x) => x.reponse)
    .slice(0, 3)
    .map((x) => x.reponse);
  return melanger([unite.reponse, ...fausses], hasard);
}

/**
 * `newQuestion` : une unité de `pool`, trois fois plus souvent si elle n'est pas encore sue
 * (boîte inférieure à 4) que si elle l'est, avec ses options tirées de `poolOptions` (le chapitre,
 * tous sens confondus).
 *
 * @throws RangeError si `pool` est vide.
 */
export function questionDeQuiz(
  pool: readonly UniteDeCarte[],
  etats: ReadonlyMap<string, EtatUnite>,
  index: IndexDesReponses,
  poolOptions: readonly UniteDeCarte[],
  hasard: Hasard,
): { unite: UniteDeCarte; options: string[] } {
  const unite = tirerPondere(pool, (x) => poidsDeQuiz(etatDe(etats, x.id)), hasard);
  return { unite, options: optionsQcm(unite, poolOptions, index, hasard) };
}
