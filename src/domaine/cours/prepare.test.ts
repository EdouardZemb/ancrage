import { describe, expect, it } from 'vitest';
import { reponsesAcceptees } from '../cartes/unites.js';
import type { Tache } from '../contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from './cours.fixture.js';
import { type CoursPrepare, ongletsDuCours, preparerCours } from './prepare.js';
import type { CoursServi, ModuleServi } from './servi.js';

/* Données factices, écrites à la main (invariant 7). */

function sans(cours: CoursServi, ...types: ModuleServi['type'][]): CoursServi {
  return { ...cours, modules: cours.modules.filter((module) => !types.includes(module.type)) };
}

function seulement(cours: CoursServi, ...types: ModuleServi['type'][]): CoursServi {
  return { ...cours, modules: cours.modules.filter((module) => types.includes(module.type)) };
}

describe('preparerCours', () => {
  it('prepare_les_unites_les_chapitres_et_les_modules', () => {
    const cours = coursServiDeTest();

    const prepare = preparerCours(cours);

    expect(prepare.cours).toBe(cours);
    expect(prepare.unites.map((u) => u.id)).toEqual([
      'c1000001',
      'c1000001:inverse',
      'c1000002',
      'c1000002:inverse',
      'c1000003',
      'c1000003:inverse',
      'c1000004',
      'c1000004:inverse',
      'c1000005',
      'c1000005:inverse',
      'c1000006',
      'c1000006:inverse',
      'c1000007',
      'c1000007:inverse',
      'c1000008',
      'c2000001',
      'c2000001:inverse',
      'c2000002',
      'c2000002:inverse',
      'c2000003',
      'c2000003:inverse',
      'c2000004',
      'c2000004:inverse',
      'c2000005',
      'c2000005:inverse',
    ]);
    expect(prepare.chapitres).toEqual([
      { id: CHAPITRE_1, numero: 1, titre: 'Anfangskapitel' },
      { id: CHAPITRE_2, numero: 2, titre: 'Vorsilben' },
    ]);
    expect(prepare.morphologie?.id).toBe('mm000001');
    expect(prepare.schemas.map((s) => s.id)).toEqual(['sc000001']);
    expect(prepare.textes?.id).toBe('te000001');
    expect(prepare.exercices?.id).toBe('ex000001');
    expect(prepare.examen?.id).toBe('ey000001');
    expect(prepare.feuilles.map((f) => f.id)).toEqual(['fe000001']);
  });

  it('feuilles_preparees_de_la_plus_recente_a_la_plus_ancienne', () => {
    const cours = coursServiDeTest();
    const feuille = cours.modules.find((module) => module.type === 'feuille');
    if (feuille === undefined) throw new Error('la fixture a une feuille');
    // Dans l'ordre du cours : 1, 3, 2. La plus récente est celle de la Unit la plus haute.
    cours.modules.push(
      { ...feuille, id: 'fe000003', numero: 3, titre: 'Unit 3' },
      { ...feuille, id: 'fe000002', numero: 2, titre: 'Unit 2' },
    );

    const prepare = preparerCours(cours);

    expect(prepare.feuilles.map((f) => [f.id, f.numero])).toEqual([
      ['fe000003', 3],
      ['fe000002', 2],
      ['fe000001', 1],
    ]);
    // Le cours servi garde son ordre.
    expect(cours.modules.filter((m) => m.type === 'feuille').map((m) => m.id)).toEqual([
      'fe000001',
      'fe000003',
      'fe000002',
    ]);
  });

  it('index_des_reponses_des_unites_inverses', () => {
    const prepare = preparerCours(coursServiDeTest());
    const hyper = prepare.unites.find((u) => u.id === 'c1000006:inverse');

    expect(hyper).toBeDefined();
    if (hyper === undefined) return;
    expect([...reponsesAcceptees(hyper, prepare.index)].sort()).toEqual(['hyper', 'ueber']);
  });

  it('plusieurs_schemas_dans_l_ordre_du_cours', () => {
    const cours = coursServiDeTest();
    const schema = cours.modules.find((module) => module.type === 'schema');
    if (schema === undefined) throw new Error('la fixture a un schéma');
    cours.modules.push({ ...schema, id: 'sc000002', titre: 'Le deuxième' });

    const prepare = preparerCours(cours);

    expect(prepare.schemas.map((s) => s.id)).toEqual(['sc000001', 'sc000002']);
  });

  it('un_cours_sans_module_optionnel_les_laisse_absents', () => {
    const prepare = preparerCours(seulement(coursServiDeTest(), 'cartes'));

    expect(prepare.morphologie).toBeUndefined();
    expect(prepare.schemas).toEqual([]);
    expect(prepare.textes).toBeUndefined();
    expect(prepare.exercices).toBeUndefined();
    expect(prepare.examen).toBeUndefined();
    expect(prepare.feuilles).toEqual([]);
    expect(prepare.chapitres).toHaveLength(2);
  });

  it('un_cours_sans_carte_n_a_ni_unite_ni_chapitre', () => {
    const prepare = preparerCours(sans(coursServiDeTest(), 'cartes'));

    expect(prepare.unites).toEqual([]);
    expect(prepare.chapitres).toEqual([]);
    expect(prepare.index.size).toBe(0);
  });
});

