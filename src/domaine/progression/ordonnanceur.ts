import type { ReglagesLeitner, ReglagesMemoire } from '../contenu/modele.js';
import type { Evenement } from '../journal/evenement.js';
import { type EtatUnite, etatsDesUnites } from './etat.js';
import { etatsFsrs } from './fsrs.js';

/*
 * Le choix de l'algorithme de mémoire d'un cours (ADR-0012) : le manifeste dit, par `memoire`, si
 * l'état de chaque unité se dérive du journal par la méthode de Leitner (`etat.ts`) ou par FSRS
 * (`fsrs.ts`). Les deux rendent le même `EtatUnite` : ce que lit l'application ne change pas.
 * Sans `memoire`, c'est Leitner, comme avant.
 */

/** Rejoue le journal et rend l'état de chaque unité qui a reçu une réponse. */
export type Ordonnanceur = (evenements: readonly Evenement[]) => ReadonlyMap<string, EtatUnite>;

/** L'ordonnanceur du cours : FSRS si son `memoire` le demande, Leitner sinon. */
export function ordonnanceurDe(reglages: {
  leitner: ReglagesLeitner;
  memoire?: ReglagesMemoire;
}): Ordonnanceur {
  const { leitner, memoire } = reglages;
  if (memoire?.algorithme === 'fsrs') {
    const retention = memoire.retention;
    return (evenements) => etatsFsrs(evenements, retention);
  }
  return (evenements) => etatsDesUnites(evenements, leitner);
}
