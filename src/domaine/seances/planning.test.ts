import { expect, it } from 'vitest';
import type { EtapeDePlanning, Planning } from '../contenu/modele.js';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import type { CoursServi } from '../cours/servi.js';
import { examenRemisDeTest, reponseDeTest } from '../evenements.fixture.js';
import {
  departDuPlanning,
  joursAvantExamen,
  lirePlanning,
  modulesFermes,
  ouvertureDe,
  planningDuCours,
} from './planning.js';

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

it('planning_lu_tel_que_le_serveur_l_envoie_genre_ecrit_en_toutes_lettres', () => {
  const servi = {
    etapes: [
      { titre: 'Woche 1', semaine: 1, genre: 'cours', modules: ['aaaaaaaa'] },
      { titre: 'Woche 2', semaine: 2, genre: 'revision', modules: [] },
    ],
  };
  expect(lirePlanning(servi)).toStrictEqual(servi);
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
    {
      etapes: [ETAPE_RELATIVE, { titre: 'Woche 2', semaine: 2, seance: '2030-03-05', modules: [] }],
    },
    { etapes: [ETAPE_RELATIVE, { titre: 'Woche 2', modules: [] }] },
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

/* Le départ, l'ouverture des étapes et le compte à rebours (A1-D4 à A1-D8). */

const AUJOURDHUI = '2030-03-10';
const reponduLe = (n: number, instant: string) => reponseDeTest(n, 'c1000001', true, instant);

it('depart_sans_evenement_vaut_aujourdhui', () => {
  expect(departDuPlanning([], AUJOURDHUI)).toBe(AUJOURDHUI);
});

it('depart_est_le_jour_du_premier_evenement_du_journal', () => {
  const premier = reponduLe(1, '2030-03-04T10:00:00.000+02:00');
  const second = reponduLe(2, '2030-03-06T10:00:00.000+02:00');
  expect(departDuPlanning([premier], AUJOURDHUI)).toBe('2030-03-04');
  expect(departDuPlanning([second, premier], AUJOURDHUI)).toBe('2030-03-04');
  expect(departDuPlanning([reponduLe(3, `${AUJOURDHUI}T09:00:00.000+02:00`)], AUJOURDHUI)).toBe(
    AUJOURDHUI,
  );
});

it('depart_d_un_doublon_est_celui_de_la_premiere_copie', () => {
  const premiere = reponduLe(1, '2030-03-06T10:00:00.000+02:00');
  const seconde = { ...premiere, repondu_a: '2030-03-04T10:00:00.000+02:00' };
  const autre = reponduLe(2, '2030-03-08T10:00:00.000+02:00');
  expect(departDuPlanning([premiere, seconde, autre], AUJOURDHUI)).toBe('2030-03-06');
});

it('depart_compte_un_evenement_de_tout_genre', () => {
  const examen = examenRemisDeTest('cm5r8t23', 1, '2030-03-02T08:00:00.000+01:00');
  const reponse = reponduLe(2, '2030-03-04T10:00:00.000+02:00');
  expect(departDuPlanning([reponse, examen], AUJOURDHUI)).toBe('2030-03-02');
});

it('depart_suit_l_ordre_du_journal_et_non_le_plus_petit_jour_local', () => {
  // A est plus tôt en UTC (22:30 la veille) mais son jour local est le 05 ; B, plus tard, est le 04.
  const a = reponduLe(1, '2030-03-05T00:30:00.000+02:00');
  const b = reponduLe(2, '2030-03-04T23:00:00.000-05:00');
  expect(departDuPlanning([b, a], AUJOURDHUI)).toBe('2030-03-05');
});

it('depart_n_est_jamais_apres_aujourdhui', () => {
  const demain = reponduLe(1, '2030-03-11T00:10:00.000+02:00');
  expect(departDuPlanning([demain], AUJOURDHUI)).toBe(AUJOURDHUI);
});

const DEPART = '2030-03-04';

it('ouverture_d_une_etape_datee_et_d_une_etape_relative', () => {
  const datee: EtapeDePlanning = { titre: 'a', seance: '2030-05-01', genre: 'cours', modules: [] };
  expect(ouvertureDe(datee, DEPART)).toBe('2030-05-01');
  const cas: [number, string][] = [
    [1, '2030-03-04'],
    [2, '2030-03-11'],
    [3, '2030-03-18'],
  ];
  for (const [semaine, jour] of cas) {
    const relative: EtapeDePlanning = { titre: 'a', semaine, genre: 'cours', modules: [] };
    expect(ouvertureDe(relative, DEPART), `semaine ${semaine}`).toBe(jour);
  }
});

it('une_etape_sans_seance_ni_semaine_s_ouvre_au_depart', () => {
  const sans = { titre: 'a', genre: 'cours', modules: [] } satisfies EtapeDePlanning;
  expect(ouvertureDe(sans, DEPART)).toBe(DEPART);
});

const PLANNING_DATE: Planning = {
  etapes: [
    { titre: 'a', seance: '2030-03-04', genre: 'cours', modules: ['m1'] },
    { titre: 'b', seance: '2030-03-11', genre: 'cours', modules: ['m2', 'm3'] },
    { titre: 'c', seance: '2030-03-18', genre: 'revision', modules: ['m4'] },
  ],
};
const PLANNING_RELATIF: Planning = {
  etapes: [
    { titre: 'a', semaine: 1, genre: 'cours', modules: ['m1'] },
    { titre: 'b', semaine: 2, genre: 'cours', modules: ['m2', 'm3'] },
    { titre: 'c', semaine: 3, genre: 'revision', modules: ['m4'] },
  ],
};

it('modules_fermes_d_un_planning_date_la_veille_le_jour_et_le_lendemain', () => {
  const cas: [string, string[]][] = [
    ['2030-03-03', ['m1', 'm2', 'm3', 'm4']],
    ['2030-03-04', ['m2', 'm3', 'm4']],
    ['2030-03-10', ['m2', 'm3', 'm4']],
    ['2030-03-11', ['m4']],
    ['2030-03-12', ['m4']],
    ['2030-03-17', ['m4']],
    ['2030-03-18', []],
    ['2030-03-19', []],
  ];
  for (const [jour, fermes] of cas) {
    expect([...modulesFermes(PLANNING_DATE, DEPART, jour)].sort(), jour).toEqual(fermes);
  }
});

it('modules_fermes_d_un_planning_relatif_suivent_le_depart', () => {
  const cas: [string, string[]][] = [
    [DEPART, ['m2', 'm3', 'm4']],
    ['2030-03-10', ['m2', 'm3', 'm4']],
    ['2030-03-11', ['m4']],
    ['2030-03-17', ['m4']],
    ['2030-03-18', []],
  ];
  for (const [jour, fermes] of cas) {
    expect([...modulesFermes(PLANNING_RELATIF, DEPART, jour)].sort(), jour).toEqual(fermes);
  }
});

it('un_module_cite_par_une_etape_ouverte_et_une_fermee_est_ouvert', () => {
  const planning: Planning = {
    etapes: [
      { titre: 'a', semaine: 1, genre: 'cours', modules: ['m1'] },
      { titre: 'b', semaine: 2, genre: 'revision', modules: ['m1', 'm2'] },
    ],
  };
  expect([...modulesFermes(planning, DEPART, DEPART)]).toEqual(['m2']);
});

it('un_planning_sans_module_n_a_rien_de_ferme', () => {
  const planning: Planning = {
    etapes: [{ titre: 'a', semaine: 1, genre: 'revision', modules: [] }],
  };
  expect(modulesFermes(planning, DEPART, DEPART).size).toBe(0);
});

it('jours_avant_examen_compte_jusqu_au_jour_de_l_examen', () => {
  const cas: [string | undefined, number | undefined][] = [
    [undefined, undefined],
    ['2030-03-20', 10],
    ['2030-03-11', 1],
    [AUJOURDHUI, 0],
    ['2030-03-09', undefined],
  ];
  for (const [examen, attendu] of cas) {
    expect(joursAvantExamen(examen, AUJOURDHUI), String(examen)).toBe(attendu);
  }
});
