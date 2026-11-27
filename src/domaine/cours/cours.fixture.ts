import {
  ID_MANUEL_ALPHA,
  ID_MANUEL_BETA,
  REGLAGES_DE_L_EXAMEN,
} from '../contenu/exemple.fixture.js';
import type { Carte, Etat, Exercice, Morpheme, Mot, PointDeSchema } from '../contenu/modele.js';
import type { CoursServi, ModuleServi } from './servi.js';

/*
 * Un petit cours servi, valide et entièrement factice, écrit à la main (invariant 7). Il a un
 * module de chaque type, sauf un deuxième module de cartes, et sa feuille a une tâche de chaque
 * genre. Les tests en retirent des modules pour exercer chaque cas. Les identifiants sont bien
 * formés (8 caractères parmi 0-9 et a-z, sans i, l, o ni u) et propres à ce cours.
 */

export const CHAPITRE_1 = 'mc000001';
export const CHAPITRE_2 = 'mc000002';
export const SCHEMA_2 = 'sc000002';
export const ID_MANUEL_GAMMA = 'd9p4q6sv';
/** Un identifiant bien formé qu'aucun manuel du cours ne porte. */
export const ID_MANUEL_INCONNU = 'epas79zz';

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

/**
 * Le cours de test avec trois manuels inventés, « Lehrbuch Alpha », « Lehrbuch Beta » et
 * « Lehrbuch Gamma » (cité par aucun module). `CHAPITRE_1` est au chapitre 2 de Beta, Unit 1 ;
 * `CHAPITRE_2` au chapitre 1 de Beta, Unit 2 ; le schéma est dans Alpha ; un second schéma,
 * `SCHEMA_2`, n'a pas de manuel et porte trois points, le premier cinq.
 */
export function coursAvecManuels(): CoursServi {
  const servi = coursServiDeTest();
  const rangements = new Map([
    [CHAPITRE_1, { manuel: ID_MANUEL_BETA, chapitre: 2, unit: 1 }],
    [CHAPITRE_2, { manuel: ID_MANUEL_BETA, chapitre: 1, unit: 2 }],
  ]);
  const modules = servi.modules.flatMap((module): ModuleServi[] => {
    if (module.type === 'cartes') return [{ ...module, ...rangements.get(module.id) }];
    if (module.type !== 'schema') return [module];
    const second = {
      ...module,
      id: SCHEMA_2,
      titre: 'Das zweite Muster',
      points: module.points.slice(0, 3).map((p) => ({ ...p, id: p.id.replace('q', 'r') })),
    };
    return [{ ...module, manuel: ID_MANUEL_ALPHA }, second];
  });
  const manuels = [
    { id: ID_MANUEL_ALPHA, titre: 'Lehrbuch Alpha' },
    { id: ID_MANUEL_BETA, titre: 'Lehrbuch Beta' },
    { id: ID_MANUEL_GAMMA, titre: 'Lehrbuch Gamma' },
  ];
  return { ...servi, manuels, modules };
}

/** `coursAvecManuels()`, dont `CHAPITRE_2` nomme un manuel bien formé que le cours ne connaît pas. */
export function coursAvecChapitreAuManuelInconnu(): CoursServi {
  const servi = coursAvecManuels();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.id === CHAPITRE_2 ? { ...module, manuel: ID_MANUEL_INCONNU } : module,
    ),
  };
}

/**
 * Le cours servi dont la carte `id` gagne ces champs, tels quels : une aide, un terme confondu, ou
 * une valeur illisible qu'une version suivante pourrait servir (M6).
 */
export function coursAvecChampsDeCarte(
  servi: CoursServi,
  id: string,
  champs: Record<string, unknown>,
): CoursServi {
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'cartes'
        ? {
            ...module,
            cartes: module.cartes.map((carte) =>
              carte.id === id ? { ...carte, ...champs } : carte,
            ),
          }
        : module,
    ),
  };
}

/** Le cours, chaque carte avec une aide inventée tirée de son identifiant (« Merkhilfe <id> »). */
export function coursAvecUneAideParCarte(servi: CoursServi): CoursServi {
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'cartes'
        ? {
            ...module,
            cartes: module.cartes.map((carte) => ({ ...carte, aide: `Merkhilfe ${carte.id}` })),
          }
        : module,
    ),
  };
}

/** Le cours servi dont l'élément de feuille `id` gagne ces champs, tels quels (M10). */
export function coursAvecChampsDElement(
  servi: CoursServi,
  id: string,
  champs: Record<string, unknown>,
): CoursServi {
  const avec = (element: { id: string }) =>
    element.id === id ? { ...element, ...champs } : element;
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'feuille'
        ? {
            ...module,
            parties: module.parties.map((partie) => ({
              ...partie,
              taches: partie.taches.map((tache) => {
                switch (tache.genre) {
                  case 'appariement':
                    return { ...tache, paires: tache.paires.map(avec) };
                  case 'qcm':
                    return { ...tache, questions: tache.questions.map(avec) };
                  case 'trous':
                    return { ...tache, phrases: tache.phrases.map(avec) };
                  default:
                    return tache;
                }
              }),
            })),
          }
        : module,
    ),
  } as CoursServi;
}

/** Les explications inventées du cours de test (M10-D10), par identifiant d'élément. */
export const EXPLICATIONS_DE_TEST: Readonly<Record<string, Record<string, unknown>>> = {
  fb000007: {
    explication: 'Der Murmelkrat misst immer zu viel, also darüber.',
    explicationsDistracteurs: {
      schnell: 'Schnell ist der Zimbolwesp, nicht der Murmelkrat.',
      'unter dem Mass': 'Darunter liegt nur der Grunwurm.',
    },
  },
  fb000010: { explication: 'Die Lücken füllt der Brummelkopf von links nach rechts.' },
  fb000001: { explication: 'Der Gnurpel zeigt immer auf das erste Paar.' },
};

/** Le cours servi avec `EXPLICATIONS_DE_TEST` : `fb000007`, `fb000010` et `fb000001`. */
export function coursAvecExplications(servi: CoursServi): CoursServi {
  return Object.entries(EXPLICATIONS_DE_TEST).reduce(
    (cours, [id, champs]) => coursAvecChampsDElement(cours, id, champs),
    servi,
  );
}
