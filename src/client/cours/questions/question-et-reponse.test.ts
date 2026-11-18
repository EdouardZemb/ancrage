import { expect, it } from 'vitest';
import { coursAvecChampsDeCarte, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { preparerCours } from '../../../domaine/cours/prepare.js';
import { type Posable, posablesDuCours } from '../../../domaine/seances/heute.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { questionEtReponse } from './question-et-reponse.js';

/* Données factices, écrites à la main (invariant 7). */

const t = TEXTES_COURS.de;

function cours() {
  const prepare = preparerCours(coursServiDeTest());
  return { prepare, posables: posablesDuCours(prepare) };
}

function ligne(id: string) {
  const { prepare, posables } = cours();
  const posable = posables.find((p: Posable) => p.id === id);
  if (posable === undefined) throw new Error(`aucun posable ${id}`);
  return questionEtReponse(posable, t, prepare.unites);
}

it('une_carte_rend_l_invite_et_la_reponse_de_son_sens', () => {
  expect(ligne('c1000001')).toEqual({ question: 'Herz', reponse: 'Organ im Brustkorb' });
  expect(ligne('c1000001:inverse')).toEqual({ question: 'Organ im Brustkorb', reponse: 'Herz' });
});

it('une_carte_rend_son_aide_et_la_carte_confondue', () => {
  const avecAide = coursAvecChampsDeCarte(coursServiDeTest(), 'c1000001', {
    aide: 'Herz pumpt.',
    confonduAvec: 'c1000002',
  });
  const prepare = preparerCours(avecAide);
  const herz = posablesDuCours(prepare).find((p) => p.id === 'c1000001');
  if (herz === undefined) throw new Error('Herz absente');

  expect(questionEtReponse(herz, t, prepare.unites).aide).toEqual({
    texte: 'Herz pumpt.',
    confusion: { recto: 'Leber', verso: 'Grosse Drüse im Oberbauch' },
  });
});

it('un_mot_rend_le_mot_son_sens_et_ses_morceaux', () => {
  expect(ligne('w0000001')).toEqual({
    question: 'Gastritis',
    reponse: 'Schmerz im Oberbauch',
    aide: { texte: 'Gastr·itis' },
  });
});

it('un_point_rend_son_sens_son_terme_le_titre_du_schema_et_sa_note', () => {
  expect(ligne('q0000002')).toEqual({
    question: 'Zentrum des Organs',
    reponse: 'Mitte',
    indication: 'Das Musterorgan',
    aide: { texte: 'Übungsschema ohne Vorbild' },
  });
});

it('un_exercice_rend_son_enonce_et_la_reponse_que_sa_question_montre', () => {
  // Un article est suivi de son mot, comme dans le verdict de la question.
  expect(ligne('e1000001')).toEqual({ question: '___ Musterus', reponse: 'der Musterus' });
});

it('une_question_a_choix_rend_son_enonce_et_sa_bonne_option', () => {
  expect(ligne('fb000007')).toEqual({
    question: 'Was bedeutet hyper-?',
    reponse: 'über dem Mass',
  });
});

it('un_vrai_faux_rend_le_libelle_de_sa_bonne_option_jamais_le_code_et_sa_correction', () => {
  expect(ligne('fb000008')).toEqual({
    question: 'Die Milz filtert das Blut.',
    reponse: t.feuille_richtig,
  });
  expect(ligne('fb000009')).toEqual({
    question: 'Der Magen ist ein paariges Organ.',
    reponse: t.feuille_falsch,
    aide: { texte: 'Der Magen ist ein Hohlorgan.' },
  });
});
