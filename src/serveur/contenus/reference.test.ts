import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
import { describe, expect, it } from 'vitest';
import { analyserContenus } from '../../domaine/contenu/analyse.js';
import { exempleDeCours, REGLAGES_DE_L_EXAMEN } from '../../domaine/contenu/exemple.fixture.js';
import type { Cours } from '../../domaine/contenu/modele.js';
import { calculerReference } from './reference.js';

function coursDe(fichiers: Map<string, string>): Cours {
  const resultat = analyserContenus(fichiers);
  expect(resultat.erreurs).toEqual([]);
  return resultat.cours[0];
}

/** Remplace `avant`, une fois, dans le fichier `chemin` de l'exemple. */
function remplacer(fichiers: Map<string, string>, chemin: string, avant: string, apres: string) {
  const texte = fichiers.get(chemin) ?? '';
  if (!texte.includes(avant)) throw new Error(`« ${avant} » est absent de ${chemin}`);
  fichiers.set(chemin, texte.replace(avant, apres));
}

describe('calculerReference', () => {
  it('reference_de_l_exemple', () => {
    const reference = calculerReference(coursDe(exempleDeCours()));

    expect(Object.keys(reference)).toEqual([
      'cours',
      'diffusion',
      'chapitres',
      'unites',
      'morphemes',
      'mots',
      'schemas',
      'textes',
      'exercices',
      'feuilles',
      'descriptions',
      'consignes',
      'reglages',
    ]);
    expect(reference.cours).toEqual({
      id: 'j5by5stz',
      titre: 'Übungskurs',
      langue: 'de',
      typesDeCarte: { b: 'Begriff', p: 'Präfix', g: 'Gegenteil' },
      leitner: { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 },
    });
    expect(Object.keys(reference.cours)).toEqual([
      'id',
      'titre',
      'langue',
      'typesDeCarte',
      'leitner',
    ]);
    expect(Object.keys(reference.cours.leitner)).toEqual(['intervalles', 'nouvellesParSeance']);
    // L'exemple a des éléments « à vérifier », et pas de dérogation.
    expect(Object.keys(reference.diffusion)).toEqual(['aVerifier', 'derogation', 'statuts']);
    expect(reference.diffusion.aVerifier).toBe(true);
    expect(reference.diffusion.derogation).toBeNull();
    expect(reference.chapitres).toEqual([
      { module: 'epas79zz', numero: 1, titre: 'Anfangskapitel' },
      { module: 'f9qmb1xs', numero: 2, titre: 'Vorsilben' },
    ]);

    // Unités : l'ordre des cartes, la directe puis l'inverse ; pas d'inverse pour `g`.
    expect(reference.unites.map((unite) => unite.id)).toEqual([
      'ed3d8me1',
      'ed3d8me1:inverse',
      'zaq3f32b',
      'zaq3f32b:inverse',
      '586my7a4',
      '4g84caqa',
      '4g84caqa:inverse',
      'rzbyrqna',
      'rzbyrqna:inverse',
    ]);
    const [directe, inverse] = reference.unites;
    expect(Object.keys(directe)).toEqual([
      'id',
      'numero',
      'type',
      'sens',
      'question',
      'reponse',
      'acceptees',
    ]);
    expect(directe).toMatchObject({ numero: 1, type: 'b', sens: 'direct' });
    expect(inverse).toMatchObject({
      sens: 'inverse',
      question: 'Erfundenes Organ für Übungszwecke',
      reponse: 'Musterorgan',
      acceptees: ['musterorgan'],
    });
    const protoInverse = reference.unites.find((unite) => unite.id === '4g84caqa:inverse');
    expect(protoInverse?.acceptees).toEqual(['proto']);
    for (const unite of reference.unites) {
      expect(unite.acceptees).toEqual([...unite.acceptees].sort());
    }

    expect(reference.morphemes).toHaveLength(3);
    expect(Object.keys(reference.morphemes[0])).toEqual(['id', 'categorie', 'forme', 'sens']);
    expect(reference.morphemes[0]).toEqual({
      id: 'w59xqe2s',
      categorie: 'p',
      forme: 'proto-',
      sens: 'erfunden',
    });

    expect(reference.mots).toHaveLength(2);
    expect(Object.keys(reference.mots[0])).toEqual(['id', 'mot', 'segments', 'sens']);
    expect(reference.mots[0].segments).toEqual([
      { texte: 'Proto', morpheme: 'w59xqe2s' },
      { texte: 'muster', morpheme: 'm2x1qnz2' },
      { texte: 'itis', morpheme: 'cmfe95c3' },
    ]);

    expect(reference.schemas).toHaveLength(1);
    const [schema] = reference.schemas;
    expect(Object.keys(schema)).toEqual(['id', 'titre', 'viewbox', 'dessin', 'note', 'points']);
    expect(schema).toMatchObject({ id: 'zp42j4eq', viewbox: '0 0 200 100' });
    expect(schema.dessin).toContain('<circle cx="100" cy="50" r="20"/>');
    expect(Object.keys(schema.points[0])).toEqual(['id', 'x', 'y', 'terme', 'sens']);
    expect(schema.points).toHaveLength(3);

    expect(reference.textes).toHaveLength(1);
    const [texte] = reference.textes;
    expect(Object.keys(texte)).toEqual(['id', 'titre', 'segments', 'questions']);
    // Les segments alternent : texte, jeton, texte, jeton, texte final.
    expect(texte.segments.map((segment) => ('jeton' in segment ? 'jeton' : 'texte'))).toEqual([
      'texte',
      'jeton',
      'texte',
      'jeton',
      'texte',
    ]);
    expect(texte.segments[1]).toEqual({ jeton: 't688vh43', forme: 'Mst.', sens: 'Musteritis' });
    expect(Object.keys(texte.segments[1])).toEqual(['jeton', 'forme', 'sens']);
    expect(texte.questions).toHaveLength(2);
    expect(Object.keys(texte.questions[0])).toEqual(['id', 'question', 'reponse', 'distracteurs']);

    // Une famille avec options donne `choix`, une famille sans options donne `tapee`.
    expect(reference.exercices.map((exercice) => [exercice.id, exercice.type])).toEqual([
      ['7g7wk0z1', 'choix'],
      ['301zktwp', 'choix'],
      ['e5pnxb2n', 'tapee'],
      ['tvm1e7ah', 'tapee'],
    ]);
    expect(Object.keys(reference.exercices[0])).toEqual([
      'id',
      'famille',
      'libelle',
      'invite',
      'type',
      'options',
      'reponse',
      'regle',
    ]);
    expect(reference.exercices[0]).toMatchObject({
      famille: 'artikel',
      libelle: 'Artikel',
      options: ['der', 'die', 'das'],
      regle: 'Die Endung bestimmt das Geschlecht.',
    });
    expect(reference.exercices[1].regle).toBe('Endung -a: Artikel die');
    // `options` et `regle` sont absentes, et non vides, quand l'exercice n'en a pas.
    expect(Object.keys(reference.exercices[2])).toEqual([
      'id',
      'famille',
      'libelle',
      'invite',
      'type',
      'reponse',
    ]);

    // Les descriptions, dans l'ordre du cours : celles des modules qui en ont une.
    expect(reference.descriptions).toEqual([
      { module: 'v1xmwpyr', description: 'Rezeptwörter in Teile zerlegen und neu bilden' },
      { module: 'zp42j4eq', description: 'Übungsschema mit drei Punkten' },
      {
        module: '4gyye686',
        description: 'Kochbegriffe und Zutaten in Rezepten verstehen',
      },
      { module: 'xqmqsxxe', description: 'Artikel und Plural zum Üben' },
    ]);
    expect(Object.keys(reference.descriptions[0])).toEqual(['module', 'description']);

    // Les consignes : celles des textes annotés qui en ont une.
    expect(reference.consignes).toEqual([
      { module: '4gyye686', consigne: 'Rezepttexte zum Lesen und Üben – frei erfunden.' },
    ]);
    expect(Object.keys(reference.consignes[0])).toEqual(['module', 'consigne']);

    // Les réglages des modules uniques : la réussite d'un texte, puis l'examen.
    expect(Object.keys(reference.reglages)).toEqual(['reussite', 'examen']);
    expect(reference.reglages.reussite).toBe(0.8);
    expect(reference.reglages.examen).toEqual({ module: 'nex8y92b', ...REGLAGES_DE_L_EXAMEN });
    expect(Object.keys(reference.reglages.examen ?? {})).toEqual([
      'module',
      'titre',
      'tailles',
      'tailleParDefaut',
      'secondesParQuestion',
      'minutesMinimum',
      'noteSuffisante',
      'seuilChapitre',
      'tirage',
    ]);
    expect(Object.keys(reference.reglages.examen?.tirage ?? {})).toEqual([
      'schema',
      'texte',
      'exercice',
      'feuille',
      'mot',
      'direct',
      'aTaper',
    ]);
  });

  it('reference_contient_les_feuilles', () => {
    const reference = calculerReference(coursDe(exempleDeCours()));

    expect(reference.feuilles).toHaveLength(1);
    const [feuille] = reference.feuilles;
    // Ni `fichier`, ni statut : la référence garde le contenu, sans son état de relecture.
    expect(Object.keys(feuille)).toEqual(['id', 'numero', 'titre', 'parties']);
    expect(feuille).toMatchObject({
      id: '9wjxv82j',
      numero: 1,
      titre: 'Übungsblatt 1 – Musterkunde',
    });
    expect(JSON.stringify(feuille)).not.toMatch(/statut|verifieLe|fichier/);
    expect(feuille.parties.map((partie) => partie.titre)).toEqual([
      'Teil A: Zuordnungsaufgaben',
      'Teil B: Auswahlaufgaben',
      'Teil C: Zutaten ergänzen',
      'Teil D: Offene Fragen',
    ]);
    expect(feuille.parties.map((partie) => partie.taches.map((tache) => tache.genre))).toEqual([
      ['appariement', 'classement'],
      ['qcm', 'vrai-faux'],
      ['trous', 'orthographe'],
      ['ouverte'],
    ]);

    const [[appariement, classement], [qcm, vraiFaux], [trous, orthographe], [ouverte]] =
      feuille.parties.map((partie) => partie.taches);
    expect(appariement).toEqual({
      id: 'hatk2eac',
      genre: 'appariement',
      consigne: 'Ordnen Sie die Begriffe den Erklärungen zu.',
      paires: [
        { id: '4bc2tbhe', terme: 'Musterorganum', cible: 'Erfundenes Übungsorgan' },
        { id: 'm68hg1re', terme: 'Probelappen', cible: 'Teil des Musterorgans' },
      ],
    });
    expect(Object.keys(appariement)).toEqual(['id', 'genre', 'consigne', 'paires']);
    expect(Object.keys(classement)).toEqual(['id', 'genre', 'consigne', 'categories', 'elements']);
    expect(Object.keys(qcm)).toEqual(['id', 'genre', 'consigne', 'questions']);
    expect(Object.keys(vraiFaux)).toEqual(['id', 'genre', 'consigne', 'affirmations']);
    expect(Object.keys(trous)).toEqual(['id', 'genre', 'consigne', 'liste', 'phrases']);
    expect(Object.keys(orthographe)).toEqual(['id', 'genre', 'consigne', 'mots']);
    expect(Object.keys(ouverte)).toEqual(['id', 'genre', 'consigne', 'questions']);
    // La correction n'est écrite que si l'affirmation en a une.
    expect(vraiFaux).toMatchObject({
      affirmations: [
        { id: 'npcgzqe2', affirmation: 'Das Musterorgan ist frei erfunden.', vrai: true },
        {
          id: '88jvr1wz',
          affirmation: 'Die Vorsilbe kontra- bedeutet mit.',
          vrai: false,
          correction: 'Die Vorsilbe kontra- bedeutet gegen.',
        },
      ],
    });
    if (vraiFaux.genre !== 'vrai-faux') throw new Error('attendu un vrai-faux');
    expect(vraiFaux.affirmations[0]).not.toHaveProperty('correction');
  });

  it('reference_sans_examen_ni_description_ni_consigne', () => {
    const fichiers = exempleDeCours();
    // L'examen est retiré (son identifiant reste au verrou, marqué retiré), puis deux descriptions.
    fichiers.delete('essai/examen.yaml');
    remplacer(fichiers, 'essai/cours.yaml', '  - "examen.yaml"\n', '');
    remplacer(fichiers, 'ids.lock', 'nex8y92b\n', 'nex8y92b retiré\n');
    const description = (texte: string) => `description: "${texte}"\n`;
    remplacer(
      fichiers,
      'essai/morphologie.yaml',
      description('Rezeptwörter in Teile zerlegen und neu bilden'),
      '',
    );
    remplacer(
      fichiers,
      'essai/textes.yaml',
      description('Kochbegriffe und Zutaten in Rezepten verstehen'),
      '',
    );
    remplacer(
      fichiers,
      'essai/textes.yaml',
      'consigne: "Rezepttexte zum Lesen und Üben – frei erfunden."\n',
      '',
    );

    const reference = calculerReference(coursDe(fichiers));

    expect(reference.descriptions.map((d) => d.module)).toEqual(['zp42j4eq', 'xqmqsxxe']);
    expect(reference.consignes).toEqual([]);
    expect(reference.reglages).toEqual({ reussite: 0.8 });
    expect(reference.reglages).not.toHaveProperty('examen');
  });

  it('reference_met_en_commun_les_reponses_de_tous_les_modules_de_cartes', () => {
    // Le verso de « kontra- » devient celui de « Probelappen », dans l'autre module de cartes.
    const fichiers = exempleDeCours();
    const vorsilben = fichiers.get('essai/cartes/02-vorsilben.yaml') ?? '';
    fichiers.set(
      'essai/cartes/02-vorsilben.yaml',
      vorsilben.replace('"gegen"', '"Teil des Musterorgans"'),
    );

    const reference = calculerReference(coursDe(fichiers));

    const unites = new Map(reference.unites.map((unite) => [unite.id, unite]));
    expect(unites.get('zaq3f32b:inverse')?.question).toBe('Teil des Musterorgans');
    expect(unites.get('zaq3f32b:inverse')?.acceptees).toEqual(['kontra', 'probelappen']);
    expect(unites.get('rzbyrqna:inverse')?.acceptees).toEqual(['kontra', 'probelappen']);
  });

  it('memoire_ecrite_dans_la_reference_et_rien_sans_elle', () => {
    // Sans `memoire`, la section `cours` est celle d'avant : aucune clé de plus.
    expect(calculerReference(coursDe(exempleDeCours())).cours).not.toHaveProperty('memoire');

    const fichiers = exempleDeCours();
    remplacer(
      fichiers,
      'essai/cours.yaml',
      'modules:\n',
      'memoire:\n  algorithme: "fsrs"\n  retention: 0.85\nmodules:\n',
    );
    const { cours } = calculerReference(coursDe(fichiers));

    expect(cours.memoire).toStrictEqual({ algorithme: 'fsrs', retention: 0.85 });
    expect(Object.keys(cours)).toEqual([
      'id',
      'titre',
      'langue',
      'typesDeCarte',
      'leitner',
      'memoire',
    ]);
  });

  it('memoire_par_chapitre_ecrite_en_entier_dans_la_reference', () => {
    const poids = [...FSRS6_DEFAULT_WEIGHTS];
    const fichiers = exempleDeCours();
    remplacer(
      fichiers,
      'essai/cours.yaml',
      'modules:\n',
      `memoire:\n  algorithme: "par-chapitre"\n  retention: 0.88\n  parametres: [${poids.join(', ')}]\n  examen: "2028-02-29"\n  chapitres: ["epas79zz"]\nmodules:\n`,
    );
    const { cours } = calculerReference(coursDe(fichiers));

    expect(cours.memoire).toStrictEqual({
      algorithme: 'par-chapitre',
      retention: 0.88,
      parametres: poids,
      examen: '2028-02-29',
      chapitres: ['epas79zz'],
    });
  });

  it('memoire_fsrs_sans_les_cles_nouvelles_n_en_porte_aucune', () => {
    const fichiers = exempleDeCours();
    remplacer(
      fichiers,
      'essai/cours.yaml',
      'modules:\n',
      'memoire:\n  algorithme: "fsrs"\nmodules:\n',
    );
    const { memoire } = calculerReference(coursDe(fichiers)).cours;

    expect(memoire).toStrictEqual({ algorithme: 'fsrs', retention: 0.9 });
  });

  // Invariant 9 et ADR-0003 : la section `diffusion` porte l'état du cours, sa dérogation, et le
  // nombre des éléments de chaque statut, module par module.
  it('diffusion_d_un_cours_sans_element_a_verifier_ni_derogation', () => {
    const fichiers = exempleDeCours();
    for (const [chemin, texte] of fichiers) {
      fichiers.set(chemin, texte.replaceAll('statut: "à vérifier"', 'statut: "source"'));
    }

    const { aVerifier, derogation, statuts } = calculerReference(coursDe(fichiers)).diffusion;

    expect(aVerifier).toBe(false);
    expect(derogation).toBeNull();
    expect(statuts.map((compte) => compte.aVerifier)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('diffusion_d_un_cours_a_verifier_avec_derogation', () => {
    const fichiers = exempleDeCours();
    remplacer(
      fichiers,
      'essai/cours.yaml',
      'modules:\n',
      'derogation_diffusion:\n  motif: "Ouvert avant sa relecture"\n  date: "2026-11-04"\nmodules:\n',
    );

    const { aVerifier, derogation } = calculerReference(coursDe(fichiers)).diffusion;

    expect(aVerifier).toBe(true);
    expect(derogation).toStrictEqual({ motif: 'Ouvert avant sa relecture', date: '2026-11-04' });
  });

  // Les comptes suivent la règle de « Statuts » : un élément sans statut prend celui de son module,
  // un schéma compte pour un élément (ses points, non), et l'examen n'y figure pas. Décompte fait à
  // la main sur `exempleDeCours()`, dans l'ordre du cours.
  it('diffusion_compte_les_statuts_de_chaque_module_et_le_schema_pour_un', () => {
    const { statuts } = calculerReference(coursDe(exempleDeCours())).diffusion;

    expect(statuts).toStrictEqual([
      // Les cartes du module `source` : deux héritent, une est « vérifié ».
      { module: 'epas79zz', source: 2, aVerifier: 0, verifie: 1 },
      // Les cartes du module « à vérifier » : une hérite, une est `source`.
      { module: 'f9qmb1xs', source: 1, aVerifier: 1, verifie: 0 },
      // Trois morphèmes et un mot héritent de `source`, un mot est « à vérifier ».
      { module: 'v1xmwpyr', source: 4, aVerifier: 1, verifie: 0 },
      // Le schéma et ses trois points : un élément.
      { module: 'zp42j4eq', source: 1, aVerifier: 0, verifie: 0 },
      // Un texte ; ses questions et ses jetons n'ont pas de statut à eux.
      { module: '4gyye686', source: 0, aVerifier: 1, verifie: 0 },
      { module: 'xqmqsxxe', source: 3, aVerifier: 1, verifie: 0 },
      // Les dix éléments des tâches, pas les tâches : une paire « vérifié », une question `source`.
      { module: '9wjxv82j', source: 1, aVerifier: 8, verifie: 1 },
    ]);
  });
});
