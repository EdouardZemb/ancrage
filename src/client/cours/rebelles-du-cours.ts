/*
 * Les éléments rebelles d'un cours, dérivés du journal (M6, T2-D2) : rien n'est gardé (invariant 5).
 * `useProgression` les calcule une fois par journal et le contexte du cours les donne à tout l'écran ;
 * le contexte factice des tests les calcule de même.
 */

import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { seuilDesRebelles } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import {
  type EtatDeRebelle,
  fautesDuJournal,
  reponduesLe,
  unitesRebelles,
} from '../../domaine/progression/rebelles.js';
import { posablesDuCours } from '../../domaine/seances/heute.js';

export interface RebellesDuCours {
  /** Les fautes de chaque unité du journal, sans seuil. */
  fautes: ReadonlyMap<string, EtatDeRebelle>;
  /** Les posables du cours qui ont atteint le seuil du cours. */
  rebelles: ReadonlySet<string>;
  /** Les rebelles qui ont déjà une réponse aujourd'hui (hors pré-test) : « Heute » ne les pose plus. */
  ecartes: ReadonlySet<string>;
}

export function rebellesDuCours(
  cours: CoursPrepare,
  evenements: readonly Evenement[],
  aujourdhui: string,
): RebellesDuCours {
  const fautes = fautesDuJournal(evenements);
  const rebelles = unitesRebelles(posablesDuCours(cours), fautes, seuilDesRebelles(cours.cours));
  const repondues = reponduesLe(evenements, aujourdhui);
  return { fautes, rebelles, ecartes: new Set([...rebelles].filter((id) => repondues.has(id))) };
}
