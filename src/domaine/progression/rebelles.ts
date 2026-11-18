import type { Evenement } from '../journal/evenement.js';
import { jourDe } from '../journal/temps.js';
import { journalDesRevisions } from './etat.js';
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
export function estRebelle(etat: EtatDeRebelle | undefined, seuil: number): etat is EtatDeRebelle {
  return etat !== undefined && etat.fautes >= seuil;
}

/** Les posables rebelles au seuil donné : jamais une unité qui n'est pas un posable (T2-D2). */
export function unitesRebelles(
  posables: readonly { id: string }[],
  fautes: ReadonlyMap<string, EtatDeRebelle>,
  seuil: number,
): ReadonlySet<string> {
  return new Set(posables.filter((p) => estRebelle(fautes.get(p.id), seuil)).map((p) => p.id));
}

/** Les unités qui ont une réponse le `jour` (local), hors pré-test et sans doublon (T2-D3). */
export function reponduesLe(evenements: readonly Evenement[], jour: string): ReadonlySet<string> {
  const unites = new Set<string>();
  for (const evenement of journalDesRevisions(evenements)) {
    if (evenement.type === 'reponse' && jourDe(evenement.repondu_a) === jour) {
      unites.add(evenement.unite);
    }
  }
  return unites;
}

export interface GroupeAReprendre<P> {
  module: string;
  elements: { posable: P; fautes: number }[];
}

/**
 * La liste « à reprendre » (T2-D9) : les rebelles par module, dans l'ordre de `ordre` (les modules
 * qui n'y sont pas, à la suite dans l'ordre des posables), puis par fautes décroissantes ; à égalité,
 * l'ordre du cours. Un module sans rebelle est absent.
 */
export function aReprendre<P extends { id: string }>(
  posables: readonly P[],
  modules: ReadonlyMap<string, string>,
  ordre: readonly string[],
  fautes: ReadonlyMap<string, EtatDeRebelle>,
  seuil: number,
): GroupeAReprendre<P>[] {
  const parModule = new Map<string, { posable: P; fautes: number }[]>();
  for (const posable of posables) {
    const etat = fautes.get(posable.id);
    const module = modules.get(posable.id);
    if (module === undefined || !estRebelle(etat, seuil)) continue;
    const groupe = parModule.get(module) ?? [];
    groupe.push({ posable, fautes: etat.fautes });
    parModule.set(module, groupe);
  }
  const rang = (module: string): number => {
    const i = ordre.indexOf(module);
    return i === -1 ? ordre.length : i;
  };
  // Le tri de `Array` est stable : à rang ou fautes égaux, l'ordre d'insertion (celui du cours) reste.
  return [...parModule.entries()]
    .sort(([a], [b]) => rang(a) - rang(b))
    .map(([module, elements]) => ({
      module,
      elements: [...elements].sort((x, y) => y.fautes - x.fautes),
    }));
}
