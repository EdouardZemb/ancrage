import { expect, it } from 'vitest';
import { examenRemisDeTest, pretestDeTest, reponseDeTest } from '../evenements.fixture.js';
import { estRebelle, etatDeRebelle, fautesDuJournal, SUCCES_DE_SORTIE } from './rebelles.js';

const O = true;
const X = false;

/** Un jour par réponse, à partir du 1er mars. */
const unParJour = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);

function etat(justes: boolean[], jours: string[] = unParJour(justes.length)) {
  return etatDeRebelle(jours, justes);
}

it('trois_succes_de_sortie', () => {
  expect(SUCCES_DE_SORTIE).toBe(3);
});

it('des_fautes_avant_tout_succes_ne_comptent_pas', () => {
  expect(etat([X, X, X, X])).toEqual({ fautes: 0, suite: 0 });
  expect(etat([X, X, O, X])).toEqual({ fautes: 1, suite: 0 });
});

it('trois_fautes_de_trois_jours_apres_un_succes_font_un_rebelle', () => {
  const trois = etat([O, X, X, X]);
  expect(trois).toEqual({ fautes: 3, suite: 0 });
  expect(estRebelle(trois, 3)).toBe(true);
  const deux = etat([O, X, X]);
  expect(deux.fautes).toBe(2);
  expect(estRebelle(deux, 3)).toBe(false);
});

it('deux_fautes_le_meme_jour_comptent_pour_une_et_coupent_la_suite', () => {
  const jours = ['2026-03-01', '2026-03-02', '2026-03-02'];
  expect(etat([O, X, X], jours)).toEqual({ fautes: 1, suite: 0 });
  // la seconde faute remet la suite à 0 même sans compter
  expect(etat([O, X, O, X], ['2026-03-01', '2026-03-02', '2026-03-02', '2026-03-02'])).toEqual({
    fautes: 1,
    suite: 0,
  });
});

it('rebelle_puis_deux_succes_reste_rebelle_un_troisieme_le_sort', () => {
  const base = [O, X, X, X];
  const deux = etat([...base, O, O]);
  expect(deux).toEqual({ fautes: 3, suite: 2 });
  expect(estRebelle(deux, 3)).toBe(true);
  const trois = etat([...base, O, O, O]);
  expect(trois).toEqual({ fautes: 0, suite: 3 });
  expect(estRebelle(trois, 3)).toBe(false);
});

it('une_faute_coupe_la_suite_de_succes', () => {
  const e = etat([O, X, X, X, O, O, X, O, O]);
  expect(e.fautes).toBe(4);
  expect(estRebelle(e, 3)).toBe(true);
});

it('sorti_puis_deux_fautes_pas_rebelle_une_troisieme_si', () => {
  const sorti = [O, X, X, X, O, O, O];
  const deux = etat([...sorti, X, X]);
  expect(deux.fautes).toBe(2);
  expect(estRebelle(deux, 3)).toBe(false);
  expect(estRebelle(etat([...sorti, X, X, X]), 3)).toBe(true);
});

it('trois_succes_effacent_les_fautes_d_une_unite_qui_n_est_pas_rebelle', () => {
  const e = etat([O, X, X, O, O, O, X]);
  expect(e.fautes).toBe(1);
  expect(estRebelle(e, 2)).toBe(false);
  expect(estRebelle(e, 3)).toBe(false);
});

it('le_meme_jour_succes_puis_faute_compte_faute_puis_succes_non', () => {
  const jour = '2026-03-01';
  expect(etat([O, X], [jour, jour]).fautes).toBe(1);
  expect(etat([X, O], [jour, jour]).fautes).toBe(0);
});

it('le_jour_compte_ne_s_oublie_pas_a_la_remise_a_zero', () => {
  const jour = '2026-03-01';
  expect(etat([O, X, O, O, O, X], [jour, jour, jour, jour, jour, jour]).fautes).toBe(0);
  const lendemain = [jour, jour, jour, jour, jour, '2026-03-02'];
  expect(etat([O, X, O, O, O, X], lendemain).fautes).toBe(1);
});

it('estRebelle_au_seuil_et_pas_dessous', () => {
  expect(estRebelle(undefined, 2)).toBe(false);
  expect(estRebelle({ fautes: 3, suite: 0 }, 3)).toBe(true);
  expect(estRebelle({ fautes: 4, suite: 1 }, 3)).toBe(true);
  expect(estRebelle({ fautes: 2, suite: 0 }, 3)).toBe(false);
});

it('un_jour_local_qui_recule_ne_fait_pas_deux_fautes', () => {
  // Même instant ordonné : le 06 à +14:00 (05 à 10 h UTC), puis le 05 à -05:00 (06 à 04 h UTC).
  const journal = [
    reponseDeTest(1, 'u1', true, '2026-03-01T12:00:00.000+01:00'),
    reponseDeTest(2, 'u1', false, '2026-03-06T00:30:00.000+14:00'),
    reponseDeTest(3, 'u1', false, '2026-03-05T23:00:00.000-05:00'),
  ];
  expect(fautesDuJournal(journal).get('u1')).toEqual({ fautes: 1, suite: 0 });
});

it('un_pretest_faux_et_un_doublon_ne_comptent_pas', () => {
  const premiere = reponseDeTest(1, 'u1', true, '2026-03-01T12:00:00.000+01:00');
  const journal = [
    premiere,
    pretestDeTest(2, 'u1', false, '2026-03-02T12:00:00.000+01:00'),
    reponseDeTest(3, 'u1', false, '2026-03-03T12:00:00.000+01:00'),
    reponseDeTest(3, 'u1', false, '2026-03-03T12:00:00.000+01:00'),
  ];
  expect(fautesDuJournal(journal).get('u1')).toEqual({ fautes: 1, suite: 0 });
});

it('une_carte_et_son_sens_inverse_sont_jugees_a_part', () => {
  const journal = [
    reponseDeTest(1, 'u1', true, '2026-03-01T12:00:00.000+01:00'),
    reponseDeTest(2, 'u1~r', true, '2026-03-01T12:01:00.000+01:00'),
    reponseDeTest(3, 'u1', false, '2026-03-02T12:00:00.000+01:00'),
    examenRemisDeTest('cm5r8t23', 4, '2026-03-02T13:00:00.000+01:00'),
  ];
  const etats = fautesDuJournal(journal);
  expect(etats.get('u1')).toEqual({ fautes: 1, suite: 0 });
  expect(etats.get('u1~r')).toEqual({ fautes: 0, suite: 1 });
  expect([...etats.keys()]).toEqual(['u1', 'u1~r']);
});
