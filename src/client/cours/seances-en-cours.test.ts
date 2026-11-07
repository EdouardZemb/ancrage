import { describe, expect, it } from 'vitest';
import {
  cartesEnCours,
  examenEnCours,
  feuilleEnCours,
  serieCommencee,
  tacheEntamee,
  texteEnCours,
} from './seances-en-cours.js';

describe('seances-en-cours', () => {
  it('serie_sans_reponse_n_est_pas_une_seance', () => {
    expect(serieCommencee({ faites: 0 })).toBe(false);
    expect(serieCommencee({ faites: 1 })).toBe(true);
  });

  it('cartes_finies_ne_sont_plus_une_seance', () => {
    expect(cartesEnCours({ seance: { faites: 2, file: [] } })).toBe(false);
    expect(cartesEnCours({ seance: { faites: 2, file: ['u'] } })).toBe(true);
    expect(cartesEnCours({ seance: { faites: 0, file: ['u'] } })).toBe(false);
  });

  it('examen_remis_n_est_plus_une_seance', () => {
    expect(examenEnCours({ resultat: { note: 4 } })).toBe(false);
    expect(examenEnCours({ resultat: null })).toBe(true);
    expect(examenEnCours(null)).toBe(false);
  });

  it('feuille_sans_reponse_ou_finie_n_est_pas_une_seance', () => {
    expect(feuilleEnCours({ resultats: {}, rang: 0 }, 3)).toBe(false);
    expect(feuilleEnCours({ resultats: { a: true }, rang: 3 }, 3)).toBe(false);
    expect(feuilleEnCours({ resultats: { a: true }, rang: 1 }, 3)).toBe(true);
    expect(feuilleEnCours(null, 3)).toBe(false);
  });

  it('tache_entamee_a_la_valeur_pres', () => {
    // Les formes des tâches : un choix, des cases à remplir, un terme et son rang dans la réserve.
    const initiaux = { a: null, b: ['', ''], c: { place: null, rang: 0.5 } };
    expect(tacheEntamee(initiaux, initiaux)).toBe(false);
    // Un état revenu à l'initial, mais refait : la valeur compte, pas l'objet.
    expect(tacheEntamee({ a: null, b: ['', ''], c: { place: null, rang: 0.5 } }, initiaux)).toBe(
      false,
    );
    expect(tacheEntamee({ ...initiaux, a: 'r' }, initiaux)).toBe(true);
    expect(tacheEntamee({ ...initiaux, b: ['Herz', ''] }, initiaux)).toBe(true);
    expect(tacheEntamee({ ...initiaux, b: [''] }, initiaux)).toBe(true);
    expect(tacheEntamee({ ...initiaux, c: { place: 'x', rang: 0.5 } }, initiaux)).toBe(true);
    expect(tacheEntamee({ ...initiaux, c: { place: null } }, initiaux)).toBe(true);
    expect(tacheEntamee({ ...initiaux, c: [null, 0.5] }, initiaux)).toBe(true);
  });

  it('texte_sans_reponse_ou_au_bilan_n_est_pas_une_seance', () => {
    expect(texteEnCours(null)).toBe(false);
    expect(texteEnCours({ phase: 'jetons', resultats: [], reponses: [] })).toBe(false);
    expect(texteEnCours({ phase: 'jetons', resultats: [true], reponses: [] })).toBe(true);
    // Un texte sans terme commence par ses questions.
    expect(texteEnCours({ phase: 'questions', resultats: [], reponses: [false] })).toBe(true);
    expect(texteEnCours({ phase: 'bilan', resultats: [true], reponses: [false] })).toBe(false);
  });
});
