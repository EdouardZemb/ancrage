import type { ReglagesLeitner, ReglagesMemoire } from '../contenu/modele.js';
import type { Evenement } from '../journal/evenement.js';
import { CHAPITRE_INVENTE, chapitreInvente, journalInvente } from './journal-invente.js';
import { type Ordonnanceur, ordonnanceurDe } from './ordonnanceur.js';

/*
 * La mesure du rejeu du journal (M3-P7) : le temps que met chaque algorithme à rejouer un journal
 * inventé. L'horloge est un paramètre : les tests n'attendent pas le temps réel.
 */

export const ALGORITHMES = ['leitner', 'fsrs', 'par-chapitre'] as const;
export type AlgorithmeMesure = (typeof ALGORITHMES)[number];

/** Les réglages de la mesure, écrits ici : ni cours, ni manifeste. */
const LEITNER: ReglagesLeitner = { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 10 };
const FSRS: ReglagesMemoire = { algorithme: 'fsrs', retention: 0.9, examen: '2027-06-30' };
const PAR_CHAPITRE: ReglagesMemoire = {
  algorithme: 'par-chapitre',
  retention: 0.9,
  examen: '2027-06-30',
  chapitres: [CHAPITRE_INVENTE],
};

/** Les trois ordonnanceurs, tels que `ordonnanceurDe` les construit d'après ces réglages. */
export function ordonnanceursDeMesure(): Record<AlgorithmeMesure, Ordonnanceur> {
  return {
    leitner: ordonnanceurDe({ leitner: LEITNER }),
    fsrs: ordonnanceurDe({ leitner: LEITNER, memoire: FSRS }),
    'par-chapitre': ordonnanceurDe({
      leitner: LEITNER,
      memoire: PAR_CHAPITRE,
      chapitreDe: chapitreInvente,
    }),
  };
}

/** La médiane : la valeur du milieu, ou la moyenne des deux du milieu. */
export function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? (triees[milieu] as number)
    : ((triees[milieu - 1] as number) + (triees[milieu] as number)) / 2;
}

/** La médiane, en millisecondes, de `repetitions` rejeux du `journal` par `ordonnanceur`. */
export function medianeDuRejeu(
  ordonnanceur: Ordonnanceur,
  journal: readonly Evenement[],
  repetitions: number,
  maintenant: () => number,
): number {
  const durees: number[] = [];
  for (let i = 0; i < repetitions; i++) {
    const depart = maintenant();
    ordonnanceur(journal);
    durees.push(maintenant() - depart);
  }
  return mediane(durees);
}

export interface OptionsDeMesure {
  unites: number;
  graine: number;
  repetitions: number;
  maintenant: () => number;
  /** Appelé avec le journal inventé avant de le rejouer. */
  surJournal?: (journal: readonly Evenement[]) => void;
}

/** La médiane du rejeu d'un journal de `taille` réponses, par chaque algorithme. */
export function mesurerLaTaille(
  taille: number,
  options: OptionsDeMesure,
): Record<AlgorithmeMesure, number> {
  const journal = journalInvente(taille, options.unites, options.graine);
  options.surJournal?.(journal);
  const ordonnanceurs = ordonnanceursDeMesure();
  const mesure = (algorithme: AlgorithmeMesure): number =>
    medianeDuRejeu(ordonnanceurs[algorithme], journal, options.repetitions, options.maintenant);
  return {
    leitner: mesure('leitner'),
    fsrs: mesure('fsrs'),
    'par-chapitre': mesure('par-chapitre'),
  };
}
