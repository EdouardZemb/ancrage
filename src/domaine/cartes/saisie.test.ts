import { expect, it } from 'vitest';
import { canonique } from './reponses.js';
import { jugerLaCarte } from './saisie.js';
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

it('ue_et_une_lettre_fausse_sur_un_terme_de_cinq_caractères_est_fausse_de_peu', () => {
  const u = inverse('e1', 'définition neuf', 'Kübal');
  const { index } = avecIndex(u);
  expect(jugerLaCarte('Kuebel', u, index)).toEqual(PRESQUE);
});

it('un_recto_ponctué_saisi_exactement_est_juste_sans_frappe', () => {
  const u = inverse('f1', 'définition dix', 'Ka.erlitum', ['Ka.erlitam']);
  const { index } = avecIndex(u);
  expect(jugerLaCarte('Ka.erlitum', u, index)).toEqual(JUSTE);
});

it('le_recto_ponctué_d_une_autre_carte_voisine_d_une_lettre_est_faux', () => {
  const autre = inverse('g1', 'définition onze', 'Ka.erlitum');
  const u = inverse('g2', 'définition douze', 'Ka.erlitom');
  const { index } = avecIndex(autre, u);
  expect(jugerLaCarte('Ka.erlitum', u, index)).toEqual(PRESQUE);
});

it('une_saisie_exacte_n_est_jamais_une_frappe_même_avec_une_voisine_admise_hors_de_l_index', () => {
  const directe: UniteDeCarte = {
    ...six,
    id: 'h1',
    sens: 'direct',
    reponse: 'Murmelkrat/Murmelkrot',
  };
  expect(jugerLaCarte('Murmelkrat', directe, new Map())).toEqual(JUSTE);
});

it('un_tréma_oublié_est_juste_et_signalé_quelle_que_soit_la_longueur', () => {
  const u = inverse('i1', 'définition treize', 'Kübo');
  const v = inverse('i2', 'définition quatorze', 'Mäbel');
  const w = inverse('i3', 'définition quinze', 'Zörna');
  const { index } = avecIndex(u, v, w);
  expect(jugerLaCarte('Kubo', u, index)).toEqual(FRAPPE);
  expect(jugerLaCarte('Mabel', v, index)).toEqual(FRAPPE);
  expect(jugerLaCarte('Zorna', w, index)).toEqual(FRAPPE);
});

it('un_tréma_en_trop_est_juste_et_signalé', () => {
  const u = inverse('j1', 'définition seize', 'Kubo');
  const { index } = avecIndex(u);
  expect(jugerLaCarte('Kübo', u, index)).toEqual(FRAPPE);
});

it('deux_termes_de_l_index_qui_ne_diffèrent_que_par_un_tréma_ne_se_confondent_pas', () => {
  const a = inverse('k1', 'définition dix-sept', 'Kübo');
  const b = inverse('k2', 'définition dix-huit', 'Kubo');
  const { index } = avecIndex(a, b);
  expect(jugerLaCarte('Kubo', a, index)).toEqual(PRESQUE);
  expect(jugerLaCarte('Kübo', b, index)).toEqual(PRESQUE);
  expect(jugerLaCarte('Kübo', a, index)).toEqual(JUSTE);
});

it('une_saisie_sans_tréma_vide_ou_étrangère_reste_fausse', () => {
  const u = inverse('l1', 'définition dix-neuf', 'Kübo');
  const { index } = avecIndex(u);
  expect(jugerLaCarte('', u, index)).toEqual(FAUX);
  expect(jugerLaCarte('Kabo', u, index)).toEqual(PRESQUE);
});

it('le_tréma_oublié_joue_sur_une_seule_des_réponses_admises', () => {
  const u = inverse('m1', 'définition vingt', 'Kübo', ['Zarnik']);
  const { index } = avecIndex(u);
  expect(jugerLaCarte('Kubo', u, index)).toEqual(FRAPPE);
});
