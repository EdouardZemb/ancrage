import { expect, it } from 'vitest';
import { examenRemisDeTest, pretestDeTest, reponseDeTest } from '../evenements.fixture.js';
import {
  aReprendre,
  estRebelle,
  etatDeRebelle,
  fautesDuJournal,
  reponduesLe,
  SUCCES_DE_SORTIE,
  unitesRebelles,
} from './rebelles.js';

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

it('un_pretest_faux_ne_compte_pas', () => {
  const journal = [
    reponseDeTest(1, 'u1', true, '2026-03-01T12:00:00.000+01:00'),
    pretestDeTest(2, 'u1', false, '2026-03-02T12:00:00.000+01:00'),
    reponseDeTest(3, 'u1', false, '2026-03-03T12:00:00.000+01:00'),
  ];
  expect(fautesDuJournal(journal).get('u1')).toEqual({ fautes: 1, suite: 0 });
});

it('un_doublon_ne_compte_pas', () => {
  // Sans dédoublonnage : juste, faute, juste, juste, juste, soit trois succès de suite et 0 faute.
  const juste3 = reponseDeTest(3, 'u1', true, '2026-03-03T12:00:00.000+01:00');
  const journal = [
    reponseDeTest(1, 'u1', true, '2026-03-01T12:00:00.000+01:00'),
    reponseDeTest(2, 'u1', false, '2026-03-02T12:00:00.000+01:00'),
    juste3,
    juste3,
    reponseDeTest(4, 'u1', true, '2026-03-04T12:00:00.000+01:00'),
  ];
  expect(fautesDuJournal(journal).get('u1')).toEqual({ fautes: 1, suite: 2 });
});

it('une_carte_et_son_sens_inverse_sont_jugees_a_part', () => {
  const journal = [
    reponseDeTest(1, 'abcd2345', true, '2026-03-01T12:00:00.000+01:00'),
    reponseDeTest(2, 'abcd2345:inverse', true, '2026-03-01T12:01:00.000+01:00'),
    reponseDeTest(3, 'abcd2345', false, '2026-03-02T12:00:00.000+01:00'),
    examenRemisDeTest('cm5r8t23', 4, '2026-03-02T13:00:00.000+01:00'),
  ];
  const etats = fautesDuJournal(journal);
  expect(etats.get('abcd2345')).toEqual({ fautes: 1, suite: 0 });
  expect(etats.get('abcd2345:inverse')).toEqual({ fautes: 0, suite: 1 });
  expect([...etats.keys()]).toEqual(['abcd2345', 'abcd2345:inverse']);
});

it('une_faute_d_avant_le_premier_succes_ne_prend_pas_le_jour', () => {
  const jour = '2026-03-01';
  expect(etat([X, O, X], [jour, jour, jour])).toEqual({ fautes: 1, suite: 0 });
});

it('un_quatrieme_succes_de_suite_garde_les_fautes_a_zero', () => {
  expect(etat([O, X, O, O, O, O])).toEqual({ fautes: 0, suite: 4 });
});

it('un_journal_vide_n_a_aucune_entree_et_une_unite_de_fautes_seules_a_la_sienne', () => {
  expect(fautesDuJournal([]).size).toBe(0);
  const journal = [reponseDeTest(1, 'u1', false, '2026-03-01T12:00:00.000+01:00')];
  expect(fautesDuJournal(journal).get('u1')).toEqual({ fautes: 0, suite: 0 });
});

it('unites_rebelles_au_seuil_pas_dessous_et_jamais_une_unite_qui_n_est_pas_un_posable', () => {
  const fautes = new Map([
    ['a', { fautes: 3, suite: 0 }],
    ['b', { fautes: 2, suite: 0 }],
    ['retiree', { fautes: 9, suite: 0 }],
  ]);
  const posables = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  expect([...unitesRebelles(posables, fautes, 3)]).toEqual(['a']);
  expect([...unitesRebelles(posables, fautes, 2)]).toEqual(['a', 'b']);
  expect(unitesRebelles([], fautes, 2).size).toBe(0);
});

