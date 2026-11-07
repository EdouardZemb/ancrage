import { expect, it } from 'vitest';
import type { Jeton, Question } from '../contenu/modele.js';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { hasardDeterministe } from '../hasard.js';
import {
  estAbreviation,
  jetonsDuModule,
  jetonsDuTexte,
  optionsDeJeton,
  optionsDeQuestion,
  texteReussi,
} from './textes.js';

/* Données factices, écrites à la main (invariant 7). */

const jeton = (id: string, forme: string, sens: string): Jeton => ({ id, forme, sens });

it('abreviation_selon_le_prototype', () => {
  // H:1659 : un point, ou 2 à 6 majuscules (ou chiffres, ou tirets), ou une fin en « -Ca ».
  for (const forme of ['EL', 'TL', 'Msp.', 'Hypo-Ca', 'n. B.', 'z. B.', 'Topf-Ca']) {
    expect(estAbreviation(forme), forme).toBe(true);
  }
  for (const forme of ['Stunde', 'Rahm', 'Gemüse', 'Ca', 'K', 'abc', 'ABCDEFG', 'Aa', '']) {
    expect(estAbreviation(forme), forme).toBe(false);
  }
});

it('abreviation_des_majuscules_et_chiffres', () => {
  expect(estAbreviation('EKG')).toBe(true);
  expect(estAbreviation('ÄÖÜ')).toBe(true);
  expect(estAbreviation('BZ2')).toBe(true);
  expect(estAbreviation('A-B')).toBe(true);
  expect(estAbreviation('AB')).toBe(true);
  expect(estAbreviation('ABCDEF')).toBe(true);
  expect(estAbreviation('A')).toBe(false);
});

const TOUS = [
  jeton('j1', 'EL', 'Esslöffel'),
  jeton('j2', 'TL', 'Teelöffel'),
  jeton('j3', 'Msp.', 'Messerspitze'),
  jeton('j4', 'Min.', 'Minuten'),
  jeton('j5', 'Pfanne', 'Bratgeschirr'),
  jeton('j6', 'Teig', 'Mehlmasse'),
  jeton('j7', 'Rahm', 'Sahne'),
  jeton('j8', 'Wähe', 'Kuchen'),
  // Le même sens qu'un autre jeton : il ne doit pas revenir deux fois.
  jeton('j9', 'Bratgeschirr', 'Bratgeschirr'),
];

it('options_de_jeton_quatre_uniques_dont_le_sens', () => {
  for (const cible of TOUS) {
    for (let graine = 1; graine <= 20; graine++) {
      const options = optionsDeJeton(cible, TOUS, hasardDeterministe(graine));

      expect(options, cible.forme).toHaveLength(4);
      expect(options.filter((o) => o === cible.sens)).toHaveLength(1);
      expect(new Set(options).size).toBe(4);
    }
  }
});

it('options_de_jeton_prefere_les_jetons_de_meme_nature', () => {
  // « EL » est une abréviation : TL, Msp. et Min., trois autres abréviations, la complètent.
  for (let graine = 1; graine <= 30; graine++) {
    const options = optionsDeJeton(TOUS[0], TOUS, hasardDeterministe(graine));

    expect([...options].sort()).toEqual(
      ['Esslöffel', 'Teelöffel', 'Messerspitze', 'Minuten'].sort(),
    );
  }
});

it('options_de_jeton_complete_avec_l_autre_nature', () => {
  // Trois abréviations seulement : la quatrième option est d'un autre genre.
  const peu = [TOUS[0], TOUS[1], TOUS[2], TOUS[4], TOUS[5], TOUS[6]];
  for (let graine = 1; graine <= 30; graine++) {
    const options = optionsDeJeton(peu[0], peu, hasardDeterministe(graine));

    expect(options).toHaveLength(4);
    expect(options).toContain('Teelöffel');
    expect(options).toContain('Messerspitze');
    expect(options).toContain('Esslöffel');
  }
});

it('options_de_jeton_ecarte_le_sens_de_la_reponse_et_les_doublons', () => {
  const peu = [
    jeton('j1', 'Minuten', 'Minuten'),
    jeton('j2', 'Minute', 'Minuten'),
    jeton('j3', 'Gewürz', 'Prise'),
    jeton('j4', 'Pfeffer', 'Prise'),
    jeton('j5', 'Salz', 'Streusalz'),
  ];

  for (let graine = 1; graine <= 30; graine++) {
    const options = optionsDeJeton(peu[0], peu, hasardDeterministe(graine));

    // Trois sens distincts seulement : 3 options, la réponse une fois.
    expect([...options].sort()).toEqual(['Minuten', 'Prise', 'Streusalz']);
  }
});

