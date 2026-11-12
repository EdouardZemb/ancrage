import { describe, expect, it } from 'vitest';
import { alternativesDeCarte, canonique } from '../../domaine/cartes/reponses.js';
import { reponsesAcceptees, type UniteDeCarte } from '../../domaine/cartes/unites.js';
import { idsDeFeuille } from '../../domaine/contenu/feuille.js';
import { ongletsDuCours, preparerCours } from '../../domaine/cours/prepare.js';
import { coursServiUtilisable } from '../../domaine/cours/servi.js';
import { hasardDeterministe } from '../../domaine/hasard.js';
import { statistiquesDeChapitre } from '../../domaine/progression/statistiques.js';
import { construireSeance, unitesDuChoix } from '../../domaine/seances/cartes.js';
import { choisirExercice } from '../../domaine/seances/exercices.js';
import {
  choisirMot,
  motBienForme,
  optionsDeSens,
  tuilesDuMot,
} from '../../domaine/seances/mots.js';
import { optionsQcm, questionDeQuiz } from '../../domaine/seances/quiz.js';
import { tacheDeSchema } from '../../domaine/seances/schemas.js';
import { jetonsDuModule, optionsDeJeton, optionsDeQuestion } from '../../domaine/seances/textes.js';
import { coursDExempleServi } from './exemple.disque.fixture.js';

/*
 * Les tirages des séances sur un cours entier, lu sur le disque : le cours d'exemple,
 * `exemple-contenu/kueche` (S1-D6). Ces tests passaient sur le vrai cours depuis le lot 1d, avec
 * les assertions du prototype (`test_app.js`, l.44-55 et l.104-107). Un hasard déterministe rend
 * ces tests stables.
 */

const AUJOURDHUI = '2026-10-17';
const GRAINES = [4242, 1, 99];

const prepare = preparerCours(coursDExempleServi());

const jetonsDuCours = prepare.textes === undefined ? [] : jetonsDuModule(prepare.textes);

describe("cours d'exemple : cours préparé", () => {
  it('cours_prepare_a_tous_les_modules', () => {
    // Rien n'y fige la taille du contenu : une retouche de l'exemple ne doit pas casser ces tests.
    expect(prepare.chapitres.length).toBeGreaterThan(0);
    expect(prepare.unites.length).toBeGreaterThan(0);
    expect(prepare.morphologie?.mots.length).toBeGreaterThan(0);
    expect(prepare.schemas.length).toBeGreaterThan(0);
    expect(prepare.textes?.textes.length).toBeGreaterThan(0);
    expect(prepare.exercices?.familles.length).toBeGreaterThan(0);
    expect(prepare.feuilles.length).toBeGreaterThan(0);
    expect(prepare.examen).toBeDefined();
    expect(ongletsDuCours(prepare)).toEqual([
      'heute',
      'apercu',
      'cartes',
      'quiz',
      'mots',
      'schemas',
      'textes',
      'exercices',
      'feuilles',
      'examen',
      'progression',
    ]);
  });

  // Le client n'affiche ni ne range un contenu qui n'a pas cette forme (retour arrière) : un cours
  // entier, tel que l'API le sert, doit l'avoir.
  it('cours_d_exemple_servi_utilisable_par_le_client', () => {
    expect(coursServiUtilisable(JSON.parse(JSON.stringify(coursDExempleServi())))).toBe(true);
  });

  it('unites_connues_du_cours', () => {
    const attendues =
      prepare.unites.length +
      (prepare.morphologie?.mots.length ?? 0) +
      prepare.schemas.reduce((n, s) => n + s.points.length, 0) +
      (prepare.textes?.textes.length ?? 0) +
      (prepare.exercices?.familles.reduce((n, f) => n + f.exercices.length, 0) ?? 0) +
      prepare.feuilles.reduce((n, feuille) => n + idsDeFeuille(feuille).length, 0);

    // Chaque identifiant est unique dans le cours (ids.lock) : aucune unité n'en cache une autre.
    expect(prepare.unitesConnues.size).toBe(attendues);
    for (const jeton of jetonsDuCours) expect(prepare.unitesConnues.has(jeton.id)).toBe(false);
  });

  it('chaque_choix_de_la_seance_a_des_unites', () => {
    const choix = [...prepare.chapitres.map((c) => c.id), 'tous'];
    for (const chapitre of choix) {
      expect(unitesDuChoix(prepare, chapitre, 'mix').length, chapitre).toBeGreaterThan(0);
      expect(unitesDuChoix(prepare, chapitre, 'direct').length, chapitre).toBeGreaterThan(0);
    }
    expect(unitesDuChoix(prepare, 'tous', 'inverse').length).toBeGreaterThan(0);
  });

  it('seance_et_statistiques_du_cours_neuf', () => {
    const pool = unitesDuChoix(prepare, 'tous', 'mix');

    const stats = statistiquesDeChapitre(pool, new Map(), AUJOURDHUI);
    const seance = construireSeance(
      pool,
      new Map(),
      AUJOURDHUI,
      prepare.cours.leitner.nouvellesParSeance,
      hasardDeterministe(4242),
    );

    expect(stats.total).toBe(prepare.unites.length);
    expect(stats.boites).toEqual([prepare.unites.length, 0, 0, 0, 0, 0]);
    expect(stats.dues).toBe(0);
    expect(seance.file).toHaveLength(prepare.cours.leitner.nouvellesParSeance);
  });

  // test_app.js l.44-45 : aucune unité inverse ne donne sa réponse dans sa question. Les réponses
  // sont celles de la carte, explicites (`reponses`) ou tirées du recto.
  it('aucune_fuite_dans_les_unites_inverses', () => {
    const inverses = prepare.unites.filter((unite) => unite.sens === 'inverse');
    const fuites = inverses.filter((unite) =>
      [...alternativesDeCarte({ recto: unite.reponse, reponses: unite.reponses })].some(
        (x) => x.length >= 3 && canonique(unite.question).includes(x),
      ),
    );

    expect(inverses.length).toBeGreaterThan(0);
    expect(fuites).toEqual([]);
  });
});

