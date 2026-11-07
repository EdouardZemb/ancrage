// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../../domaine/cours/cours.fixture.js';
import { preparerCours } from '../../domaine/cours/prepare.js';
import type { CoursServi } from '../../domaine/cours/servi.js';
import {
  ecrirePreferences,
  effacerPreferences,
  lirePreferences,
  type Preferences,
} from './preferences.js';

const ALICE = 'p-alice';
const BERTHE = 'p-berthe';
const cours = preparerCours(coursServiDeTest());
const cle = (personne: string, idCours: string) => `ancrage.preferences.${personne}.${idCours}`;

const PAR_DEFAUT: Preferences = {
  // Le premier module de cartes : le prototype disait « 8 », son premier chapitre de cartes.
  cartes: { chapitre: CHAPITRE_1, sens: 'mix', saisie: true },
  quiz: { chapitre: CHAPITRE_1, sens: 'mix' },
  mots: { mode: 'mix' },
  examen: { chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 30, chrono: true, avecModules: true },
  schemas: { schema: 'sc000001', mode: 'benennen' },
  textes: { indice: 0 },
  exercices: { famille: 'mix' },
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('preferences', () => {
  it('preferences_par_personne_et_cours_valeurs_par_defaut', () => {
    expect(lirePreferences(ALICE, cours)).toEqual(PAR_DEFAUT);

    const choisies: Preferences = {
      cartes: { chapitre: CHAPITRE_2, sens: 'inverse', saisie: false },
      quiz: { chapitre: 'tous', sens: 'direct' },
      mots: { mode: 'bilden' },
      examen: { chapitres: [CHAPITRE_2], taille: 50, chrono: false, avecModules: false },
      schemas: { schema: 'sc000001', mode: 'zeigen' },
      textes: { indice: 1 },
      exercices: { famille: 'plural' },
    };
    ecrirePreferences(ALICE, cours.cours.id, choisies);

    expect(JSON.parse(localStorage.getItem(cle(ALICE, cours.cours.id)) ?? 'null')).toEqual(
      choisies,
    );
    expect(lirePreferences(ALICE, cours)).toEqual(choisies);
    // Une autre personne sur le même appareil, ou un autre cours : les valeurs par défaut.
    expect(lirePreferences(BERTHE, cours)).toEqual(PAR_DEFAUT);
    const autreCours = preparerCours({ ...coursServiDeTest(), id: 'cs000002' });
    expect(lirePreferences(ALICE, autreCours)).toEqual(PAR_DEFAUT);
  });

  it('preferences_inconnues_du_cours_remplacees_par_defaut', () => {
    // Le contenu a changé depuis : un chapitre, un schéma, une taille ou une famille ont disparu.
    localStorage.setItem(
      cle(ALICE, cours.cours.id),
      JSON.stringify({
        cartes: { chapitre: 'mc000099', sens: 'rueckwaerts', saisie: 'oui' },
        quiz: { chapitre: CHAPITRE_2 },
        mots: { mode: 'zerlegen' },
        examen: { chapitres: [CHAPITRE_2, 'mc000099', CHAPITRE_1], taille: 40, chrono: false },
        schemas: { schema: 'sc000099', mode: 'lernen' },
        textes: { indice: 2 },
        exercices: { famille: 'endung' },
      }),
    );

    expect(lirePreferences(ALICE, cours)).toEqual({
      cartes: { chapitre: CHAPITRE_1, sens: 'mix', saisie: true },
      quiz: { chapitre: CHAPITRE_2, sens: 'mix' },
      mots: { mode: 'zerlegen' },
      // Les chapitres connus seulement, dans l'ordre du cours.
      examen: { chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 30, chrono: false, avecModules: true },
      schemas: { schema: 'sc000001', mode: 'lernen' },
      textes: { indice: 0 },
      exercices: { famille: 'mix' },
    });

    localStorage.setItem(cle(ALICE, cours.cours.id), 'pas du JSON');
    expect(lirePreferences(ALICE, cours)).toEqual(PAR_DEFAUT);
    localStorage.setItem(cle(ALICE, cours.cours.id), '[1, 2]');
    expect(lirePreferences(ALICE, cours)).toEqual(PAR_DEFAUT);
  });

  it('preferences_d_un_cours_sans_ces_modules', () => {
    const servi = coursServiDeTest();
    const sansModules: CoursServi = {
      ...servi,
      modules: servi.modules.filter((module) => module.type === 'morphologie'),
    };
    expect(lirePreferences(ALICE, preparerCours(sansModules))).toEqual({
      ...PAR_DEFAUT,
      cartes: { chapitre: 'tous', sens: 'mix', saisie: true },
      quiz: { chapitre: 'tous', sens: 'mix' },
      examen: { chapitres: [], taille: 0, chrono: true, avecModules: true },
      schemas: { schema: '', mode: 'benennen' },
    });
  });

  it('effacer_preferences_ne_touche_que_les_siennes', () => {
    ecrirePreferences(ALICE, 'cs000001', PAR_DEFAUT);
    ecrirePreferences(BERTHE, 'cs000002', PAR_DEFAUT);
    localStorage.setItem('ancrage.appareil', '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17');
    localStorage.setItem('ancrage.preferencesX', 'autre');
    localStorage.setItem('autre.application', 'garde');

    effacerPreferences();

    expect(localStorage.getItem(cle(ALICE, 'cs000001'))).toBeNull();
    expect(localStorage.getItem(cle(BERTHE, 'cs000002'))).toBeNull();
    expect(localStorage.length).toBe(3);
    expect(localStorage.getItem('ancrage.appareil')).toBe('4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17');
    expect(localStorage.getItem('ancrage.preferencesX')).toBe('autre');
    expect(localStorage.getItem('autre.application')).toBe('garde');
  });

  it('effacer_preferences_sauf_celles_d_une_personne', () => {
    // Une autre personne se connecte : les préférences de la précédente disparaissent (Review
    // Focus 3), celles de la personne qui arrive restent.
    ecrirePreferences(ALICE, 'cs000001', PAR_DEFAUT);
    ecrirePreferences(ALICE, 'cs000002', PAR_DEFAUT);
    ecrirePreferences(BERTHE, 'cs000001', PAR_DEFAUT);
    // Un identifiant qui commence comme celui d'Alice n'est pas le sien.
    ecrirePreferences(`${ALICE}x`, 'cs000001', PAR_DEFAUT);
    localStorage.setItem('ancrage.appareil', '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17');

    effacerPreferences(BERTHE);

    expect(localStorage.getItem(cle(ALICE, 'cs000001'))).toBeNull();
    expect(localStorage.getItem(cle(ALICE, 'cs000002'))).toBeNull();
    expect(localStorage.getItem(cle(`${ALICE}x`, 'cs000001'))).toBeNull();
    expect(localStorage.getItem(cle(BERTHE, 'cs000001'))).not.toBeNull();
    expect(localStorage.getItem('ancrage.appareil')).toBe('4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17');
    expect(localStorage.length).toBe(2);
  });

  it('preferences_sans_stockage_valeurs_par_defaut', () => {
    // Une fenêtre privée, des données bloquées : le stockage refuse tout.
    const refus = () => {
      throw new DOMException('refusé', 'SecurityError');
    };
    vi.stubGlobal('localStorage', {
      getItem: refus,
      setItem: refus,
      removeItem: refus,
      key: refus,
      get length(): number {
        return refus();
      },
    });

    expect(lirePreferences(ALICE, cours)).toEqual(PAR_DEFAUT);
    expect(() => ecrirePreferences(ALICE, cours.cours.id, PAR_DEFAUT)).not.toThrow();
    expect(() => effacerPreferences()).not.toThrow();
  });

  it('preference_feuilles_refusee_sans_element_ferme', () => {
    localStorage.setItem(
      cle(ALICE, cours.cours.id),
      JSON.stringify({ quiz: { chapitre: 'feuilles' } }),
    );
    expect(lirePreferences(ALICE, cours).quiz.chapitre).toBe('feuilles');

    const servi = coursServiDeTest();
    const sansFeuille = preparerCours({
      ...servi,
      modules: servi.modules.filter((module) => module.type !== 'feuille'),
    });
    localStorage.setItem(
      cle(ALICE, sansFeuille.cours.id),
      JSON.stringify({ quiz: { chapitre: 'feuilles' } }),
    );
    expect(lirePreferences(ALICE, sansFeuille).quiz.chapitre).toBe(CHAPITRE_1);
  });
});
