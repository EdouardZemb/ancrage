import { expect, it } from 'vitest';
import { hasardScripte } from './hasard.fixture.js';
import { entier, hasardDeterministe, melanger, tirerPondere, uniquesPar } from './hasard.js';

/* Données factices, écrites à la main (invariant 7). */

it('entier_reste_dans_l_intervalle_demi_ouvert', () => {
  expect(entier(5, () => 0)).toBe(0);
  expect(entier(5, () => 0.4)).toBe(2);
  expect(entier(5, () => 0.999999)).toBe(4);
  expect(entier(1, () => 0.7)).toBe(0);
});

it('melanger_est_le_melange_de_fisher_yates_du_prototype', () => {
  // Avec un hasard toujours nul, chaque étape échange le dernier élément restant avec le premier.
  expect(melanger(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a']);
  // Avec un hasard presque 1, chaque élément reste à sa place (j = i).
  expect(melanger(['a', 'b', 'c', 'd'], () => 0.999)).toEqual(['a', 'b', 'c', 'd']);
  // Les étapes vont de la fin au début : i = 3, 2, 1, avec j = ⌊h × (i + 1)⌋.
  expect(melanger(['a', 'b', 'c', 'd'], hasardScripte([0.5, 0.5, 0.5]))).toEqual([
    'a',
    'd',
    'b',
    'c',
  ]);
});

it('melanger_rend_une_permutation_sans_toucher_a_l_entree', () => {
  const entree = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
  const hasard = hasardDeterministe(42);

  const sortie = melanger(entree, hasard);

  expect([...sortie].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(sortie).not.toBe(entree);
  expect(entree).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(melanger([], hasard)).toEqual([]);
  expect(melanger(['seul'], hasard)).toEqual(['seul']);
});

it('uniques_par_garde_le_premier_de_chaque_cle', () => {
  const x = (cle: string, rang: number) => ({ cle, rang });

  expect(uniquesPar([x('a', 1), x('b', 2), x('a', 3), x('c', 4), x('b', 5)], (e) => e.cle)).toEqual(
    [x('a', 1), x('b', 2), x('c', 4)],
  );
  expect(uniquesPar([], (e: string) => e)).toEqual([]);
});

it('tirer_pondere_repete_chaque_element_selon_son_poids', () => {
  const elements = ['a', 'b', 'c'];
  const poids = (x: string) => (x === 'b' ? 1 : 3);
  // La liste pondérée est a a a b c c c : sept cases.
  const sorties = Array.from({ length: 7 }, (_, k) =>
    tirerPondere(elements, poids, hasardScripte([(k + 0.5) / 7])),
  );

  expect(sorties).toEqual(['a', 'a', 'a', 'b', 'c', 'c', 'c']);
});

it('tirer_pondere_refuse_une_liste_vide', () => {
  expect(() =>
    tirerPondere(
      [],
      () => 1,
      () => 0.5,
    ),
  ).toThrow(RangeError);
  expect(() =>
    tirerPondere(
      ['a'],
      () => 0,
      () => 0.5,
    ),
  ).toThrow(RangeError);
});

it('hasard_deterministe_est_repetable_et_dans_zero_un', () => {
  const a = hasardDeterministe(7);
  const b = hasardDeterministe(7);
  const suiteA = Array.from({ length: 1000 }, () => a());
  const suiteB = Array.from({ length: 1000 }, () => b());

  expect(suiteA).toEqual(suiteB);
  expect(suiteA.every((v) => v >= 0 && v < 1)).toBe(true);
  expect(new Set(suiteA).size).toBeGreaterThan(990);
  expect(Array.from({ length: 5 }, hasardDeterministe(8))).not.toEqual(suiteA.slice(0, 5));
  // La moyenne d'un bon générateur est proche de 1/2.
  expect(suiteA.reduce((s, v) => s + v, 0) / suiteA.length).toBeGreaterThan(0.45);
  expect(suiteA.reduce((s, v) => s + v, 0) / suiteA.length).toBeLessThan(0.55);
});

it('hasard_deterministe_vaut_mulberry32', () => {
  // Valeurs de référence de mulberry32 pour la graine 1 : toute dérive ferait changer, sans le
  // dire, les séances que les tests tirent avec une graine.
  const hasard = hasardDeterministe(1);

  expect(Array.from({ length: 3 }, hasard)).toEqual(REFERENCE_MULBERRY32_GRAINE_1);
});

const REFERENCE_MULBERRY32_GRAINE_1 = [
  0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
];
