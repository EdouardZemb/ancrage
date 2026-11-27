import { expect, it } from 'vitest';
import type { PaireAppariee, PhraseATrous, QuestionAChoix } from '../contenu/modele.js';
import {
  explicationDe,
  explicationDuDistracteur,
  explicationsApresLeChoix,
  explicationsDErgebnis,
} from './explications.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

const TEXTE = 'Der Murmelkrat lebt im Wald und frisst Moos.';

const QUESTION: QuestionAChoix = {
  id: 'fb000071',
  question: 'Was frisst der Murmelkrat?',
  reponse: 'Moos',
  distracteurs: ['Steine', 'Wolken', 'Sand'],
  explication: TEXTE,
  // Dans le désordre : l'ordre rendu est celui de `distracteurs`.
  explicationsDistracteurs: {
    Wolken: 'Wolken sind zu hoch für ihn.',
    Steine: 'Steine sind zu hart.',
  },
  statut: 'source',
};

const PHRASE: PhraseATrous = {
  id: 'fb000072',
  texte: 'Der Murmelkrat frisst ___.',
  reponses: ['Moos'],
  explication: 'Moos wächst im Wald.',
  statut: 'source',
};

const PAIRE: PaireAppariee = {
  id: 'fb000073',
  terme: 'Murmelkrat',
  cible: 'Wald',
  explication: 'Er lebt im Wald.',
  statut: 'source',
};

const SANS_RIEN: QuestionAChoix = {
  id: 'fb000074',
  question: 'Was frisst der Murmelkrat?',
  reponse: 'Moos',
  distracteurs: ['Steine', 'Wolken', 'Sand'],
  statut: 'source',
};

const AVEC = (champs: Record<string, unknown>): QuestionAChoix =>
  ({ ...QUESTION, ...champs }) as QuestionAChoix;

it('explication_d_un_element_rend_son_texte_ou_rien', () => {
  expect(explicationDe(QUESTION)).toBe(TEXTE);
  expect(explicationDe(PHRASE)).toBe('Moos wächst im Wald.');
  expect(explicationDe(PAIRE)).toBe('Er lebt im Wald.');
  const sansCle: Record<string, unknown> = { ...QUESTION };
  delete sansCle.explication;
  expect(explicationDe(sansCle as unknown as QuestionAChoix)).toBeUndefined();
  for (const valeur of ['', '   ', 42, null, {}]) {
    expect(explicationDe(AVEC({ explication: valeur }))).toBeUndefined();
  }
});

it('explication_du_distracteur_ne_lit_que_ses_propres_cles', () => {
  expect(explicationDuDistracteur(QUESTION, 'Steine')).toBe('Steine sind zu hart.');
  expect(explicationDuDistracteur(QUESTION, 'Sand')).toBeUndefined();
  expect(explicationDuDistracteur(QUESTION, 'Moos')).toBeUndefined();
  const avecReponse = AVEC({ explicationsDistracteurs: { Moos: 'Das ist die Antwort.' } });
  expect(explicationDuDistracteur(avecReponse, 'Moos')).toBeUndefined();
  // Une clé héritée n'est pas une clé écrite : la valeur est un texte, seul `hasOwn` la refuse.
  const heritee = AVEC({ explicationsDistracteurs: Object.create({ Steine: 'Geerbt.' }) });
  expect(explicationDuDistracteur(heritee, 'Steine')).toBeUndefined();
  const heriteDeObject = AVEC({ distracteurs: ['toString', 'a', 'b'] });
  expect(explicationDuDistracteur(heriteDeObject, 'toString')).toBeUndefined();
  const zero = AVEC({ distracteurs: ['0', 'a', 'b'], explicationsDistracteurs: ['Ein Text'] });
  expect(explicationDuDistracteur(zero, '0')).toBeUndefined();
  expect(
    explicationDuDistracteur(AVEC({ ...zero, explicationsDistracteurs: 'x' }), '0'),
  ).toBeUndefined();
  const sansObjet: Record<string, unknown> = { ...QUESTION };
  delete sansObjet.explicationsDistracteurs;
  expect(
    explicationDuDistracteur(sansObjet as unknown as QuestionAChoix, 'Steine'),
  ).toBeUndefined();
  for (const objet of [null, 'x', 42]) {
    expect(
      explicationDuDistracteur(AVEC({ explicationsDistracteurs: objet }), 'Steine'),
    ).toBeUndefined();
  }
  for (const valeur of [42, '  ']) {
    const q = AVEC({ explicationsDistracteurs: { Steine: valeur } });
    expect(explicationDuDistracteur(q, 'Steine')).toBeUndefined();
  }
});

it('apres_un_choix_l_explication_du_choix_puis_celle_de_la_reponse', () => {
  const choix = 'Wolken sind zu hoch für ihn.';
  expect(explicationsApresLeChoix(QUESTION, 'Wolken', true)).toStrictEqual({
    choix,
    reponse: TEXTE,
  });
  expect(explicationsApresLeChoix(QUESTION, 'Sand', true)).toStrictEqual({ reponse: TEXTE });
  expect(explicationsApresLeChoix(QUESTION, 'Wolken', false)).toStrictEqual({ choix });
  expect(explicationsApresLeChoix(QUESTION, 'Moos', true)).toStrictEqual({ reponse: TEXTE });
  expect(explicationsApresLeChoix(QUESTION, 'Moos', false)).toBeUndefined();
  expect(explicationsApresLeChoix(SANS_RIEN, 'Wolken', true)).toBeUndefined();
});

it('ergebnis_donne_la_reponse_toujours_et_les_distracteurs_apres_une_faute', () => {
  expect(explicationsDErgebnis(QUESTION, null)).toStrictEqual({ reponse: TEXTE, distracteurs: [] });
  expect(explicationsDErgebnis(QUESTION, { juste: true })).toStrictEqual({
    reponse: TEXTE,
    distracteurs: [],
  });
  expect(explicationsDErgebnis(QUESTION, { juste: false })).toStrictEqual({
    reponse: TEXTE,
    distracteurs: [
      { distracteur: 'Steine', texte: 'Steine sind zu hart.' },
      { distracteur: 'Wolken', texte: 'Wolken sind zu hoch für ihn.' },
    ],
  });
  expect(explicationsDErgebnis(PHRASE, { juste: false })).toStrictEqual({
    reponse: 'Moos wächst im Wald.',
    distracteurs: [],
  });
  expect(explicationsDErgebnis(PAIRE, null)).toStrictEqual({
    reponse: 'Er lebt im Wald.',
    distracteurs: [],
  });
  const sansReponse: Record<string, unknown> = { ...QUESTION };
  delete sansReponse.explication;
  const q = sansReponse as unknown as QuestionAChoix;
  expect(explicationsDErgebnis(q, { juste: false })).toStrictEqual({
    distracteurs: [
      { distracteur: 'Steine', texte: 'Steine sind zu hart.' },
      { distracteur: 'Wolken', texte: 'Wolken sind zu hoch für ihn.' },
    ],
  });
  expect(explicationsDErgebnis(q, null)).toBeUndefined();
  expect(explicationsDErgebnis(q, { juste: true })).toBeUndefined();
  expect(explicationsDErgebnis(SANS_RIEN, { juste: false })).toBeUndefined();
});
