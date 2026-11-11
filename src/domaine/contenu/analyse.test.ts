import { describe, expect, it } from 'vitest';
import { CLES_DE_NOTICE } from '../notice.js';
import { coursAVerifier } from './acces-cours.js';
import { analyserContenus } from './analyse.js';
import {
  exempleDeCours,
  modifier,
  REGLAGES_DE_L_EXAMEN,
  valeursDeNoticeDExemple,
} from './exemple.fixture.js';
import type { Module } from './modele.js';
import { FICHIER_NOTICE as NOTICE } from './notice.js';

const COURS = 'essai/cours.yaml';
const CARTES_1 = 'essai/cartes/01-grundbegriffe.yaml';
const CARTES_2 = 'essai/cartes/02-vorsilben.yaml';
const MORPHOLOGIE = 'essai/morphologie.yaml';
const SCHEMA = 'essai/schemas/muster.yaml';
const DESSIN = 'essai/schemas/muster.svg';
const TEXTES = 'essai/textes.yaml';
const EXERCICES = 'essai/exercices.yaml';
const FEUILLE = 'essai/feuille.yaml';
const EXAMEN = 'essai/examen.yaml';

function erreursApres(chemin: string, avant: string, apres: string) {
  return analyserContenus(modifier(exempleDeCours(), chemin, avant, apres)).erreurs;
}

/** La valeur `fr.tunnel` de la notice de l'exemple, écrite sans ses guillemets. */
const SANS_GUILLEMETS = {
  avant: 'tunnel: "Passerelle"\n  delai_reponse: "15 jours"',
  apres: 'tunnel: Passerelle\n  delai_reponse: "15 jours"',
};

const MOTIF = 'Relecture en cours, diffusion limitée acceptée par écrit';
const LEITNER = 'leitner:\n  intervalles: [0, 1, 2, 4, 8, 16]\n  nouvelles_par_seance: 15\n';

/**
 * L'exemple, dont `cours.yaml` gagne la clé `cle` : `bloc` est son contenu, déjà indenté (ou une
 * valeur après les deux-points, sur la même ligne).
 */
function avecDerogation(bloc: string, cle = 'derogation_diffusion'): Map<string, string> {
  const valeur = bloc.startsWith('  ') ? `\n${bloc}` : bloc;
  return modifier(exempleDeCours(), COURS, 'modules:\n', `${cle}:${valeur}modules:\n`);
}

function erreursAvecDerogation(bloc: string, cle?: string) {
  return analyserContenus(avecDerogation(bloc, cle)).erreurs;
}

function erreur(fichier: string, lieu: string, message: RegExp) {
  return { fichier, lieu, message: expect.stringMatching(message) };
}

function moduleDe<T extends Module['type']>(
  modules: readonly Module[],
  fichier: string,
  type: T,
): Extract<Module, { type: T }> {
  const module = modules.find((m) => m.fichier === fichier);
  if (module?.type !== type) throw new Error(`pas de module ${type} dans ${fichier}`);
  return module as Extract<Module, { type: T }>;
}

function modulesDe(fichiers: Map<string, string>): Module[] {
  const { cours, erreurs } = analyserContenus(fichiers);
  expect(erreurs).toEqual([]);
  return cours[0].modules;
}

