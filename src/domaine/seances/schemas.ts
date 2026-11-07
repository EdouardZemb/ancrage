import type { ModuleServiDe } from '../cours/prepare.js';
import { type Hasard, melanger, tirerPondere } from '../hasard.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { poidsSelonReponses } from './poids.js';

/*
 * Les schémas, repris du prototype (H:1652-1657) sans changer leur comportement : un point à
 * nommer parmi quatre propositions.
 */

/**
 * `anatTask` : un point du schéma, trois fois plus souvent s'il n'est pas encore acquis, avec
 * quatre indices de points (le sien et trois autres au hasard), mélangés. Un schéma de moins de
 * quatre points en propose moins, comme le prototype. Les indices sont ceux de `schema.points`.
 *
 * @throws RangeError si le schéma n'a aucun point.
 */
export function tacheDeSchema(
  schema: ModuleServiDe<'schema'>,
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): { cible: number; options: number[] } {
  const rangs = schema.points.map((_, rang) => rang);
  const cible = tirerPondere(
    rangs,
    (rang) => poidsSelonReponses(etatDe(etats, schema.points[rang].id)),
    hasard,
  );
  const autres = melanger(
    rangs.filter((rang) => rang !== cible),
    hasard,
  ).slice(0, 3);
  return { cible, options: melanger([cible, ...autres], hasard) };
}