describe("cours d'exemple : quiz", () => {
  // test_app.js l.48-55 : sur toutes les unités, avec un pool du même chapitre, au moins quatre
  // options, la réponse une fois, des options toutes différentes, et pour une inverse, aucun
  // distracteur accepté par la question.
  it('options_qcm_de_toutes_les_unites', () => {
    expect(prepare.unites.length).toBeGreaterThan(0);
    const defectueuses: string[] = [];

    for (const graine of GRAINES) {
      const hasard = hasardDeterministe(graine);
      for (const unite of prepare.unites) {
        const pool = prepare.unites.filter((x) => x.module === unite.module);
        const options = optionsQcm(unite, pool, prepare.index, hasard);
        const acceptees = reponsesAcceptees(unite, prepare.index);
        const defaut =
          options.length < 4 ||
          options.filter((o) => o === unite.reponse).length !== 1 ||
          new Set(options).size !== options.length ||
          (unite.sens === 'inverse' &&
            options.some((o) => o !== unite.reponse && acceptees.has(canonique(o))));
        if (defaut) defectueuses.push(`${unite.id} (graine ${graine})`);
      }
    }

    expect(defectueuses).toEqual([]);
  });

  it('question_de_quiz_sur_chaque_chapitre', () => {
    const hasard = hasardDeterministe(7);
    for (const chapitre of prepare.chapitres) {
      for (const sens of ['mix', 'direct', 'inverse'] as const) {
        const pool = unitesDuChoix(prepare, chapitre.id, sens);
        if (pool.length === 0) continue;
        const { unite, options } = questionDeQuiz(
          pool,
          new Map(),
          prepare.index,
          unitesDuChoix(prepare, chapitre.id, 'mix'),
          hasard,
        );

        expect(pool).toContain(unite);
        expect(options).toContain(unite.reponse);
      }
    }
  });
});