describe('analyserContenus', () => {
  it('exemple_valide_sans_erreur', () => {
    const { cours, erreurs, identifiants } = analyserContenus(exempleDeCours());
    const types = [
      'cartes',
      'cartes',
      'morphologie',
      'schema',
      'texte-annote',
      'exercices',
      'feuille',
      'examen',
    ];

    expect(erreurs).toEqual([]);
    expect(cours).toHaveLength(1);
    expect(cours[0]).toMatchObject({
      id: 'j5by5stz',
      dossier: 'essai',
      titre: 'Übungskurs',
      langue: 'de',
      typesDeCarte: { b: 'Begriff', p: 'Präfix', g: 'Gegenteil' },
      leitner: { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 },
    });
    expect(Object.keys(cours[0].typesDeCarte)).toEqual(['b', 'p', 'g']);
    expect(cours[0].modules.map((m) => m.type)).toEqual(types);
    expect(cours[0].modules.map((m) => m.fichier)).toEqual([
      CARTES_1,
      CARTES_2,
      MORPHOLOGIE,
      SCHEMA,
      TEXTES,
      EXERCICES,
      FEUILLE,
      EXAMEN,
    ]);

    const fichiersALEnvers = new Map([...exempleDeCours()].reverse());
    expect(modulesDe(fichiersALEnvers).map((m) => m.type)).toEqual(types);

    expect(identifiants.size).toBe(48);
    expect(identifiants.get('j5by5stz')).toBe(`${COURS}:id`);
    expect(identifiants.get('epas79zz')).toBe(`${CARTES_1}:id`);
    expect(identifiants.get('ed3d8me1')).toBe(`${CARTES_1}:cartes[0].id`);
    expect(identifiants.get('cv8wvsev')).toBe(`${MORPHOLOGIE}:mots[1].id`);
    expect(identifiants.get('90vd725z')).toBe(`${TEXTES}:textes[0].texte.jetons[1]`);
    expect(identifiants.get('tvm1e7ah')).toBe(`${EXERCICES}:familles[1].exercices[1].id`);
    expect(identifiants.get('nex8y92b')).toBe(`${EXAMEN}:id`);
  });

  it('modele_resolu_de_l_exemple', () => {
    const modules = modulesDe(exempleDeCours());

    expect(moduleDe(modules, CARTES_2, 'cartes')).toEqual({
      type: 'cartes',
      id: 'f9qmb1xs',
      fichier: CARTES_2,
      numero: 2,
      titre: 'Vorsilben',
      cartes: [
        {
          id: '4g84caqa',
          type: 'p',
          recto: 'proto-',
          verso: 'erfunden, nur zur Übung',
          reponses: ['proto'],
          statut: 'à vérifier',
        },
        { id: 'rzbyrqna', type: 'p', recto: 'kontra-', verso: 'gegen', statut: 'source' },
      ],
    });
    expect(moduleDe(modules, MORPHOLOGIE, 'morphologie')).toMatchObject({
      chapitres: ['f9qmb1xs'],
      morphemes: [
        { id: 'w59xqe2s', categorie: 'p', forme: 'proto-', sens: 'erfunden', statut: 'source' },
        { id: 'm2x1qnz2' },
        { id: 'cmfe95c3' },
      ],
      mots: [
        { id: 'z4qcq7np', mot: 'Protomusteritis' },
        {
          id: 'cv8wvsev',
          mot: 'Musteritis',
          segments: [
            { texte: 'Muster', morpheme: 'm2x1qnz2' },
            { texte: 'itis', morpheme: 'cmfe95c3' },
          ],
          sens: 'Entzündung der Vorlage',
          statut: 'à vérifier',
        },
      ],
    });
    expect(moduleDe(modules, SCHEMA, 'schema')).toEqual({
      type: 'schema',
      id: 'zp42j4eq',
      fichier: SCHEMA,
      titre: 'Das Musterorgan',
      statut: 'source',
      description: 'Übungsschema mit drei Punkten',
      viewbox: '0 0 200 100',
      dessin:
        '<rect x="10" y="10" width="180" height="80" rx="12" fill="none" stroke="currentColor"/>\n' +
        '<circle cx="100" cy="50" r="20"/>\n<path d="M40 30 L160 70"/>',
      note: 'Übungsschema ohne Vorbild',
      points: [
        { id: 'khddt0nq', x: 40, y: 30, terme: 'Oberpol', sens: 'oberes Ende' },
        { id: '7czjdx4q', x: 100, y: 50, terme: 'Mitte', sens: 'Zentrum des Organs' },
        { id: 'dws2s1yj', x: 160, y: 70, terme: 'Unterpol', sens: 'unteres Ende' },
      ],
    });
    expect(moduleDe(modules, TEXTES, 'texte-annote').textes).toEqual([
      {
        id: 'pr8zqeth',
        titre: 'Bericht 1',
        texte:
          'Pat. mit [[Mst.|Musteritis|t688vh43]] seit dem Frühstück, [[n. B.|nach Bedarf|90vd725z]] kühlen.',
        segments: [
          { texte: 'Pat. mit ' },
          { jeton: { id: 't688vh43', forme: 'Mst.', sens: 'Musteritis' } },
          { texte: ' seit dem Frühstück, ' },
          { jeton: { id: '90vd725z', forme: 'n. B.', sens: 'nach Bedarf' } },
          { texte: ' kühlen.' },
        ],
        questions: [
          {
            id: 'ba3vg7bf',
            question: 'Seit wann bestehen die Beschwerden?',
            reponse: 'Seit dem Frühstück',
            distracteurs: ['Seit einer Woche', 'Seit Jahren', 'Seit heute Morgen'],
          },
          {
            id: 'b8d74bda',
            question: 'Was soll man tun?',
            reponse: 'Kühlen',
            distracteurs: ['Wärmen', 'Ruhen', 'Laufen'],
          },
        ],
        statut: 'à vérifier',
      },
    ]);
  });

  it('statut_herite_du_module_et_surcharge', () => {
    const modules = modulesDe(exempleDeCours());
    const etats = (elements: readonly { statut: string; verifieLe?: string }[]) =>
      elements.map(({ statut, verifieLe }) => (verifieLe ? { statut, verifieLe } : { statut }));

    const cartes1 = moduleDe(modules, CARTES_1, 'cartes').cartes;
    expect(etats(cartes1)).toEqual([
      { statut: 'source' },
      { statut: 'vérifié', verifieLe: '2026-10-01' },
      { statut: 'source' },
    ]);
    expect(cartes1[0]).not.toHaveProperty('verifieLe');
    expect(etats(moduleDe(modules, CARTES_2, 'cartes').cartes)).toEqual([
      { statut: 'à vérifier' },
      { statut: 'source' },
    ]);
    expect(etats(moduleDe(modules, MORPHOLOGIE, 'morphologie').mots)).toEqual([
      { statut: 'source' },
      { statut: 'à vérifier' },
    ]);
    expect(moduleDe(modules, SCHEMA, 'schema').statut).toBe('source');
    expect(etats(moduleDe(modules, TEXTES, 'texte-annote').textes)).toEqual([
      { statut: 'à vérifier' },
    ]);
    const familles = moduleDe(modules, EXERCICES, 'exercices').familles;
    expect(etats(familles.flatMap((f) => f.exercices))).toEqual([
      { statut: 'source' },
      { statut: 'source' },
      { statut: 'source' },
      { statut: 'à vérifier' },
    ]);

    const verifie = modulesDe(
      modifier(
        exempleDeCours(),
        CARTES_2,
        'statut: "à vérifier"\n',
        'statut: "vérifié"\nverifie_le: "2026-09-30"\n',
      ),
    );
    expect(etats(moduleDe(verifie, CARTES_2, 'cartes').cartes)).toEqual([
      { statut: 'vérifié', verifieLe: '2026-09-30' },
      { statut: 'source' },
    ]);
  });

  it('verifie_exige_une_date', () => {
    expect(erreursApres(CARTES_1, '    verifie_le: "2026-10-01"\n', '')).toEqual([
      erreur(CARTES_1, 'cartes[1].statut', /vérifié.*verifie_le/),
    ]);
    expect(erreursApres(CARTES_2, 'statut: "à vérifier"', 'statut: "vérifié"')).toEqual([
      erreur(CARTES_2, 'statut', /vérifié.*verifie_le/),
    ]);
    for (const date of ['2026-02-30', '2026-13-01', '26-10-01', '2026-10-1', '1er octobre']) {
      expect(erreursApres(CARTES_1, '"2026-10-01"', `"${date}"`), date).toEqual([
        erreur(CARTES_1, 'cartes[1].verifie_le', /date/i),
      ]);
    }
    expect(erreursApres(CARTES_1, '"2026-10-01"', '"2028-02-29"')).toEqual([]);
  });

  it('date_sans_verifie_refusee', () => {
    expect(
      erreursApres(
        CARTES_2,
        '    statut: "source"\n',
        '    statut: "source"\n    verifie_le: "2026-10-01"\n',
      ),
    ).toEqual([erreur(CARTES_2, 'cartes[1].verifie_le', /vérifié/)]);
    expect(
      erreursApres(
        CARTES_1,
        '    verso: "Teil des Musterorgans"\n    statut: "vérifié"\n',
        '    verso: "Teil des Musterorgans"\n',
      ),
    ).toEqual([erreur(CARTES_1, 'cartes[1].verifie_le', /vérifié/)]);
  });

  it('refuse_un_texte_non_chaine', () => {
    expect(erreursApres(CARTES_1, 'recto: "Musterorgan"', 'recto: 1.0')).toEqual([
      erreur(CARTES_1, 'cartes[0].recto', /texte.*nombre/),
    ]);
    expect(erreursApres(CARTES_1, 'recto: "Musterorgan"', 'recto: true')).toEqual([
      erreur(CARTES_1, 'cartes[0].recto', /texte.*booléen/),
    ]);
    expect(erreursApres(SCHEMA, 'x: 40', 'x: "40"')).toEqual([
      erreur(SCHEMA, 'points[0].x', /nombre.*texte/),
    ]);
  });

  it('refuse_un_texte_sans_guillemets', () => {
    // Sonde de la revue : le `#` ouvre un commentaire, donc la valeur serait lue « Teil ».
    const sonde = erreursApres(
      CARTES_1,
      'verso: "Teil des Musterorgans"',
      'verso: Teil #des Musterorgans',
    );
    expect(sonde).toEqual([erreur(CARTES_1, 'cartes[1].verso', /guillemets doubles/)]);
    expect(sonde[0].message).not.toContain('Musterorgans');
    expect(sonde[0].message).not.toContain('Teil');

    const styles = [
      'verso: gegen',
      "verso: 'gegen'",
      'verso: >-\n      gegen',
      'verso: |-\n      gegen',
    ];
    for (const style of styles) {
      expect(erreursApres(CARTES_2, 'verso: "gegen"', style), style).toEqual([
        erreur(CARTES_2, 'cartes[1].verso', /guillemets doubles/),
      ]);
    }
  });

  it('refuse_un_texte_sans_guillemets_dans_une_liste', () => {
    expect(
      erreursApres(CARTES_2, 'reponses: ["proto"]', 'reponses:\n      - "proto"\n      - kontra'),
    ).toEqual([erreur(CARTES_2, 'cartes[0].reponses[1]', /guillemets doubles/)]);
    expect(erreursApres(CARTES_2, 'reponses: ["proto"]', 'reponses: [proto]')).toEqual([
      erreur(CARTES_2, 'cartes[0].reponses[0]', /guillemets doubles/),
    ]);
    expect(erreursApres(TEXTES, '"Ruhen", "Laufen"', '"Ruhen", \'Laufen\'')).toEqual([
      erreur(TEXTES, 'textes[0].questions[1].distracteurs[2]', /guillemets doubles/),
    ]);
  });

  it('refuse_un_texte_sans_guillemets_a_la_racine_avec_sa_ligne', () => {
    const fichiers = exempleDeCours();
    fichiers.set(COURS, 'Lunge\n');

    expect(analyserContenus(fichiers).erreurs).toContainEqual(
      erreur(COURS, 'ligne 1', /guillemets doubles/),
    );
  });

  it('laisse_libres_les_cles_et_les_valeurs_qui_ne_sont_pas_des_textes', () => {
    // Seules les valeurs de type texte sont concernées : une clé s'écrit comme on veut, et un nombre
    // n'a pas de guillemets.
    expect(
      erreursApres(
        CARTES_1,
        '  - id: "ed3d8me1"\n    type: "b"',
        '  - "id": "ed3d8me1"\n    \'type\': "b"',
      ),
    ).toEqual([]);
    expect(erreursApres(SCHEMA, 'x: 40', 'x: 40.0')).toEqual([]);
  });

  it('refuse_une_cle_inconnue', () => {
    expect(
      erreursApres(
        CARTES_1,
        '    recto: "Musterorgan"\n',
        '    recto: "Musterorgan"\n    farbe: "rot"\n',
      ),
    ).toEqual([erreur(CARTES_1, 'cartes[0].farbe', /Clé inconnue/)]);
    expect(erreursApres(COURS, 'langue: "de"\n', 'langue: "de"\nautor: "X"\n')).toEqual([
      erreur(COURS, 'autor', /Clé inconnue/),
    ]);
    expect(
      erreursApres(
        SCHEMA,
        '    sens: "oberes Ende"\n',
        '    sens: "oberes Ende"\n    statut: "source"\n',
      ),
    ).toEqual([erreur(SCHEMA, 'points[0].statut', /Clé inconnue/)]);
  });

  it('refuse_un_format_ou_un_type_de_module_inconnu', () => {
    expect(erreursApres(COURS, 'format: 1', 'format: 2')).toEqual([
      erreur(COURS, 'format', /attendu 1/),
    ]);
    expect(erreursApres(CARTES_1, 'type: "cartes"', 'type: "karten"')).toEqual([
      erreur(CARTES_1, 'type', /type de module inconnu/i),
    ]);
  });

  it('memoire_acceptee_avec_retention_par_defaut', () => {
    const { cours, erreurs } = analyserContenus(
      avecDerogation('  algorithme: "fsrs"\n', 'memoire'),
    );

    expect(erreurs).toEqual([]);
    expect(cours[0].memoire).toEqual({ algorithme: 'fsrs', retention: 0.9 });
    expect(
      analyserContenus(avecDerogation('  algorithme: "leitner"\n', 'memoire')).cours[0].memoire,
    ).toEqual({ algorithme: 'leitner', retention: 0.9 });
  });

  it('memoire_acceptee_avec_retention_ecrite', () => {
    const { cours, erreurs } = analyserContenus(
      avecDerogation('  algorithme: "fsrs"\n  retention: 0.85\n', 'memoire'),
    );

    expect(erreurs).toEqual([]);
    expect(cours[0].memoire).toEqual({ algorithme: 'fsrs', retention: 0.85 });
    // Les bornes sont comprises.
    for (const retention of ['0.8', '0.95']) {
      const resultat = analyserContenus(
        avecDerogation(`  algorithme: "fsrs"\n  retention: ${retention}\n`, 'memoire'),
      );
      expect(resultat.erreurs).toEqual([]);
      expect(resultat.cours[0].memoire?.retention).toBe(Number(retention));
    }
  });

  it('memoire_refusee_si_mal_formee', () => {
    expect(erreursAvecDerogation('  algorithme: "sm2"\n', 'memoire')).toEqual([
      erreur(COURS, 'memoire.algorithme', /« leitner » ou « fsrs »/),
    ]);
    expect(erreursAvecDerogation('  retention: 0.9\n', 'memoire')).toEqual([
      erreur(COURS, 'memoire.algorithme', /obligatoire/i),
    ]);
    for (const retention of ['0.79', '0.96']) {
      expect(
        erreursAvecDerogation(`  algorithme: "fsrs"\n  retention: ${retention}\n`, 'memoire'),
      ).toEqual([erreur(COURS, 'memoire.retention', /entre 0,80 et 0,95/)]);
    }
    expect(erreursAvecDerogation('  algorithme: "fsrs"\n  jours: 3\n', 'memoire')).toEqual([
      erreur(COURS, 'memoire.jours', /Clé inconnue/),
    ]);
  });

  it('memoire_absente_le_cours_n_a_pas_la_cle', () => {
    expect('memoire' in analyserContenus(exempleDeCours()).cours[0]).toBe(false);
  });

  it('derogation_diffusion_acceptee', () => {
    const { cours, erreurs } = analyserContenus(
      avecDerogation(`  motif: "${MOTIF}"\n  date: "2026-10-16"\n`),
    );

    expect(erreurs).toEqual([]);
    expect(cours[0].derogationDiffusion).toEqual({ motif: MOTIF, date: '2026-10-16' });
    // L'ordre des clés est libre, et 2028-02-29 existe.
    expect(
      analyserContenus(avecDerogation(`  date: "2028-02-29"\n  motif: "${MOTIF}"\n`)).cours[0]
        .derogationDiffusion,
    ).toEqual({ motif: MOTIF, date: '2028-02-29' });
    // Sans la clé, le cours n'a pas de dérogation.
    expect(analyserContenus(exempleDeCours()).cours[0]).not.toHaveProperty('derogationDiffusion');
  });

  it('derogation_sans_motif_refusee', () => {
    expect(erreursAvecDerogation('  date: "2026-10-16"\n')).toEqual([
      erreur(COURS, 'derogation_diffusion.motif', /obligatoire/i),
    ]);
    for (const motif of ['""', '"   "']) {
      expect(erreursAvecDerogation(`  motif: ${motif}\n  date: "2026-10-16"\n`), motif).toEqual([
        erreur(COURS, 'derogation_diffusion.motif', /vide/),
      ]);
    }
    expect(erreursAvecDerogation('  motif: 3\n  date: "2026-10-16"\n')).toEqual([
      erreur(COURS, 'derogation_diffusion.motif', /un texte entre guillemets, trouvé un nombre/),
    ]);
    expect(erreursAvecDerogation('  motif: Relecture en cours\n  date: "2026-10-16"\n')).toEqual([
      erreur(COURS, 'derogation_diffusion.motif', /guillemets doubles/),
    ]);
    // Un drapeau n'est pas une dérogation écrite : il n'a ni motif ni date.
    expect(erreursAvecDerogation(' true\n')).toEqual([
      erreur(COURS, 'derogation_diffusion', /des clés et leurs valeurs, trouvé un booléen/),
    ]);
  });

  it('derogation_date_invalide_refusee', () => {
    for (const date of ['2026-02-30', '2026-13-01', '26-10-01', '2026-10-1', '1er octobre']) {
      expect(erreursAvecDerogation(`  motif: "${MOTIF}"\n  date: "${date}"\n`), date).toEqual([
        erreur(COURS, 'derogation_diffusion.date', /date/i),
      ]);
    }
    expect(erreursAvecDerogation(`  motif: "${MOTIF}"\n`)).toEqual([
      erreur(COURS, 'derogation_diffusion.date', /obligatoire/i),
    ]);
    expect(erreursAvecDerogation(`  motif: "${MOTIF}"\n  date: 2026-10-16\n`)).toEqual([
      erreur(COURS, 'derogation_diffusion.date', /guillemets doubles/),
    ]);
  });

  it('derogation_cle_inconnue_refusee', () => {
    expect(
      erreursAvecDerogation(`  motif: "${MOTIF}"\n  date: "2026-10-16"\n  auteur: "X"\n`),
    ).toEqual([erreur(COURS, 'derogation_diffusion.auteur', /Clé inconnue/)]);
    // La clé de `cours.yaml` s'écrit exactement `derogation_diffusion`.
    expect(
      erreursAvecDerogation(`  motif: "${MOTIF}"\n  date: "2026-10-16"\n`, 'derogation'),
    ).toEqual([erreur(COURS, 'derogation', /Clé inconnue/)]);
  });

  it('leitner_absent_refuse', () => {
    expect(erreursApres(COURS, LEITNER, '')).toEqual([erreur(COURS, 'leitner', /obligatoire/i)]);
    expect(erreursApres(COURS, '  intervalles: [0, 1, 2, 4, 8, 16]\n', '')).toEqual([
      erreur(COURS, 'leitner.intervalles', /obligatoire/i),
    ]);
    expect(erreursApres(COURS, '  nouvelles_par_seance: 15\n', '')).toEqual([
      erreur(COURS, 'leitner.nouvelles_par_seance', /obligatoire/i),
    ]);
    expect(
      erreursApres(
        COURS,
        '  nouvelles_par_seance: 15\n',
        '  nouvelles_par_seance: 15\n  jours: 3\n',
      ),
    ).toEqual([erreur(COURS, 'leitner.jours', /Clé inconnue/)]);
  });

  it('intervalles_six_entiers_croissants_depuis_zero', () => {
    const avec = (intervalles: string) => erreursApres(COURS, '[0, 1, 2, 4, 8, 16]', intervalles);

    expect(avec('[0, 1, 3, 7, 14, 30]')).toEqual([]);
    expect(analyserContenus(exempleDeCours()).cours[0].leitner).toEqual({
      intervalles: [0, 1, 2, 4, 8, 16],
      nouvellesParSeance: 15,
    });

    // Le premier, celui de la boîte 0 (les cartes neuves), vaut 0.
    expect(avec('[1, 2, 4, 8, 16, 32]')).toEqual([erreur(COURS, 'leitner.intervalles[0]', /0/)]);
    expect(avec('[-1, 1, 2, 4, 8, 16]')).toEqual([erreur(COURS, 'leitner.intervalles[0]', /0/)]);
    // Six valeurs exactement : une par boîte.
    expect(avec('[0, 1, 2, 4, 8]')).toEqual([erreur(COURS, 'leitner.intervalles', /exactement 6/)]);
    expect(avec('[0, 1, 2, 4, 8, 16, 32]')).toEqual([
      erreur(COURS, 'leitner.intervalles', /exactement 6/),
    ]);
    // Croissants au sens large : deux intervalles égaux passent, une valeur plus petite non.
    expect(avec('[0, 1, 2, 4, 4, 16]')).toEqual([]);
    expect(avec('[0, 0, 2, 4, 8, 16]')).toEqual([]);
    expect(avec('[0, 1, 2, 8, 4, 16]')).toEqual([
      erreur(COURS, 'leitner.intervalles[4]', /décroître/),
    ]);
    expect(avec('[0, 1, 2, 4, 8, 7]')).toEqual([
      erreur(COURS, 'leitner.intervalles[5]', /décroître/),
    ]);
    // Des entiers.
    expect(avec('[0, 1, 2, 4, 8, 16.5]')).toEqual([
      erreur(COURS, 'leitner.intervalles[5]', /entier/),
    ]);
    expect(avec('[0, 1, 2, 4, 8, "16"]')).toEqual([
      erreur(COURS, 'leitner.intervalles[5]', /un nombre, trouvé un texte/),
    ]);
  });

  it('nouvelles_par_seance_entier_de_1_a_100', () => {
    const avec = (valeur: string) =>
      erreursApres(COURS, 'nouvelles_par_seance: 15', `nouvelles_par_seance: ${valeur}`);

    for (const valeur of ['1', '15', '100']) expect(avec(valeur), valeur).toEqual([]);
    for (const valeur of ['0', '-3', '101']) {
      expect(avec(valeur), valeur).toEqual([
        erreur(COURS, 'leitner.nouvelles_par_seance', /entre 1 et 100/),
      ]);
    }
    expect(avec('1.5')).toEqual([erreur(COURS, 'leitner.nouvelles_par_seance', /entier/)]);
    expect(avec('"15"')).toEqual([
      erreur(COURS, 'leitner.nouvelles_par_seance', /un nombre, trouvé un texte/),
    ]);
  });

  it('reussite_entre_0_exclu_et_1', () => {
    const avec = (valeur: string) => erreursApres(TEXTES, 'reussite: 0.8', `reussite: ${valeur}`);

    expect(moduleDe(modulesDe(exempleDeCours()), TEXTES, 'texte-annote').reussite).toBe(0.8);
    for (const valeur of ['0.01', '0.5', '1']) expect(avec(valeur), valeur).toEqual([]);
    for (const valeur of ['0', '-0.2', '1.01', '2']) {
      expect(avec(valeur), valeur).toEqual([erreur(TEXTES, 'reussite', /entre 0 \(exclu\) et 1/)]);
    }
    expect(avec('"0.8"')).toEqual([erreur(TEXTES, 'reussite', /un nombre, trouvé un texte/)]);
    expect(erreursApres(TEXTES, 'reussite: 0.8\n', '')).toEqual([
      erreur(TEXTES, 'reussite', /obligatoire/i),
    ]);
  });

  it('examen_valide_resolu', () => {
    const examen = moduleDe(modulesDe(exempleDeCours()), EXAMEN, 'examen');

    expect(examen).toEqual({
      type: 'examen',
      id: 'nex8y92b',
      fichier: EXAMEN,
      ...REGLAGES_DE_L_EXAMEN,
    });
    expect(examen.tirage.aTaper).toBe(0.72);
    expect(examen).not.toHaveProperty('statut');
  });

  it('examen_n_a_pas_de_statut', () => {
    const titre = 'titre: "Probeprüfung zum Üben"\n';

    expect(erreursApres(EXAMEN, titre, `${titre}statut: "source"\n`)).toEqual([
      erreur(EXAMEN, 'statut', /Clé inconnue/),
    ]);
    expect(erreursApres(EXAMEN, titre, `${titre}verifie_le: "2026-10-01"\n`)).toEqual([
      erreur(EXAMEN, 'verifie_le', /Clé inconnue/),
    ]);
  });

  it('taille_par_defaut_hors_des_tailles_refusee', () => {
    const avec = (taille: number) =>
      erreursApres(EXAMEN, 'taille_par_defaut: 30', `taille_par_defaut: ${taille}`);

    for (const taille of [20, 30, 50]) expect(avec(taille), String(taille)).toEqual([]);
    for (const taille of [25, 0, -30, 100]) {
      expect(avec(taille), String(taille)).toEqual([
        erreur(EXAMEN, 'taille_par_defaut', /tailles/),
      ]);
    }
    expect(erreursApres(EXAMEN, 'taille_par_defaut: 30', 'taille_par_defaut: 30.5')).toEqual([
      erreur(EXAMEN, 'taille_par_defaut', /entier/),
    ]);
  });

  it('tailles_strictement_croissantes', () => {
    const avec = (tailles: string) =>
      erreursApres(EXAMEN, 'tailles: [20, 30, 50]', `tailles: ${tailles}`);

    expect(avec('[30]')).toEqual([]);
    expect(avec('[10, 30, 40]')).toEqual([]);
    expect(avec('[30, 20, 50]')).toEqual([erreur(EXAMEN, 'tailles[1]', /croître/)]);
    expect(avec('[20, 30, 30]')).toEqual([erreur(EXAMEN, 'tailles[2]', /croître/)]);
    expect(avec('[0, 30]')).toEqual([erreur(EXAMEN, 'tailles[0]', /entier positif/)]);
    expect(avec('[20.5, 30]')).toEqual([erreur(EXAMEN, 'tailles[0]', /entier/)]);
    expect(avec('[]')).toContainEqual(erreur(EXAMEN, 'tailles', /au moins une taille/));
  });

  it('tirage_non_cumule_refuse', () => {
    const avec = (avant: string, apres: string) =>
      erreursApres(EXAMEN, `  ${avant}\n`, apres === '' ? '' : `  ${apres}\n`);

    // Les seuils d'un tirage unique se cumulent : schema ≤ texte ≤ exercice ≤ feuille.
    expect(avec('schema: 0.10', 'schema: 0.20')).toEqual([erreur(EXAMEN, 'tirage.texte', /cumul/)]);
    expect(avec('exercice: 0.25', 'exercice: 0.15')).toEqual([
      erreur(EXAMEN, 'tirage.exercice', /cumul/),
    ]);
    expect(avec('schema: 0.10', 'schema: 0.17')).toEqual([]);
    expect(avec('schema: 0.10', 'schema: 0')).toEqual([]);
    expect(avec('exercice: 0.25', 'exercice: 0.35')).toEqual([]);
    // Toutes les valeurs sont dans [0, 1].
    // Hors de [0, 1], `mot` dépasse aussi `direct`, et `direct` passe sous `mot` : les deux
    // erreurs sont dites.
    expect(avec('mot: 0.12', 'mot: 1.5')).toEqual([
      erreur(EXAMEN, 'tirage.mot', /entre 0 et 1/),
      erreur(EXAMEN, 'tirage.direct', /cumul/),
    ]);
    expect(avec('direct: 0.45', 'direct: -0.1')).toEqual([
      erreur(EXAMEN, 'tirage.direct', /entre 0 et 1/),
      erreur(EXAMEN, 'tirage.direct', /cumul/),
    ]);
    // Hors de [0, 1], `exercice` dépasse aussi `feuille` : les deux erreurs sont dites.
    expect(avec('exercice: 0.25', 'exercice: 1.2')).toEqual([
      erreur(EXAMEN, 'tirage.exercice', /entre 0 et 1/),
      erreur(EXAMEN, 'tirage.feuille', /cumul/),
    ]);
    expect(avec('a_taper: 0.72', 'a_taper: "0.72"')).toEqual([
      erreur(EXAMEN, 'tirage.a_taper', /un nombre, trouvé un texte/),
    ]);
    // Sept seuils, ni plus ni moins.
    expect(avec('a_taper: 0.72', '')).toEqual([erreur(EXAMEN, 'tirage.a_taper', /obligatoire/i)]);
    expect(avec('a_taper: 0.72', 'a_taper: 0.72\n  autre: 1')).toEqual([
      erreur(EXAMEN, 'tirage.autre', /Clé inconnue/),
    ]);
  });

  it('seuil_direct_sous_mot_refuse', () => {
    const avec = (avant: string, apres: string) =>
      erreursApres(EXAMEN, `  ${avant}\n`, `  ${apres}\n`);

    expect(avec('direct: 0.45', 'direct: 0.05')).toEqual([
      erreur(EXAMEN, 'tirage.direct', /cumul/),
    ]);
    expect(avec('direct: 0.45', 'direct: 0.12')).toEqual([]);
  });

  it('seuil_a_taper_sous_direct_refuse', () => {
    const avec = (avant: string, apres: string) =>
      erreursApres(EXAMEN, `  ${avant}\n`, `  ${apres}\n`);

    expect(avec('a_taper: 0.72', 'a_taper: 0.30')).toEqual([
      erreur(EXAMEN, 'tirage.a_taper', /cumul/),
    ]);
    expect(avec('a_taper: 0.72', 'a_taper: 0.45')).toEqual([]);
  });

  it('tirage_feuille_inferieur_a_exercice_refuse', () => {
    const avec = (avant: string, apres: string) =>
      erreursApres(EXAMEN, `  ${avant}\n`, apres === '' ? '' : `  ${apres}\n`);

    expect(moduleDe(modulesDe(exempleDeCours()), EXAMEN, 'examen').tirage.feuille).toBe(0.35);
    // `feuille` suit `exercice` dans le cumul : exercice ≤ feuille ≤ 1 (F1-D6).
    expect(avec('feuille: 0.35', 'feuille: 0.2')).toEqual([
      erreur(EXAMEN, 'tirage.feuille', /cumul/),
    ]);
    expect(avec('exercice: 0.25', 'exercice: 0.4')).toEqual([
      erreur(EXAMEN, 'tirage.feuille', /cumul/),
    ]);
    expect(avec('feuille: 0.35', 'feuille: 0.25')).toEqual([]);
    expect(avec('feuille: 0.35', 'feuille: 1')).toEqual([]);
    expect(avec('feuille: 0.35', 'feuille: 1.1')).toEqual([
      erreur(EXAMEN, 'tirage.feuille', /entre 0 et 1/),
    ]);
    // Obligatoire dans le contenu ; seule la forme servie s'en passe (contenu en cache).
    expect(avec('feuille: 0.35', '')).toEqual([erreur(EXAMEN, 'tirage.feuille', /obligatoire/i)]);
  });

  it.each([
    ['secondes_par_question', '45', ['1', '120'], ['0', '-5', '45.5'], /entier/],
    ['minutes_minimum', '5', ['1', '10'], ['0', '-1', '2.5'], /entier/],
    ['note_suffisante', '4', ['1', '4.5', '6'], ['0.5', '6.5', '0'], /entre 1 et 6/],
    ['seuil_chapitre', '0.6', ['0.01', '1'], ['0', '1.1', '-0.5'], /entre 0 \(exclu\) et 1/],
  ] as const)('bornes_du_reglage_d_examen_%s', (cle, actuelle, admises, refusees, message) => {
    const avec = (valeur: string) =>
      erreursApres(EXAMEN, `${cle}: ${actuelle}\n`, `${cle}: ${valeur}\n`);

    for (const valeur of admises) expect(avec(valeur), valeur).toEqual([]);
    for (const valeur of refusees) {
      expect(avec(valeur), valeur).toEqual([erreur(EXAMEN, cle, message)]);
    }
    expect(avec('"1"')).toEqual([erreur(EXAMEN, cle, /trouvé un texte/)]);
    expect(erreursApres(EXAMEN, `${cle}: ${actuelle}\n`, '')).toEqual([
      erreur(EXAMEN, cle, /obligatoire/i),
    ]);
  });

  // Un module de ces types est unique dans le cours : le client en tire ses onglets (« Wortbaukasten »,
  // « Berichte », « Grammatik », « Prüfung »). Les cartes et les schémas, eux, sont aussi nombreux
  // qu'on veut.
  it.each([
    ['examen', EXAMEN],
    ['morphologie', MORPHOLOGIE],
    ['texte-annote', TEXTES],
    ['exercices', EXERCICES],
  ])('deux_modules_%s_refuses', (type, fichier) => {
    const copie = `essai/copie-${type}.yaml`;
    const fichiers = exempleDeCours();
    fichiers.set(copie, fichiers.get(fichier) ?? '');
    modifier(
      fichiers,
      COURS,
      '  - "examen.yaml"\n',
      `  - "examen.yaml"\n  - "copie-${type}.yaml"\n`,
    );

    // La copie porte les mêmes identifiants : ces erreurs-là ne sont pas l'objet du test.
    const erreurs = analyserContenus(fichiers).erreurs.filter((e) =>
      /Au plus un module/.test(e.message),
    );

    expect(erreurs).toEqual([erreur(copie, 'type', new RegExp(`« ${type} ».*${fichier}`))]);
  });

  it('plusieurs_modules_de_schemas_admis', () => {
    const fichiers = exempleDeCours();
    fichiers.set('essai/schemas/copie.yaml', fichiers.get(SCHEMA) ?? '');
    modifier(
      fichiers,
      COURS,
      '  - "examen.yaml"\n',
      '  - "examen.yaml"\n  - "schemas/copie.yaml"\n',
    );

    const erreurs = analyserContenus(fichiers).erreurs;

    expect(erreurs.filter((e) => /Au plus un module/.test(e.message))).toEqual([]);
  });

  it.each([
    ['morphologie', MORPHOLOGIE, 'Rezeptwörter in Teile zerlegen und neu bilden'],
    ['schema', SCHEMA, 'Übungsschema mit drei Punkten'],
    ['texte-annote', TEXTES, 'Kochbegriffe und Zutaten in Rezepten verstehen'],
    ['exercices', EXERCICES, 'Artikel und Plural zum Üben'],
  ] as const)('description_facultative_texte_non_vide_%s', (type, fichier, description) => {
    const ligne = `description: "${description}"`;

    expect(moduleDe(modulesDe(exempleDeCours()), fichier, type).description).toBe(description);

    // Facultative : sans elle, la clé est absente du modèle.
    const sans = modulesDe(modifier(exempleDeCours(), fichier, `${ligne}\n`, ''));
    expect(moduleDe(sans, fichier, type)).not.toHaveProperty('description');

    // Un texte non vide.
    for (const vide of ['""', '"   "']) {
      expect(erreursApres(fichier, ligne, `description: ${vide}`), vide).toEqual([
        erreur(fichier, 'description', /vide/),
      ]);
    }
    expect(erreursApres(fichier, ligne, 'description: 3')).toEqual([
      erreur(fichier, 'description', /un texte entre guillemets, trouvé un nombre/),
    ]);
    expect(erreursApres(fichier, ligne, `description: ${description}`)).toEqual([
      erreur(fichier, 'description', /guillemets doubles/),
    ]);
  });

  it('consigne_facultative_texte_non_vide', () => {
    const consigne = 'Rezepttexte zum Lesen und Üben – frei erfunden.';
    const ligne = `consigne: "${consigne}"`;

    expect(moduleDe(modulesDe(exempleDeCours()), TEXTES, 'texte-annote').consigne).toBe(consigne);

    // Facultative : sans elle, la clé est absente du modèle.
    const sans = modulesDe(modifier(exempleDeCours(), TEXTES, `${ligne}\n`, ''));
    expect(moduleDe(sans, TEXTES, 'texte-annote')).not.toHaveProperty('consigne');

    // Un texte non vide.
    for (const vide of ['""', '"   "']) {
      expect(erreursApres(TEXTES, ligne, `consigne: ${vide}`), vide).toEqual([
        erreur(TEXTES, 'consigne', /vide/),
      ]);
    }
    expect(erreursApres(TEXTES, ligne, 'consigne: 3')).toEqual([
      erreur(TEXTES, 'consigne', /un texte entre guillemets, trouvé un nombre/),
    ]);
    expect(erreursApres(TEXTES, ligne, `consigne: ${consigne}`)).toEqual([
      erreur(TEXTES, 'consigne', /guillemets doubles/),
    ]);
  });

  it('consigne_reservee_aux_textes_annotes', () => {
    for (const [fichier, type] of [
      [CARTES_1, 'cartes'],
      [MORPHOLOGIE, 'morphologie'],
      [SCHEMA, 'schema'],
      [EXERCICES, 'exercices'],
      [FEUILLE, 'feuille'],
      [EXAMEN, 'examen'],
    ]) {
      expect(
        erreursApres(fichier, `type: "${type}"\n`, `type: "${type}"\nconsigne: "Kurzer Text"\n`),
        type,
      ).toEqual([erreur(fichier, 'consigne', /Clé inconnue/)]);
    }
  });

  it('description_reservee_a_quatre_types_de_module', () => {
    expect(
      erreursApres(
        CARTES_1,
        'statut: "source"\ncartes:',
        'statut: "source"\ndescription: "Kapitel"\ncartes:',
      ),
    ).toEqual([erreur(CARTES_1, 'description', /Clé inconnue/)]);
    expect(erreursApres(EXAMEN, 'tailles:', 'description: "Prüfung zum Üben"\ntailles:')).toEqual([
      erreur(EXAMEN, 'description', /Clé inconnue/),
    ]);
    expect(erreursApres(FEUILLE, 'parties:\n', 'description: "Arbeitsblatt"\nparties:\n')).toEqual([
      erreur(FEUILLE, 'description', /Clé inconnue/),
    ]);
  });

  it('refuse_un_identifiant_en_double_entre_fichiers', () => {
    const erreurs = erreursApres(CARTES_2, 'id: "4g84caqa"', 'id: "ed3d8me1"');

    expect(erreurs).toEqual([
      erreur(CARTES_2, 'cartes[0].id', /ed3d8me1/),
      erreur('ids.lock', 'ligne 11', /4g84caqa.*disparu/),
    ]);
    expect(erreurs[0].message).toContain(`${CARTES_1}:cartes[0].id`);
    expect(erreurs[0].message).toContain(`${CARTES_2}:cartes[0].id`);
  });

  it('refuse_un_identifiant_mal_forme', () => {
    expect(erreursApres(CARTES_1, 'id: "ed3d8me1"', 'id: "ed3d8mei"')).toEqual([
      erreur(CARTES_1, 'cartes[0].id', /mal formé/),
    ]);
    expect(erreursApres(COURS, 'id: "j5by5stz"', 'id: "J5BY5STZ"')).toEqual([
      erreur(COURS, 'id', /mal formé/),
    ]);
  });

  it('refuse_un_recto_en_double_dans_un_module', () => {
    expect(erreursApres(CARTES_1, 'recto: "Probelappen"', 'recto: "Musterorgan"')).toEqual([
      erreur(CARTES_1, 'cartes[1].recto', /double.*cartes\[0\]\.recto/),
    ]);
    expect(erreursApres(CARTES_2, 'recto: "kontra-"', 'recto: "Musterorgan"')).toEqual([]);
  });

  it('refuse_un_numero_en_double', () => {
    expect(erreursApres(CARTES_2, 'numero: 2', 'numero: 1')).toEqual([
      erreur(CARTES_2, 'numero', /01-grundbegriffe\.yaml/),
    ]);
  });

  it('refuse_un_espace_en_bord_de_texte', () => {
    expect(erreursApres(CARTES_1, 'recto: "Musterorgan"', 'recto: " Zystitis"')).toEqual([
      erreur(CARTES_1, 'cartes[0].recto', /espace/),
    ]);
    expect(erreursApres(CARTES_1, 'recto: "Musterorgan"', 'recto: "Zystitis "')).toEqual([
      erreur(CARTES_1, 'cartes[0].recto', /espace/),
    ]);
    expect(erreursApres(CARTES_2, 'verso: "gegen"', 'verso: "ge\\tgen"')).toEqual([
      erreur(CARTES_2, 'cartes[1].verso', /tabulation/),
    ]);
    expect(erreursApres(CARTES_2, 'verso: "gegen"', 'verso: "ge\\ngen"')).toEqual([
      erreur(CARTES_2, 'cartes[1].verso', /saut de ligne/),
    ]);
    expect(erreursApres(CARTES_2, 'verso: "gegen"', 'verso: ""')).toEqual([
      erreur(CARTES_2, 'cartes[1].verso', /vide/),
    ]);
  });

  it('refuse_des_reponses_vides', () => {
    expect(erreursApres(CARTES_2, 'reponses: ["proto"]', 'reponses: []')).toEqual([
      erreur(CARTES_2, 'cartes[0].reponses', /vide/),
    ]);
    expect(erreursApres(CARTES_2, 'reponses: ["proto"]', 'reponses: ["proto", ""]')).toEqual([
      erreur(CARTES_2, 'cartes[0].reponses[1]', /vide/),
    ]);
  });

  it('refuse_un_type_de_carte_inconnu', () => {
    expect(erreursApres(CARTES_1, 'type: "g"', 'type: "z"')).toEqual([
      erreur(CARTES_1, 'cartes[2].type', /types_de_carte/),
    ]);
  });

  it('refuse_un_chapitre_qui_n_est_pas_un_module_de_cartes', () => {
    expect(erreursApres(MORPHOLOGIE, 'chapitres: ["f9qmb1xs"]', 'chapitres: ["v1xmwpyr"]')).toEqual(
      [erreur(MORPHOLOGIE, 'chapitres[0]', /module de cartes/)],
    );
  });

  it('refuse_un_morpheme_inconnu', () => {
    expect(
      erreursApres(
        MORPHOLOGIE,
        '- texte: "Muster"\n        morpheme: "m2x1qnz2"',
        '- texte: "Muster"\n        morpheme: "rhg18m9y"',
      ),
    ).toEqual([erreur(MORPHOLOGIE, 'mots[1].segments[0].morpheme', /morphème/i)]);
  });

  it('refuse_un_mot_qui_ne_se_recompose_pas', () => {
    expect(erreursApres(MORPHOLOGIE, 'mot: "Musteritis"', 'mot: "Musterose"')).toEqual([
      erreur(MORPHOLOGIE, 'mots[1].segments', /recompos/),
    ]);
  });

  it('refuse_un_mot_en_double', () => {
    const fichiers = modifier(
      exempleDeCours(),
      MORPHOLOGIE,
      'mot: "Musteritis"',
      'mot: "Protomusteritis"',
    );
    modifier(fichiers, MORPHOLOGIE, '- texte: "Muster"\n', '- texte: "Protomuster"\n');

    expect(analyserContenus(fichiers).erreurs).toEqual([
      erreur(MORPHOLOGIE, 'mots[1].mot', /double.*mots\[0\]\.mot/),
    ]);
  });

  it('refuse_un_point_trop_pres_du_bord', () => {
    expect(erreursApres(SCHEMA, 'x: 40', 'x: 7')).toEqual([erreur(SCHEMA, 'points[0]', /bord/)]);
    expect(erreursApres(SCHEMA, 'y: 70', 'y: 93')).toEqual([erreur(SCHEMA, 'points[2]', /bord/)]);
    expect(erreursApres(SCHEMA, 'x: 40', 'x: 8')).toEqual([]);
    expect(erreursApres(SCHEMA, 'y: 70', 'y: 92')).toEqual([]);
  });

  it('refuse_deux_points_trop_proches', () => {
    expect(erreursApres(SCHEMA, 'x: 100\n    y: 50', 'x: 40\n    y: 48')).toEqual([
      erreur(SCHEMA, 'points[1]', /points\[0\].*18/),
    ]);
    expect(erreursApres(SCHEMA, 'x: 100\n    y: 50', 'x: 40\n    y: 49')).toEqual([]);
  });

  it('refuse_un_terme_en_double_dans_un_schema', () => {
    expect(erreursApres(SCHEMA, 'terme: "Mitte"', 'terme: "Oberpol"')).toEqual([
      erreur(SCHEMA, 'points[1].terme', /double.*points\[0\]\.terme/),
    ]);
  });

  it('refuse_un_svg_mal_ferme', () => {
    expect(
      erreursApres(DESSIN, '<circle cx="100" cy="50" r="20"/>', '<circle cx="100" cy="50" r="20">'),
    ).toEqual([erreur(DESSIN, '', /non fermée/)]);
    expect(erreursApres(DESSIN, '</svg>\n', '')).toEqual([erreur(DESSIN, '', /cadre/)]);
  });

  /*
   * R37 : le dessin est inséré tel quel dans la page (`DessinSchema.tsx`). Rien n'y doit exécuter
   * du code ni charger une ressource hors du dessin. Le piège remplace le cercle, à la ligne 3 du
   * fichier ; le message situe la ligne sans citer le texte.
   */
  const CERCLE = '<circle cx="100" cy="50" r="20"/>';

  it('refuse_un_element_interdit_dans_un_dessin', () => {
    for (const [element, piege] of [
      ['script', '<script/>'],
      ['script', '<SCRIPT/>'],
      ['foreignObject', '<foreignObject width="10" height="10"/>'],
      ['iframe', '<iframe/>'],
      ['object', '<object/>'],
      ['embed', '<embed/>'],
    ]) {
      expect(erreursApres(DESSIN, CERCLE, piege), piege).toEqual([
        erreur(DESSIN, 'ligne 3', new RegExp(`^Élément « ${element} » interdit dans un dessin`)),
      ]);
    }
  });

  it('refuse_un_attribut_d_evenement_dans_un_dessin', () => {
    for (const piege of [
      '<circle cx="100" cy="50" r="20" onclick="appel()"/>',
      '<circle cx="100" cy="50" r="20" ONLOAD="appel()"/>',
      '<circle cx="100" cy="50" r="20" onmouseover = "appel()"/>',
      '<circle cx="100" cy="50" r="20"/onfocus="appel()"/>',
    ]) {
      expect(erreursApres(DESSIN, CERCLE, piege), piege).toEqual([
        erreur(DESSIN, 'ligne 3', /^Attribut d'événement \(on…\) interdit dans un dessin/),
      ]);
    }
    // Sur une autre ligne, l'erreur la nomme.
    expect(
      erreursApres(DESSIN, '<path d="M40 30 L160 70"/>', '<path d="M40 30 L160 70" onload="x"/>'),
    ).toEqual([erreur(DESSIN, 'ligne 4', /^Attribut d'événement/)]);
  });

  it('refuse_javascript_dans_un_dessin', () => {
    for (const piege of [
      '<rect fill="javascript:appel()"/>',
      '<rect fill="JavaScript:appel()"/>',
      // Écrit autrement, il reste ce que lit le navigateur : références décodées, tabulations et
      // sauts de ligne retirés.
      '<rect fill="java&#x73;cript:appel()"/>',
      '<rect fill="java&#115;cript&colon;appel()"/>',
      '<rect fill="java&Tab;script:appel()"/>',
      '<rect fill="java\tscript:appel()"/>',
    ]) {
      expect(erreursApres(DESSIN, CERCLE, piege), piege).toEqual([
        erreur(DESSIN, 'ligne 3', /^« javascript: » interdit dans un dessin/),
      ]);
    }
  });

  it('refuse_un_lien_hors_du_dessin', () => {
    for (const piege of [
      '<use href="https://exemple.invalid/forme.svg#forme"/>',
      '<use xlink:href="data:image/svg+xml;base64,AAAA"/>',
      "<use href='forme.svg'/>",
      '<use href=forme.svg/>',
      '<use href=""/>',
      '<use HREF = "/forme.svg"/>',
    ]) {
      expect(erreursApres(DESSIN, CERCLE, piege), piege).toEqual([
        erreur(DESSIN, 'ligne 3', /^Lien interdit dans un dessin/),
      ]);
    }
  });

  it('accepte_un_lien_vers_un_element_du_dessin', () => {
    for (const lien of [
      '<use href="#forme"/>',
      "<use xlink:href='#forme'/>",
      '<use href=#forme/>',
      '<use href = "#forme"/>',
    ]) {
      expect(erreursApres(DESSIN, CERCLE, lien), lien).toEqual([]);
    }
  });

  it('message_d_un_dessin_piege_ne_cite_pas_le_texte', () => {
    const piege =
      '<circle r="20" onclick="appelSecret()"/><use href="https://secret.invalid/x"/>' +
      '<rect fill="javascript:appelSecret()"/><iframe/>';
    const erreurs = erreursApres(DESSIN, CERCLE, piege);

    expect(erreurs).toHaveLength(4);
    for (const { lieu, message } of erreurs) {
      expect(lieu).toBe('ligne 3');
      expect(message).not.toMatch(/appelSecret|secret\.invalid|circle|<use|<set/);
    }
  });

  it('refuse_un_viewbox_mal_forme', () => {
    expect(erreursApres(DESSIN, 'viewBox="0 0 200 100"', 'viewBox="0 0 200"')).toEqual([
      erreur(DESSIN, 'viewBox', /4 nombres/),
    ]);
  });

  it('refuse_un_dessin_introuvable', () => {
    expect(erreursApres(SCHEMA, 'dessin: "muster.svg"', 'dessin: "herz.svg"')).toEqual([
      erreur(SCHEMA, 'dessin', /introuvable.*essai\/schemas\/herz\.svg/),
      erreur(DESSIN, '', /référencé/),
    ]);
  });

  it('refuse_un_jeton_mal_forme_ou_un_crochet_residuel', () => {
    expect(erreursApres(TEXTES, '|t688vh43]]', '|T688VH43]]')).toEqual([
      erreur(TEXTES, 'textes[0].texte', /jetons\[0\].*mal formé/),
    ]);
    expect(erreursApres(TEXTES, 'nach Bedarf|90vd725z', 'nach Bedarf 90vd725z')).toEqual([
      erreur(TEXTES, 'textes[0].texte', /« \[\[ » ou « \]\] »/),
    ]);
  });

  it('refuse_un_distracteur_egal_a_la_reponse', () => {
    expect(erreursApres(TEXTES, '"Seit Jahren"', '"Seit dem Frühstück"')).toEqual([
      erreur(TEXTES, 'textes[0].questions[0].distracteurs', /réponse/),
    ]);
  });

  it('refuse_des_distracteurs_en_double_ou_pas_trois', () => {
    expect(erreursApres(TEXTES, '"Ruhen", "Laufen"', '"Ruhen", "Ruhen"')).toEqual([
      erreur(TEXTES, 'textes[0].questions[1].distracteurs', /double/),
    ]);
    expect(erreursApres(TEXTES, '"Ruhen", "Laufen"', '"Ruhen"')).toEqual([
      erreur(TEXTES, 'textes[0].questions[1].distracteurs', /exactement 3/),
    ]);
  });

  it('refuse_des_options_sans_la_reponse', () => {
    expect(erreursApres(EXERCICES, 'reponse: "der"', 'reponse: "dem"')).toEqual([
      erreur(EXERCICES, 'familles[0].exercices[0].reponse', /options de la famille/),
    ]);
    expect(
      erreursApres(
        EXERCICES,
        '        reponse: "die"\n',
        '        reponse: "die"\n        options: ["der", "das", "dem"]\n',
      ),
    ).toEqual([erreur(EXERCICES, 'familles[0].exercices[1].options', /réponse/)]);
    expect(
      erreursApres(EXERCICES, 'options: ["der", "die", "das"]', 'options: ["der", "die", "die"]'),
    ).toEqual([erreur(EXERCICES, 'familles[0].options', /double/)]);
  });

  it('options_en_double_d_un_exercice', () => {
    expect(
      erreursApres(
        EXERCICES,
        '        reponse: "die"\n',
        '        reponse: "die"\n        options: ["der", "die", "die"]\n',
      ),
    ).toEqual([erreur(EXERCICES, 'familles[0].exercices[1].options', /double/)]);
  });

  it('options_de_famille_appliquees', () => {
    const familles = moduleDe(modulesDe(exempleDeCours()), EXERCICES, 'exercices').familles;
    const regle = 'Die Endung bestimmt das Geschlecht.';

    expect(familles).toEqual([
      {
        code: 'artikel',
        libelle: 'Artikel',
        exercices: [
          {
            id: '7g7wk0z1',
            invite: '___ Musterus',
            reponse: 'der',
            options: ['der', 'die', 'das'],
            regle,
            statut: 'source',
          },
          {
            id: '301zktwp',
            invite: '___ Probela',
            reponse: 'die',
            options: ['der', 'die', 'das'],
            regle: 'Endung -a: Artikel die',
            statut: 'source',
          },
        ],
      },
      {
        code: 'plural',
        libelle: 'Plural',
        exercices: [
          { id: 'e5pnxb2n', invite: 'Musterus → Plural', reponse: 'Musteri', statut: 'source' },
          {
            id: 'tvm1e7ah',
            invite: 'Probela → Plural',
            reponse: 'Probelae',
            statut: 'à vérifier',
          },
        ],
      },
    ]);
    expect(familles[1].exercices[0]).not.toHaveProperty('options');
    expect(familles[1].exercices[0]).not.toHaveProperty('regle');

    const surcharge = modifier(
      exempleDeCours(),
      EXERCICES,
      '        reponse: "die"\n',
      '        reponse: "die"\n        options: ["die", "das"]\n',
    );
    expect(
      moduleDe(modulesDe(surcharge), EXERCICES, 'exercices').familles[0].exercices[1],
    ).toMatchObject({ options: ['die', 'das'] });
  });

  // --- Le module `feuille` (F1) ---

  it('feuille_exemple_resolue', () => {
    const feuille = moduleDe(modulesDe(exempleDeCours()), FEUILLE, 'feuille');
    // Les éléments prennent le statut de la feuille, sauf ceux qui écrivent le leur (F1-D2).
    const aVerifier = { statut: 'à vérifier' } as const;

    expect(feuille).toStrictEqual({
      type: 'feuille',
      id: '9wjxv82j',
      fichier: FEUILLE,
      numero: 1,
      titre: 'Übungsblatt 1 – Musterkunde',
      parties: [
        {
          titre: 'Teil A: Zuordnungsaufgaben',
          taches: [
            {
              id: 'hatk2eac',
              genre: 'appariement',
              consigne: 'Ordnen Sie die Begriffe den Erklärungen zu.',
              paires: [
                {
                  id: '4bc2tbhe',
                  terme: 'Musterorganum',
                  cible: 'Erfundenes Übungsorgan',
                  statut: 'vérifié',
                  verifieLe: '2026-10-19',
                },
                {
                  id: 'm68hg1re',
                  terme: 'Probelappen',
                  cible: 'Teil des Musterorgans',
                  ...aVerifier,
                },
              ],
            },
            {
              id: 'h5zv5rdq',
              genre: 'classement',
              consigne: 'Ordnen Sie die Vorsilben der richtigen Gruppe zu.',
              categories: ['Lagebezeichnung', 'Mengenangabe'],
              elements: [
                {
                  id: 'dxqavhcg',
                  terme: 'supramuster-',
                  categorie: 'Lagebezeichnung',
                  ...aVerifier,
                },
                { id: '4rzj4cvb', terme: 'polymuster-', categorie: 'Mengenangabe', ...aVerifier },
              ],
            },
          ],
        },
        {
          titre: 'Teil B: Auswahlaufgaben',
          taches: [
            {
              id: 'gbt5q87v',
              genre: 'qcm',
              consigne: 'Wählen Sie die richtige Antwort.',
              questions: [
                {
                  id: 'x9wzygy4',
                  question: 'Was bedeutet die Vorsilbe proto-?',
                  reponse: 'erfunden, zur Übung',
                  distracteurs: ['gegen etwas gerichtet', 'halb so gross', 'sehr viele davon'],
                  ...aVerifier,
                },
              ],
            },
            {
              id: 'hp0zbdh2',
              genre: 'vrai-faux',
              consigne: 'Richtig oder falsch?',
              affirmations: [
                {
                  id: 'npcgzqe2',
                  affirmation: 'Das Musterorgan ist frei erfunden.',
                  vrai: true,
                  ...aVerifier,
                },
                {
                  id: '88jvr1wz',
                  affirmation: 'Die Vorsilbe kontra- bedeutet mit.',
                  vrai: false,
                  correction: 'Die Vorsilbe kontra- bedeutet gegen.',
                  ...aVerifier,
                },
              ],
            },
          ],
        },
        {
          titre: 'Teil C: Zutaten ergänzen',
          taches: [
            {
              id: '7p9a5nnf',
              genre: 'trous',
              consigne: 'Ergänzen Sie die Lücken mit den Wörtern der Liste.',
              liste: ['oberes Ende', 'unteres Ende', 'seitlicher Rand'],
              phrases: [
                {
                  id: 'ymn0s16n',
                  texte: 'Der Oberpol ist das ___, der Unterpol das ___.',
                  reponses: ['oberes Ende', 'unteres Ende'],
                  ...aVerifier,
                },
              ],
            },
            {
              id: '8np95qta',
              genre: 'orthographe',
              consigne: 'Korrigieren Sie die Schreibweise.',
              mots: [
                {
                  id: '3kxvpj39',
                  fautif: 'Probelapenentzündung',
                  reponse: 'Probelappenentzündung',
                  ...aVerifier,
                },
              ],
            },
          ],
        },
        {
          titre: 'Teil D: Offene Fragen',
          taches: [
            {
              id: 'mhg83t90',
              genre: 'ouverte',
              consigne: 'Beantworten Sie die Frage in einem Satz.',
              questions: [
                {
                  id: 'x4jzxbsn',
                  question: 'Wozu dient das Musterorgan?',
                  reponse: 'Es dient nur zum Üben der Begriffe.',
                  statut: 'source',
                },
              ],
            },
          ],
        },
      ],
    });

    // Une tâche n'a pas de statut (F1-D2) : la clé y est refusée comme toute clé inconnue.
    expect(
      erreursApres(FEUILLE, 'genre: "qcm"\n', 'genre: "qcm"\n        statut: "source"\n'),
    ).toEqual([erreur(FEUILLE, 'parties[1].taches[0].statut', /Clé inconnue/)]);
    // Une trous sans liste de mots est admise : chaque trou se tape.
    const sansListe = modifier(
      exempleDeCours(),
      FEUILLE,
      '        liste: ["oberes Ende", "unteres Ende", "seitlicher Rand"]\n',
      '',
    );
    expect(
      moduleDe(modulesDe(sansListe), FEUILLE, 'feuille').parties[2].taches[0],
    ).not.toHaveProperty('liste');
  });

  it('feuille_ids_notes_pour_le_verrou', () => {
    const { identifiants } = analyserContenus(exempleDeCours());
    const lieux: Record<string, string> = {
      '9wjxv82j': 'id',
      hatk2eac: 'parties[0].taches[0].id',
      '4bc2tbhe': 'parties[0].taches[0].paires[0].id',
      m68hg1re: 'parties[0].taches[0].paires[1].id',
      h5zv5rdq: 'parties[0].taches[1].id',
      dxqavhcg: 'parties[0].taches[1].elements[0].id',
      '4rzj4cvb': 'parties[0].taches[1].elements[1].id',
      gbt5q87v: 'parties[1].taches[0].id',
      x9wzygy4: 'parties[1].taches[0].questions[0].id',
      hp0zbdh2: 'parties[1].taches[1].id',
      npcgzqe2: 'parties[1].taches[1].affirmations[0].id',
      '88jvr1wz': 'parties[1].taches[1].affirmations[1].id',
      '7p9a5nnf': 'parties[2].taches[0].id',
      ymn0s16n: 'parties[2].taches[0].phrases[0].id',
      '8np95qta': 'parties[2].taches[1].id',
      '3kxvpj39': 'parties[2].taches[1].mots[0].id',
      mhg83t90: 'parties[3].taches[0].id',
      x4jzxbsn: 'parties[3].taches[0].questions[0].id',
    };

    for (const [id, lieu] of Object.entries(lieux)) {
      expect(identifiants.get(id), id).toBe(`${FEUILLE}:${lieu}`);
    }
    // Le verrou les voit : un identifiant d'élément absent d'ids.lock est signalé à son lieu.
    expect(erreursApres('ids.lock', '\nx4jzxbsn\n', '\n')).toEqual([
      erreur(FEUILLE, 'parties[3].taches[0].questions[0].id', /x4jzxbsn.*absent d'ids\.lock/),
    ]);
    // Une tâche aussi.
    expect(erreursApres('ids.lock', '\nhatk2eac\n', '\n')).toEqual([
      erreur(FEUILLE, 'parties[0].taches[0].id', /hatk2eac.*absent d'ids\.lock/),
    ]);
  });

  it('feuille_cibles_en_double_refusees', () => {
    const erreurs = erreursApres(
      FEUILLE,
      'cible: "Teil des Musterorgans"',
      'cible: "Erfundenes Übungsorgan"',
    );

    expect(erreurs).toEqual([
      erreur(
        FEUILLE,
        'parties[0].taches[0].paires[1].cible',
        /^Cible en double : déjà en parties\[0\]\.taches\[0\]\.paires\[0\]\.cible\.$/,
      ),
    ]);
  });

  it('feuille_termes_en_double_refuses', () => {
    // Dans un appariement.
    expect(erreursApres(FEUILLE, 'terme: "Probelappen"', 'terme: "Musterorganum"')).toEqual([
      erreur(
        FEUILLE,
        'parties[0].taches[0].paires[1].terme',
        /^Terme en double : déjà en parties\[0\]\.taches\[0\]\.paires\[0\]\.terme\.$/,
      ),
    ]);
    // Dans un classement.
    expect(erreursApres(FEUILLE, 'terme: "polymuster-"', 'terme: "supramuster-"')).toEqual([
      erreur(
        FEUILLE,
        'parties[0].taches[1].elements[1].terme',
        /^Terme en double : déjà en parties\[0\]\.taches\[1\]\.elements\[0\]\.terme\.$/,
      ),
    ]);
  });

  it('feuille_categorie_inconnue_refusee', () => {
    const erreurs = erreursApres(FEUILLE, 'categorie: "Mengenangabe"', 'categorie: "Zeitangabe"');

    expect(erreurs).toEqual([
      erreur(FEUILLE, 'parties[0].taches[1].elements[1].categorie', /^Catégorie inconnue/),
    ]);
    expect(erreurs[0].message).not.toContain('Zeitangabe');
  });

  it('feuille_distracteur_egal_reponse_refuse', () => {
    expect(erreursApres(FEUILLE, '"halb so gross"', '"erfunden, zur Übung"')).toEqual([
      erreur(FEUILLE, 'parties[1].taches[0].questions[0].distracteurs', /égal à la réponse/),
    ]);
  });

  it('feuille_distracteurs_en_double_refuses', () => {
    expect(erreursApres(FEUILLE, '"sehr viele davon"', '"halb so gross"')).toEqual([
      erreur(FEUILLE, 'parties[1].taches[0].questions[0].distracteurs', /double/),
    ]);
    // Exactement 3, comme les questions des comptes rendus.
    expect(erreursApres(FEUILLE, ', "sehr viele davon"', '')).toEqual([
      erreur(FEUILLE, 'parties[1].taches[0].questions[0].distracteurs', /exactement 3/),
    ]);
  });

  it('feuille_trous_et_reponses_en_nombre_different_refuses', () => {
    const reponses = 'reponses: ["oberes Ende", "unteres Ende"]';

    expect(erreursApres(FEUILLE, reponses, 'reponses: ["oberes Ende"]')).toEqual([
      erreur(
        FEUILLE,
        'parties[2].taches[0].phrases[0].reponses',
        /^2 trous \(___\) pour 1 réponse/,
      ),
    ]);
    expect(
      erreursApres(
        FEUILLE,
        reponses,
        'reponses: ["oberes Ende", "unteres Ende", "seitlicher Rand"]',
      ),
    ).toEqual([
      erreur(
        FEUILLE,
        'parties[2].taches[0].phrases[0].reponses',
        /^2 trous \(___\) pour 3 réponse/,
      ),
    ]);
    // Une phrase a au moins un trou, donc au moins une réponse.
    expect(erreursApres(FEUILLE, reponses, 'reponses: []')).toEqual([
      erreur(FEUILLE, 'parties[2].taches[0].phrases[0].reponses', /au moins une réponse/),
    ]);
    expect(
      erreursApres(
        FEUILLE,
        'texte: "Der Oberpol ist das ___, der Unterpol das ___."',
        'texte: "Der Oberpol ist oben, der Unterpol unten."',
      ),
    ).toEqual([
      erreur(FEUILLE, 'parties[2].taches[0].phrases[0].reponses', /^0 trou \(___\) pour 2 réponse/),
    ]);
  });

  it('feuille_reponse_hors_liste_refusee', () => {
    const liste = 'liste: ["oberes Ende", "unteres Ende", "seitlicher Rand"]';

    expect(erreursApres(FEUILLE, liste, 'liste: ["oberes Ende", "seitlicher Rand"]')).toEqual([
      erreur(FEUILLE, 'parties[2].taches[0].phrases[0].reponses[1]', /liste de mots/),
    ]);
    // La liste se compare à l'identique (F1-D4) : une majuscule de plus n'en fait pas partie.
    expect(
      erreursApres(FEUILLE, liste, 'liste: ["Oberes Ende", "unteres Ende", "seitlicher Rand"]'),
    ).toEqual([erreur(FEUILLE, 'parties[2].taches[0].phrases[0].reponses[0]', /liste de mots/)]);
  });

  it('feuille_orthographe_identique_refusee', () => {
    const erreurs = erreursApres(
      FEUILLE,
      'fautif: "Probelapenentzündung"',
      'fautif: "Probelappenentzündung"',
    );

    expect(erreurs).toEqual([
      erreur(FEUILLE, 'parties[2].taches[1].mots[0].fautif', /égale à la réponse/),
    ]);
    expect(erreurs[0].message).not.toContain('Probelappen');
  });

  it('feuille_orthographe_identique_a_la_comparaison_refusee', () => {
    // Même comparaison que la correction (F1-D4) : forme Unicode et espaces ne comptent pas.
    for (const fautif of ['Probelappenentzündung', '  Probelappenentzündung ']) {
      expect(
        erreursApres(FEUILLE, 'fautif: "Probelapenentzündung"', `fautif: "${fautif}"`),
      ).toEqual([erreur(FEUILLE, 'parties[2].taches[1].mots[0].fautif', /égale à la réponse/)]);
    }
  });

  it('feuille_tache_sans_element_refusee', () => {
    const questions =
      '        questions:\n          - id: "x4jzxbsn"\n            question: "Wozu dient das Musterorgan?"\n            reponse: "Es dient nur zum Üben der Begriffe."\n            statut: "source"\n';

    expect(erreursApres(FEUILLE, questions, '        questions: []\n')).toEqual([
      erreur(FEUILLE, 'parties[3].taches[0].questions', /au moins un élément/),
    ]);
  });

  it('feuille_sans_partie_ou_partie_sans_tache_refusee', () => {
    // Une partie sans tâche n'a rien à faire faire.
    const teilD = `    taches:
      - id: "mhg83t90"
        genre: "ouverte"
        consigne: "Beantworten Sie die Frage in einem Satz."
        questions:
          - id: "x4jzxbsn"
            question: "Wozu dient das Musterorgan?"
            reponse: "Es dient nur zum Üben der Begriffe."
            statut: "source"
`;
    expect(erreursApres(FEUILLE, teilD, '    taches: []\n')).toEqual([
      erreur(FEUILLE, 'parties[3].taches', /^La partie est vide : attendu au moins une tâche\.$/),
    ]);

    // Une feuille sans partie non plus.
    const fichiers = exempleDeCours();
    const texte = fichiers.get(FEUILLE) ?? '';
    fichiers.set(FEUILLE, `${texte.slice(0, texte.indexOf('parties:'))}parties: []\n`);
    expect(analyserContenus(fichiers).erreurs).toEqual([
      erreur(FEUILLE, 'parties', /^La feuille est vide : attendu au moins une partie\.$/),
    ]);
  });

  it('feuille_categories_en_double_refusees', () => {
    const erreurs = erreursApres(
      FEUILLE,
      'categories: ["Lagebezeichnung", "Mengenangabe"]',
      'categories: ["Lagebezeichnung", "Mengenangabe", "Lagebezeichnung"]',
    );

    expect(erreurs).toEqual([
      erreur(
        FEUILLE,
        'parties[0].taches[1].categories[2]',
        /^Catégorie en double : déjà en parties\[0\]\.taches\[1\]\.categories\[0\]\.$/,
      ),
    ]);
  });

  it('feuille_mots_de_liste_en_double_refuses', () => {
    const erreurs = erreursApres(
      FEUILLE,
      'liste: ["oberes Ende", "unteres Ende", "seitlicher Rand"]',
      'liste: ["oberes Ende", "unteres Ende", "seitlicher Rand", "unteres Ende"]',
    );

    expect(erreurs).toEqual([
      erreur(
        FEUILLE,
        'parties[2].taches[0].liste[3]',
        /^Mot de la liste en double : déjà en parties\[2\]\.taches\[0\]\.liste\[1\]\.$/,
      ),
    ]);
  });

  it('feuille_suite_de_quatre_tirets_bas_refusee', () => {
    // `____` se lirait comme un trou suivi d'un tiret bas : la marque d'un trou en a exactement 3.
    const texte = 'texte: "Der Oberpol ist das ___, der Unterpol das ___."';
    const lieu = 'parties[2].taches[0].phrases[0].texte';
    for (const trou of ['____', '_____']) {
      const erreurs = erreursApres(FEUILLE, texte, texte.replace('das ___,', `das ${trou},`));
      expect(erreurs, trou).toEqual([erreur(FEUILLE, lieu, /^Suite de 4 tirets bas ou plus/)]);
      expect(erreurs[0].message).not.toContain('Oberpol');
    }
    // Deux trous collés font une suite de six : refusée aussi, et le compte des trous le dit.
    expect(erreursApres(FEUILLE, texte, texte.replace('das ___,', 'das ______,'))).toEqual([
      erreur(FEUILLE, lieu, /^Suite de 4 tirets bas ou plus/),
      erreur(FEUILLE, 'parties[2].taches[0].phrases[0].reponses', /^3 trous \(___\) pour 2/),
    ]);
  });

  it('feuille_numero_en_double_refuse', () => {
    const copie = 'essai/feuille-2.yaml';
    const avecCopie = (numero: number) => {
      const fichiers = exempleDeCours();
      fichiers.set(copie, (fichiers.get(FEUILLE) ?? '').replace('numero: 1', `numero: ${numero}`));
      modifier(fichiers, COURS, '  - "examen.yaml"\n', '  - "examen.yaml"\n  - "feuille-2.yaml"\n');
      // La copie porte les mêmes identifiants : ces erreurs-là ne sont pas l'objet du test.
      return analyserContenus(fichiers).erreurs.filter((e) => /Numéro/.test(e.message));
    };

    expect(avecCopie(1)).toEqual([
      erreur(copie, 'numero', /^Numéro 1 en double.*essai\/feuille\.yaml/),
    ]);
    // Un cours a autant de feuilles qu'on veut, et une feuille peut partager le numéro d'un
    // module de cartes (Vorsilben a le numéro 2).
    expect(avecCopie(2)).toEqual([]);
  });

  it('feuille_genre_inconnu_refuse', () => {
    expect(erreursApres(FEUILLE, 'genre: "orthographe"', 'genre: "diktat"')).toEqual([
      erreur(FEUILLE, 'parties[2].taches[1].genre', /^Genre de tâche inconnu/),
    ]);
    // Un genre n'admet que ses propres clés.
    expect(erreursApres(FEUILLE, 'genre: "orthographe"', 'genre: "ouverte"')).toEqual([
      erreur(FEUILLE, 'parties[2].taches[1].questions', /obligatoire/i),
      erreur(FEUILLE, 'parties[2].taches[1].mots', /Clé inconnue/),
    ]);
  });

  it('feuille_vrai_est_un_booleen_sans_guillemets', () => {
    expect(erreursApres(FEUILLE, 'vrai: true', 'vrai: "true"')).toEqual([
      erreur(
        FEUILLE,
        'parties[1].taches[1].affirmations[0].vrai',
        /^Attendu un booléen \(true ou false, sans guillemets\), trouvé un texte\.$/,
      ),
    ]);
  });

  it('feuille_element_a_verifier_rend_le_cours_a_verifier', () => {
    const fichiers = exempleDeCours();
    for (const [chemin, texte] of fichiers) {
      fichiers.set(chemin, texte.replace(/^( *)statut: "à vérifier"$/gm, '$1statut: "source"'));
    }
    const aVerifier = () => {
      const { cours, erreurs } = analyserContenus(fichiers);
      expect(erreurs).toEqual([]);
      return coursAVerifier(cours[0]);
    };

    expect(aVerifier()).toBe(false);
    // Un seul élément de la feuille, la question ouverte, repasse « à vérifier ».
    modifier(
      fichiers,
      FEUILLE,
      '            statut: "source"\n',
      '            statut: "à vérifier"\n',
    );
    expect(aVerifier()).toBe(true);
  });

  it('refuse_un_fichier_non_reference', () => {
    const fichiers = exempleDeCours();
    fichiers.set('essai/notizen.md', 'x');
    fichiers.set('essai/schemas/alt.svg', 'x');

    expect(analyserContenus(fichiers).erreurs).toEqual([
      erreur('essai/notizen.md', '', /référencé/),
      erreur('essai/schemas/alt.svg', '', /référencé/),
    ]);
  });

  it('refuse_un_fichier_a_la_racine', () => {
    const fichiers = exempleDeCours();
    fichiers.set('LISEZMOI.md', 'x');

    expect(analyserContenus(fichiers).erreurs).toEqual([erreur('LISEZMOI.md', '', /racine/)]);
  });

  it('racine_admet_un_readme_ignore', () => {
    const fichiers = exempleDeCours();
    fichiers.set('README.md', '# Contenu de l’instance');

    const resultat = analyserContenus(fichiers);

    expect(resultat.erreurs).toEqual([]);
    expect(resultat.cours.map((c) => c.dossier)).toEqual(['essai']);
  });

  it('refuse_un_dossier_sans_cours_yaml', () => {
    const fichiers = exempleDeCours();
    fichiers.set('brouillon/cartes.yaml', 'x');
    expect(analyserContenus(fichiers).erreurs).toEqual([erreur('brouillon', '', /cours\.yaml/)]);

    const sansCours = exempleDeCours();
    sansCours.delete(COURS);
    expect(analyserContenus(sansCours)).toEqual({
      cours: [],
      erreurs: [erreur('essai', '', /cours\.yaml/)],
      identifiants: new Map(),
      notice: valeursDeNoticeDExemple(),
    });
  });

  it('notice_lue_avec_ses_valeurs_et_ses_liens', () => {
    const { notice } = analyserContenus(exempleDeCours());

    expect(notice?.date).toBe('2026-11-03');
    expect(Object.keys(notice?.valeurs.fr ?? {})).toEqual([...CLES_DE_NOTICE]);
    expect(Object.keys(notice?.valeurs.de ?? {})).toEqual([...CLES_DE_NOTICE]);
    expect(notice?.valeurs.fr.tunnel).toBe('Passerelle');
    expect(notice?.valeurs.de.delai_reponse).toBe('15 Tagen');
    expect(notice?.liens).toEqual([
      { texte: 'contact@exemple.test', cible: 'mailto:contact@exemple.test' },
      { texte: 'protection.exemple.test', cible: 'https://protection.exemple.test' },
    ]);
  });

  it('notice_obligatoire_a_la_racine', () => {
    const sansNotice = exempleDeCours();
    sansNotice.delete(NOTICE);
    const resultat = analyserContenus(sansNotice);
    expect(resultat.erreurs).toEqual([erreur(NOTICE, '', /notice\.yaml est absent/)]);
    expect(resultat.notice).toBeUndefined();
    expect(resultat.cours).toHaveLength(1);

    // Dans un dossier de cours, elle n'est pas la notice : c'est un fichier que rien ne cite.
    const ailleurs = exempleDeCours();
    ailleurs.set(`essai/${NOTICE}`, ailleurs.get(NOTICE) ?? '');
    ailleurs.delete(NOTICE);
    expect(analyserContenus(ailleurs).erreurs).toEqual([
      erreur(`essai/${NOTICE}`, '', /référencé/),
      erreur(NOTICE, '', /notice\.yaml est absent/),
    ]);
  });

  it('notice_refuse_une_cle_manquante_ou_en_trop', () => {
    const notice = (fichiers: Map<string, string>) => analyserContenus(fichiers).notice;
    for (const langue of ['fr', 'de']) {
      const sansTunnel = modifier(
        exempleDeCours(),
        NOTICE,
        `${langue}:\n  responsable:`,
        `${langue}:\n  tunnel_bis: "x"\n  responsable:`,
      );
      // Une clé de plus, et la même langue perd ensuite `tunnel`.
      const texte = sansTunnel.get(NOTICE) ?? '';
      const debut = texte.indexOf(`${langue}:\n`);
      const ligne = texte.indexOf('  tunnel: ', debut);
      sansTunnel.set(NOTICE, texte.slice(0, ligne) + texte.slice(texte.indexOf('\n', ligne) + 1));

      expect(analyserContenus(sansTunnel).erreurs, langue).toEqual([
        erreur(NOTICE, `${langue}.tunnel`, /^Champ obligatoire absent\.$/),
        erreur(NOTICE, `${langue}.tunnel_bis`, /^Clé inconnue/),
      ]);
      expect(notice(sansTunnel), langue).toBeUndefined();
    }
  });

  it('notice_refuse_un_lien_ni_https_ni_mailto', () => {
    for (const cible of ['javascript:alert(1)', 'http://x']) {
      const fichiers = modifier(
        exempleDeCours(),
        NOTICE,
        'cible: "https://protection.exemple.test"',
        `cible: "${cible}"`,
      );
      const resultat = analyserContenus(fichiers);

      expect(resultat.erreurs, cible).toEqual([
        erreur(NOTICE, 'liens[1].cible', /^Cible non admise : un lien commence par https:\/\/ ou/),
      ]);
      expect(resultat.notice, cible).toBeUndefined();
    }
    // Un lien sans texte ne mènerait nulle part.
    expect(erreursApres(NOTICE, 'texte: "contact@exemple.test"', 'texte: ""')).toEqual([
      erreur(NOTICE, 'liens[0].texte', /^Le texte est vide\.$/),
    ]);
  });

  it('notice_refuse_un_format_inconnu', () => {
    expect(erreursApres(NOTICE, 'format: 1\n', 'format: 2\n')).toEqual([
      erreur(NOTICE, 'format', /^Valeur non admise : attendu 1\.$/),
    ]);
    // Sa date et ses textes suivent les règles de tout fichier de contenu.
    expect(erreursApres(NOTICE, 'date: "2026-11-03"', 'date: "2026-02-30"')).toEqual([
      erreur(NOTICE, 'date', /^Date invalide/),
    ]);
    expect(erreursApres(NOTICE, SANS_GUILLEMETS.avant, SANS_GUILLEMETS.apres)).toEqual([
      erreur(NOTICE, 'fr.tunnel', /guillemets doubles/),
    ]);
  });

  it('notice_en_echec_n_empeche_pas_le_controle_du_verrou', () => {
    // La notice ne porte aucun identifiant : un défaut de guillemets y laisse le verrou confronté au
    // contenu, qui signale toujours un identifiant absent d'ids.lock.
    const fichiers = modifier(
      exempleDeCours(),
      NOTICE,
      SANS_GUILLEMETS.avant,
      SANS_GUILLEMETS.apres,
    );
    modifier(fichiers, 'ids.lock', '586my7a4\n', '');

    expect(analyserContenus(fichiers).erreurs).toEqual([
      erreur(NOTICE, 'fr.tunnel', /guillemets doubles/),
      erreur(CARTES_1, 'cartes[2].id', /586my7a4 est absent d'ids\.lock/),
    ]);
  });

  it('refuse_un_module_introuvable_ou_cite_deux_fois', () => {
    expect(erreursApres(COURS, '- "textes.yaml"', '- "texte.yaml"')).toEqual([
      erreur(COURS, 'modules[4]', /introuvable.*essai\/texte\.yaml/),
      erreur(TEXTES, '', /référencé/),
    ]);
    expect(
      erreursApres(COURS, '  - "exercices.yaml"\n', '  - "exercices.yaml"\n  - "textes.yaml"\n'),
    ).toEqual([erreur(COURS, 'modules[6]', /deux fois/)]);
  });

  it('erreur_yaml_avec_ligne', () => {
    expect(erreursApres(CARTES_1, 'numero: 1\n', 'numero: 1\nnumero: 3\n')).toEqual([
      erreur(CARTES_1, 'ligne 4', /YAML/),
    ]);
    const guillemetNonFerme = erreursApres(COURS, 'langue: "de"\n', 'langue: "de\n');
    expect(guillemetNonFerme.length).toBeGreaterThan(0);
    for (const e of guillemetNonFerme) {
      expect(e).toEqual({
        fichier: COURS,
        lieu: expect.stringMatching(/^ligne \d+$/),
        message: expect.stringMatching(/YAML/),
      });
    }
  });

  it('erreur_yaml_sans_texte_du_source', () => {
    // La bibliothèque cite parfois le source dans son message (étiquette, en-tête de bloc) : le
    // journal de démarrage ne doit jamais en reproduire un mot.
    const sources = ['numero: !Lunge 1\n', 'numero: !!Lunge 1\n', 'numero: |Lunge\n  1\n'];
    for (const apres of sources) {
      const erreurs = erreursApres(CARTES_1, 'numero: 1\n', apres);

      expect(erreurs.length).toBeGreaterThan(0);
      for (const e of erreurs) {
        expect(e).toEqual({
          fichier: CARTES_1,
          lieu: expect.stringMatching(/^ligne \d+$/),
          message: expect.stringMatching(/^YAML invalide : /),
        });
        expect(e.message).not.toContain('Lunge');
      }
    }
  });

  it('alias_yaml_inconnu_sans_texte_du_source', () => {
    const erreurs = erreursApres(CARTES_1, 'numero: 1\n', 'numero: *Lunge\n');

    expect(erreurs).toEqual([erreur(CARTES_1, '', /^YAML invalide : /)]);
    expect(erreurs[0].message).not.toContain('Lunge');
  });

  it('erreur_yaml_nomme_le_code', () => {
    expect(erreursApres(CARTES_1, 'numero: 1\n', 'numero: 1\nnumero: 3\n')).toEqual([
      erreur(CARTES_1, 'ligne 4', /DUPLICATE_KEY/),
    ]);
    expect(erreursApres(CARTES_1, 'numero: 1\n', 'numero: &a &b 1\n')).toEqual([
      erreur(CARTES_1, 'ligne 3', /MULTIPLE_ANCHORS/),
    ]);
  });

  it('chaine_dans_un_nombre_une_seule_erreur', () => {
    expect(erreursApres(CARTES_1, 'numero: 1\n', 'numero: abc\n')).toEqual([
      erreur(CARTES_1, 'numero', /Attendu un nombre/),
    ]);
  });

  it('table_attendue_en_francais', () => {
    const fichiers = exempleDeCours();
    fichiers.set(
      COURS,
      (fichiers.get(COURS) ?? '').replace(/types_de_carte:\n( {2}.*\n)+/, 'types_de_carte: 3\n'),
    );
    const erreurs = analyserContenus(fichiers).erreurs;

    const erreurTypes = erreurs.find((e) => e.lieu === 'types_de_carte');
    expect(erreurTypes?.message).toContain('des clés et leurs valeurs');
    expect(erreurTypes?.message).not.toContain('record');
  });

  it.each([['0'], ['-1'], ['1.5']])('numero_%s_refuse', (valeur) => {
    expect(erreursApres(CARTES_1, 'numero: 1\n', `numero: ${valeur}\n`)).toEqual([
      erreur(CARTES_1, 'numero', /entier|positif/),
    ]);
  });

  it('refuse_un_yaml_aux_alias_excessifs', () => {
    const fichiers = exempleDeCours();
    const liste = (alias: string) => `[${Array(10).fill(alias).join(', ')}]`;
    fichiers.set(
      COURS,
      `${fichiers.get(COURS)}a: &a [1]\nb: &b ${liste('*a')}\nc: &c ${liste('*b')}\nd: ${liste('*c')}\n`,
    );

    expect(analyserContenus(fichiers).erreurs).toEqual([erreur(COURS, '', /YAML invalide/)]);
  });

  it('les_erreurs_du_verrou_remontent', () => {
    const carte =
      '  - id: "586my7a4"\n    type: "g"\n    recto: "warm – kalt"\n    verso: "Gegensatzpaar zum Üben"\n';

    expect(erreursApres(CARTES_1, carte, '')).toEqual([
      erreur('ids.lock', 'ligne 8', /586my7a4.*disparu/),
    ]);
    expect(erreursApres(CARTES_1, 'id: "586my7a4"', 'id: "zdpn0x9s"')).toEqual([
      erreur(CARTES_1, 'cartes[2].id', /zdpn0x9s.*retiré/),
      erreur('ids.lock', 'ligne 8', /586my7a4.*disparu/),
    ]);
    expect(erreursApres('ids.lock', '\ne5pnxb2n\n', '\n')).toEqual([
      erreur(
        EXERCICES,
        'familles[1].exercices[0].id',
        /e5pnxb2n.*absent d'ids\.lock.*corepack pnpm contenus:verrouiller/,
      ),
    ]);
  });

  it('refuse_un_verrou_absent', () => {
    const fichiers = exempleDeCours();
    fichiers.delete('ids.lock');

    expect(analyserContenus(fichiers).erreurs).toEqual([erreur('ids.lock', '', /absent/)]);
  });
});
