import type { UniteDeCarte } from '../cartes/unites.js';
import type { CoursPrepare } from '../cours/prepare.js';
import { type Hasard, melanger } from '../hasard.js';
import { type EtatUnite, estDue, etatDe } from '../progression/etat.js';

/*
 * Les séances de cartes (Karteikarten), reprises du prototype (H:1625, H:1742-1818) sans changer
 * leur comportement : une file d'unités, les dues d'abord, puis des neuves. Les fonctions ne
 * touchent ni aux unités ni à leurs `reponses`, que les unités d'une carte se partagent.
 */

export type SensChoisi = 'mix' | 'direct' | 'inverse';

export interface SeanceCartes {
  /** Les unités à poser, la prochaine en tête. */
  file: UniteDeCarte[];
  faites: number;
  justes: number;
  /** Les erreurs d'un examen, révisées en cartes (le prototype disait `custom`). */
  deLExamen: boolean;
}

/**
 * `itemsIn` : les unités d'un chapitre (l'identifiant de son module de cartes, ou `'tous'`) dans un
 * sens (`'mix'` : les deux), dans l'ordre du cours. Un chapitre inconnu n'a aucune unité.
 */
export function unitesDuChoix(
  cours: CoursPrepare,
  chapitre: string | 'tous',
  sens: SensChoisi,
): UniteDeCarte[] {
  return cours.unites.filter(
    (unite) =>
      (chapitre === 'tous' || unite.module === chapitre) && (sens === 'mix' || unite.sens === sens),
  );
}

/**
 * `buildSession` : les unités dues, mélangées, puis `nouvelles` unités neuves tirées au hasard.
 * Une unité répondue mais pas encore due n'y est pas. `etats` peut citer des unités que le cours
 * n'a plus : elles ne sont pas dans `pool`, donc ignorées.
 */
export function construireSeance(
  pool: readonly UniteDeCarte[],
  etats: ReadonlyMap<string, EtatUnite>,
  aujourdhui: string,
  nouvelles: number,
  hasard: Hasard,
): SeanceCartes {
  const dues = melanger(
    pool.filter((unite) => estDue(etatDe(etats, unite.id), aujourdhui)),
    hasard,
  );
  const neuves = melanger(
    pool.filter((unite) => etatDe(etats, unite.id).boite === 0),
    hasard,
  ).slice(0, nouvelles);
  return { file: [...dues, ...neuves], faites: 0, justes: 0, deLExamen: false };
}

/**
 * « Weitere neue Karten » : `nouvelles` unités neuves, mélangées ; s'il n'y en a plus, `nouvelles`
 * unités de tout le pool, neuves ou non.
 */
export function seanceDeNouvelles(
  pool: readonly UniteDeCarte[],
  etats: ReadonlyMap<string, EtatUnite>,
  nouvelles: number,
  hasard: Hasard,
): SeanceCartes {
  let file = melanger(
    pool.filter((unite) => etatDe(etats, unite.id).boite === 0),
    hasard,
  ).slice(0, nouvelles);
  if (file.length === 0) file = melanger(pool, hasard).slice(0, nouvelles);
  return { file, faites: 0, justes: 0, deLExamen: false };
}

/**
 * `answer` : la séance après une réponse à l'unité de tête. Une réponse juste la retire de la
 * file ; une réponse fausse la remet en fin de file. Une file vide ne change pas.
 */
export function apresReponse(seance: SeanceCartes, juste: boolean): SeanceCartes {
  if (seance.file.length === 0) return seance;
  const [posee, ...reste] = seance.file;
  return {
    file: juste ? reste : [...reste, posee],
    faites: seance.faites + 1,
    justes: seance.justes + (juste ? 1 : 0),
    deLExamen: seance.deLExamen,
  };
}
