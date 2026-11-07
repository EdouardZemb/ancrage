import { expect, it } from 'vitest';
import type { UniteDeCarte } from '../cartes/unites.js';
import type { EtatUnite } from './etat.js';
import { cartesDifficiles, reussis, statistiquesDeChapitre } from './statistiques.js';

/*
 * Données factices, écrites à la main (invariant 7). Les états sont donnés directement : c'est
 * `etat.test.ts` qui vérifie qu'ils se tirent du journal.
 */

const AUJOURDHUI = '2026-10-17';

function unite(id: string): UniteDeCarte {
  return {
    id,
    carte: id,
    module: 'mc000001',
    numero: 1,
    type: 'b',
    sens: 'direct',
    question: `Frage ${id}`,
    reponse: `Antwort ${id}`,
  };
}

const etat = (boite: number, echeance: string | null, justes: number, fausses: number) =>
  ({ boite, echeance, justes, fausses }) satisfies EtatUnite;

it('statistiques_de_chapitre_comptent_les_boites_les_sures_et_les_dues', () => {
  const unites = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map(unite);
  const etats = new Map<string, EtatUnite>([
    ['u1', etat(1, '2026-10-17', 1, 1)], // boîte 1, due aujourd'hui
    ['u2', etat(2, '2026-10-19', 2, 0)], // boîte 2, pas due
    ['u3', etat(3, '2026-10-01', 3, 0)], // boîte 3, due depuis longtemps
    ['u4', etat(4, '2026-10-30', 4, 0)], // boîte 4, sûre
    ['u5', etat(5, '2026-11-02', 5, 0)], // boîte 5, sûre
    ['u6', etat(5, '2026-10-17', 6, 0)], // boîte 5, sûre et due
    // u7 et u8 : jamais répondues, neuves.
  ]);

  const stats = statistiquesDeChapitre(unites, etats, AUJOURDHUI);

  expect(stats).toEqual({
    total: 8,
    boites: [2, 1, 1, 1, 1, 2],
    sures: 3,
    dues: 3,
  });
});

it('statistiques_de_chapitre_sans_unite_sont_a_zero', () => {
  expect(statistiquesDeChapitre([], new Map(), AUJOURDHUI)).toEqual({
    total: 0,
    boites: [0, 0, 0, 0, 0, 0],
    sures: 0,
    dues: 0,
  });
});

it('statistiques_de_chapitre_une_unite_neuve_n_est_pas_due', () => {
  const stats = statistiquesDeChapitre([unite('u1')], new Map(), AUJOURDHUI);

  expect(stats).toEqual({ total: 1, boites: [1, 0, 0, 0, 0, 0], sures: 0, dues: 0 });
});

it('statistiques_de_chapitre_ignorent_les_etats_d_unites_hors_du_chapitre', () => {
  const etats = new Map<string, EtatUnite>([
    ['u1', etat(2, '2026-10-17', 1, 0)],
    ['autre', etat(5, '2026-10-01', 9, 0)],
  ]);

  const stats = statistiquesDeChapitre([unite('u1')], etats, AUJOURDHUI);

  expect(stats).toEqual({ total: 1, boites: [0, 0, 1, 0, 0, 0], sures: 0, dues: 1 });
});

it('cartes_difficiles_triees_par_fautes_moins_trois_dixiemes_des_justes', () => {
  const unites = ['u1', 'u2', 'u3', 'u4', 'u5'].map(unite);
  const etats = new Map<string, EtatUnite>([
    ['u1', etat(1, '2026-10-17', 0, 2)], // score 2
    ['u2', etat(1, '2026-10-17', 10, 3)], // 3 - 3 = 0
    ['u3', etat(1, '2026-10-17', 0, 5)], // 5
    ['u4', etat(5, '2026-10-17', 20, 1)], // 1 - 6 = -5
    // u5 : jamais fausse, absente de la liste.
    ['u5', etat(5, '2026-10-17', 7, 0)],
  ]);

  const difficiles = cartesDifficiles(unites, etats, 12);

  expect(difficiles.map((d) => d.unite.id)).toEqual(['u3', 'u1', 'u2', 'u4']);
  expect(difficiles[0].etat).toBe(etats.get('u3'));
  expect(difficiles[3].etat).toEqual(etat(5, '2026-10-17', 20, 1));
});

it('cartes_difficiles_les_reussites_n_effacent_qu_une_partie_des_fautes', () => {
  // Le poids d'une réussite est 0,3 : 10 réussites effacent 3 fautes, pas toutes.
  const unites = ['longue', 'petite', 'grande', 'courte'].map(unite);
  const etats = new Map<string, EtatUnite>([
    ['petite', etat(1, '2026-10-17', 0, 1)], // 1
    ['grande', etat(3, '2026-10-17', 10, 5)], // 5 - 3 = 2 : devant « petite »
    ['courte', etat(1, '2026-10-17', 0, 2)], // 2
    ['longue', etat(5, '2026-10-17', 20, 5)], // 5 - 6 = -1 : derrière « courte »
  ]);

  const difficiles = cartesDifficiles(unites, etats, 12);

  expect(difficiles.map((d) => d.unite.id)).toEqual(['grande', 'courte', 'petite', 'longue']);
});

it('cartes_difficiles_limitees_a_n', () => {
  const unites = Array.from({ length: 20 }, (_, i) => unite(`u${String(i).padStart(2, '0')}`));
  const etats = new Map(unites.map((u, i) => [u.id, etat(1, '2026-10-17', 0, i + 1)] as const));

  const douze = cartesDifficiles(unites, etats, 12);

  expect(douze).toHaveLength(12);
  expect(douze[0].unite.id).toBe('u19');
  expect(douze[11].unite.id).toBe('u08');
  expect(cartesDifficiles(unites, etats, 3).map((d) => d.unite.id)).toEqual(['u19', 'u18', 'u17']);
  expect(cartesDifficiles(unites, etats, 0)).toEqual([]);
});

it('cartes_difficiles_a_egalite_gardent_l_ordre_du_cours', () => {
  const unites = ['u1', 'u2', 'u3'].map(unite);
  const etats = new Map(unites.map((u) => [u.id, etat(1, '2026-10-17', 0, 2)] as const));

  expect(cartesDifficiles(unites, etats, 12).map((d) => d.unite.id)).toEqual(['u1', 'u2', 'u3']);
});

it('cartes_difficiles_sans_faute_est_vide', () => {
  const etats = new Map<string, EtatUnite>([['u1', etat(3, '2026-10-17', 4, 0)]]);

  expect(cartesDifficiles([unite('u1'), unite('u2')], etats, 12)).toEqual([]);
  expect(cartesDifficiles([], new Map(), 12)).toEqual([]);
});

it('reussis_compte_les_unites_avec_au_moins_une_reponse_juste', () => {
  const etats = new Map<string, EtatUnite>([
    ['a', etat(2, '2026-10-17', 1, 0)],
    ['b', etat(1, '2026-10-17', 0, 3)], // seulement des fautes : pas réussie
    ['c', etat(5, '2026-10-17', 9, 2)],
    ['hors', etat(5, '2026-10-17', 9, 2)], // pas dans la liste demandée
  ]);

  expect(reussis(['a', 'b', 'c', 'd'], etats)).toBe(2);
  expect(reussis(['a'], etats)).toBe(1);
  expect(reussis(['b', 'd'], etats)).toBe(0);
  expect(reussis([], etats)).toBe(0);
  expect(reussis(['a', 'c'], new Map())).toBe(0);
});
