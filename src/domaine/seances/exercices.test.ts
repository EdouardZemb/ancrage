import { expect, it } from 'vitest';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { hasardScripte, poidsObserves } from '../hasard.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { EtatUnite } from '../progression/etat.js';
import { choisirExercice } from './exercices.js';

/* Données factices, écrites à la main (invariant 7). */

const exercices = preparerCours(coursServiDeTest()).exercices;
if (exercices === undefined) throw new Error('la fixture a des exercices');

const etat = (justes: number, fausses: number): EtatUnite => ({
  boite: 1,
  echeance: '2026-10-17',
  justes,
  fausses,
});

it('exercice_en_melange_pondere_par_les_reponses_justes', () => {
  const etats = new Map<string, EtatUnite>([
    // Plus de justes que de fausses : poids 1. Autant : poids 3. Neuf : poids 3.
    ['e1000001', etat(3, 0)],
    ['e1000002', etat(1, 1)],
    ['e2000001', etat(2, 1)],
  ]);

  // Les cinq exercices pèsent 1 3 3 1 3 : onze cases, toutes familles confondues.
  const poids = poidsObserves(
    11,
    (hasard) => choisirExercice(exercices, etats, 'mix', hasard),
    (t) => t.exercice.id,
  );

  expect(Object.fromEntries(poids)).toEqual({
    e1000001: 1,
    e1000002: 3,
    e1000003: 3,
    e2000001: 1,
    e2000002: 3,
  });
});

it('exercice_en_melange_rend_la_famille_de_l_exercice', () => {
  for (let k = 0; k < 11; k++) {
    const { famille, exercice } = choisirExercice(
      exercices,
      new Map(),
      'mix',
      hasardScripte([(k + 0.5) / 11]),
    );

    expect(famille.exercices).toContain(exercice);
    expect(famille.code).toBe(exercice.id.startsWith('e1') ? 'artikel' : 'plural');
  }
});

it('exercice_d_une_famille_est_tire_au_hasard_dans_la_famille', () => {
  // Comme le prototype (H:1675-1682), la pondération ne sert qu'au mélange : dans une famille
  // choisie, chaque exercice a la même chance, quel que soit son état.
  const etats = new Map<string, EtatUnite>([['e1000001', etat(9, 0)]]);

  const poids = poidsObserves(
    3,
    (hasard) => choisirExercice(exercices, etats, 'artikel', hasard),
    (t) => t.exercice.id,
  );

  expect(Object.fromEntries(poids)).toEqual({ e1000001: 1, e1000002: 1, e1000003: 1 });
  for (const graine of [1, 2, 3, 4, 5, 6]) {
    const { famille } = choisirExercice(exercices, etats, 'plural', hasardDeterministe(graine));
    expect(famille.code).toBe('plural');
  }
});

it('exercice_d_une_famille_inconnue_se_tire_en_melange', () => {
  // Une préférence enregistrée peut citer une famille que le cours n'a plus.
  const { exercice } = choisirExercice(exercices, new Map(), 'disparue', hasardScripte([0.99]));

  expect(exercice.id).toBe('e2000002');
});

it('exercice_sans_exercice_leve_une_erreur_claire', () => {
  const vide = { ...exercices, familles: [{ code: 'artikel', libelle: 'Artikel', exercices: [] }] };

  expect(() => choisirExercice(vide, new Map(), 'mix', hasardDeterministe(1))).toThrow(RangeError);
  expect(() => choisirExercice(vide, new Map(), 'artikel', hasardDeterministe(1))).toThrow(
    RangeError,
  );
  expect(() =>
    choisirExercice({ ...exercices, familles: [] }, new Map(), 'mix', hasardDeterministe(1)),
  ).toThrow(RangeError);
});
