import { describe, expect, it } from 'vitest';
import { indexerReponses, type Sens, type UniteDeCarte } from '../cartes/unites.js';
import { hasardScripte, poidsObserves } from '../hasard.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { EtatUnite } from '../progression/etat.js';
import { optionsQcm, questionDeQuiz } from './quiz.js';

/* Données factices, écrites à la main (invariant 7). */

function unite(
  id: string,
  sens: Sens,
  type: string,
  question: string,
  reponse: string,
  reponses?: string[],
): UniteDeCarte {
  return {
    id,
    carte: id.replace(':inverse', ''),
    module: 'mc000001',
    numero: 1,
    type,
    sens,
    question,
    reponse,
    ...(reponses === undefined ? {} : { reponses }),
  };
}

const direct = (id: string, type: string, reponse: string) =>
  unite(id, 'direct', type, `Frage ${id}`, reponse);

const etat = (boite: number): EtatUnite => ({
  boite,
  echeance: '2026-10-20',
  justes: 1,
  fausses: 0,
});

describe('optionsQcm', () => {
  const POOL = [
    direct('a1', 'b', 'Organ im Brustkorb'),
    direct('a2', 'b', 'Grosse Drüse'),
    direct('a3', 'b', 'Paariges Organ'),
    direct('a4', 'b', 'Hohlorgan'),
    direct('p1', 'p', 'über dem Mass'),
    direct('p2', 'p', 'unter'),
    direct('p3', 'p', 'schnell'),
  ];
  const INDEX = indexerReponses(POOL);

  it('options_qcm_une_bonne_reponse_et_trois_distracteurs_distincts', () => {
    for (const unite of POOL) {
      const options = optionsQcm(unite, POOL, INDEX, hasardDeterministe(11));

      expect(options, unite.id).toHaveLength(4);
      expect(options.filter((o) => o === unite.reponse)).toHaveLength(1);
      expect(new Set(options).size).toBe(4);
      expect(options.every((o) => POOL.some((p) => p.reponse === o))).toBe(true);
    }
  });

  it('options_qcm_prefere_les_distracteurs_du_meme_type', () => {
    const [a1] = POOL;
    for (let graine = 1; graine <= 30; graine++) {
      const options = optionsQcm(a1, POOL, INDEX, hasardDeterministe(graine));

      // Trois autres unités du type « b » : elles complètent la question avant tout autre type.
      expect([...options].sort()).toEqual(
        ['Organ im Brustkorb', 'Grosse Drüse', 'Paariges Organ', 'Hohlorgan'].sort(),
      );
    }
  });

  it('options_qcm_complete_avec_les_autres_types_quand_le_type_manque', () => {
    const p1 = POOL[4];
    for (let graine = 1; graine <= 30; graine++) {
      const options = optionsQcm(p1, POOL, INDEX, hasardDeterministe(graine));

      // Deux autres « p », puis une unité d'un autre type.
      expect(options).toHaveLength(4);
      expect(options).toContain('unter');
      expect(options).toContain('schnell');
      expect(options.filter((o) => ['über dem Mass', 'unter', 'schnell'].includes(o))).toHaveLength(
        3,
      );
    }
  });

  it('options_qcm_ne_repete_jamais_un_meme_texte', () => {
    const pool = [
      direct('a1', 'b', 'Organ'),
      direct('a2', 'b', 'Drüse'),
      direct('a3', 'b', 'Drüse'),
      direct('a4', 'b', 'Organ'),
      direct('a5', 'p', 'Drüse'),
      direct('a6', 'p', 'Hülle'),
      direct('a7', 'p', 'Gefäss'),
    ];

    for (let graine = 1; graine <= 30; graine++) {
      const options = optionsQcm(pool[0], pool, indexerReponses(pool), hasardDeterministe(graine));

      // « Organ » est la bonne réponse : ses doublons ne sont pas des distracteurs.
      expect(options.filter((o) => o === 'Organ')).toHaveLength(1);
      expect(new Set(options).size).toBe(options.length);
      expect(options).toHaveLength(4);
    }
  });

  it('options_qcm_garde_le_sens_de_la_question', () => {
    const pool = [
      direct('a1', 'b', 'Organ'),
      direct('a2', 'b', 'Drüse'),
      direct('a3', 'b', 'Hülle'),
      direct('a4', 'b', 'Gefäss'),
      unite('a1:inverse', 'inverse', 'b', 'Organ', 'Herz'),
      unite('a2:inverse', 'inverse', 'b', 'Drüse', 'Leber'),
      unite('a3:inverse', 'inverse', 'b', 'Hülle', 'Pleura'),
      unite('a4:inverse', 'inverse', 'b', 'Gefäss', 'Vene'),
    ];
    const index = indexerReponses(pool);

    for (let graine = 1; graine <= 20; graine++) {
      expect([...optionsQcm(pool[0], pool, index, hasardDeterministe(graine))].sort()).toEqual([
        'Drüse',
        'Gefäss',
        'Hülle',
        'Organ',
      ]);
      expect([...optionsQcm(pool[4], pool, index, hasardDeterministe(graine))].sort()).toEqual([
        'Herz',
        'Leber',
        'Pleura',
        'Vene',
      ]);
    }
  });

  it('options_qcm_inverse_sans_distracteur_accepte_par_la_question', () => {
    // Deux cartes ont la même question inverse : chacune accepte la réponse de l'autre.
    const pool = [
      unite('a1:inverse', 'inverse', 'b', 'Kuchenbasis', 'Hefeteig ruhend'),
      unite('a2:inverse', 'inverse', 'b', 'Kuchenbasis', 'Hefeteig'),
      unite('a3:inverse', 'inverse', 'b', 'Gelbe Frucht', 'Zitrus'),
      unite('a4:inverse', 'inverse', 'b', 'Kaltes Getränk', 'Limonade'),
      unite('a5:inverse', 'inverse', 'b', 'Warmes Getränk', 'Tee'),
      unite('a6:inverse', 'inverse', 'b', 'Heisse Suppe', 'Bouillon'),
    ];
    const index = indexerReponses(pool);

    for (let graine = 1; graine <= 40; graine++) {
      const options = optionsQcm(pool[0], pool, index, hasardDeterministe(graine));

      expect(options.filter((o) => o === 'Hefeteig ruhend')).toHaveLength(1);
      expect(options).not.toContain('Hefeteig');
      expect(options).toHaveLength(4);
    }
  });

  it('options_qcm_inverse_exclut_une_reponse_ecrite_autrement', () => {
    // « Citrus » et « Zitrus » comptent pour la même chose (c → z devant i).
    const pool = [
      unite('a1:inverse', 'inverse', 'b', 'Gelbe Frucht', 'Zitrus'),
      unite('a2:inverse', 'inverse', 'b', 'Gelbe Frucht, englisch geschrieben', 'Citrus'),
      unite('a3:inverse', 'inverse', 'b', 'Kaltes Getränk', 'Limonade'),
      unite('a4:inverse', 'inverse', 'b', 'Warmes Getränk', 'Tee'),
      unite('a5:inverse', 'inverse', 'b', 'Heisse Suppe', 'Bouillon'),
      unite('a6:inverse', 'inverse', 'b', 'Süsse Beilage', 'Kompott'),
    ];
    const index = indexerReponses(pool);

    for (let graine = 1; graine <= 40; graine++) {
      const options = optionsQcm(pool[0], pool, index, hasardDeterministe(graine));

      expect(options).not.toContain('Citrus');
      expect(options.filter((o) => o === 'Zitrus')).toHaveLength(1);
      expect(options).toHaveLength(4);
    }
  });

  it('options_qcm_direct_ne_retire_que_les_textes_identiques', () => {
    // Seule une unité inverse écarte les réponses qu'elle accepte (prototype : `acc` n'existe que
    // pour le sens inverse) : pour une directe, « Citrus » reste un distracteur de « Zitrus ».
    const pool = [
      direct('a1', 'b', 'Zitrus'),
      direct('a2', 'b', 'Citrus'),
      direct('a3', 'b', 'Tee'),
      direct('a4', 'b', 'Bouillon'),
    ];

    const options = optionsQcm(pool[0], pool, indexerReponses(pool), hasardDeterministe(2));

    expect([...options].sort()).toEqual(['Bouillon', 'Citrus', 'Tee', 'Zitrus']);
  });

  it('options_qcm_avec_peu_d_unites_rend_moins_de_quatre_options', () => {
    const pool = [
      direct('a1', 'b', 'Organ'),
      direct('a2', 'b', 'Drüse'),
      direct('a3', 'p', 'Hülle'),
    ];

    const options = optionsQcm(pool[0], pool, indexerReponses(pool), hasardDeterministe(1));

    // Comme le prototype : on n'invente pas de distracteur.
    expect([...options].sort()).toEqual(['Drüse', 'Hülle', 'Organ']);
    expect(optionsQcm(pool[0], [pool[0]], indexerReponses(pool), hasardDeterministe(1))).toEqual([
      'Organ',
    ]);
  });

  it('options_qcm_ne_modifie_ni_le_pool_ni_les_reponses_partagees', () => {
    const reponses = Object.freeze(['hyper', 'ueber']) as string[];
    const pool = Object.freeze([
      Object.freeze(unite('a1:inverse', 'inverse', 'p', 'über dem Mass', 'hyper-', reponses)),
      Object.freeze(unite('a2:inverse', 'inverse', 'p', 'unter', 'hypo-')),
      Object.freeze(unite('a3:inverse', 'inverse', 'p', 'schnell', 'tachy-')),
      Object.freeze(unite('a4:inverse', 'inverse', 'p', 'langsam', 'brady-')),
    ]);

    const options = optionsQcm(pool[0], pool, indexerReponses(pool), hasardDeterministe(3));

    expect(options).toHaveLength(4);
    expect(reponses).toEqual(['hyper', 'ueber']);
    expect(pool.map((u) => u.id)).toEqual(['a1:inverse', 'a2:inverse', 'a3:inverse', 'a4:inverse']);
  });
});

