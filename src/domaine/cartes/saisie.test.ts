import { expect, it } from 'vitest';
import { canonique } from './reponses.js';
import { jugerLaCarte, LONGUEUR_TOLEREE } from './saisie.js';
import { type IndexDesReponses, indexerReponses, type UniteDeCarte } from './unites.js';

/** Une unité inverse inventée : la question est la définition, la réponse le terme. */
function inverse(id: string, question: string, reponse: string, reponses?: string[]): UniteDeCarte {
  return {
    id: `${id}:inverse`,
    carte: id,
    module: 'm1',
    numero: 1,
    type: 'v',
    sens: 'inverse',
    question,
    reponse,
    ...(reponses === undefined ? {} : { reponses }),
  };
}
function avecIndex(...unites: UniteDeCarte[]): { index: IndexDesReponses } {
  return { index: indexerReponses(unites) };
}
const FAUX = { juste: false, presque: false, frappe: false };
const PRESQUE = { juste: false, presque: true, frappe: false };
const JUSTE = { juste: true, presque: false, frappe: false };
const FRAPPE = { juste: true, presque: false, frappe: true };

const six = inverse('a1', 'définition un', 'Bornav');
const cinq = inverse('a2', 'définition deux', 'Borna');
const dix = inverse('a3', 'définition trois', 'Bornavelitis');
const tableau = inverse('a4', 'définition quatre', 'Grünbau');

it('la_longueur_tolerée_est_six', () => {
  expect(LONGUEUR_TOLEREE).toBe(6);
});

it('une_saisie_exacte_est_juste_sans_frappe', () => {
  const { index } = avecIndex(six);
  expect(jugerLaCarte('bornav', six, index)).toEqual(JUSTE);
  expect(jugerLaCarte('  Bornav ', six, index)).toEqual(JUSTE);
});

it('ue_pour_ü_est_juste_sans_frappe_sur_un_terme_court_et_long', () => {
  const court = inverse('b1', 'définition cinq', 'Büb');
  const { index } = avecIndex(court, tableau);
  expect(jugerLaCarte('Bueb', court, index)).toEqual(JUSTE);
  expect(jugerLaCarte('Gruenbau', tableau, index)).toEqual(JUSTE);
  expect(jugerLaCarte('Grünbau', tableau, index)).toEqual(JUSTE);
});

it('une_lettre_changée_en_trop_ou_en_moins_est_une_frappe_à_six_caractères', () => {
  const { index } = avecIndex(six);
  expect(jugerLaCarte('Bornov', six, index)).toEqual(FRAPPE);
  expect(jugerLaCarte('Bornave', six, index)).toEqual(FRAPPE);
  expect(jugerLaCarte('Borna', six, index)).toEqual(FRAPPE);
});

it('la_même_faute_sur_cinq_caractères_est_fausse_de_peu', () => {
  const { index } = avecIndex(cinq);
  expect(jugerLaCarte('Barna', cinq, index)).toEqual(PRESQUE);
  expect(jugerLaCarte('Bornaa', cinq, index)).toEqual(PRESQUE);
  expect(jugerLaCarte('Born', cinq, index)).toEqual(PRESQUE);
});

it('deux_lettres_échangées_restent_fausses', () => {
  const { index } = avecIndex(dix, six);
  // Dix caractères ou plus : « presque » comme avant.
  expect(jugerLaCarte('Bornavelitsi', dix, index)).toEqual(PRESQUE);
  // Six à neuf caractères : rien.
  expect(jugerLaCarte('Bornva', six, index)).toEqual(FAUX);
});

it('deux_termes_voisins_de_l_index_ne_se_confondent_pas', () => {
  const a = inverse('c1', 'définition six', 'Torvanel', ['Zelmira']);
  const b = inverse('c2', 'définition sept', 'Torvanex');
  const { index } = avecIndex(a, b);
  expect(jugerLaCarte('Torvanex', a, index)).toEqual(PRESQUE);
  expect(jugerLaCarte('Torvanel', b, index)).toEqual(PRESQUE);
  expect(jugerLaCarte('Torvanel', a, index)).toEqual(JUSTE);
});

it('la_tolérance_joue_sur_une_réponse_admise_par_reponses', () => {
  const u = inverse('d1', 'définition huit', 'Primavel', ['Sekundavel']);
  const { index } = avecIndex(u);
  expect(jugerLaCarte('Sekundavil', u, index)).toEqual(FRAPPE);
  expect(jugerLaCarte('Primavil', u, index)).toEqual(FRAPPE);
});

it('une_saisie_vide_est_fausse', () => {
  const { index } = avecIndex(six);
  expect(jugerLaCarte('', six, index)).toEqual(FAUX);
  expect(jugerLaCarte('   ', six, index)).toEqual(FAUX);
});

it('une_unité_directe_sans_index_se_juge_sur_son_repli', () => {
  const directe: UniteDeCarte = {
    ...six,
    id: 'a1',
    sens: 'direct',
    question: 'Bornave',
    reponse: 'Définition longue',
  };
  expect(jugerLaCarte('Definition longue', directe, new Map())).toEqual(FRAPPE);
});

it('une_saisie_vide_ne_vaut_pas_même_si_l_index_admet_le_vide', () => {
  const index: IndexDesReponses = new Map([[canonique(six.question), new Set([''])]]);
  expect(jugerLaCarte('', six, index)).toEqual(FAUX);
});