it('repondues_le_compte_les_reponses_du_jour_local_hors_pretest_et_examen', () => {
  const journal = [
    reponseDeTest(1, 'u1', true, '2026-03-05T12:00:00.000+01:00'),
    // 00:30 à +02:00 : le jour local est le 06, le jour UTC est le 05.
    reponseDeTest(2, 'u2', false, '2026-03-06T00:30:00.000+02:00'),
    pretestDeTest(3, 'u3', false, '2026-03-06T10:00:00.000+01:00'),
    examenRemisDeTest('cm5r8t23', 4, '2026-03-06T11:00:00.000+01:00'),
    reponseDeTest(5, 'u4', true, '2026-03-07T10:00:00.000+01:00'),
  ];
  expect([...reponduesLe(journal, '2026-03-06')]).toEqual(['u2']);
  expect([...reponduesLe(journal, '2026-03-05')]).toEqual(['u1']);
  expect(reponduesLe([], '2026-03-06').size).toBe(0);
  const doublon = reponseDeTest(6, 'u5', true, '2026-03-06T10:00:00.000+01:00');
  expect([...reponduesLe([doublon, doublon], '2026-03-06')]).toEqual(['u5']);
});

const lesFautes = (...entrees: [string, number][]) =>
  new Map(entrees.map(([id, fautes]) => [id, { fautes, suite: 0 }]));

it('a_reprendre_range_par_module_du_manifeste_puis_par_fautes_decroissantes', () => {
  const posables = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 's1' }, { id: 'n' }];
  // Les schémas précèdent les cartes dans le manifeste, quel que soit l'ordre des posables.
  const modules = new Map([
    ['c1', 'cartes'],
    ['c2', 'cartes'],
    ['c3', 'cartes'],
    ['s1', 'schema'],
    ['n', 'cartes'],
  ]);
  const liste = aReprendre(
    posables,
    modules,
    ['schema', 'cartes'],
    lesFautes(['c1', 3], ['c2', 5], ['c3', 4], ['s1', 3], ['n', 1]),
    3,
  );
  expect(liste.map((g) => g.module)).toEqual(['schema', 'cartes']);
  expect(liste[0].elements.map((e) => [e.posable.id, e.fautes])).toEqual([['s1', 3]]);
  expect(liste[1].elements.map((e) => [e.posable.id, e.fautes])).toEqual([
    ['c2', 5],
    ['c3', 4],
    ['c1', 3],
  ]);
});

it('a_reprendre_a_egalite_de_fautes_l_ordre_du_cours_departage', () => {
  const posables = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const modules = new Map([
    ['a', 'm'],
    ['b', 'm'],
    ['c', 'm'],
  ]);
  const liste = aReprendre(posables, modules, ['m'], lesFautes(['c', 3], ['a', 3], ['b', 3]), 3);
  expect(liste[0].elements.map((e) => e.posable.id)).toEqual(['a', 'b', 'c']);
});

it('a_reprendre_omet_le_non_rebelle_le_module_sans_rebelle_et_range_un_module_inconnu_a_la_fin', () => {
  const posables = [{ id: 'a' }, { id: 'b' }, { id: 'x' }, { id: 'y' }];
  const modules = new Map([
    ['a', 'm1'],
    ['b', 'm2'],
    ['x', 'inconnu2'],
    ['y', 'inconnu1'],
  ]);
  const liste = aReprendre(
    posables,
    modules,
    ['m1', 'm2'],
    lesFautes(['a', 1], ['b', 3], ['x', 3], ['y', 4]),
    3,
  );
  // m1 n'a aucun rebelle : absent. Les modules hors de `ordre` suivent, dans l'ordre des posables.
  expect(liste.map((g) => g.module)).toEqual(['m2', 'inconnu2', 'inconnu1']);
  expect(aReprendre(posables, modules, ['m1'], lesFautes(), 3)).toEqual([]);
  expect(aReprendre([], modules, ['m1'], lesFautes(['a', 9]), 3)).toEqual([]);
});

it('a_reprendre_ignore_un_posable_sans_module', () => {
  const liste = aReprendre([{ id: 'a' }], new Map(), ['m'], lesFautes(['a', 5]), 3);
  expect(liste).toEqual([]);
});
