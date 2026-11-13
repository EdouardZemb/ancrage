import { expect, test } from 'vitest';
import type { Evenement, ModeDeReponse } from '../../domaine/journal/evenement.js';
import { coursDExemple } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import {
  estActive,
  MINIMUM_D_UNE_CASE,
  mesures,
  reussiteObservee,
  sommerMesures,
} from './mesures.js';

const cours = coursDExemple();
const A = 'xyv4pn7g';
const B = 'xyv4pn7g:inverse';
const ID_DU_COURS = cours.cours.id;

let rang = 0;
function reponse(
  jour: number,
  heure: number,
  minute: number,
  seconde: number,
  unite: string,
  juste: boolean,
  mode?: ModeDeReponse,
): Evenement {
  rang += 1;
  const instant = Date.UTC(2026, 0, jour, heure, minute, seconde);
  return reponseInventee(instant, rang, unite, juste, ID_DU_COURS, mode);
}

/** Un petit journal dont les comptes se vérifient à la main (Leitner, intervalles 0, 1, 2, 4, 8, 16). */
function petitJournal(): Evenement[] {
  return [
    reponse(5, 10, 0, 0, A, true, 'retournee'),
    reponse(5, 10, 0, 30, A, false, 'retournee'),
    reponse(5, 10, 1, 0, B, true),
    reponse(6, 9, 0, 0, A, true, 'saisie'),
    reponse(6, 9, 0, 40, B, true, 'saisie'),
    reponse(7, 10, 0, 0, A, true, 'choix'),
  ];
}

test('les_reponses_et_les_decouvertes_se_comptent_par_jour', () => {
  const m = mesures(petitJournal(), cours, '2026-01-07');
  expect(m.reponses).toBe(6);
  expect(m.premierJour).toBe('2026-01-05');
  expect(m.dernierJour).toBe('2026-01-07');
  expect(m.parJour).toEqual({
    '2026-01-05': { reponses: 3, decouvertes: 2 },
    '2026-01-06': { reponses: 2, decouvertes: 0 },
    '2026-01-07': { reponses: 1, decouvertes: 0 },
  });
});

test('la_reussite_se_mesure_selon_le_delai_depuis_la_reponse_d_avant', () => {
  const { delais } = mesures(petitJournal(), cours, '2026-01-07');
  expect(delais.premiere).toEqual({ reponses: 2, justes: 2 });
  expect(delais['meme-jour']).toEqual({ reponses: 1, justes: 0 });
  // Le 06, A (boîte 1, échue le 05) et B (boîte 1, échue le 06) reviennent à l'échéance.
  expect(delais['boite-1']).toEqual({ reponses: 2, justes: 2 });
  // Le 07, A (boîte 2, échue le 08) revient avant son échéance.
  expect(delais['avant-echeance']).toEqual({ reponses: 1, justes: 1 });
  expect(delais['boite-2']).toEqual({ reponses: 0, justes: 0 });
});

test('la_reussite_se_mesure_selon_le_mode_et_les_reponses_sans_mode_sont_a_part', () => {
  const { modes } = mesures(petitJournal(), cours, '2026-01-07');
  expect(modes.retournee).toEqual({ reponses: 2, justes: 1 });
  expect(modes.saisie).toEqual({ reponses: 2, justes: 2 });
  expect(modes.choix).toEqual({ reponses: 1, justes: 1 });
  expect(modes['sans-mode']).toEqual({ reponses: 1, justes: 1 });
  expect(modes.pointage).toEqual({ reponses: 0, justes: 0 });
});

test('la_part_vue_et_les_boites_viennent_de_l_etat_du_jour', () => {
  const m = mesures(petitJournal(), cours, '2026-01-07');
  expect(m.elements).toBe(80);
  // A est en boîte 3 (échue le 11), B en boîte 2 (échue le 08).
  expect(m.boites).toEqual([78, 0, 1, 1, 0, 0]);
  expect(m.dues).toBe(0);
  expect(mesures(petitJournal(), cours, '2026-01-08').dues).toBe(1);
});

