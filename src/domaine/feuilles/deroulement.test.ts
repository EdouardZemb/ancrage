import { expect, it } from 'vitest';
import { elementsDeTache, idsDeFeuille } from '../contenu/feuille.js';
import type { ModuleFeuille, Tache } from '../contenu/modele.js';
import { examenRemisDeTest, reponseDeTest } from '../evenements.fixture.js';
import {
  dernieresReponses,
  dernieresReponsesDatees,
  etatDeFeuille,
  resultatsDeFeuille,
  scoreDeFeuille,
  tachesADerouler,
} from './deroulement.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

const SOURCE = { statut: 'source' } as const;

const FEUILLE: ModuleFeuille = {
  type: 'feuille',
  id: 'feuil001',
  fichier: 'feuille-1.yaml',
  numero: 1,
  titre: 'Unit 1',
  parties: [
    {
      titre: 'Teil A',
      taches: [
        {
          id: 'tache001',
          genre: 'qcm',
          consigne: 'Wählen Sie.',
          questions: [
            {
              id: 'qcm00001',
              question: 'Q1',
              reponse: 'a',
              distracteurs: ['b', 'c', 'd'],
              ...SOURCE,
            },
            {
              id: 'qcm00002',
              question: 'Q2',
              reponse: 'a',
              distracteurs: ['b', 'c', 'd'],
              ...SOURCE,
            },
          ],
        },
        {
          id: 'tache002',
          genre: 'classement',
          consigne: 'Ordnen Sie zu.',
          categories: ['links', 'rechts'],
          elements: [
            { id: 'cla00001', terme: 'T1', categorie: 'links', ...SOURCE },
            { id: 'cla00002', terme: 'T2', categorie: 'rechts', ...SOURCE },
          ],
        },
      ],
    },
    {
      titre: 'Teil B',
      taches: [
        {
          id: 'tache003',
          genre: 'orthographe',
          consigne: 'Korrigieren Sie.',
          mots: [{ id: 'ort00001', fautif: 'Zervx', reponse: 'Cervix', ...SOURCE }],
        },
        {
          id: 'tache004',
          genre: 'appariement',
          consigne: 'Verbinden Sie.',
          paires: [
            { id: 'app00001', terme: 'T1', cible: 'C1', ...SOURCE },
            { id: 'app00002', terme: 'T2', cible: 'C2', ...SOURCE },
          ],
        },
        {
          id: 'tache005',
          genre: 'vrai-faux',
          consigne: 'Richtig oder falsch?',
          affirmations: [
            { id: 'vra00001', affirmation: 'A1', vrai: true, ...SOURCE },
            { id: 'vra00002', affirmation: 'A2', vrai: false, ...SOURCE },
          ],
        },
        {
          id: 'tache006',
          genre: 'trous',
          consigne: 'Ergänzen Sie.',
          phrases: [
            { id: 'tro00001', texte: '___ eins.', reponses: ['Eins'], ...SOURCE },
            { id: 'tro00002', texte: '___ zwei.', reponses: ['Zwei'], ...SOURCE },
          ],
        },
        {
          id: 'tache007',
          genre: 'ouverte',
          consigne: 'Antworten Sie.',
          questions: [
            { id: 'ouv00001', question: 'Q1', reponse: 'R1', ...SOURCE },
            { id: 'ouv00002', question: 'Q2', reponse: 'R2', ...SOURCE },
          ],
        },
      ],
    },
  ],
};

const T0 = '2026-10-01T10:00:00+02:00';
const T1 = '2026-10-01T11:00:00+02:00';
const T2 = '2026-10-01T12:00:00+02:00';

it('derniere_reponse_l_emporte', () => {
  const dernieres = dernieresReponses([
    reponseDeTest(1, 'qcm00001', false, T1),
    reponseDeTest(2, 'qcm00001', true, T0),
    reponseDeTest(3, 'qcm00002', true, T0),
    reponseDeTest(4, 'qcm00002', false, T2),
  ]);

  expect(dernieres.get('qcm00001')).toBe(false);
  expect(dernieres.get('qcm00002')).toBe(false);
  expect(dernieres.size).toBe(2);
});

it('derniere_reponse_garde_la_juste_si_elle_est_la_plus_recente', () => {
  const dernieres = dernieresReponses([
    reponseDeTest(1, 'qcm00001', false, T0),
    reponseDeTest(2, 'qcm00001', true, T1),
  ]);

  expect(dernieres.get('qcm00001')).toBe(true);
});

