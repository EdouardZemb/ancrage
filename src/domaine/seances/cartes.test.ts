import { describe, expect, it } from 'vitest';
import type { Sens, UniteDeCarte } from '../cartes/unites.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { hasardDeterministe, melanger } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import { ETAT_NEUF, type EtatUnite, etatDe, etatsDesUnites } from '../progression/etat.js';
import { cartesDifficiles, reussis, statistiquesDeChapitre } from '../progression/statistiques.js';
import {
  apresReponse,
  construireSeance,
  type SeanceCartes,
  seanceDeNouvelles,
  unitesDuChoix,
} from './cartes.js';

/* Données factices, écrites à la main (invariant 7). */

const AUJOURDHUI = '2026-10-17';

function unite(id: string, sens: Sens = 'direct'): UniteDeCarte {
  return {
    id,
    carte: id.replace(':inverse', ''),
    module: CHAPITRE_1,
    numero: 1,
    type: 'b',
    sens,
    question: `Frage ${id}`,
    reponse: `Antwort ${id}`,
  };
}

const unites = (prefixe: string, n: number): UniteDeCarte[] =>
  Array.from({ length: n }, (_, i) => unite(`${prefixe}${String(i + 1).padStart(2, '0')}`));

const etat = (boite: number, echeance: string | null, justes = 1, fausses = 0): EtatUnite => ({
  boite,
  echeance,
  justes,
  fausses,
});

const ids = (liste: readonly UniteDeCarte[]): string[] => liste.map((u) => u.id);

describe('unitesDuChoix', () => {
  const prepare = preparerCours(coursServiDeTest());

  it('unites_du_choix_filtre_par_chapitre_et_par_sens', () => {
    const chapitre1 = ids(unitesDuChoix(prepare, CHAPITRE_1, 'mix'));

    expect(chapitre1).toHaveLength(15);
    expect(chapitre1.every((id) => id.startsWith('c1'))).toBe(true);
    expect(ids(unitesDuChoix(prepare, CHAPITRE_2, 'mix'))).toHaveLength(10);
    expect(ids(unitesDuChoix(prepare, CHAPITRE_1, 'direct'))).toEqual([
      'c1000001',
      'c1000002',
      'c1000003',
      'c1000004',
      'c1000005',
      'c1000006',
      'c1000007',
      'c1000008',
    ]);
    expect(ids(unitesDuChoix(prepare, CHAPITRE_1, 'inverse'))).toEqual([
      'c1000001:inverse',
      'c1000002:inverse',
      'c1000003:inverse',
      'c1000004:inverse',
      'c1000005:inverse',
      'c1000006:inverse',
      'c1000007:inverse',
    ]);
  });

  it('unites_du_choix_tous_les_chapitres_dans_l_ordre_du_cours', () => {
    expect(ids(unitesDuChoix(prepare, 'tous', 'mix'))).toEqual(ids(prepare.unites));
    expect(unitesDuChoix(prepare, 'tous', 'direct').every((u) => u.sens === 'direct')).toBe(true);
    expect(unitesDuChoix(prepare, 'tous', 'inverse')).toHaveLength(
      prepare.unites.filter((u) => u.sens === 'inverse').length,
    );
  });

  it('unites_du_choix_d_un_chapitre_inconnu_est_vide', () => {
    expect(unitesDuChoix(prepare, 'zzzzzzzz', 'mix')).toEqual([]);
  });
});