test('l_ecart_median_ne_compte_que_les_reponses_qui_se_suivent_a_moins_de_deux_minutes', () => {
  const m = mesures(petitJournal(), cours, '2026-01-07');
  // 30 s, 30 s et 40 s ; les autres écarts dépassent deux minutes.
  expect(m.ecarts).toEqual([30, 30, 40]);
  expect(m.ecartMedian).toBe(30);
});

test('sans_ecart_court_l_ecart_median_est_inconnu', () => {
  const m = mesures([reponse(5, 10, 0, 0, A, true)], cours, '2026-01-05');
  expect(m.ecartMedian).toBeNull();
});

test('un_journal_vide_donne_des_mesures_vides', () => {
  const m = mesures([], cours, '2026-01-05');
  expect(m.reponses).toBe(0);
  expect(m.premierJour).toBeNull();
  expect(m.parJour).toEqual({});
  expect(m.boites[0]).toBe(80);
});

test('un_evenement_present_deux_fois_ne_compte_qu_une_fois', () => {
  const journal = petitJournal();
  const m = mesures([...journal, ...journal], cours, '2026-01-07');
  expect(m.reponses).toBe(6);
});

test('les_mesures_de_deux_journaux_s_additionnent', () => {
  const un = mesures(petitJournal(), cours, '2026-01-07');
  const deux = sommerMesures([un, un]);
  expect(deux.reponses).toBe(12);
  expect(deux.parJour['2026-01-05']).toEqual({ reponses: 6, decouvertes: 4 });
  expect(deux.delais['boite-1']).toEqual({ reponses: 4, justes: 4 });
  expect(deux.boites).toEqual([156, 0, 2, 2, 0, 0]);
  expect(deux.elements).toBe(160);
  expect(deux.ecartMedian).toBe(30);
});

test('la_reussite_observee_a_un_defaut_la_ou_la_mesure_manque', () => {
  const observee = reussiteObservee(mesures(petitJournal(), cours, '2026-01-07'));
  expect(observee.premiere).toBe(1);
  expect(observee.memeJour).toBe(0);
  expect(observee.parBoite[1]).toBe(1);
  expect(observee.parBoite[5]).toBe(0.5);
});

test('une_personne_est_active_a_vingt_reponses_dans_les_vingt_huit_jours_qui_finissent_au_jour_du_rapport', () => {
  const AUJOURDHUI = '2026-01-30';
  const duJour = (jour: number, n: number) =>
    Array.from({ length: n }, (_, i) => reponse(jour, 10, i, 0, A, true));
  // 19 réponses dans la fenêtre, 3 avant : pas encore active.
  expect(estActive([...duJour(2, 3), ...duJour(30, 19)], AUJOURDHUI)).toBe(false);
  // 20 réponses : active.
  expect(estActive(duJour(30, 20), AUJOURDHUI)).toBe(true);
  // 20 réponses, dont 5 il y a 28 jours (hors fenêtre) : inactive ; il y a 27 jours : active.
  const ancien = Array.from({ length: 5 }, (_, i) => reponse(2, 10, i, 0, A, true));
  const recent = Array.from({ length: 15 }, (_, i) => reponse(30, 10, i, 0, A, true));
  expect(estActive([...ancien, ...recent], AUJOURDHUI)).toBe(false);
  const limite = Array.from({ length: 5 }, (_, i) => reponse(3, 10, i, 0, A, true));
  expect(estActive([...limite, ...recent], AUJOURDHUI)).toBe(true);
});

test('un_compte_ancien_n_est_plus_actif_au_jour_du_rapport', () => {
  const ancien = Array.from({ length: 50 }, (_, i) => reponse(5, 10, i, 0, A, true));
  expect(estActive(ancien, '2026-02-20')).toBe(false);
  expect(estActive(ancien, '2026-01-05')).toBe(true);
  // Les réponses d'après le jour du rapport ne comptent pas.
  expect(estActive(ancien, '2026-01-04')).toBe(false);
});

test('le_minimum_d_une_case_est_de_vingt_reponses', () => {
  expect(MINIMUM_D_UNE_CASE).toBe(20);
});
