import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
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
    const echeance = etatsFsrs(journal, { retention: retention }).get(unite)?.echeance ?? '';
    intervalles.push(ecart(jour, echeance));
    jour = echeance;
  }
  return { journal, jours, intervalles };
}

it('une unité sans réponse est absente', () => {
  expect(etatsFsrs([], { retention: 0.9 }).size).toBe(0);
});

it('une première réponse juste', () => {
  const etat = etatsFsrs([repAMidi(1, 'u1', true, J0)], { retention: 0.9 }).get('u1');
  expect(etat?.boite).toBeGreaterThanOrEqual(1);
  expect(etat?.justes).toBe(1);
  expect(etat?.fausses).toBe(0);
  expect((etat?.echeance ?? '') > J0).toBe(true);
});

it("une faute rend l'unité due le jour même", () => {
  const jour = ajouterJours(J0, 3);
  const etat = etatsFsrs([repAMidi(1, 'u1', true, J0), repAMidi(2, 'u1', false, jour)], {
    retention: 0.9,
  }).get('u1');
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
  const endroit = etatsFsrs(journal, { retention: 0.9 });
  expect(endroit.size).toBe(2);
  expect(etatsFsrs([...journal].reverse(), { retention: 0.9 })).toEqual(endroit);
  expect(etatsFsrs(melange, { retention: 0.9 })).toEqual(endroit);
});

it("un doublon ne compte qu'une fois", () => {
  const premiere = repAMidi(1, 'u1', true, J0);
  const seconde = repAMidi(2, 'u1', true, ajouterJours(J0, 2));
  expect(etatsFsrs([premiere, seconde, seconde], { retention: 0.9 })).toEqual(
    etatsFsrs([premiere, seconde], { retention: 0.9 }),
  );
  expect(etatsFsrs([premiere, premiere], { retention: 0.9 }).get('u1')?.justes).toBe(1);
});

it("un examen n'y entre pas", () => {
  const journal = [repAMidi(1, 'u1', true, J0), repAMidi(2, 'u1', false, ajouterJours(J0, 1))];
  const avecExamen = [
    ...journal,
    examenRemisDeTest('cm5r8t23', 3, `${ajouterJours(J0, 2)}T10:00:00.000+01:00`),
  ];
  expect(etatsFsrs(avecExamen, { retention: 0.9 })).toEqual(etatsFsrs(journal, { retention: 0.9 }));
  expect(etatsFsrs(avecExamen, { retention: 0.9 }).has('exam0001')).toBe(false);
});

it("l'unité inverse est une autre unité", () => {
  const etats = etatsFsrs([repAMidi(1, 'u1', true, J0), repAMidi(2, 'u1:inverse', false, J0)], {
    retention: 0.9,
  });
  expect(etats.get('u1')).toMatchObject({ justes: 1, fausses: 0 });
  expect(etats.get('u1:inverse')).toEqual({ boite: 1, echeance: J0, justes: 0, fausses: 1 });
});

it('beaucoup de réponses le même jour', () => {
  const journal = [
    repAMidi(1, 'u1', false, J0),
    ...[2, 3, 4, 5, 6].map((n) => repAMidi(n, 'u1', true, J0)),
  ];
  const etat = etatsFsrs(journal, { retention: 0.9 }).get('u1');
  expect(etat?.boite).toBeGreaterThanOrEqual(1);
  expect(etat?.boite).toBeLessThanOrEqual(5);
  expect(etat?.echeance).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect((etat?.echeance ?? '') >= J0).toBe(true);
  const fautif = etatsFsrs([...journal, repAMidi(7, 'u1', false, J0)], { retention: 0.9 }).get(
    'u1',
  );
  expect(fautif?.echeance).toBe(J0);
});

it('23 h 59 puis 0 h 01', () => {
  const tard = etatsFsrs(
    [
      reponseDeTest(1, 'u1', true, '2026-03-02T23:59:00+01:00'),
      reponseDeTest(2, 'u1', true, '2026-03-03T00:01:00+01:00'),
    ],
    { retention: 0.9 },
  );
  const midi = etatsFsrs(
    [repAMidi(1, 'u1', true, '2026-03-02'), repAMidi(2, 'u1', true, '2026-03-03')],
    { retention: 0.9 },
  );
  expect(tard).toEqual(midi);
});