it('derniere_reponse_ignore_les_examens', () => {
  const dernieres = dernieresReponses([
    reponseDeTest(1, 'qcm00001', true, T0),
    { ...examenRemisDeTest('cm5r8t23', 2, T1), unite: 'qcm00001' },
    { ...examenRemisDeTest('cm5r8t23', 3, T1), unite: 'qcm00002' },
  ]);

  expect(dernieres.get('qcm00001')).toBe(true);
  expect(dernieres.has('qcm00002')).toBe(false);
});

it('derniere_reponse_compte_un_evenement_en_double_une_fois', () => {
  const premiere = reponseDeTest(1, 'qcm00001', true, T0);
  const dernieres = dernieresReponses([
    reponseDeTest(2, 'qcm00001', false, T1),
    premiere,
    reponseDeTest(1, 'qcm00001', false, T0),
  ]);

  expect(dernieres.get('qcm00001')).toBe(false);
});

it('score_compte_les_dernieres_justes', () => {
  const dernieres = dernieresReponses([
    reponseDeTest(1, 'qcm00001', true, T0),
    reponseDeTest(2, 'qcm00002', true, T0),
    reponseDeTest(3, 'qcm00002', false, T1),
    reponseDeTest(4, 'cla00001', true, T0),
    reponseDeTest(5, 'inconnu1', true, T0),
  ]);

  expect(scoreDeFeuille(FEUILLE, dernieres)).toEqual({ justes: 2, total: 13 });
});

it('score_d_une_feuille_jamais_faite_est_zero_sur_total', () => {
  expect(scoreDeFeuille(FEUILLE, new Map())).toEqual({ justes: 0, total: 13 });
});

it('deroule_tout_dans_l_ordre_du_papier', () => {
  const deroule = tachesADerouler(FEUILLE, 'tout', new Map([['qcm00001', true]]));

  expect(deroule.map(({ partie, tache }) => [partie, tache.id])).toEqual([
    ['Teil A', 'tache001'],
    ['Teil A', 'tache002'],
    ['Teil B', 'tache003'],
    ['Teil B', 'tache004'],
    ['Teil B', 'tache005'],
    ['Teil B', 'tache006'],
    ['Teil B', 'tache007'],
  ]);
  expect(deroule[0].tache).toBe(FEUILLE.parties[0].taches[0]);
});

it('deroule_erreurs_ne_garde_que_les_fausses', () => {
  const dernieres = new Map([
    ['qcm00001', true],
    ['qcm00002', false],
    ['ort00001', false],
  ]);

  const deroule = tachesADerouler(FEUILLE, 'erreurs', dernieres);

  expect(deroule.map(({ partie, tache }) => [partie, tache.id])).toEqual([
    ['Teil A', 'tache001'],
    ['Teil B', 'tache003'],
  ]);
  const qcm = deroule[0].tache;
  expect(qcm.genre === 'qcm' && qcm.questions.map((q) => q.id)).toEqual(['qcm00002']);
  const mots = deroule[1].tache;
  expect(mots.genre === 'orthographe' && mots.mots.map((m) => m.id)).toEqual(['ort00001']);
});

it('deroule_erreurs_ne_garde_pas_les_elements_jamais_faits', () => {
  expect(tachesADerouler(FEUILLE, 'erreurs', new Map([['qcm00001', true]]))).toEqual([]);
});

it('deroule_erreurs_vide_sans_erreur', () => {
  expect(tachesADerouler(FEUILLE, 'erreurs', new Map())).toEqual([]);
});

it('classement_en_erreurs_garde_ses_categories', () => {
  const deroule = tachesADerouler(FEUILLE, 'erreurs', new Map([['cla00002', false]]));

  expect(deroule).toHaveLength(1);
  expect(deroule[0].tache).toEqual({
    id: 'tache002',
    genre: 'classement',
    consigne: 'Ordnen Sie zu.',
    categories: ['links', 'rechts'],
    elements: [{ id: 'cla00002', terme: 'T2', categorie: 'rechts', ...SOURCE }],
  });
});