describe('unitesConnues', () => {
  it('unites_connues_reunit_les_unites_qui_recoivent_une_reponse', () => {
    const prepare = preparerCours(coursServiDeTest());

    expect([...prepare.unitesConnues].sort()).toEqual(
      [
        // Les cartes, dans les deux sens quand elles en ont deux.
        ...prepare.unites.map((u) => u.id),
        // Les mots du Wortbaukasten.
        'w0000001',
        'w0000002',
        'w0000003',
        // Les points des schémas.
        'q0000001',
        'q0000002',
        'q0000003',
        'q0000004',
        'q0000005',
        // Les textes annotés entiers.
        't1000001',
        't1000002',
        // Les exercices.
        'e1000001',
        'e1000002',
        'e1000003',
        'e2000001',
        'e2000002',
        // Les éléments de la feuille.
        'fb000001',
        'fb000002',
        'fb000003',
        'fb000004',
        'fb000005',
        'fb000006',
        'fb000007',
        'fb000008',
        'fb000009',
        'fb000010',
        'fb000011',
        'fb000012',
        'fb000013',
      ].sort(),
    );
  });

  it('unites_connues_comprennent_les_elements_de_feuille', () => {
    const prepare = preparerCours(coursServiDeTest());

    // Chaque élément reçoit une réponse : paires, éléments à classer, questions, affirmations,
    // phrases (une par phrase, quel que soit son nombre de trous) et mots.
    for (const id of ['fb000001', 'fb000006', 'fb000007', 'fb000009', 'fb000010', 'fb000013']) {
      expect(prepare.unitesConnues.has(id), id).toBe(true);
    }
    // Ni la feuille, ni ses tâches.
    for (const id of ['fe000001', 'fa000001', 'fa000005', 'fa000008']) {
      expect(prepare.unitesConnues.has(id), id).toBe(false);
    }
    // Sans feuille, aucun de ses éléments.
    expect(preparerCours(sans(coursServiDeTest(), 'feuille')).unitesConnues.has('fb000001')).toBe(
      false,
    );
  });

  it('unites_connues_ignorent_une_tache_d_un_genre_inconnu', () => {
    // F1-D11 : une tâche ajoutée par une version suivante n'a pas d'élément connu de ce client.
    const cours = coursServiDeTest();
    const feuille = cours.modules.find((module) => module.type === 'feuille');
    if (feuille === undefined) throw new Error('la fixture a une feuille');
    const futur = {
      id: 'fa000009',
      genre: 'futur',
      consigne: 'Neu.',
      karten: [{ id: 'fb000099' }],
    };
    feuille.parties[0].taches.push(futur as unknown as Tache);

    const prepare = preparerCours(cours);

    expect(prepare.unitesConnues.has('fb000099')).toBe(false);
    expect(prepare.unitesConnues.has('fb000001')).toBe(true);
  });

  it('unites_connues_exclut_ce_qui_ne_produit_pas_d_evenement', () => {
    const prepare = preparerCours(coursServiDeTest());
    const exclus = [
      // Les jetons et les questions d'un texte ne produisent pas d'événement (décision 8).
      'j1000001',
      'j1000002',
      'j1000003',
      'j1000004',
      'k1000001',
      // Ni les morphèmes, ni les modules, ni les familles, ni le cours.
      'p0000001',
      's0000002',
      'x0000003',
      CHAPITRE_1,
      'mm000001',
      'sc000001',
      'te000001',
      'ex000001',
      'ey000001',
      'cs000001',
      'artikel',
    ];

    for (const id of exclus) {
      expect(prepare.unitesConnues.has(id), id).toBe(false);
    }
  });

  it('unites_connues_suit_les_modules_presents', () => {
    const prepare = preparerCours(sans(coursServiDeTest(), 'morphologie', 'exercices'));

    expect(prepare.unitesConnues.has('w0000001')).toBe(false);
    expect(prepare.unitesConnues.has('e1000001')).toBe(false);
    expect(prepare.unitesConnues.has('c1000001:inverse')).toBe(true);
    expect(prepare.unitesConnues.has('q0000001')).toBe(true);
    expect(prepare.unitesConnues.has('t1000001')).toBe(true);
  });
});

