import { REGLAGES_DE_L_EXAMEN } from '../contenu/exemple.fixture.js';
import type { Carte, Etat, Exercice, Morpheme, Mot, PointDeSchema } from '../contenu/modele.js';
import type { CoursServi } from './servi.js';

/*
 * Un petit cours servi, valide et entièrement factice, écrit à la main (invariant 7). Il a un
 * module de chaque type, sauf un deuxième module de cartes, et sa feuille a une tâche de chaque
 * genre. Les tests en retirent des modules pour exercer chaque cas. Les identifiants sont bien
 * formés (8 caractères parmi 0-9 et a-z, sans i, l, o ni u) et propres à ce cours.
 */

export const CHAPITRE_1 = 'mc000001';
export const CHAPITRE_2 = 'mc000002';

/** Une carte `source`, avec ses réponses acceptées en plus s'il y en a. */
export function carte(
  id: string,
  type: string,
  recto: string,
  verso: string,
  reponses?: string[],
): Carte {
  return {
    id,
    type,
    recto,
    verso,
    statut: 'source',
    ...(reponses === undefined ? {} : { reponses }),
  };
}

function morpheme(id: string, categorie: Morpheme['categorie'], forme: string, sens: string) {
  return { id, categorie, forme, sens, statut: 'source' } satisfies Morpheme;
}

function mot(id: string, texte: string, segments: [string, string][], sens: string): Mot {
  return {
    id,
    mot: texte,
    segments: segments.map(([t, m]) => ({ texte: t, morpheme: m })),
    sens,
    statut: 'source',
  };
}

function point(id: string, x: number, y: number, terme: string, sens: string): PointDeSchema {
  return { id, x, y, terme, sens };
}

function exercice(id: string, invite: string, reponse: string, options?: string[]): Exercice {
  return {
    id,
    invite,
    reponse,
    statut: 'source',
    ...(options === undefined ? {} : { options }),
  };
}

/** Un élément de feuille `source`. */
function element<T extends object>(id: string, champs: T): { id: string } & T & Etat {
  return { id, ...champs, statut: 'source' };
}