describe('construireSeance', () => {
  it('seance_dues_melangees_puis_15_nouvelles', () => {
    const neuves = unites('n', 30);
    const dues = [unite('d1'), unite('d2'), unite('d3')];
    const futures = [unite('p1'), unite('p2')];
    const pool = [...neuves, ...futures, ...dues];
    const etats = new Map<string, EtatUnite>([
      ['d1', etat(2, '2026-10-16')],
      ['d2', etat(1, AUJOURDHUI)],
      ['d3', etat(5, '2026-01-02')],
      ['p1', etat(3, '2026-10-18')],
      ['p2', etat(4, '2026-11-01')],
    ]);

    const seance = construireSeance(pool, etats, AUJOURDHUI, 15, hasardDeterministe(3));

    expect(seance.faites).toBe(0);
    expect(seance.justes).toBe(0);
    expect(seance.deLExamen).toBe(false);
    // Les dues d'abord, toutes ; puis 15 neuves distinctes ; aucune unité repoussée.
    expect(seance.file).toHaveLength(3 + 15);
    expect(new Set(ids(seance.file.slice(0, 3)))).toEqual(new Set(['d1', 'd2', 'd3']));
    const suite = ids(seance.file.slice(3));
    expect(new Set(suite).size).toBe(15);
    expect(suite.every((id) => id.startsWith('n'))).toBe(true);
    // Mêmes tirages que le prototype : les dues mélangées, puis les neuves mélangées et coupées.
    const hasard = hasardDeterministe(3);
    expect(ids(seance.file)).toEqual([
      ...ids(melanger(dues, hasard)),
      ...ids(melanger(neuves, hasard).slice(0, 15)),
    ]);
  });

  it('seance_melange_les_dues_et_les_neuves', () => {
    const neuves = unites('n', 30);
    const dues = unites('d', 8);
    const etats = new Map(dues.map((u) => [u.id, etat(1, '2026-10-01')] as const));
    const pool = [...dues, ...neuves];

    const a = construireSeance(pool, etats, AUJOURDHUI, 15, hasardDeterministe(1));
    const b = construireSeance(pool, etats, AUJOURDHUI, 15, hasardDeterministe(2));

    expect(ids(a.file.slice(0, 8))).not.toEqual(ids(dues));
    expect(ids(a.file)).not.toEqual(ids(b.file));
    expect(new Set(ids(a.file.slice(0, 8)))).toEqual(new Set(ids(dues)));
    expect(new Set(ids(b.file.slice(0, 8)))).toEqual(new Set(ids(dues)));
  });

  it('seance_rend_toutes_les_neuves_quand_il_y_en_a_moins_que_la_limite', () => {
    const neuves = unites('n', 4);

    const seance = construireSeance(neuves, new Map(), AUJOURDHUI, 15, hasardDeterministe(1));

    expect(new Set(ids(seance.file))).toEqual(new Set(ids(neuves)));
    expect(seance.file).toHaveLength(4);
  });

  it('seance_respecte_le_nombre_de_nouvelles_du_cours', () => {
    const neuves = unites('n', 30);

    const seance = construireSeance(neuves, new Map(), AUJOURDHUI, 5, hasardDeterministe(1));

    expect(seance.file).toHaveLength(5);
  });

  it('seance_sans_rien_a_faire_est_vide', () => {
    const repoussees = unites('p', 3);
    const etats = new Map(repoussees.map((u) => [u.id, etat(3, '2026-11-01')] as const));

    const seance = construireSeance(repoussees, etats, AUJOURDHUI, 15, hasardDeterministe(1));

    expect(seance).toEqual({ file: [], faites: 0, justes: 0, deLExamen: false });
    expect(construireSeance([], new Map(), AUJOURDHUI, 15, hasardDeterministe(1)).file).toEqual([]);
  });

  it('seance_ne_modifie_ni_le_pool_ni_les_reponses_partagees', () => {
    const inverse = {
      ...unite('c9999999:inverse', 'inverse'),
      reponses: Object.freeze(['a', 'b']) as string[],
    };
    const pool = Object.freeze([...unites('n', 20), Object.freeze(inverse)]);

    const seance = construireSeance(pool, new Map(), AUJOURDHUI, 15, hasardDeterministe(5));

    expect(seance.file.length).toBe(15);
    expect(pool).toHaveLength(21);
    expect(inverse.reponses).toEqual(['a', 'b']);
  });
});

describe('seanceDeNouvelles', () => {
  it('seance_de_nouvelles_reprend_tout_quand_il_n_y_en_a_plus', () => {
    const pool = unites('u', 20);
    const toutesRepondues = new Map(pool.map((u) => [u.id, etat(1, '2026-10-17')] as const));

    const seance = seanceDeNouvelles(pool, toutesRepondues, 15, hasardDeterministe(4));

    // Plus aucune neuve : 15 unités tirées parmi toutes, comme le prototype (H:1760-1764).
    expect(ids(seance.file)).toEqual(ids(melanger(pool, hasardDeterministe(4)).slice(0, 15)));
    expect(new Set(ids(seance.file)).size).toBe(15);
    expect(seance).toMatchObject({ faites: 0, justes: 0, deLExamen: false });
  });

  it('seance_de_nouvelles_ne_prend_que_les_neuves_quand_il_y_en_a', () => {
    const repondues = unites('r', 16);
    const neuves = unites('n', 4);
    const etats = new Map(repondues.map((u) => [u.id, etat(2, '2026-10-20')] as const));

    const seance = seanceDeNouvelles([...repondues, ...neuves], etats, 15, hasardDeterministe(4));

    expect(new Set(ids(seance.file))).toEqual(new Set(ids(neuves)));
    expect(seance.file).toHaveLength(4);
  });

  it('seance_de_nouvelles_se_limite_au_nombre_demande', () => {
    const neuves = unites('n', 40);

    expect(seanceDeNouvelles(neuves, new Map(), 15, hasardDeterministe(4)).file).toHaveLength(15);
    expect(seanceDeNouvelles(neuves, new Map(), 7, hasardDeterministe(4)).file).toHaveLength(7);
  });

  it('seance_de_nouvelles_d_un_petit_pool_rend_tout_le_pool', () => {
    const pool = unites('u', 6);
    const etats = new Map(pool.map((u) => [u.id, etat(1, '2026-10-17')] as const));

    expect(new Set(ids(seanceDeNouvelles(pool, etats, 15, hasardDeterministe(4)).file))).toEqual(
      new Set(ids(pool)),
    );
    expect(seanceDeNouvelles([], new Map(), 15, hasardDeterministe(4)).file).toEqual([]);
  });
});