describe('questionDeQuiz', () => {
  const A = direct('a', 'b', 'Antwort A');
  const B = direct('b', 'b', 'Antwort B');
  const C = direct('c', 'b', 'Antwort C');
  const D = direct('d', 'b', 'Antwort D');
  const E = direct('e', 'b', 'Antwort E');
  const POOL = [A, B, C, D];

  it('quiz_pondere_par_la_boite', () => {
    const etats = new Map<string, EtatUnite>([
      // Neuve, boîte 3 : poids 3. Boîtes 4 et 5, déjà sues : poids 1.
      ['b', etat(3)],
      ['c', etat(4)],
      ['d', etat(5)],
    ]);

    // La liste pondérée est a a a b b b c d : huit cases.
    const poids = poidsObserves(
      8,
      (hasard) => questionDeQuiz(POOL, etats, new Map(), [...POOL, E], hasard),
      (q) => q.unite.id,
    );

    expect(Object.fromEntries(poids)).toEqual({ a: 3, b: 3, c: 1, d: 1 });
  });

  it('quiz_tire_d_abord_l_unite_puis_les_options', () => {
    const etats = new Map<string, EtatUnite>();

    // Le premier tirage choisit l'unité (3 cases par unité neuve) ; les suivants, les options.
    const q = questionDeQuiz(POOL, etats, new Map(), [...POOL, E], hasardScripte([0.99]));

    expect(q.unite.id).toBe('d');
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain('Antwort D');
  });

  it('quiz_propose_des_options_tirees_du_pool_d_options', () => {
    // Le pool du tirage peut être réduit à un sens ; les options viennent de tout le chapitre.
    const q = questionDeQuiz([A], new Map(), new Map(), [A, B, C, D, E], hasardDeterministe(5));

    expect(q.unite).toBe(A);
    expect(q.options).toHaveLength(4);
    expect(q.options.filter((o) => o === 'Antwort A')).toHaveLength(1);
    expect(
      q.options.every((o) =>
        ['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D', 'Antwort E'].includes(o),
      ),
    ).toBe(true);
  });

  it('quiz_sans_unite_a_tirer_leve_une_erreur_claire', () => {
    expect(() => questionDeQuiz([], new Map(), new Map(), POOL, hasardDeterministe(1))).toThrow(
      RangeError,
    );
  });
});