export function coursServiDeTest(): CoursServi {
  return {
    id: 'cs000001',
    titre: 'Übungskurs',
    langue: 'de',
    typesDeCarte: { b: 'Begriff', p: 'Präfix', q: 'Frage' },
    leitner: { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 },
    modules: [
      {
        type: 'cartes',
        id: CHAPITRE_1,
        numero: 1,
        titre: 'Anfangskapitel',
        cartes: [
          carte('c1000001', 'b', 'Herz', 'Organ im Brustkorb'),
          carte('c1000002', 'b', 'Leber', 'Grosse Drüse im Oberbauch'),
          carte('c1000003', 'b', 'Niere', 'Paariges Organ der Harnbildung'),
          carte('c1000004', 'b', 'Milz', 'Organ der Blutfilterung'),
          carte('c1000005', 'b', 'Magen', 'Hohlorgan der Verdauung'),
          carte('c1000006', 'p', 'hyper-', 'über dem Mass', ['hyper', 'ueber']),
          carte('c1000007', 'p', 'hypo-', 'unter dem Mass'),
          carte('c1000008', 'q', 'Wie viele Kammern hat das Herz?', 'Vier'),
        ],
      },
      {
        type: 'cartes',
        id: CHAPITRE_2,
        numero: 2,
        titre: 'Vorsilben',
        cartes: [
          carte('c2000001', 'p', 'tachy-', 'schnell'),
          carte('c2000002', 'p', 'brady-', 'langsam'),
          carte('c2000003', 'p', 'endo-', 'innen'),
          carte('c2000004', 'p', 'hemi-', 'halb'),
          carte('c2000005', 'p', 'poly-', 'viel'),
        ],
      },
      {
        type: 'morphologie',
        id: 'mm000001',
        titre: 'Baukasten',
        description: 'Rezeptwörter in Teile zerlegen und neu bilden',
        chapitres: [CHAPITRE_2],
        morphemes: [
          morpheme('p0000001', 'p', 'tachy-', 'schnell'),
          morpheme('p0000002', 'p', 'brady-', 'langsam'),
          morpheme('p0000003', 'p', 'hyper-', 'über'),
          morpheme('p0000004', 'p', 'endo-', 'innen'),
          morpheme('s0000001', 's', 'gastr', 'Magen'),
          morpheme('s0000002', 's', 'kard', 'Herz'),
          morpheme('s0000003', 's', 'nephr', 'Niere'),
          morpheme('s0000004', 's', 'hepat', 'Leber'),
          morpheme('x0000001', 'x', '-itis', 'Entzündung'),
          morpheme('x0000002', 'x', '-ektomie', 'Herausschneiden'),
          morpheme('x0000003', 'x', '-pathie', 'Krankheit'),
          morpheme('x0000004', 'x', '-ie', 'Zustand'),
        ],
        mots: [
          mot(
            'w0000001',
            'Gastritis',
            [
              ['Gastr', 's0000001'],
              ['itis', 'x0000001'],
            ],
            'Schmerz im Oberbauch',
          ),
          mot(
            'w0000002',
            'Tachykardie',
            [
              ['Tachy', 'p0000001'],
              ['kard', 's0000002'],
              ['ie', 'x0000004'],
            ],
            'Puls über hundert Schläge',
          ),
          mot(
            'w0000003',
            'Hepatektomie',
            [
              ['Hepat', 's0000004'],
              ['ektomie', 'x0000002'],
            ],
            'Leberentfernung',
          ),
        ],
      },
      {
        type: 'schema',
        id: 'sc000001',
        titre: 'Das Musterorgan',
        description: 'Übungsschema mit fünf Punkten',
        viewbox: '0 0 200 100',
        dessin: '<circle cx="100" cy="50" r="20"/>',
        note: 'Übungsschema ohne Vorbild',
        statut: 'source',
        points: [
          point('q0000001', 40, 30, 'Oberpol', 'oberes Ende'),
          point('q0000002', 100, 50, 'Mitte', 'Zentrum des Organs'),
          point('q0000003', 160, 70, 'Unterpol', 'unteres Ende'),
          point('q0000004', 60, 80, 'Rand', 'äusserer Saum'),
          point('q0000005', 140, 20, 'Spitze', 'oberster Punkt'),
        ],
      },
      {
        type: 'texte-annote',
        id: 'te000001',
        titre: 'Berichte',
        description: 'Kochbegriffe und Zutaten in Rezepten',
        consigne: 'Rezepte zum Lesen – frei erfunden.',
        reussite: 0.8,
        textes: [
          {
            id: 't1000001',
            titre: 'Bericht 1',
            texte: 'Pfanne mit [[EL|Esslöffel|j1000001]] und [[Rösti|Kartoffelgericht|j1000002]].',
            statut: 'source',
            segments: [
              { texte: 'Pfanne mit ' },
              { jeton: { id: 'j1000001', forme: 'EL', sens: 'Esslöffel' } },
              { texte: ' und ' },
              { jeton: { id: 'j1000002', forme: 'Rösti', sens: 'Kartoffelgericht' } },
              { texte: '.' },
            ],
            questions: [
              {
                id: 'k1000001',
                question: 'Was kommt in die Pfanne?',
                reponse: 'Butter',
                distracteurs: ['Wasser', 'Mehl', 'Zucker'],
              },
            ],
          },
          {
            id: 't1000002',
            titre: 'Bericht 2',
            texte: '[[TL|Teelöffel|j1000003]], [[Wähe|Kuchen|j1000004]].',
            statut: 'source',
            segments: [
              { jeton: { id: 'j1000003', forme: 'TL', sens: 'Teelöffel' } },
              { texte: ', ' },
              { jeton: { id: 'j1000004', forme: 'Wähe', sens: 'Kuchen' } },
              { texte: '.' },
            ],
            questions: [],
          },
        ],
      },
      {
        type: 'exercices',
        id: 'ex000001',
        titre: 'Grammatik',
        description: 'Artikel und Plural zum Üben',
        familles: [
          {
            code: 'artikel',
            libelle: 'Artikel',
            exercices: [
              exercice('e1000001', '___ Musterus', 'der', ['der', 'die', 'das']),
              exercice('e1000002', '___ Probela', 'die', ['der', 'die', 'das']),
              exercice('e1000003', '___ Beispielum', 'das', ['der', 'die', 'das']),
            ],
          },
          {
            code: 'plural',
            libelle: 'Plural',
            exercices: [
              exercice('e2000001', 'Plural von «Musterus»?', 'Musteri'),
              exercice('e2000002', 'Plural von «Probela»?', 'Probelae'),
            ],
          },
        ],
      },
      {
        type: 'feuille',
        id: 'fe000001',
        numero: 1,
        titre: 'Unit 1 – Übungsblatt',
        parties: [
          {
            titre: 'Teil A: Zuordnen',
            taches: [
              {
                id: 'fa000001',
                genre: 'appariement',
                consigne: 'Ordnen Sie die Begriffe den Erklärungen zu.',
                paires: [
                  element('fb000001', { terme: 'Herz', cible: 'Organ im Brustkorb' }),
                  element('fb000002', { terme: 'Leber', cible: 'Grosse Drüse im Oberbauch' }),
                  element('fb000003', { terme: 'Niere', cible: 'Organ der Harnbildung' }),
                ],
              },
              {
                id: 'fa000002',
                genre: 'classement',
                consigne: 'Ordnen Sie die Vorsilben zu.',
                categories: ['Tempo', 'Lage'],
                elements: [
                  element('fb000004', { terme: 'tachy-', categorie: 'Tempo' }),
                  element('fb000005', { terme: 'brady-', categorie: 'Tempo' }),
                  element('fb000006', { terme: 'endo-', categorie: 'Lage' }),
                ],
              },
            ],
          },
          {
            titre: 'Teil B: Auswählen',
            taches: [
              {
                id: 'fa000003',
                genre: 'qcm',
                consigne: 'Wählen Sie die richtige Antwort.',
                questions: [
                  element('fb000007', {
                    question: 'Was bedeutet hyper-?',
                    reponse: 'über dem Mass',
                    distracteurs: ['unter dem Mass', 'schnell', 'langsam'],
                  }),
                ],
              },
              {
                id: 'fa000004',
                genre: 'vrai-faux',
                consigne: 'Richtig oder falsch?',
                affirmations: [
                  element('fb000008', { affirmation: 'Die Milz filtert das Blut.', vrai: true }),
                  element('fb000009', {
                    affirmation: 'Der Magen ist ein paariges Organ.',
                    vrai: false,
                    correction: 'Der Magen ist ein Hohlorgan.',
                  }),
                ],
              },
            ],
          },
          {
            titre: 'Teil C: Ergänzen',
            taches: [
              {
                id: 'fa000005',
                genre: 'trous',
                consigne: 'Ergänzen Sie mit den Wörtern der Liste.',
                liste: ['Herz', 'Leber', 'Niere'],
                phrases: [
                  element('fb000010', {
                    texte: 'Das ___ hat vier Kammern, die ___ bildet den Harn.',
                    reponses: ['Herz', 'Niere'],
                  }),
                ],
              },
              {
                id: 'fa000006',
                genre: 'trous',
                consigne: 'Ergänzen Sie.',
                phrases: [
                  element('fb000011', {
                    texte: 'Die Vorsilbe ___ bedeutet schnell.',
                    reponses: ['tachy-'],
                  }),
                ],
              },
              {
                id: 'fa000007',
                genre: 'orthographe',
                consigne: 'Korrigieren Sie die Schreibweise.',
                mots: [element('fb000012', { fautif: 'Tachykardi', reponse: 'Tachykardie' })],
              },
            ],
          },
          {
            titre: 'Teil D: Offene Fragen',
            taches: [
              {
                id: 'fa000008',
                genre: 'ouverte',
                consigne: 'Beantworten Sie die Frage.',
                questions: [
                  element('fb000013', {
                    question: 'Wozu dient die Leber?',
                    reponse: 'Sie verarbeitet Nährstoffe.',
                  }),
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'examen',
        id: 'ey000001',
        titre: 'Probeprüfung',
        tailles: [20, 30, 50],
        tailleParDefaut: 30,
        secondesParQuestion: 45,
        minutesMinimum: 5,
        noteSuffisante: 4,
        seuilChapitre: 0.6,
        // Les seuils du contenu d'exemple, écrits une fois (1f-D4) : `feuille` vaut 0,35.
        tirage: { ...REGLAGES_DE_L_EXAMEN.tirage },
      },
    ],
  };
}

/** Le cours de test, sans les modules de ces types. */
export function coursSans(...types: string[]): CoursServi {
  const servi = coursServiDeTest();
  return { ...servi, modules: servi.modules.filter((module) => !types.includes(module.type)) };
}

/** Le cours de test, dont le module `examen` prend ces réglages. */
export function coursAvecReglages(reglages: Record<string, unknown>): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'examen' ? { ...module, ...reglages } : module,
    ),
  };
}

/**
 * Le cours de test tel que la v0.3.0 l'aurait servi, avant le lot 1d : ni `leitner`, ni `reussite`
 * d'un texte annoté, ni module `examen` ou `feuille`. Un client précaché le reçoit après un retour
 * arrière vers cette version.
 */
export function coursServiParLaV030(): Record<string, unknown> {
  const { leitner: _leitner, ...cours } = coursServiDeTest();
  return {
    ...cours,
    modules: cours.modules
      .filter((module) => module.type !== 'examen' && module.type !== 'feuille')
      .map((module) => {
        if (module.type !== 'texte-annote') return module;
        const { reussite: _reussite, ...sansReussite } = module;
        return sansReussite;
      }),
  };
}
