import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import { type Ordonnanceur, ordonnanceurDe } from '../../domaine/progression/ordonnanceur.js';

/*
 * L'ordonnanceur d'un cours préparé : l'algorithme de son manifeste, et, pour `par-chapitre`, le
 * chapitre de chaque unité de carte, qui est son module (les deux sens d'une carte vont ensemble).
 * Les mots, les points, les exercices et les fiches n'ont pas de chapitre : ils restent en Leitner.
 * `useProgression` et les contextes de test s'en servent, pour calculer d'une seule façon.
 */
export function ordonnanceurDuCours(cours: CoursPrepare): Ordonnanceur {
  const chapitres = new Map(cours.unites.map((unite) => [unite.id, unite.module]));
  return ordonnanceurDe({
    leitner: cours.cours.leitner,
    memoire: memoireDuCours(cours.cours),
    chapitreDe: (unite) => chapitres.get(unite),
  });
}
