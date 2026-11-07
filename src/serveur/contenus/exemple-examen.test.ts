import { describe, expect, it } from 'vitest';
import { preparerCours } from '../../domaine/cours/prepare.js';
import { FAUX, VRAI } from '../../domaine/feuilles/correction.js';
import { hasardDeterministe } from '../../domaine/hasard.js';
import type { EtatUnite } from '../../domaine/progression/etat.js';
import {
  composerExamen,
  corrigerExamen,
  noteSuisse,
  type QuestionExamen,
  type ReponseExamen,
  reponseAttendue,
} from '../../domaine/seances/examen.js';
import { idDeLElement } from '../../domaine/seances/feuilles.js';
import { coursDExempleServi } from './exemple.disque.fixture.js';

/*
 * L'examen sur un cours entier, lu sur le disque : le cours d'exemple, `exemple-contenu/kueche`
 * (S1-D6). Ces tests passaient sur le vrai cours depuis le lot 1d, avec les assertions du prototype
 * (`test_app.js`, l.65-83 et l.124-132). Un hasard déterministe rend ces tests stables. Ils
 * tiennent par la taille de l'exemple : sans les modules, un examen ne pose que des cartes (une
 * question par carte) et des mots, et ceux de l'exemple remplissent tout juste sa plus grande
 * taille. Une retouche qui retire une carte ou un mot fait échouer
 * `examen_de_chaque_taille_sans_doublon`, sur une précondition qui le dit.
 */

const GRAINES = [4242, 1, 99];
const AUCUN: ReadonlyMap<string, EtatUnite> = new Map();

const prepare = preparerCours(coursDExempleServi());
const reglages = prepare.examen;
if (reglages === undefined) throw new Error('le cours a un module examen');
const morphologie = prepare.morphologie;
if (morphologie === undefined) throw new Error('le cours a un Wortbaukasten');

const TOUS = prepare.chapitres.map((c) => c.id);

/** L'indice de la bonne option, ou la bonne saisie. */
function bonne(question: QuestionExamen): ReponseExamen {
  const attendue = reponseAttendue(question);
  return question.options === undefined ? attendue : question.options.indexOf(attendue);
}

/** Ce qui identifie une question : deux questions de même clé seraient un doublon. */
function cle(question: QuestionExamen): string {
  switch (question.genre) {
    case 'carte':
      return `carte:${question.unite.carte}`;
    case 'mot':
      return `mot:${question.mot.id}`;
    case 'schema':
      return `schema:${question.schema.points[question.point].id}`;
    case 'jeton':
      return `jeton:${question.jeton.forme}|${question.jeton.sens}`;
    case 'exercice':
      return `exercice:${question.exercice.id}`;
    case 'feuille':
      return `feuille:${idDeLElement(question.element)}`;
  }
}

/** Une question qui se tape : une carte inverse, un exercice, une phrase sans liste ou un mot. */
function seTape(question: QuestionExamen): boolean {
  switch (question.genre) {
    case 'carte':
      return question.unite.sens === 'inverse';
    case 'exercice':
      return true;
    case 'feuille': {
      const { element } = question;
      // Une phrase à liste se choisit dans sa liste : elle ne se tape pas.
      return (
        (element.genre === 'trous' && element.liste === undefined) ||
        element.genre === 'orthographe'
      );
    }
    default:
      return false;
  }
}