it('deroule_erreurs_filtre_les_elements_de_chaque_genre', () => {
  const dernieres = new Map([
    ['app00001', true],
    ['app00002', false],
    ['vra00001', false],
    ['vra00002', true],
    ['tro00001', true],
    ['tro00002', false],
    ['ouv00001', false],
    ['ouv00002', true],
  ]);

  const deroule = tachesADerouler(FEUILLE, 'erreurs', dernieres);

  expect(deroule.map(({ tache }) => elementsDeTache(tache).map((element) => element.id))).toEqual([
    ['app00002'],
    ['vra00001'],
    ['tro00002'],
    ['ouv00001'],
  ]);
});

it('deroule_nouveaux_ne_garde_que_les_elements_jamais_repondus', () => {
  // Juste ou faux, un élément répondu n'est plus « nouveau » ; une tâche toute répondue disparaît.
  const dernieres = new Map([
    ['qcm00001', true],
    ['qcm00002', false],
    ['cla00001', true],
    ['app00001', false],
  ]);

  const deroule = tachesADerouler(FEUILLE, 'nouveaux', dernieres);

  expect(deroule.map(({ partie, tache }) => [partie, tache.id])).toEqual([
    ['Teil A', 'tache002'],
    ['Teil B', 'tache003'],
    ['Teil B', 'tache004'],
    ['Teil B', 'tache005'],
    ['Teil B', 'tache006'],
    ['Teil B', 'tache007'],
  ]);
  expect(deroule.map(({ tache }) => elementsDeTache(tache).map((element) => element.id))).toEqual([
    ['cla00002'],
    ['ort00001'],
    ['app00002'],
    ['vra00001', 'vra00002'],
    ['tro00001', 'tro00002'],
    ['ouv00001', 'ouv00002'],
  ]);
});

it('deroule_nouveaux_sans_reponse_est_le_deroule_complet', () => {
  const nouveaux = tachesADerouler(FEUILLE, 'nouveaux', new Map());

  expect(nouveaux.map(({ tache }) => tache.id)).toEqual(
    tachesADerouler(FEUILLE, 'tout', new Map()).map(({ tache }) => tache.id),
  );
});

it('deroule_nouveaux_vide_quand_tout_est_repondu', () => {
  const tout = new Map(
    tachesADerouler(FEUILLE, 'tout', new Map()).flatMap(({ tache }) =>
      elementsDeTache(tache).map((element): [string, boolean] => [element.id, true]),
    ),
  );

  expect(tachesADerouler(FEUILLE, 'nouveaux', tout)).toEqual([]);
});

it('etat_neuve_sans_element_repondu', () => {
  // Une réponse à un identifiant étranger à la feuille ne l'entame pas.
  expect(etatDeFeuille(FEUILLE, new Map())).toBe('neuve');
  expect(etatDeFeuille(FEUILLE, new Map([['inconnu1', true]]))).toBe('neuve');
});

it('etat_entamee_des_un_element_repondu_juste_ou_faux', () => {
  expect(etatDeFeuille(FEUILLE, new Map([['qcm00001', true]]))).toBe('entamee');
  expect(etatDeFeuille(FEUILLE, new Map([['ouv00002', false]]))).toBe('entamee');
});

it('etat_entamee_tant_qu_un_element_manque', () => {
  const tousSaufUn = new Map(
    idsDeFeuille(FEUILLE)
      .slice(1)
      .map((id): [string, boolean] => [id, false]),
  );

  expect(etatDeFeuille(FEUILLE, tousSaufUn)).toBe('entamee');
});

it('etat_faite_quand_tous_les_elements_sont_repondus', () => {
  const tous = new Map(idsDeFeuille(FEUILLE).map((id): [string, boolean] => [id, id < 'o']));

  expect(etatDeFeuille(FEUILLE, tous)).toBe('faite');
});

it('etat_d_une_feuille_sans_element_est_neuve', () => {
  expect(etatDeFeuille({ parties: [] }, new Map())).toBe('neuve');
});

it('derniere_datee_garde_le_moment_de_la_derniere_reponse', () => {
  const dernieres = dernieresReponsesDatees([
    reponseDeTest(1, 'qcm00001', false, T1),
    reponseDeTest(2, 'qcm00001', true, T0),
  ]);

  expect(dernieres.get('qcm00001')).toEqual({ juste: false, reponduA: T1 });
});

