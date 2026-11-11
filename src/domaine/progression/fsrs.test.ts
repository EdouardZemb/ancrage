import { expect, it } from 'vitest';
import { examenRemisDeTest, reponseDeTest } from '../evenements.fixture.js';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours } from '../journal/temps.js';
import { boiteDeStabilite, etatsFsrs } from './fsrs.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

const J0 = '2026-03-02';

/** L'écart en jours entre deux jours `AAAA-MM-JJ`. */
function ecart(de: string, a: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000;
}

/** Une réponse donnée à midi, heure locale, le `jour` dit. */
function repAMidi(n: number, unite: string, juste: boolean, jour: string): Evenement {
  return reponseDeTest(n, unite, juste, `${jour}T12:00:00.000+01:00`);
}

/** Des justes, chacune le jour d'échéance que rend la précédente : les jours de réponse et les intervalles. */
function justesALEcheance(
  unite: string,
  combien: number,
  retention = 0.9,
): { journal: Evenement[]; jours: string[]; intervalles: number[] } {
  const journal: Evenement[] = [];
  const jours: string[] = [];
  const intervalles: number[] = [];
  let jour = J0;
  for (let i = 0; i < combien; i++) {
    journal.push(repAMidi(i + 1, unite, true, jour));
    jours.push(jour);
    const echeance = etatsFsrs(journal, retention).get(unite)?.echeance ?? '';
    intervalles.push(ecart(jour, echeance));
    jour = echeance;
  }
  return { journal, jours, intervalles };
}

it('une unité sans réponse est absente', () => {
  expect(etatsFsrs([], 0.9).size).toBe(0);
});

it('une première réponse juste', () => {
  const etat = etatsFsrs([repAMidi(1, 'u1', true, J0)], 0.9).get('u1');
  expect(etat?.boite).toBeGreaterThanOrEqual(1);
  expect(etat?.justes).toBe(1);
  expect(etat?.fausses).toBe(0);
  expect((etat?.echeance ?? '') > J0).toBe(true);
});

it("une faute rend l'unité due le jour même", () => {
  const jour = ajouterJours(J0, 3);
  const etat = etatsFsrs([repAMidi(1, 'u1', true, J0), repAMidi(2, 'u1', false, jour)], 0.9).get(
    'u1',
  );
  expect(etat).toEqual({ boite: 1, echeance: jour, justes: 1, fausses: 1 });
});

it("les justes espacées allongent l'intervalle", () => {
  const { intervalles } = justesALEcheance('u1', 4);
  for (let i = 1; i < intervalles.length; i++) {
    expect(intervalles[i]).toBeGreaterThan(intervalles[i - 1] ?? Number.POSITIVE_INFINITY);
  }
});

it("l'intervalle dépasse le plafond de Leitner", () => {
  const { intervalles } = justesALEcheance('u1', 4);
  expect(intervalles[3]).toBeGreaterThan(16);
});

it("l'ordre d'arrivée ne compte pas", () => {
  const journal = [
    repAMidi(1, 'u1', true, '2026-03-02'),
    repAMidi(2, 'u2', true, '2026-03-02'),
    repAMidi(3, 'u1', true, '2026-03-04'),
    repAMidi(4, 'u2', false, '2026-03-05'),
    repAMidi(5, 'u1', false, '2026-03-09'),
    repAMidi(6, 'u2', true, '2026-03-10'),
  ];
  const melange = [journal[3], journal[0], journal[5], journal[2], journal[4], journal[1]].filter(
    (e): e is Evenement => e !== undefined,
  );
  const endroit = etatsFsrs(journal, 0.9);
  expect(endroit.size).toBe(2);
  expect(etatsFsrs([...journal].reverse(), 0.9)).toEqual(endroit);
  expect(etatsFsrs(melange, 0.9)).toEqual(endroit);
});

it("un doublon ne compte qu'une fois", () => {
  const premiere = repAMidi(1, 'u1', true, J0);
  const seconde = repAMidi(2, 'u1', true, ajouterJours(J0, 2));
  expect(etatsFsrs([premiere, seconde, seconde], 0.9)).toEqual(etatsFsrs([premiere, seconde], 0.9));
  expect(etatsFsrs([premiere, premiere], 0.9).get('u1')?.justes).toBe(1);
});

it("un examen n'y entre pas", () => {
  const journal = [repAMidi(1, 'u1', true, J0), repAMidi(2, 'u1', false, ajouterJours(J0, 1))];
  const avecExamen = [
    ...journal,
    examenRemisDeTest('cm5r8t23', 3, `${ajouterJours(J0, 2)}T10:00:00.000+01:00`),
  ];
  expect(etatsFsrs(avecExamen, 0.9)).toEqual(etatsFsrs(journal, 0.9));
  expect(etatsFsrs(avecExamen, 0.9).has('exam0001')).toBe(false);
});