describe('ongletsDuCours', () => {
  const TOUS = [
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
  ];

  const onglets = (cours: CoursServi): string[] => ongletsDuCours(preparerCours(cours));

  it('onglets_selon_les_modules', () => {
    const cours = coursServiDeTest();

    // Décision 19 : l'ordre du prototype (H:194-202).
    expect(onglets(cours)).toEqual(TOUS);
    // Un onglet par type de module : sans lui, l'onglet disparaît et les autres restent à leur
    // place.
    expect(onglets(sans(cours, 'morphologie'))).toEqual(TOUS.filter((o) => o !== 'mots'));
    expect(onglets(sans(cours, 'schema'))).toEqual(TOUS.filter((o) => o !== 'schemas'));
    expect(onglets(sans(cours, 'texte-annote'))).toEqual(TOUS.filter((o) => o !== 'textes'));
    expect(onglets(sans(cours, 'exercices'))).toEqual(TOUS.filter((o) => o !== 'exercices'));
    // L'onglet des fiches, entre la Grammatik et la Prüfung, n'existe que s'il y a une fiche (F1-D1).
    expect(onglets(sans(cours, 'feuille'))).toEqual(TOUS.filter((o) => o !== 'feuilles'));
    expect(onglets(sans(cours, 'examen'))).toEqual(TOUS.filter((o) => o !== 'examen'));
    // Les cartes donnent deux onglets : les cartes et le quiz.
    expect(onglets(sans(cours, 'cartes'))).toEqual(
      TOUS.filter((o) => o !== 'cartes' && o !== 'quiz'),
    );
  });

  it('onglets_d_un_cours_sans_module_gardent_heute_l_apercu_et_la_progression', () => {
    expect(onglets({ ...coursServiDeTest(), modules: [] })).toEqual([
      'heute',
      'apercu',
      'progression',
    ]);
  });

  it('onglets_d_un_seul_module_de_cartes_donnent_les_cartes_et_le_quiz', () => {
    const cours = coursServiDeTest();
    const premier = cours.modules.find((module) => module.type === 'cartes');
    if (premier === undefined) throw new Error('la fixture a des cartes');

    expect(onglets({ ...cours, modules: [premier] })).toEqual([
      'heute',
      'apercu',
      'cartes',
      'quiz',
      'progression',
    ]);
  });

  it('onglets_se_lisent_sur_le_cours_prepare', () => {
    const prepare: CoursPrepare = preparerCours(coursServiDeTest());

    expect(ongletsDuCours({ ...prepare, schemas: [] })).not.toContain('schemas');
    expect(ongletsDuCours({ ...prepare, morphologie: undefined })).not.toContain('mots');
    expect(ongletsDuCours({ ...prepare, chapitres: [] })).not.toContain('cartes');
    expect(ongletsDuCours(prepare)).toContain('feuilles');
    expect(ongletsDuCours({ ...prepare, feuilles: [] })).not.toContain('feuilles');
  });
});
