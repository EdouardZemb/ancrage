import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
import { expect, it } from 'vitest';
import { estDateIso, lireReglagesDeMemoire, poidsFsrsValides } from './reglages.js';

const POIDS = [...FSRS6_DEFAULT_WEIGHTS];

it('poids_par_defaut_valides', () => {
  expect(poidsFsrsValides(POIDS)).toBe(true);
});

it('poids_en_mauvais_nombre_refuses_sans_exception', () => {
  expect(poidsFsrsValides(POIDS.slice(0, 20))).toBe(false);
  expect(poidsFsrsValides([...POIDS, 1])).toBe(false);
  expect(poidsFsrsValides([])).toBe(false);
});

it('poids_hors_bornes_ou_non_numeriques_refuses_sans_exception', () => {
  expect(poidsFsrsValides(POIDS.map((p, i) => (i === 4 ? 99 : p)))).toBe(false);
  expect(poidsFsrsValides(POIDS.map((p, i) => (i === 0 ? 0 : p)))).toBe(false);
  expect(poidsFsrsValides(POIDS.map((p, i) => (i === 3 ? 'x' : p)))).toBe(false);
  expect(poidsFsrsValides(POIDS.map((p, i) => (i === 3 ? Number.NaN : p)))).toBe(false);
  expect(poidsFsrsValides(POIDS.map((p, i) => (i === 3 ? null : p)))).toBe(false);
  expect(poidsFsrsValides('poids')).toBe(false);
  expect(poidsFsrsValides(undefined)).toBe(false);
});

it('date_iso_qui_existe', () => {
  expect(estDateIso('2028-02-29')).toBe(true);
  expect(estDateIso('2027-02-29')).toBe(false);
  expect(estDateIso('2027-13-01')).toBe(false);
  expect(estDateIso('2027-1-01')).toBe(false);
  expect(estDateIso('x2027-01-01')).toBe(false);
  expect(estDateIso('2027-01-01x')).toBe(false);
  expect(estDateIso('')).toBe(false);
});

it('lecture_de_leitner_et_de_fsrs_comme_avant', () => {
  expect(lireReglagesDeMemoire({ algorithme: 'leitner', retention: 0.9 })).toEqual({
    algorithme: 'leitner',
    retention: 0.9,
  });
  expect(lireReglagesDeMemoire({ algorithme: 'fsrs', retention: 0.8 })).toEqual({
    algorithme: 'fsrs',
    retention: 0.8,
  });
  expect(lireReglagesDeMemoire({ algorithme: 'fsrs', retention: 0.95 })?.retention).toBe(0.95);
});

it('lecture_ignore_ce_qui_est_inconnu_sans_lever', () => {
  for (const lu of [
    { algorithme: 'sm2', retention: 0.9 },
    { algorithme: 'fsrs', retention: 0.79 },
    { algorithme: 'fsrs', retention: 0.96 },
    { algorithme: 'fsrs' },
    'fsrs',
    null,
    undefined,
    42,
    [],
  ]) {
    expect(lireReglagesDeMemoire(lu), JSON.stringify(lu)).toBeUndefined();
  }
});

it('lecture_des_trois_cles_nouvelles', () => {
  expect(
    lireReglagesDeMemoire({
      algorithme: 'par-chapitre',
      retention: 0.9,
      parametres: POIDS,
      examen: '2027-06-30',
      chapitres: ['abcd2345'],
    }),
  ).toEqual({
    algorithme: 'par-chapitre',
    retention: 0.9,
    parametres: POIDS,
    examen: '2027-06-30',
    chapitres: ['abcd2345'],
  });
  expect(
    lireReglagesDeMemoire({ algorithme: 'fsrs', retention: 0.9, examen: '2027-06-30' }),
  ).toEqual({ algorithme: 'fsrs', retention: 0.9, examen: '2027-06-30' });
});

it('lecture_sans_les_cles_nouvelles_ne_les_ajoute_pas', () => {
  const lu = lireReglagesDeMemoire({ algorithme: 'fsrs', retention: 0.9 });
  expect(lu).not.toHaveProperty('parametres');
  expect(lu).not.toHaveProperty('examen');
  expect(lu).not.toHaveProperty('chapitres');
});

it('lecture_ignore_un_reglage_aux_cles_nouvelles_invalides', () => {
  const base = { algorithme: 'fsrs', retention: 0.9 };
  for (const en_plus of [
    { parametres: POIDS.slice(0, 20) },
    { parametres: 'x' },
    { examen: '2027-02-30' },
    { examen: 20270630 },
    { chapitres: 'abcd2345' },
    { chapitres: [3] },
  ]) {
    expect(lireReglagesDeMemoire({ ...base, ...en_plus }), JSON.stringify(en_plus)).toBeUndefined();
  }
});

it('par_chapitre_sans_chapitres_ou_avec_une_liste_vide_est_ignore', () => {
  const base = { algorithme: 'par-chapitre', retention: 0.9 };
  expect(lireReglagesDeMemoire(base)).toBeUndefined();
  expect(lireReglagesDeMemoire({ ...base, chapitres: [] })).toBeUndefined();
  expect(lireReglagesDeMemoire({ ...base, chapitres: ['abcd2345'] })).toEqual({
    ...base,
    chapitres: ['abcd2345'],
  });
});
