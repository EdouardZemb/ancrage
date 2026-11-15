import { expect, it } from 'vitest';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import type { CoursServi } from '../cours/servi.js';
import { lirePlanning, planningDuCours } from './planning.js';

/* Données factices, écrites à la main (invariant 7). */

const ETAPE_DATEE = { titre: 'Woche 1', seance: '2030-03-04', modules: ['aaaaaaaa'] };
const ETAPE_RELATIVE = { titre: 'Woche 1', semaine: 1, modules: ['aaaaaaaa'] };

/** Un planning d'une étape, dont `changement` remplace des champs. */
function unPlanning(
  changement: Record<string, unknown> = {},
  base: Record<string, unknown> = ETAPE_RELATIVE,
) {
  return { etapes: [{ ...base, ...changement }] };
}

it('planning_valide_lu_avec_le_genre_cours_par_defaut', () => {
  expect(lirePlanning(unPlanning())).toStrictEqual({
    etapes: [{ titre: 'Woche 1', semaine: 1, genre: 'cours', modules: ['aaaaaaaa'] }],
  });
  expect(lirePlanning(unPlanning({}, ETAPE_DATEE))).toStrictEqual({
    etapes: [{ titre: 'Woche 1', seance: '2030-03-04', genre: 'cours', modules: ['aaaaaaaa'] }],
  });
  expect(lirePlanning(unPlanning({ genre: 'revision', modules: [] }))?.etapes[0]).toStrictEqual({
    titre: 'Woche 1',
    semaine: 1,
    genre: 'revision',
    modules: [],
  });
});

it('planning_lu_borne_a_520_semaines_et_a_plusieurs_etapes', () => {
  const lu = lirePlanning({
    etapes: [ETAPE_RELATIVE, { titre: 'Woche 520', semaine: 520, modules: [] }],
  });
  expect(lu?.etapes.map((e) => e.semaine)).toEqual([1, 520]);
});

it('planning_lu_retire_une_cle_inconnue_sans_bruit', () => {
  const lu = lirePlanning({
    ...unPlanning({ couleur: 'rot' }),
    notes: 'inventé',
  });
  expect(lu).toStrictEqual({
    etapes: [{ titre: 'Woche 1', semaine: 1, genre: 'cours', modules: ['aaaaaaaa'] }],
  });
});

it('planning_illisible_vaut_undefined_et_ne_leve_jamais', () => {
  const cas: unknown[] = [
    undefined,
    null,
    42,
    'planning',
    [],
    {},
    { etapes: [] },
    { etapes: 'Woche 1' },
    { etapes: [null] },
    unPlanning({ titre: undefined }),
    unPlanning({ titre: 7 }),
    unPlanning({ semaine: undefined }),
    unPlanning({ semaine: 1, seance: '2030-03-04' }),
    unPlanning({ seance: '2030-3-4', semaine: undefined }),
    unPlanning({ seance: '2030-02-30', semaine: undefined }),
    unPlanning({ genre: 'repetition' }),
    unPlanning({ modules: undefined }),
    unPlanning({ modules: 'aaaaaaaa' }),
    unPlanning({ modules: [3] }),
    unPlanning({ semaine: 0 }),
    unPlanning({ semaine: -1 }),
    unPlanning({ semaine: 1.5 }),
    unPlanning({ semaine: '2' }),
    unPlanning({ semaine: 521 }),
    { etapes: [ETAPE_DATEE, { titre: 'Woche 2', semaine: 2, modules: [] }] },
    { etapes: [ETAPE_RELATIVE, { titre: 'Tag 2', seance: '2030-03-05', modules: [] }] },
  ];
  for (const lu of cas) {
    expect(() => lirePlanning(lu), JSON.stringify(lu)).not.toThrow();
    expect(lirePlanning(lu), JSON.stringify(lu)).toBeUndefined();
  }
});

it('planning_du_cours_lit_le_champ_servi', () => {
  const cours = coursServiDeTest();
  expect(planningDuCours(cours)).toBeUndefined();
  const avec = { ...cours, planning: unPlanning() } as CoursServi;
  expect(planningDuCours(avec)?.etapes).toHaveLength(1);
  expect(planningDuCours({ ...cours, planning: 42 } as CoursServi)).toBeUndefined();
});
