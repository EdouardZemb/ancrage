import { expect, it } from 'vitest';
import type { PhraseATrous, QuestionAChoix } from '../contenu/modele.js';
import { hasardScripte } from '../hasard.fixture.js';
import { egalOrthographe, FAUX, optionsDeQcm, phraseJuste, trouJuste, VRAI } from './correction.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

it('codes_du_vrai_faux', () => {
  expect(VRAI).toBe('vrai');
  expect(FAUX).toBe('faux');
});

it('orthographe_identique_juste', () => {
  expect(egalOrthographe('Olla magna rotunda', 'Olla magna rotunda')).toBe(true);
});

it('orthographe_casse_differente_fausse', () => {
  expect(egalOrthographe('olla magna rotunda', 'Olla magna rotunda')).toBe(false);
});

it('orthographe_accent_different_faux', () => {
  expect(egalOrthographe('Ödem', 'Odem')).toBe(false);
  expect(egalOrthographe('Ödem', 'Oedem')).toBe(false);
});

it('orthographe_lettre_differente_fausse', () => {
  expect(egalOrthographe('Cervix', 'Zervix')).toBe(false);
});

it('orthographe_espace_final_juste', () => {
  expect(egalOrthographe('  Olla magna \t', 'Olla magna')).toBe(true);
  expect(egalOrthographe('Olla magna', ' Olla magna ')).toBe(true);
});

it('orthographe_espaces_internes_reduits', () => {
  expect(egalOrthographe('Olla   magna \n rotunda', 'Olla magna rotunda')).toBe(true);
  expect(egalOrthographe('Ollamagna', 'Olla magna')).toBe(false);
});

it('orthographe_nfd_juste', () => {
  expect(egalOrthographe('Überfunktion', 'Überfunktion')).toBe(true);
  expect(egalOrthographe('Überfunktion', 'Überfunktion')).toBe(true);
});

it('trou_sans_liste_canonique', () => {
  expect(trouJuste('Zervix', 'Cervix', false)).toBe(true);
  expect(trouJuste('Servix', 'Cervix', false)).toBe(false);
});

it('trou_avec_liste_exact', () => {
  expect(trouJuste('Cervix', 'Cervix', true)).toBe(true);
  expect(trouJuste('Zervix', 'Cervix', true)).toBe(false);
  expect(trouJuste('cervix', 'Cervix', true)).toBe(false);
});

const PHRASE: PhraseATrous = {
  id: 'phr00001',
  texte: '___ liegt über dem ___.',
  reponses: ['Zervix', 'Uterus'],
  statut: 'source',
};

it('phrase_juste_si_tous_ses_trous_le_sont', () => {
  expect(phraseJuste(['Cervix', 'Uterus'], PHRASE, false)).toBe(true);
  expect(phraseJuste(['Cervix', 'Uterus'], PHRASE, true)).toBe(false);
  expect(phraseJuste(['Zervix', 'Uterus'], PHRASE, true)).toBe(true);
});

it('phrase_fausse_si_un_trou_l_est', () => {
  expect(phraseJuste(['Zervix', 'Ovar'], PHRASE, false)).toBe(false);
  expect(phraseJuste(['Ovar', 'Uterus'], PHRASE, false)).toBe(false);
});

it('phrase_fausse_si_le_nombre_de_saisies_differe', () => {
  expect(phraseJuste(['Zervix'], PHRASE, false)).toBe(false);
  expect(phraseJuste(['Zervix', 'Uterus', 'Uterus'], PHRASE, false)).toBe(false);
});

const QCM: QuestionAChoix = {
  id: 'qcm00001',
  question: 'Welcher Buchstabe?',
  reponse: 'a',
  distracteurs: ['b', 'c', 'd'],
  statut: 'source',
};

it('options_de_qcm_contiennent_reponse_et_distracteurs', () => {
  const options = optionsDeQcm(QCM, hasardScripte([], 0.3));

  expect([...options].sort()).toEqual(['a', 'b', 'c', 'd']);
});

it('options_de_qcm_sont_melangees_par_le_hasard', () => {
  expect(optionsDeQcm(QCM, hasardScripte([], 0))).toEqual(['b', 'c', 'd', 'a']);
  expect(optionsDeQcm(QCM, hasardScripte([], 0.99))).toEqual(['a', 'b', 'c', 'd']);
});