it('une rétention plus haute rapproche l’échéance', () => {
  const unJuste = [repAMidi(1, 'u1', true, J0)];
  const haute = etatsFsrs(unJuste, { retention: 0.95 }).get('u1')?.echeance ?? '';
  const basse = etatsFsrs(unJuste, { retention: 0.8 }).get('u1')?.echeance ?? '';
  expect(haute <= basse).toBe(true);
  const quatreHaute = justesALEcheance('u1', 4, 0.95);
  const quatreBasse = justesALEcheance('u1', 4, 0.8);
  const derniere = (r: { journal: Evenement[] }, retention: number): string =>
    etatsFsrs(r.journal, { retention: retention }).get('u1')?.echeance ?? '';
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
  expect(etatsFsrs(journal, { retention: 0.9 }).get('u1')).toEqual({
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
  expect(etatsFsrs(journal, { retention: 0.9 }).get('u1')).toEqual({
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
  expect(etatsFsrs(journal, { retention: 0.9 }).get('u1')).toEqual({
    boite: 2,
    echeance: '2026-03-10',
    justes: 4,
    fausses: 2,
  });
});

it("un jour local qui recule est ramené au dernier jour de l'unité", () => {
  // La seconde réponse est plus tardive en instant, mais son jour local est la veille.
  const avant = '2026-03-03T00:30:00.000+01:00';
  const apres = '2026-03-02T23:45:00.000-01:00';
  const reculee = etatsFsrs(
    [reponseDeTest(1, 'u1', true, avant), reponseDeTest(2, 'u1', true, apres)],
    { retention: 0.9 },
  );
  const memeJour = etatsFsrs(
    [
      reponseDeTest(1, 'u1', true, '2026-03-03T12:00:00.000+01:00'),
      reponseDeTest(2, 'u1', true, '2026-03-03T13:00:00.000+01:00'),
    ],
    { retention: 0.9 },
  );
  expect(reculee).toEqual(memeJour);
});

it('une faute dont le jour local recule est due le jour corrigé, pas la veille', () => {
  const etat = etatsFsrs(
    [
      reponseDeTest(1, 'u1', true, '2026-03-03T00:30:00.000+01:00'),
      reponseDeTest(2, 'u1', false, '2026-03-02T23:45:00.000-01:00'),
    ],
    { retention: 0.9 },
  ).get('u1');
  expect(etat?.echeance).toBe('2026-03-03');
  expect(etat?.fausses).toBe(1);
});

/** Quatre justes à l'échéance : le dernier jour de réponse, et l'intervalle de FSRS qui le suit. */
function quatreJustes(): { journal: Evenement[]; dernierJour: string; intervalle: number } {
  const { journal, jours, intervalles } = justesALEcheance('u1', 4);
  return {
    journal,
    dernierJour: jours[3] ?? J0,
    intervalle: intervalles[3] ?? 0,
  };
}

/** L'échéance de `u1` quand l'examen tombe `avant` jours après la dernière réponse. */
function echeanceAvecExamen(avant: number): string | null | undefined {
  const { journal, dernierJour } = quatreJustes();
  return etatsFsrs(journal, { retention: 0.9, examen: ajouterJours(dernierJour, avant) }).get('u1')
    ?.echeance;
}

it("le plafond : la moitié de l'écart, arrondie vers le bas, borne un intervalle plus long", () => {
  const { dernierJour, intervalle } = quatreJustes();
  expect(intervalle).toBeGreaterThan(20);
  // Un examen assez loin pour que la moitié de l'écart dépasse l'intervalle : rien ne change.
  expect(echeanceAvecExamen(2 * intervalle + 100)).toBe(ajouterJours(dernierJour, intervalle));
  // Un écart égal au double de l'intervalle : l'intervalle passe tel quel.
  expect(echeanceAvecExamen(2 * intervalle)).toBe(ajouterJours(dernierJour, intervalle));
  expect(echeanceAvecExamen(2 * intervalle - 1)).toBe(ajouterJours(dernierJour, intervalle - 1));
  // 41 / 2 = 20,5 : 20.
  expect(echeanceAvecExamen(41)).toBe(ajouterJours(dernierJour, 20));
  expect(echeanceAvecExamen(40)).toBe(ajouterJours(dernierJour, 20));
  expect(echeanceAvecExamen(39)).toBe(ajouterJours(dernierJour, 19));
  // 100 jours avant l'examen : 50 au plus ; un intervalle de 80 jours devient 50.
  expect(echeanceAvecExamen(100)).toBe(ajouterJours(dernierJour, Math.min(intervalle, 50)));
});

it("le plafond : à trois jours de l'examen, un jour ; à un jour, un jour aussi", () => {
  const { dernierJour } = quatreJustes();
  expect(echeanceAvecExamen(3)).toBe(ajouterJours(dernierJour, 1));
  expect(echeanceAvecExamen(2)).toBe(ajouterJours(dernierJour, 1));
  // À un jour, la moitié arrondie vaut zéro : l'intervalle est d'un jour (M3-P5).
  expect(echeanceAvecExamen(1)).toBe(ajouterJours(dernierJour, 1));
});

it("le jour de l'examen et après, pas de plafond : l'intervalle est celui de FSRS", () => {
  const { dernierJour, intervalle } = quatreJustes();
  const sansExamen = ajouterJours(dernierJour, intervalle);
  expect(echeanceAvecExamen(0)).toBe(sansExamen);
  expect(echeanceAvecExamen(-1)).toBe(sansExamen);
  expect(echeanceAvecExamen(-200)).toBe(sansExamen);
});

it("le plafond part du jour de la réponse et ne borne que l'échéance, pas la stabilité", () => {
  const { journal, dernierJour } = quatreJustes();
  const examen = ajouterJours(dernierJour, 6);
  const avec = etatsFsrs(journal, { retention: 0.9, examen }).get('u1');
  const sans = etatsFsrs(journal, { retention: 0.9 }).get('u1');
  expect(avec?.echeance).toBe(ajouterJours(dernierJour, 3));
  // La boîte se dérive de la stabilité, que le plafond ne touche pas.
  expect(avec?.boite).toBe(sans?.boite);
  expect(avec?.justes).toBe(sans?.justes);
  // Le jour qui compte est celui de la réponse : une réponse plus tardive, même examen, plafonne
  // sur son propre écart.
  const tard = [...journal, repAMidi(5, 'u1', true, ajouterJours(dernierJour, 100))];
  const loin = ajouterJours(dernierJour, 102);
  expect(etatsFsrs(tard, { retention: 0.9, examen: loin }).get('u1')?.echeance).toBe(
    ajouterJours(dernierJour, 101),
  );
});

it('une faute reste due le jour même, plafond ou non', () => {
  const { journal, dernierJour } = quatreJustes();
  const faute = [...journal, repAMidi(5, 'u1', false, dernierJour)];
  const examen = ajouterJours(dernierJour, 400);
  expect(etatsFsrs(faute, { retention: 0.9, examen }).get('u1')?.echeance).toBe(dernierJour);
});

it('le plafond part du jour que le rejeu retient : un jour local qui recule est ramené', () => {
  const { journal, dernierJour } = quatreJustes();
  // Plus tardive en instant, mais son jour local est la veille : le rejeu la compte au dernier jour.
  const recule = reponseDeTest(
    5,
    'u1',
    true,
    `${ajouterJours(dernierJour, -1)}T23:59:00.000-12:00`,
  );
  const etat = etatsFsrs([...journal, recule], {
    retention: 0.9,
    examen: ajouterJours(dernierJour, 11),
  }).get('u1');
  // 11 jours restent depuis le jour retenu : 5 au plus (12 depuis la veille en donnerait 6).
  expect(etat?.echeance).toBe(ajouterJours(dernierJour, 5));
});

it('les poids par défaut sont ceux que l’on obtient sans rien dire', () => {
  const { journal } = quatreJustes();
  expect(etatsFsrs(journal, { retention: 0.9, parametres: [...FSRS6_DEFAULT_WEIGHTS] })).toEqual(
    etatsFsrs(journal, { retention: 0.9 }),
  );
});

it('des poids donnés changent les échéances', () => {
  const { journal } = quatreJustes();
  // Une première stabilité de « Good » bien plus longue (w[2]) allonge chaque intervalle.
  const poids = [...FSRS6_DEFAULT_WEIGHTS];
  poids[2] = 12;
  const par_defaut = etatsFsrs(journal, { retention: 0.9 }).get('u1');
  const ajuste = etatsFsrs(journal, { retention: 0.9, parametres: poids }).get('u1');
  expect(ajuste?.echeance).not.toBe(par_defaut?.echeance);
  expect((ajuste?.echeance ?? '') > (par_defaut?.echeance ?? '')).toBe(true);
  expect(ajuste?.justes).toBe(4);
});
