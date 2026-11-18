import type { Evenement } from '../journal/evenement.js';
import { revuesDuJournal } from './fsrs.js';

/*
 * Les éléments rebelles (lot M6) : une unité qui retombe dans la faute après avoir été sue. Tout se
 * dérive du journal, rien n'est gardé (invariant 5), et le seuil n'entre pas dans le rejeu : le
 * rejeu tient deux nombres, et le seuil se compare ensuite (`estRebelle`).
 */

/** Le nombre de réponses justes de suite qui remettent les fautes d'une unité à zéro (T1-D5). */
export const SUCCES_DE_SORTIE = 3;

export interface EtatDeRebelle {
  /** Les fautes comptées depuis la dernière sortie. */
  fautes: number;
  /** Les réponses justes de suite, depuis la dernière faute. */
  suite: number;
}

/**
 * Rejoue les verdicts d'une unité (T1-D3). Une faute ne compte qu'après une première réponse
 * juste, et une fois par jour (T1-D4). Trois justes de suite remettent les fautes à zéro (T1-D5) ;
 * le jour de la dernière faute comptée, lui, ne s'oublie pas.
 */
export function etatDeRebelle(jours: readonly string[], justes: readonly boolean[]): EtatDeRebelle {
  let fautes = 0;
  let suite = 0;
  let dejaJuste = false;
  let jourDeFaute: string | undefined;
  justes.forEach((juste, rang) => {
    if (juste) {
      dejaJuste = true;
      suite += 1;
      if (suite >= SUCCES_DE_SORTIE) fautes = 0;
      return;
    }
    suite = 0;
    if (dejaJuste && jourDeFaute !== jours[rang]) {
      fautes += 1;
      jourDeFaute = jours[rang];
    }
  });
  return { fautes, suite };
}

/** Une entrée par unité qui a au moins une réponse ; le seuil n'entre pas dans le rejeu. */
export function fautesDuJournal(
  evenements: readonly Evenement[],
): ReadonlyMap<string, EtatDeRebelle> {
  return new Map(
    revuesDuJournal(evenements).map(({ unite, jours, justes }) => [
      unite,
      etatDeRebelle(jours, justes),
    ]),
  );
}

/** Vrai quand l'unité a au moins `seuil` fautes ; une unité sans réponse n'est pas rebelle. */
export function estRebelle(etat: EtatDeRebelle | undefined, seuil: number): boolean {
  return etat !== undefined && etat.fautes >= seuil;
}