describe("cours d'exemple : examen", () => {
  // test_app.js l.65-69 : 20, 30 et 50 questions, sans doublon, tous les chapitres. Les tailles
  // sont celles du module `examen` ; le prototype les fixait à 20, 30 et 50.
  it('examen_de_chaque_taille_sans_doublon', () => {
    const sansModules = new Set(prepare.unites.map((u) => u.carte)).size + morphologie.mots.length;
    expect(
      sansModules,
      "l'exemple doit remplir sa plus grande taille d'examen sans les modules (ses cartes et ses mots)",
    ).toBeGreaterThanOrEqual(Math.max(...reglages.tailles));

    for (const avecModules of [false, true]) {
      for (const taille of reglages.tailles) {
        for (const graine of GRAINES) {
          const examen = composerExamen(
            prepare,
            AUCUN,
            { chapitres: TOUS, taille, avecModules, chrono: true },
            hasardDeterministe(graine),
          );
          const contexte = `${taille} questions, modules ${avecModules}, graine ${graine}`;

          expect(examen.questions, contexte).toHaveLength(taille);
          expect(new Set(examen.questions.map(cle)).size, contexte).toBe(taille);
          expect(examen.chapitres, contexte).toEqual(TOUS);
          // Sans les modules, il n'y a que des cartes et des mots.
          if (!avecModules) {
            for (const q of examen.questions) expect(['carte', 'mot']).toContain(q.genre);
          }
          // Chaque réponse journalisée désigne une unité du cours, une seule fois.
          const unites = corrigerExamen(prepare, examen, []).reponses.map((r) => r.unite);
          expect(new Set(unites).size, contexte).toBe(unites.length);
          for (const unite of unites) expect(prepare.unitesConnues.has(unite), unite).toBe(true);
        }
      }
    }
  });

  // test_app.js l.73-75 : un seul chapitre suffit à un examen, de 20 questions dans le prototype.
  // On prend la plus petite taille du module, et le plus petit chapitre dont les cartes, avec les
  // mots s'il est un chapitre du Wortbaukasten, suffisent à la remplir.
  it('un_chapitre_seul_donne_un_examen_complet', () => {
    const taille = Math.min(...reglages.tailles);
    const parChapitre = TOUS.map((id) => ({
      id,
      questions:
        new Set(prepare.unites.filter((u) => u.module === id).map((u) => u.carte)).size +
        (morphologie.chapitres.includes(id) ? morphologie.mots.length : 0),
    })).filter((c) => c.questions >= taille);
    expect(parChapitre.length).toBeGreaterThan(0);
    const [petit] = parChapitre.sort((a, b) => a.questions - b.questions);

    for (const graine of GRAINES) {
      const sansModules = composerExamen(
        prepare,
        AUCUN,
        { chapitres: [petit.id], taille, avecModules: false, chrono: false },
        hasardDeterministe(graine),
      );
      const avecModules = composerExamen(
        prepare,
        AUCUN,
        { chapitres: [petit.id], taille, avecModules: true, chrono: false },
        hasardDeterministe(graine),
      );

      expect(sansModules.questions, `graine ${graine}`).toHaveLength(taille);
      expect(avecModules.questions, `graine ${graine}`).toHaveLength(taille);
      expect(sansModules.chapitres).toEqual([petit.id]);
      for (const q of sansModules.questions) {
        if (q.genre === 'carte') expect(q.chapitre).toBe(petit.id);
        else expect(q.genre).toBe('mot');
      }
    }
  });

  // test_app.js l.76-83 : 50 questions des chapitres du Wortbaukasten et d'un autre, une sur deux
  // juste : 25 sur 50, la note 3,5.
  it('une_reponse_juste_sur_deux_donne_3_5', () => {
    const autre = TOUS.find((id) => !morphologie.chapitres.includes(id));
    const chapitres = [...morphologie.chapitres, ...(autre === undefined ? [] : [autre])];

    for (const graine of GRAINES) {
      const examen = composerExamen(
        prepare,
        AUCUN,
        { chapitres, taille: 50, avecModules: true, chrono: true },
        hasardDeterministe(graine),
      );
      expect(examen.questions).toHaveLength(50);

      const reponses = examen.questions.map((q, rang) => (rang % 2 === 0 ? bonne(q) : undefined));
      const correction = corrigerExamen(prepare, examen, reponses);

      expect(correction.points, `graine ${graine}`).toBe(25);
      expect(correction.questions).toBe(50);
      expect(correction.note).toBe(3.5);
      expect(correction.note).toBe(noteSuisse(25, 50));
      expect(correction.chapitres).toBe(chapitres.length);
      expect(correction.fautes).toHaveLength(25);
      // Les groupes recomptent les mêmes questions.
      const groupes = [...correction.parGroupe.values()];
      expect(groupes.reduce((n, g) => n + g.total, 0)).toBe(50);
      expect(groupes.reduce((n, g) => n + g.justes, 0)).toBe(25);
    }
  });

  // test_app.js l.124-132 : avec les modules, 50 questions toutes justes donnent 50 sur 50.
  it('examen_avec_modules_50_questions_toutes_justes_50', () => {
    for (const graine of [...GRAINES, 7, 8, 9]) {
      const examen = composerExamen(
        prepare,
        AUCUN,
        { chapitres: TOUS, taille: 50, avecModules: true, chrono: true },
        hasardDeterministe(graine),
      );
      expect(examen.questions).toHaveLength(50);

      const correction = corrigerExamen(prepare, examen, examen.questions.map(bonne));

      expect(correction.points, `graine ${graine}`).toBe(50);
      expect(correction.note).toBe(6);
      expect(correction.fautes).toEqual([]);
      // Une réponse par question, sauf les jetons, qui n'en produisent aucune.
      const jetons = examen.questions.filter((q) => q.genre === 'jeton').length;
      expect(correction.reponses).toHaveLength(50 - jetons);
      expect(correction.reponses.every((r) => r.juste)).toBe(true);
    }
  });

  // test_app.js l.70 et l.130 : chaque question à choix a sa réponse parmi au moins trois options.
  it('options_d_examen_valides', () => {
    for (const avecModules of [false, true]) {
      for (const taille of reglages.tailles) {
        for (const graine of GRAINES) {
          const examen = composerExamen(
            prepare,
            AUCUN,
            { chapitres: TOUS, taille, avecModules, chrono: false },
            hasardDeterministe(graine),
          );

          for (const q of examen.questions) {
            const contexte = `${q.genre} (graine ${graine})`;
            if (q.options === undefined) {
              // Seules se tapent une carte inverse, un exercice sans options, et, d'une feuille,
              // une phrase sans liste ou un mot à corriger.
              expect(seTape(q), contexte).toBe(true);
              continue;
            }
            // Un vrai/faux a ses deux codes, dans l'ordre (F1-D7) ; toute autre question à choix
            // en a au moins trois.
            if (q.genre === 'feuille' && q.element.genre === 'vrai-faux') {
              expect(q.options, contexte).toEqual([VRAI, FAUX]);
            } else {
              expect(q.options.length, contexte).toBeGreaterThanOrEqual(3);
            }
            expect(
              q.options.filter((o) => o === reponseAttendue(q)),
              contexte,
            ).toHaveLength(1);
            expect(new Set(q.options).size, contexte).toBe(q.options.length);
          }
        }
      }
    }
  });

  it('tous_les_genres_de_question_apparaissent_avec_les_modules', () => {
    const genres = new Set<string>();
    const aTaper = new Set<string>();
    for (const graine of GRAINES) {
      const examen = composerExamen(
        prepare,
        AUCUN,
        { chapitres: TOUS, taille: 50, avecModules: true, chrono: false },
        hasardDeterministe(graine),
      );
      for (const q of examen.questions) {
        genres.add(q.genre);
        // À taper : une carte inverse, un exercice sans option, une phrase ou un mot de feuille.
        if (q.options === undefined) aTaper.add(q.genre);
      }
    }

    expect([...genres].sort()).toEqual(['carte', 'exercice', 'feuille', 'jeton', 'mot', 'schema']);
    expect(aTaper.has('carte')).toBe(true);
  });

  it('les_mots_ne_viennent_qu_avec_un_chapitre_du_wortbaukasten', () => {
    const horsMorphologie = TOUS.filter((id) => !morphologie.chapitres.includes(id));
    expect(horsMorphologie.length).toBeGreaterThan(0);

    const motsDe = (chapitres: string[], graine: number): number =>
      composerExamen(
        prepare,
        AUCUN,
        { chapitres, taille: 50, avecModules: true, chrono: false },
        hasardDeterministe(graine),
      ).questions.filter((q) => q.genre === 'mot').length;

    for (const graine of GRAINES) {
      expect(motsDe(horsMorphologie, graine), `graine ${graine}`).toBe(0);
    }
    // Un tirage sur huit environ est un mot : sur trois examens de 50, il y en a.
    expect(GRAINES.reduce((n, graine) => n + motsDe(TOUS, graine), 0)).toBeGreaterThan(0);
  });

  it('duree_de_l_examen_selon_les_reglages_du_module', () => {
    for (const taille of reglages.tailles) {
      const examen = composerExamen(
        prepare,
        AUCUN,
        { chapitres: TOUS, taille, avecModules: true, chrono: true },
        hasardDeterministe(4242),
      );

      expect(examen.minutes).toBe(
        Math.max(
          reglages.minutesMinimum,
          Math.round((examen.questions.length * reglages.secondesParQuestion) / 60),
        ),
      );
      expect(examen.chrono).toBe(true);
    }
  });

  it('examen_laisse_sans_reponse_note_un_et_journalise_tout_en_faux', () => {
    const examen = composerExamen(
      prepare,
      AUCUN,
      { chapitres: TOUS, taille: reglages.tailleParDefaut, avecModules: true, chrono: false },
      hasardDeterministe(4242),
    );

    const correction = corrigerExamen(prepare, examen, []);

    expect(correction.points).toBe(0);
    expect(correction.note).toBe(1);
    expect(correction.fautes).toHaveLength(examen.questions.length);
    expect(correction.reponses.every((r) => !r.juste)).toBe(true);
  });
});
