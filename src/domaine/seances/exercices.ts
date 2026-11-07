import type { Exercice, FamilleExercices } from '../contenu/modele.js';
import type { ModuleServiDe } from '../cours/prepare.js';
import { entier, type Hasard, tirerPondere } from '../hasard.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { poidsSelonReponses } from './poids.js';

/*
 * La grammaire (« Grammatik »), reprise du prototype (H:1675-1682) sans changer son comportement.
 * Les textes de `gramMake` (consigne, options, règle) sont dans le contenu depuis le lot 1b.
 */

/**
 * `gramQuestion` : un exercice du module.
 *
 * - En mélange (`'mix'`, ou un code que le module n'a plus), tous les exercices de toutes les
 *   familles sont tirés, trois fois plus souvent s'ils ne sont pas encore acquis.
 * - Dans une famille, comme le prototype, tous ses exercices ont la même chance : l'état n'y
 *   compte pas.
 *
 * @throws RangeError s'il n'y a aucun exercice à tirer.
 */
export function choisirExercice(
  exercices: ModuleServiDe<'exercices'>,
  etats: ReadonlyMap<string, EtatUnite>,
  famille: string | 'mix',
  hasard: Hasard,
): { famille: FamilleExercices; exercice: Exercice } {
  const choisie = exercices.familles.find((f) => f.code === famille);
  if (choisie !== undefined) {
    if (choisie.exercices.length === 0) throw new RangeError('Aucun exercice dans la famille.');
    return {
      famille: choisie,
      exercice: choisie.exercices[entier(choisie.exercices.length, hasard)],
    };
  }
  const candidats = exercices.familles.flatMap((f) =>
    f.exercices.map((exercice) => ({ famille: f, exercice })),
  );
  return tirerPondere(candidats, (c) => poidsSelonReponses(etatDe(etats, c.exercice.id)), hasard);
}