it("l'unité inverse est une autre unité", () => {
  const etats = etatsFsrs([repAMidi(1, 'u1', true, J0), repAMidi(2, 'u1:inverse', false, J0)], 0.9);
  expect(etats.get('u1')).toMatchObject({ justes: 1, fausses: 0 });
  expect(etats.get('u1:inverse')).toEqual({ boite: 1, echeance: J0, justes: 0, fausses: 1 });
});

it('beaucoup de réponses le même jour', () => {
  const journal = [
    repAMidi(1, 'u1', false, J0),
    ...[2, 3, 4, 5, 6].map((n) => repAMidi(n, 'u1', true, J0)),
  ];
  const etat = etatsFsrs(journal, 0.9).get('u1');
  expect(etat?.boite).toBeGreaterThanOrEqual(1);
  expect(etat?.boite).toBeLessThanOrEqual(5);
  expect(etat?.echeance).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect((etat?.echeance ?? '') >= J0).toBe(true);
  const fautif = etatsFsrs([...journal, repAMidi(7, 'u1', false, J0)], 0.9).get('u1');
  expect(fautif?.echeance).toBe(J0);
});

it('23 h 59 puis 0 h 01', () => {
  const tard = etatsFsrs(
    [
      reponseDeTest(1, 'u1', true, '2026-03-02T23:59:00+01:00'),
      reponseDeTest(2, 'u1', true, '2026-03-03T00:01:00+01:00'),
    ],
    0.9,
  );
  const midi = etatsFsrs(
    [repAMidi(1, 'u1', true, '2026-03-02'), repAMidi(2, 'u1', true, '2026-03-03')],
    0.9,
  );
  expect(tard).toEqual(midi);
});

it('une rétention plus haute rapproche l’échéance', () => {
  const unJuste = [repAMidi(1, 'u1', true, J0)];
  const haute = etatsFsrs(unJuste, 0.95).get('u1')?.echeance ?? '';
  const basse = etatsFsrs(unJuste, 0.8).get('u1')?.echeance ?? '';
  expect(haute <= basse).toBe(true);
  const quatreHaute = justesALEcheance('u1', 4, 0.95);
  const quatreBasse = justesALEcheance('u1', 4, 0.8);
  const derniere = (r: { journal: Evenement[] }, retention: number): string =>
    etatsFsrs(r.journal, retention).get('u1')?.echeance ?? '';
  expect(derniere(quatreHaute, 0.95) < derniere(quatreBasse, 0.8)).toBe(true);
});

it('le calcul est fixé', () => {
  const journal = [
    repAMidi(1, 'u1', true, '2026-03-02'),
    repAMidi(2, 'u1', true, '2026-03-04'),
    repAMidi(3, 'u1', false, '2026-03-11'),
    repAMidi(4, 'u1', true, '2026-03-11'),
    repAMidi(5, 'u1', true, '2026-03-13'),
  ];
  expect(etatsFsrs(journal, 0.9).get('u1')).toEqual({
    boite: 3,
    echeance: '2026-03-18',
    justes: 4,
    fausses: 1,
  });
});

it('boiteDeStabilite', () => {
  const attendu: [number, number][] = [
    [0.5, 1],
    [1.99, 1],
    [2, 2],
    [3.99, 2],
    [4, 3],
    [7.99, 3],
    [8, 4],
    [20.99, 4],
    [21, 5],
    [400, 5],
  ];
  for (const [stabilite, boite] of attendu) {
    expect(boiteDeStabilite(stabilite), String(stabilite)).toBe(boite);
  }
});

it('une faute puis une juste le même jour : le calcul est fixé', () => {
  const journal = [
    repAMidi(1, 'u1', true, '2026-03-02'),
    repAMidi(2, 'u1', false, '2026-03-04'),
    repAMidi(3, 'u1', true, '2026-03-04'),
    repAMidi(4, 'u1', true, '2026-03-05'),
    repAMidi(5, 'u1', true, '2026-03-07'),
    repAMidi(6, 'u1', true, '2026-03-11'),
  ];
  expect(etatsFsrs(journal, 0.9).get('u1')).toEqual({
    boite: 4,
    echeance: '2026-03-23',
    justes: 5,
    fausses: 1,
  });
});

it('deux fautes puis une juste le même jour : le calcul est fixé', () => {
  const journal = [
    repAMidi(1, 'u1', true, '2026-03-02'),
    repAMidi(2, 'u1', false, '2026-03-05'),
    repAMidi(3, 'u1', false, '2026-03-05'),
    repAMidi(4, 'u1', true, '2026-03-05'),
    repAMidi(5, 'u1', true, '2026-03-06'),
    repAMidi(6, 'u1', true, '2026-03-08'),
  ];
  expect(etatsFsrs(journal, 0.9).get('u1')).toEqual({
    boite: 2,
    echeance: '2026-03-10',
    justes: 4,
    fausses: 2,
  });
});
