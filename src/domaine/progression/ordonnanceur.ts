import type { ReglagesLeitner, ReglagesMemoire } from '../contenu/modele.js';
import type { Evenement } from '../journal/evenement.js';
import { type EtatUnite, etatsDesUnites } from './etat.js';
import { etatsFsrs, type ReglagesFsrs } from './fsrs.js';

/*
 * Le choix de l'algorithme de mémoire d'un cours (ADR-0012) : le manifeste dit, par `memoire`, si
 * l'état de chaque unité se dérive du journal par la méthode de Leitner (`etat.ts`) ou par FSRS
 * (`fsrs.ts`). Les deux rendent le même `EtatUnite` : ce que lit l'application ne change pas.
 * Sans `memoire`, c'est Leitner, comme avant.
 */

/** Rejoue le journal et rend l'état de chaque unité qui a reçu une réponse. */
export type Ordonnanceur = (evenements: readonly Evenement[]) => ReadonlyMap<string, EtatUnite>;

/**
 * L'ordonnanceur du cours, d'après son `memoire` (M3-P3) :
 * - sans `memoire`, ou en `leitner` : Leitner pour tout le cours ;
 * - en `fsrs` : FSRS pour tout le cours, à sa rétention, avec ses poids et le plafond de son examen ;
 * - en `par-chapitre` : FSRS pour les unités dont `chapitreDe` rend un chapitre de `chapitres`,
 *   Leitner pour toutes les autres (sans `chapitreDe`, pour toutes). Le journal se scinde par
 *   unité, chaque part est rejouée par son algorithme, et les deux cartes d'états se réunissent :
 *   aucune unité n'a deux états.
 */
export function ordonnanceurDe(reglages: {
  leitner: ReglagesLeitner;
  memoire?: ReglagesMemoire;
  chapitreDe?: (unite: string) => string | undefined;
}): Ordonnanceur {
  const { leitner, memoire, chapitreDe } = reglages;
  if (memoire?.algorithme === 'fsrs') {
    const fsrs = reglagesFsrs(memoire);
    return (evenements) => etatsFsrs(evenements, fsrs);
  }
  if (memoire?.algorithme === 'par-chapitre' && chapitreDe !== undefined) {
    const fsrs = reglagesFsrs(memoire);
    const chapitres = new Set(memoire.chapitres);
    const enFsrs = (unite: string): boolean => {
      const chapitre = chapitreDe(unite);
      return chapitre !== undefined && chapitres.has(chapitre);
    };
    return (evenements) =>
      new Map([
        ...etatsFsrs(
          evenements.filter((evenement) => enFsrs(evenement.unite)),
          fsrs,
        ),
        ...etatsDesUnites(
          evenements.filter((evenement) => !enFsrs(evenement.unite)),
          leitner,
        ),
      ]);
  }
  return (evenements) => etatsDesUnites(evenements, leitner);
}

/** Ce que FSRS lit du manifeste : la rétention, les poids et l'examen s'ils y sont. */
function reglagesFsrs(memoire: ReglagesMemoire): ReglagesFsrs {
  return {
    retention: memoire.retention,
    parametres: memoire.parametres,
    examen: memoire.examen,
  };
}