it('options_de_question_la_reponse_et_ses_trois_distracteurs', () => {
  const question: Question = {
    id: 'k1000001',
    question: 'Was kommt in die Pfanne?',
    reponse: 'Butter',
    distracteurs: ['Wasser', 'Mehl', 'Zucker'],
  };

  for (let graine = 1; graine <= 30; graine++) {
    const options = optionsDeQuestion(question, hasardDeterministe(graine));

    expect([...options].sort()).toEqual(['Butter', 'Mehl', 'Wasser', 'Zucker']);
  }
  const ordres = new Set(
    Array.from({ length: 30 }, (_, graine) =>
      optionsDeQuestion(question, hasardDeterministe(graine)).join('|'),
    ),
  );
  expect(ordres.size).toBeGreaterThan(5);
});

it('options_de_question_ne_modifie_pas_la_question', () => {
  const distracteurs = Object.freeze(['Wasser', 'Mehl', 'Zucker']) as string[];
  const question = Object.freeze({
    id: 'k1000001',
    question: 'Was kommt in die Pfanne?',
    reponse: 'Butter',
    distracteurs,
  });

  optionsDeQuestion(question, hasardDeterministe(4));

  expect(distracteurs).toEqual(['Wasser', 'Mehl', 'Zucker']);
});

it('texte_reussi_a_80_pourcent', () => {
  // 4 réponses justes sur 5 : 80 %, c'est réussi (H:2166 : `>= 0.8`).
  expect(texteReussi([true, true, true, true, false], 0.8)).toBe(true);
  expect(texteReussi([true, true, true, false, false], 0.8)).toBe(false);
  expect(texteReussi([true, true, true, true, true], 0.8)).toBe(true);
  expect(texteReussi([false, false, false, false, false], 0.8)).toBe(false);
  // 8 sur 10 pile, 7 sur 10 non : pas d'erreur d'arrondi à la frontière.
  const huitSurDix = [true, true, true, true, true, true, true, true, false, false];
  const septSurDix = [true, true, true, true, true, true, true, false, false, false];
  expect(texteReussi(huitSurDix, 0.8)).toBe(true);
  expect(texteReussi(septSurDix, 0.8)).toBe(false);
});

it('texte_reussi_suit_le_seuil_du_module', () => {
  const resultats = [true, true, true, false, false];

  expect(texteReussi(resultats, 0.6)).toBe(true);
  expect(texteReussi(resultats, 0.7)).toBe(false);
  expect(texteReussi(resultats, 1)).toBe(false);
  expect(texteReussi([true, true], 1)).toBe(true);
  // À la frontière exacte, 1 sur 3 atteint le tiers.
  expect(texteReussi([true, false, false], 1 / 3)).toBe(true);
});

it('texte_reussi_sans_aucune_reponse_n_est_pas_reussi', () => {
  expect(texteReussi([], 0.8)).toBe(false);
  expect(texteReussi([], 0.1)).toBe(false);
});

it('jetons_du_module_tous_les_jetons_de_tous_les_textes_dans_l_ordre', () => {
  const textes = preparerCours(coursServiDeTest()).textes;
  if (textes === undefined) throw new Error('la fixture a des textes');

  expect(jetonsDuModule(textes).map((j) => j.id)).toEqual([
    'j1000001',
    'j1000002',
    'j1000003',
    'j1000004',
  ]);
  expect(jetonsDuTexte(textes.textes[0]).map((j) => j.forme)).toEqual(['EL', 'Rösti']);
  expect(jetonsDuTexte(textes.textes[1]).map((j) => j.forme)).toEqual(['TL', 'Wähe']);
});

it('jetons_du_module_ignore_les_textes_sans_jeton_et_les_questions', () => {
  const textes = preparerCours(coursServiDeTest()).textes;
  if (textes === undefined) throw new Error('la fixture a des textes');
  const sansJeton = { ...textes.textes[0], segments: [{ texte: 'Nur Text.' }] };

  expect(jetonsDuTexte(sansJeton)).toEqual([]);
  expect(jetonsDuModule({ ...textes, textes: [sansJeton] })).toEqual([]);
  expect(jetonsDuModule({ ...textes, textes: [] })).toEqual([]);
  // Un texte sans jeton n'empêche pas les autres de compter.
  expect(
    jetonsDuModule({ ...textes, textes: [sansJeton, textes.textes[1]] }).map((j) => j.id),
  ).toEqual(['j1000003', 'j1000004']);
});

it('les_jetons_de_la_fixture_donnent_des_options_valides', () => {
  const textes = preparerCours(coursServiDeTest()).textes;
  if (textes === undefined) throw new Error('la fixture a des textes');
  const jetons = jetonsDuModule(textes);

  expect(jetons).toHaveLength(4);
  for (const cible of jetons) {
    const options = optionsDeJeton(cible, jetons, hasardDeterministe(2));
    expect(options.filter((o) => o === cible.sens)).toHaveLength(1);
    expect(new Set(options).size).toBe(options.length);
  }
});
