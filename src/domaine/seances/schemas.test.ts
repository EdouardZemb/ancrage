import { expect, it } from 'vitest';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { poidsObserves } from '../hasard.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { EtatUnite } from '../progression/etat.js';
import { tacheDeSchema } from './schemas.js';

/* Données factices, écrites à la main (invariant 7). */

const [schema] = preparerCours(coursServiDeTest()).schemas;
if (schema === undefined) throw new Error('la fixture a un schéma');

const etat = (justes: number, fausses: number): EtatUnite => ({
  boite: 1,
  echeance: '2026-10-17',
  justes,
  fausses,
});

it('tache_de_schema_quatre_options_distinctes', () => {
  for (let graine = 1; graine <= 100; graine++) {
    const tache = tacheDeSchema(schema, new Map(), hasardDeterministe(graine));

    expect(tache.options).toHaveLength(4);
    expect(new Set(tache.options).size).toBe(4);
    expect(tache.options).toContain(tache.cible);
    expect(tache.options.filter((j) => j === tache.cible)).toHaveLength(1);
    // Des indices de points du schéma.
    expect(Number.isInteger(tache.cible)).toBe(true);
    expect(tache.options.every((j) => Number.isInteger(j) && j >= 0 && j < 5)).toBe(true);
  }
});

it('tache_de_schema_ponderee_par_les_reponses_justes', () => {
  const etats = new Map<string, EtatUnite>([
    // Plus de justes que de fausses : poids 1. Autant : poids 3. Neuf : poids 3.
    ['q0000001', etat(2, 1)],
    ['q0000002', etat(1, 1)],
    ['q0000004', etat(5, 0)],
  ]);

  // Les points pèsent 1 3 3 1 3 : onze cases.
  const poids = poidsObserves(
    11,
    (hasard) => tacheDeSchema(schema, etats, hasard),
    (t) => String(t.cible),
  );

  expect(Object.fromEntries(poids)).toEqual({ '0': 1, '1': 3, '2': 3, '3': 1, '4': 3 });
});

it('tache_de_schema_tire_les_trois_autres_options_au_hasard', () => {
  const vues = new Set<number>();
  for (let graine = 1; graine <= 200; graine++) {
    const tache = tacheDeSchema(schema, new Map(), hasardDeterministe(graine));
    if (tache.cible === 0) for (const j of tache.options) vues.add(j);
  }

  // Quand la cible est le point 0, les trois autres options couvrent les quatre autres points.
  expect([...vues].sort()).toEqual([0, 1, 2, 3, 4]);
});

it('tache_de_schema_avec_moins_de_quatre_points_rend_tous_les_points', () => {
  const petit = { ...schema, points: schema.points.slice(0, 3) };

  const tache = tacheDeSchema(petit, new Map(), hasardDeterministe(1));

  expect([...tache.options].sort()).toEqual([0, 1, 2]);
});

it('tache_de_schema_sans_point_leve_une_erreur_claire', () => {
  expect(() => tacheDeSchema({ ...schema, points: [] }, new Map(), hasardDeterministe(1))).toThrow(
    RangeError,
  );
});
