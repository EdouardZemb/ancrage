import { expect, it } from 'vitest';
import type { PhraseATrous, Tache } from '../contenu/modele.js';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import { type ModuleServiDe, preparerCours } from '../cours/prepare.js';
import { FAUX, VRAI } from '../feuilles/correction.js';
import { hasardScripte, poidsObserves } from '../hasard.fixture.js';
import type { EtatUnite } from '../progression/etat.js';
import {
  type ElementTirable,
  elementsTirables,
  GENRES_FERMES,
  GENRES_TIRABLES,
  idDeLElement,
  optionsDeLElement,
  questionFermee,
  reponseDeLElement,
  saisieJuste,
  type Tirable,
} from './feuilles.js';

/* Données factices, écrites à la main (invariant 7). */

const FEUILLES: ModuleServiDe<'feuille'>[] = preparerCours(coursServiDeTest()).feuilles;
const TOUS = elementsTirables(FEUILLES, GENRES_TIRABLES);
const FERMES = elementsTirables(FEUILLES, GENRES_FERMES);
/** Le QCM, les deux affirmations, la phrase à un trou sans liste, le mot à corriger. */
const [QCM, VRAIE, FAUSSE, TROU, MOT] = TOUS.map(({ element }) => element);
const ETATS = new Map<string, EtatUnite>();

const etat = (boite: number): EtatUnite => ({
  boite,
  echeance: '2026-10-20',
  justes: 1,
  fausses: 0,
});

const ids = (tirables: readonly Tirable[]) => tirables.map(({ element }) => idDeLElement(element));

/** Une feuille d'une seule partie, faite des tâches données. */
function feuilleDe(...taches: Tache[]): ModuleServiDe<'feuille'> {
  return {
    type: 'feuille',
    id: 'fe000009',
    numero: 9,
    titre: 'Unit 9 – Übungsblatt',
    parties: [{ titre: 'Teil A: Ergänzen', taches }],
  };
}

const LISTE = ['Herz', 'Leber', 'Niere'];
const NIERE: PhraseATrous = {
  id: 'fb000091',
  texte: 'Die ___ bildet den Harn.',
  reponses: ['Niere'],
  statut: 'source',
};
/** Une phrase à un trou, avec la liste de sa tâche. */
const AVEC_LISTE: ElementTirable = { genre: 'trous', phrase: NIERE, liste: LISTE };

it('elements_tirables_dans_l_ordre_du_papier', () => {
  // Ni la phrase à deux trous `fb000010` (F1-D5), ni les paires, les éléments à classer ou la
  // question ouverte, qui ne se répondent ni d'un choix ni d'un mot.
  expect(ids(TOUS)).toEqual(['fb000007', 'fb000008', 'fb000009', 'fb000011', 'fb000012']);
  expect(TOUS.map(({ element }) => element.genre)).toEqual([
    'qcm',
    'vrai-faux',
    'vrai-faux',
    'trous',
    'orthographe',
  ]);
  expect(TOUS.every(({ feuille }) => feuille === FEUILLES[0])).toBe(true);
  expect(elementsTirables([], GENRES_TIRABLES)).toEqual([]);
});

it('elements_fermes_qcm_et_vrai_faux_seulement', () => {
  expect(ids(FERMES)).toEqual(['fb000007', 'fb000008', 'fb000009']);
  expect(FERMES).toEqual(TOUS.slice(0, 3));
  // Le filtre ne garde que les genres demandés.
  expect(ids(elementsTirables(FEUILLES, ['orthographe', 'trous']))).toEqual([
    'fb000011',
    'fb000012',
  ]);
});

it('phrase_porte_la_liste_de_sa_tache', () => {
  const sansListe: PhraseATrous = { ...NIERE, id: 'fb000092' };
  const feuille = feuilleDe(
    { id: 'fa000091', genre: 'trous', consigne: 'Ergänzen Sie.', liste: LISTE, phrases: [NIERE] },
    { id: 'fa000092', genre: 'trous', consigne: 'Ergänzen Sie.', phrases: [sansListe] },
  );

  const [avec, sans] = elementsTirables([feuille], GENRES_TIRABLES).map(({ element }) => element);

  expect(avec).toStrictEqual(AVEC_LISTE);
  expect(sans).toStrictEqual({ genre: 'trous', phrase: sansListe });
});

it('tache_d_un_genre_inconnu_sans_element_tirable', () => {
  // Une tâche servie par une version suivante n'est pas tirable (F1-D11).
  const inconnue = { id: 'fa000099', genre: 'zeichnen', consigne: 'Zeichnen Sie.' } as unknown;
  expect(elementsTirables([feuilleDe(inconnue as Tache)], GENRES_TIRABLES)).toEqual([]);
});

