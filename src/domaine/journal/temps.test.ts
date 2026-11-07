import { expect, it } from 'vitest';
import { ajouterJours, horodatage, jourDe } from './temps.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 */

// 2026-10-16 22:30:00.007 UTC : le 17 à 00:30 au fuseau des tests (+02:00), le 16 à 18:30
// à New York (-04:00).
const INSTANT = Date.UTC(2026, 9, 16, 22, 30, 0, 7);

it('horodatage_avec_decalage_positif_et_negatif', () => {
  expect(horodatage(INSTANT, 120)).toBe('2026-10-17T00:30:00.007+02:00');
  expect(horodatage(INSTANT, -240)).toBe('2026-10-16T18:30:00.007-04:00');
  // Le décalage nul s'écrit +00:00, jamais Z ni -00:00.
  expect(horodatage(INSTANT, 0)).toBe('2026-10-16T22:30:00.007+00:00');
  // Les minutes du décalage : l'Inde (+05:30) et Terre-Neuve (-03:30).
  expect(horodatage(INSTANT, 330)).toBe('2026-10-17T04:00:00.007+05:30');
  expect(horodatage(INSTANT, -210)).toBe('2026-10-16T19:00:00.007-03:30');
  // Les décalages extrêmes en usage : -12:00 et +14:00.
  expect(horodatage(INSTANT, -720)).toBe('2026-10-16T10:30:00.007-12:00');
  expect(horodatage(INSTANT, 840)).toBe('2026-10-17T12:30:00.007+14:00');
});

it('horodatage_remplit_les_zeros_et_passe_les_frontieres', () => {
  // Chaque champ sur deux chiffres, les millisecondes sur trois.
  expect(horodatage(Date.UTC(2026, 0, 2, 3, 4, 5, 6), 60)).toBe('2026-01-02T04:04:05.006+01:00');
  // Minuit local, passage d'année vers l'avant puis vers l'arrière.
  expect(horodatage(Date.UTC(2026, 11, 31, 23, 30, 0, 0), 120)).toBe(
    '2027-01-01T01:30:00.000+02:00',
  );
  expect(horodatage(Date.UTC(2027, 0, 1, 1, 30, 0, 0), -120)).toBe('2026-12-31T23:30:00.000-02:00');
  // Un décalage qui n'est pas d'une heure pleine, négatif, avec des minutes sur un chiffre.
  expect(horodatage(INSTANT, -5)).toBe('2026-10-16T22:25:00.007-00:05');
});

it('horodatage_designe_le_meme_instant_quel_que_soit_le_decalage', () => {
  for (const decalage of [-720, -570, -240, -5, 0, 5, 60, 120, 330, 525, 840]) {
    expect(Date.parse(horodatage(INSTANT, decalage))).toBe(INSTANT);
  }
});

it('jour_de_prend_les_dix_premiers_caracteres', () => {
  expect(jourDe('2026-10-17T23:30:00.000+02:00')).toBe('2026-10-17');
  expect(jourDe('2026-01-02T00:00:00.000-04:00')).toBe('2026-01-02');
});

// F3 : les tests tournent à l'heure de Zurich (`vitest.config.ts`), en CI (UTC) comme sur un poste.
// Sans cela, les nuits de 23 h et de 25 h n'existent pas en CI, et le test suivant ne mord pas.
it('les_tests_tournent_a_l_heure_de_zurich', () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Zurich');
  // L'heure d'hiver, puis l'heure d'été : le décalage change bien.
  expect(new Date('2026-01-15T12:00:00.000Z').getTimezoneOffset()).toBe(-60);
  expect(new Date('2026-07-15T12:00:00.000Z').getTimezoneOffset()).toBe(-120);
});

it('ajouter_jours_passe_les_mois_et_le_changement_d_heure', () => {
  expect(ajouterJours('2026-10-17', 0)).toBe('2026-10-17');
  expect(ajouterJours('2026-10-17', 1)).toBe('2026-10-18');
  expect(ajouterJours('2026-10-17', 16)).toBe('2026-11-02');
  expect(ajouterJours('2026-10-17', -1)).toBe('2026-10-16');
  expect(ajouterJours('2026-10-17', -17)).toBe('2026-09-30');

  // Les mois de 28, 29, 30 et 31 jours.
  expect(ajouterJours('2026-01-31', 1)).toBe('2026-02-01');
  expect(ajouterJours('2026-02-28', 1)).toBe('2026-03-01');
  expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
  expect(ajouterJours('2028-02-29', 1)).toBe('2028-03-01');
  expect(ajouterJours('2026-04-30', 1)).toBe('2026-05-01');
  expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');

  // Les années.
  expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
  expect(ajouterJours('2027-01-01', -1)).toBe('2026-12-31');
  expect(ajouterJours('2026-10-17', 365)).toBe('2027-10-17');
  expect(ajouterJours('2027-10-17', -366)).toBe('2026-10-16');

  // Les nuits de 23 h et de 25 h : Europe (29 mars et 25 octobre 2026), États-Unis (8 mars et
  // 1er novembre 2026). Un jour est toujours un jour, quel que soit le fuseau du poste.
  expect(ajouterJours('2026-03-28', 1)).toBe('2026-03-29');
  expect(ajouterJours('2026-03-28', 2)).toBe('2026-03-30');
  expect(ajouterJours('2026-03-30', -2)).toBe('2026-03-28');
  expect(ajouterJours('2026-10-24', 1)).toBe('2026-10-25');
  expect(ajouterJours('2026-10-24', 2)).toBe('2026-10-26');
  expect(ajouterJours('2026-10-26', -2)).toBe('2026-10-24');
  expect(ajouterJours('2026-03-07', 2)).toBe('2026-03-09');
  expect(ajouterJours('2026-10-31', 2)).toBe('2026-11-02');
});