describe("cours d'exemple : textes annotés", () => {
  // test_app.js l.106 : pour chaque jeton, quatre options uniques, le sens exactement une fois.
  it('options_de_jeton_quatre_uniques', () => {
    expect(jetonsDuCours.length).toBeGreaterThan(0);

    for (const graine of GRAINES) {
      const hasard = hasardDeterministe(graine);
      for (const jeton of jetonsDuCours) {
        const options = optionsDeJeton(jeton, jetonsDuCours, hasard);

        expect(options, `${jeton.forme} (graine ${graine})`).toHaveLength(4);
        expect(new Set(options).size).toBe(4);
        expect(options.filter((o) => o === jeton.sens)).toHaveLength(1);
      }
    }
  });

  // test_app.js l.107 : pour chaque question, trois distracteurs, distincts de la réponse.
  it('questions_de_texte_trois_distracteurs', () => {
    const questions = (prepare.textes?.textes ?? []).flatMap((texte) => texte.questions);
    expect(questions.length).toBeGreaterThan(0);

    const hasard = hasardDeterministe(4242);
    for (const question of questions) {
      expect(question.distracteurs, question.question).toHaveLength(3);
      expect(question.distracteurs).not.toContain(question.reponse);
      expect(new Set(question.distracteurs).size).toBe(3);

      const options = optionsDeQuestion(question, hasard);
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options.filter((o) => o === question.reponse)).toHaveLength(1);
    }
  });
});

describe("cours d'exemple : Wortbaukasten, schémas et grammaire", () => {
  it('chaque_mot_a_des_tuiles_et_se_forme', () => {
    const morphologie = prepare.morphologie;
    if (morphologie === undefined) throw new Error('le cours a un Wortbaukasten');
    const hasard = hasardDeterministe(4242);

    for (const mot of morphologie.mots) {
      const siens = mot.segments.map((s) => s.morpheme);
      const tuiles = tuilesDuMot(mot, morphologie.morphemes, hasard);

      expect(new Set(tuiles).size, mot.mot).toBe(tuiles.length);
      for (const id of siens) expect(tuiles, mot.mot).toContain(id);
      expect(motBienForme(mot, siens), mot.mot).toBe(true);
      const inverses = [...siens].reverse();
      if (inverses.join('|') !== siens.join('|')) {
        expect(motBienForme(mot, inverses), mot.mot).toBe(false);
      }
    }
  });

  it('chaque_morpheme_a_quatre_sens_distincts', () => {
    const morphologie = prepare.morphologie;
    if (morphologie === undefined) throw new Error('le cours a un Wortbaukasten');
    const hasard = hasardDeterministe(4242);

    for (const morpheme of morphologie.morphemes) {
      const options = optionsDeSens(morpheme, morphologie.morphemes, hasard);

      expect(options, morpheme.forme).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options.filter((o) => o === morpheme.sens)).toHaveLength(1);
    }
  });

  it('choisir_mot_tire_un_mot_du_cours', () => {
    const mots = prepare.morphologie?.mots ?? [];
    const hasard = hasardDeterministe(4242);

    for (let i = 0; i < 50; i++) expect(mots).toContain(choisirMot(mots, new Map(), hasard));
  });

  it('tache_de_schema_quatre_options_sur_chaque_schema', () => {
    const hasard = hasardDeterministe(4242);

    for (const schema of prepare.schemas) {
      for (let i = 0; i < 20; i++) {
        const tache = tacheDeSchema(schema, new Map(), hasard);

        expect(schema.points[tache.cible], schema.titre).toBeDefined();
        expect(tache.options, schema.titre).toHaveLength(4);
        expect(new Set(tache.options).size).toBe(4);
        expect(tache.options).toContain(tache.cible);
      }
    }
  });

  it('choisir_exercice_dans_chaque_famille', () => {
    const exercices = prepare.exercices;
    if (exercices === undefined) throw new Error('le cours a des exercices');
    const hasard = hasardDeterministe(4242);

    for (const famille of ['mix', ...exercices.familles.map((f) => f.code)]) {
      for (let i = 0; i < 20; i++) {
        const tire = choisirExercice(exercices, new Map(), famille, hasard);

        expect(tire.famille.exercices).toContain(tire.exercice);
        if (famille !== 'mix') expect(tire.famille.code).toBe(famille);
      }
    }
  });
});

describe("cours d'exemple : unités par chapitre", () => {
  it('les_unites_du_choix_couvrent_le_cours_sans_doublon', () => {
    const parChapitre = prepare.chapitres.flatMap((c) => unitesDuChoix(prepare, c.id, 'mix'));
    const ids = (unites: readonly UniteDeCarte[]): string[] => unites.map((u) => u.id);

    expect(ids(parChapitre)).toEqual(ids(prepare.unites));
    expect(new Set(ids(parChapitre)).size).toBe(parChapitre.length);
  });
});