it('reponse_de_l_element_selon_son_genre', () => {
  // Le texte du QCM, le code du vrai/faux (F1-D7), le trou, la graphie juste.
  expect([QCM, VRAIE, FAUSSE, TROU, MOT].map(reponseDeLElement)).toEqual([
    'über dem Mass',
    VRAI,
    FAUX,
    'tachy-',
    'Tachykardie',
  ]);
  expect(reponseDeLElement(AVEC_LISTE)).toBe('Niere');
});

it('options_de_l_element_selon_son_genre', () => {
  const hasard = hasardScripte([]);
  expect([...(optionsDeLElement(QCM, hasard) ?? [])].sort()).toEqual(
    ['über dem Mass', 'unter dem Mass', 'schnell', 'langsam'].sort(),
  );
  // Un vrai/faux a ses deux codes, dans l'ordre (F1-D7).
  expect(optionsDeLElement(VRAIE, hasard)).toEqual([VRAI, FAUX]);
  expect(optionsDeLElement(FAUSSE, hasard)).toEqual([VRAI, FAUX]);
  // Une phrase à liste se choisit dans sa liste, dans son ordre, une copie.
  const options = optionsDeLElement(AVEC_LISTE, hasard);
  expect(options).toEqual(LISTE);
  expect(options).not.toBe(LISTE);
  // Une phrase sans liste et un mot à corriger se tapent.
  expect(optionsDeLElement(TROU, hasard)).toBeNull();
  expect(optionsDeLElement(MOT, hasard)).toBeNull();
});

it('saisie_juste_selon_son_genre', () => {
  // Un trou sans liste se juge comme une carte (`canonique`, F1-D4).
  expect(saisieJuste(TROU, ' Tachy ')).toBe(true);
  expect(saisieJuste(TROU, 'brady-')).toBe(false);
  // Avec une liste, à l'identique.
  expect(saisieJuste(AVEC_LISTE, 'Niere')).toBe(true);
  expect(saisieJuste(AVEC_LISTE, 'niere')).toBe(false);
  // Un mot à corriger, strictement : seuls les espaces ne comptent pas.
  expect(saisieJuste(MOT, ' Tachykardie ')).toBe(true);
  expect(saisieJuste(MOT, 'tachykardie')).toBe(false);
  // Une question fermée se répond d'un choix : une saisie, même juste, n'y répond pas.
  expect(saisieJuste(QCM, 'über dem Mass')).toBe(false);
  expect(saisieJuste(VRAIE, VRAI)).toBe(false);
});

it('question_fermee_pondere_les_non_sues', () => {
  const etats = new Map([['fb000007', etat(4)]]);
  const poids = poidsObserves(
    5,
    (hasard) => questionFermee(FERMES, etats, hasard).element,
    idDeLElement,
  );
  // Un élément su pèse 1, les deux autres 3 : cinq cases.
  expect(Object.fromEntries(poids)).toEqual({ fb000007: 1, fb000008: 2, fb000009: 2 });
  const toutSu = new Map(ids(FERMES).map((id) => [id, etat(3)]));
  expect(
    poidsObserves(9, (h) => questionFermee(FERMES, toutSu, h).element, idDeLElement).size,
  ).toBe(3);
});

it('question_fermee_pese_trois_sous_la_boite_quatre', () => {
  const sous = new Map([['fb000007', etat(3)]]);
  const poids = poidsObserves(
    9,
    (hasard) => questionFermee(FERMES, sous, hasard).element,
    idDeLElement,
  );
  expect(poids.get('fb000007')).toBe(3);
});

it('vrai_faux_options_dans_l_ordre', () => {
  for (const tirable of FERMES.filter(({ element }) => element.genre === 'vrai-faux')) {
    expect(questionFermee([tirable], ETATS, hasardScripte([0.9])).options).toEqual([VRAI, FAUX]);
  }
});

it('qcm_options_la_reponse_et_les_trois_distracteurs', () => {
  const { element, options } = questionFermee([FERMES[0]], ETATS, hasardScripte([0]));
  expect(element).toBe(FERMES[0].element);
  expect([...options].sort()).toEqual(
    ['über dem Mass', 'unter dem Mass', 'schnell', 'langsam'].sort(),
  );
});

it('question_fermee_vide_leve', () => {
  expect(() => questionFermee([], ETATS, hasardScripte([0]))).toThrow(RangeError);
});