it('derniere_datee_ignore_les_examens', () => {
  const dernieres = dernieresReponsesDatees([
    reponseDeTest(1, 'qcm00001', true, T0),
    { ...examenRemisDeTest('cm5r8t23', 2, T1), unite: 'qcm00001' },
    { ...examenRemisDeTest('cm5r8t23', 3, T1), unite: 'qcm00002' },
  ]);

  expect(dernieres.get('qcm00001')).toEqual({ juste: true, reponduA: T0 });
  expect(dernieres.has('qcm00002')).toBe(false);
});

it('derniere_datee_compte_un_evenement_en_double_une_fois', () => {
  const dernieres = dernieresReponsesDatees([
    reponseDeTest(1, 'qcm00001', true, T0),
    reponseDeTest(1, 'qcm00001', false, T2),
    reponseDeTest(2, 'qcm00001', false, T1),
  ]);

  expect(dernieres.get('qcm00001')).toEqual({ juste: false, reponduA: T1 });
});

it('resultats_feuille_dans_l_ordre_du_papier', () => {
  const resultats = resultatsDeFeuille(FEUILLE, new Map());

  expect(resultats.map((r) => [r.partie, r.tache.id, r.elements.map((e) => e.id)])).toEqual([
    ['Teil A', 'tache001', ['qcm00001', 'qcm00002']],
    ['Teil A', 'tache002', ['cla00001', 'cla00002']],
    ['Teil B', 'tache003', ['ort00001']],
    ['Teil B', 'tache004', ['app00001', 'app00002']],
    ['Teil B', 'tache005', ['vra00001', 'vra00002']],
    ['Teil B', 'tache006', ['tro00001', 'tro00002']],
    ['Teil B', 'tache007', ['ouv00001', 'ouv00002']],
  ]);
  expect(resultats.flatMap((r) => r.elements).every((e) => e.derniere === null)).toBe(true);
});

const JOURNAL_DE_RESULTATS = [
  reponseDeTest(1, 'qcm00001', true, T0),
  reponseDeTest(2, 'qcm00001', false, T1),
  reponseDeTest(3, 'ouv00002', true, T2),
  reponseDeTest(4, 'inconnu1', true, T0),
];

it('resultats_feuille_portent_la_derniere_reponse_datee', () => {
  const elements = resultatsDeFeuille(
    FEUILLE,
    dernieresReponsesDatees(JOURNAL_DE_RESULTATS),
  ).flatMap((r) => r.elements);
  const derniere = (id: string) => elements.find((e) => e.id === id)?.derniere;

  expect(derniere('qcm00001')).toEqual({ juste: false, reponduA: T1 });
  expect(derniere('qcm00002')).toBeNull();
  expect(derniere('ouv00002')).toEqual({ juste: true, reponduA: T2 });
  expect(elements).toHaveLength(13);
});

it('resultats_feuille_sans_tache_d_un_genre_inconnu', () => {
  const inconnue = (id: string) =>
    ({ id, genre: 'zeichnen', consigne: 'Zeichnen Sie.' }) as unknown as Tache;
  const [teilA, teilB] = FEUILLE.parties;
  const feuille = {
    parties: [
      { ...teilA, taches: [...teilA.taches, inconnue('tache098')] },
      teilB,
      { titre: 'Teil C', taches: [inconnue('tache099')] },
    ],
  };

  const resultats = resultatsDeFeuille(feuille, new Map());

  expect(resultats.map((r) => r.tache.id)).not.toContain('tache098');
  expect(resultats.map((r) => r.tache.id)).not.toContain('tache099');
  expect(resultats.map((r) => r.partie)).not.toContain('Teil C');
  expect(resultats).toHaveLength(7);
});

it('resultats_feuille_vide', () => {
  expect(resultatsDeFeuille({ parties: [] }, new Map())).toEqual([]);
});

it('resultats_feuille_comptent_comme_le_score', () => {
  const elements = resultatsDeFeuille(
    FEUILLE,
    dernieresReponsesDatees(JOURNAL_DE_RESULTATS),
  ).flatMap((r) => r.elements);
  const score = scoreDeFeuille(FEUILLE, dernieresReponses(JOURNAL_DE_RESULTATS));
  const justes = elements.filter((e) => e.derniere?.juste === true).length;

  expect(justes).toBe(score.justes);
  expect(justes).toBe(1);
  expect(elements).toHaveLength(score.total);
  expect(elements).toHaveLength(13);
});