describe('apresReponse', () => {
  const seance = (): SeanceCartes => ({
    file: [unite('a'), unite('b'), unite('c')],
    faites: 0,
    justes: 0,
    deLExamen: false,
  });

  it('faux_remet_l_unite_en_fin_de_file', () => {
    const avant = seance();

    const apres = apresReponse(avant, false);

    expect(ids(apres.file)).toEqual(['b', 'c', 'a']);
    expect(apres.faites).toBe(1);
    expect(apres.justes).toBe(0);
    // L'ancienne séance n'est pas modifiée.
    expect(ids(avant.file)).toEqual(['a', 'b', 'c']);
    expect(avant.faites).toBe(0);
  });

  it('juste_retire_l_unite_de_la_file', () => {
    const apres = apresReponse(seance(), true);

    expect(ids(apres.file)).toEqual(['b', 'c']);
    expect(apres.faites).toBe(1);
    expect(apres.justes).toBe(1);
  });

  it('la_file_se_vide_apres_autant_de_justes_que_d_unites', () => {
    let courante = seance();
    for (const juste of [true, false, true, true]) courante = apresReponse(courante, juste);

    // a juste ; b faux et remise en fin ; c juste ; b juste.
    expect(courante.file).toEqual([]);
    expect(courante.faites).toBe(4);
    expect(courante.justes).toBe(3);
  });

  it('apres_reponse_garde_l_origine_de_l_examen', () => {
    const delExamen: SeanceCartes = { ...seance(), deLExamen: true };

    expect(apresReponse(delExamen, true).deLExamen).toBe(true);
    expect(apresReponse(delExamen, false).deLExamen).toBe(true);
  });

  it('une_file_vide_reste_inchangee', () => {
    const vide: SeanceCartes = { file: [], faites: 3, justes: 2, deLExamen: false };

    expect(apresReponse(vide, true)).toEqual(vide);
    expect(apresReponse(vide, false)).toEqual(vide);
  });
});

describe('contenu modifié sous une progression existante', () => {
  const LEITNER = { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 };

  function reponse(n: number, unite: string, juste: boolean, jour: string): Evenement {
    return {
      id: `01929f3a-5b3c-7000-8000-${String(n).padStart(12, '0')}`,
      cours: 'cs000001',
      unite,
      type: 'reponse',
      resultat: { juste },
      repondu_a: `${jour}T10:00:00.000+02:00`,
      appareil: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      v: 1,
    };
  }

  it('unite_retiree_ignoree_carte_nouvelle_neuve', () => {
    const prepare = preparerCours(coursServiDeTest());
    const journal = [
      reponse(1, 'c1000001', true, '2026-10-16'),
      reponse(2, 'c1000002', false, '2026-10-16'),
      reponse(3, 'c2000001', true, '2026-10-10'),
    ];
    // Ce que le journal a gardé de cartes, mots et points que le contenu n'a plus.
    const retirees = [
      reponse(4, 'zz000001', false, '2026-10-16'),
      reponse(5, 'zz000001', false, '2026-10-16'),
      reponse(6, 'zz000002:inverse', true, '2026-10-01'),
      reponse(7, 'zz000003', false, '2026-10-17'),
    ];
    const sansRetirees = etatsDesUnites(journal, LEITNER);
    const avecRetirees = etatsDesUnites([...journal, ...retirees], LEITNER);
    const pool = unitesDuChoix(prepare, 'tous', 'mix');

    // Le journal cite bien des unités absentes du contenu.
    expect(avecRetirees.has('zz000001')).toBe(true);
    expect(prepare.unitesConnues.has('zz000001')).toBe(false);
    // Les statistiques, la séance et les unités difficiles ne changent pas, sans erreur.
    expect(statistiquesDeChapitre(pool, avecRetirees, AUJOURDHUI)).toEqual(
      statistiquesDeChapitre(pool, sansRetirees, AUJOURDHUI),
    );
    expect(construireSeance(pool, avecRetirees, AUJOURDHUI, 15, hasardDeterministe(9))).toEqual(
      construireSeance(pool, sansRetirees, AUJOURDHUI, 15, hasardDeterministe(9)),
    );
    expect(cartesDifficiles(pool, avecRetirees, 12)).toEqual(
      cartesDifficiles(pool, sansRetirees, 12),
    );
    expect(reussis([...prepare.unitesConnues], avecRetirees)).toBe(
      reussis([...prepare.unitesConnues], sansRetirees),
    );
    expect(ids(seanceDeNouvelles(pool, avecRetirees, 15, hasardDeterministe(9)).file)).toEqual(
      ids(seanceDeNouvelles(pool, sansRetirees, 15, hasardDeterministe(9)).file),
    );

    // Une carte nouvelle du contenu, que le journal n'a jamais vue, est neuve.
    expect(etatDe(avecRetirees, 'c2000005')).toEqual(ETAT_NEUF);
    const stats = statistiquesDeChapitre(pool, avecRetirees, AUJOURDHUI);
    expect(stats.total).toBe(25);
    expect(stats.boites[0]).toBe(25 - 3);
    const seance = construireSeance(pool, avecRetirees, AUJOURDHUI, 100, hasardDeterministe(9));
    expect(ids(seance.file)).toContain('c2000005');
    expect(ids(seance.file)).not.toContain('zz000001');
  });
});
