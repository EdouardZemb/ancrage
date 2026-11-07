import { expect, it } from 'vitest';
import type { UniteDeCarte } from '../cartes/unites.js';
import type { Exercice, GenreDeTache, Tache } from '../contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../cours/cours.fixture.js';
import { type CoursPrepare, type ModuleServiDe, preparerCours } from '../cours/prepare.js';
import type { ModuleServi } from '../cours/servi.js';
import { FAUX, VRAI } from '../feuilles/correction.js';
import { hasardScripte } from '../hasard.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { EtatUnite } from '../progression/etat.js';
import {
  type ChoixExamen,
  composerExamen,
  corrigerExamen,
  type Examen,
  examenAvecModulesPossible,
  groupeDeQuestion,
  noteSuisse,
  type QuestionExamen,
  type ReponseExamen,
  reponseAttendue,
} from './examen.js';
import { type ElementTirable, idDeLElement } from './feuilles.js';

/* Données factices, écrites à la main (invariant 7). */

const AUCUN: ReadonlyMap<string, EtatUnite> = new Map();

const cours = preparerCours(coursServiDeTest());

function coursSans(...types: ModuleServi['type'][]): CoursPrepare {
  const servi = coursServiDeTest();
  return preparerCours({ ...servi, modules: servi.modules.filter((m) => !types.includes(m.type)) });
}

function coursAvecReglages(
  reglages: Partial<Omit<ModuleServiDe<'examen'>, 'type' | 'id'>>,
): CoursPrepare {
  const servi = coursServiDeTest();
  return preparerCours({
    ...servi,
    modules: servi.modules.map((m) => (m.type === 'examen' ? { ...m, ...reglages } : m)),
  });
}

function choix(surcharge: Partial<ChoixExamen> = {}): ChoixExamen {
  return { chapitres: [CHAPITRE_2], taille: 1, avecModules: false, chrono: false, ...surcharge };
}

/** La première question d'un examen d'une question, avec un hasard qui rend ces valeurs puis 0. */
function premiere(
  c: CoursPrepare,
  surcharge: Partial<ChoixExamen>,
  valeurs: number[],
): QuestionExamen {
  const examen = composerExamen(
    c,
    AUCUN,
    choix({ taille: 1, ...surcharge }),
    hasardScripte(valeurs),
  );
  expect(examen.questions).toHaveLength(1);
  return examen.questions[0];
}

function unite(id: string): UniteDeCarte {
  const trouvee = cours.unites.find((x) => x.id === id);
  if (trouvee === undefined) throw new Error(`unité ${id} introuvable dans la fixture`);
  return trouvee;
}

function carte(id: string, options?: string[]): QuestionExamen {
  const u = unite(id);
  return {
    genre: 'carte',
    chapitre: u.module,
    unite: u,
    ...(options === undefined ? {} : { options }),
  };
}

const schema = cours.schemas[0];
const textes = cours.textes;
const exercices = cours.exercices;
const morphologie = cours.morphologie;
if (textes === undefined || exercices === undefined || morphologie === undefined) {
  throw new Error('la fixture a des textes, des exercices et un Wortbaukasten');
}

function exercice(id: string): QuestionExamen {
  for (const famille of exercices?.familles ?? []) {
    const trouve: Exercice | undefined = famille.exercices.find((e) => e.id === id);
    if (trouve !== undefined) {
      return {
        genre: 'exercice',
        famille,
        exercice: trouve,
        ...(trouve.options === undefined ? {} : { options: [...trouve.options] }),
      };
    }
  }
  throw new Error(`exercice ${id} introuvable dans la fixture`);
}

function motQuestion(id: string): QuestionExamen {
  const mot = morphologie?.mots.find((m) => m.id === id);
  if (mot === undefined) throw new Error(`mot ${id} introuvable dans la fixture`);
  return { genre: 'mot', mot, options: [mot.sens, 'a', 'b'] };
}

function jetonQuestion(rangTexte: number, rangJeton: number): QuestionExamen {
  const texte = textes?.textes[rangTexte];
  const jetons = (texte?.segments ?? []).flatMap((s) => ('jeton' in s ? [s.jeton] : []));
  if (texte === undefined || jetons[rangJeton] === undefined) throw new Error('jeton introuvable');
  const jeton = jetons[rangJeton];
  return { genre: 'jeton', texte, jeton, options: ['x', jeton.sens, 'y'] };
}

function schemaQuestion(point: number): QuestionExamen {
  return {
    genre: 'schema',
    schema,
    point,
    options: [schema.points[point].terme, 'Autre 1', 'Autre 2'],
  };
}

const [feuille] = cours.feuilles;

/** La tâche `id` de la feuille de la fixture, qui est de ce genre. */
function tache<G extends GenreDeTache>(id: string, genre: G): Extract<Tache, { genre: G }> {
  const trouvee = feuille.parties.flatMap((p) => p.taches).find((x) => x.id === id);
  if (trouvee?.genre !== genre) throw new Error(`tâche ${id} (${genre}) introuvable`);
  return trouvee as Extract<Tache, { genre: G }>;
}

/** Une question de fiche sur un élément de la feuille de la fixture. */
function fiche(element: ElementTirable, options?: string[]): QuestionExamen {
  return { genre: 'feuille', feuille, element, ...(options === undefined ? {} : { options }) };
}

/** Le QCM `fb000007` (« über dem Mass »), sa réponse en deuxième option. */
const QCM = fiche({ genre: 'qcm', question: tache('fa000003', 'qcm').questions[0] }, [
  'unter dem Mass',
  'über dem Mass',
  'schnell',
  'langsam',
]);
/** L'affirmation juste `fb000008`, puis la fausse `fb000009`. */
const AFFIRMATION_VRAIE = fiche(
  { genre: 'vrai-faux', affirmation: tache('fa000004', 'vrai-faux').affirmations[0] },
  [VRAI, FAUX],
);
const AFFIRMATION_FAUSSE = fiche(
  { genre: 'vrai-faux', affirmation: tache('fa000004', 'vrai-faux').affirmations[1] },
  [VRAI, FAUX],
);
/** La phrase à un trou `fb000011` (« tachy- »), sans liste : elle se tape. */
const TROU = fiche({ genre: 'trous', phrase: tache('fa000006', 'trous').phrases[0] });
/** Le mot `fb000012`, « Tachykardi » à corriger en « Tachykardie » : il se tape. */
const MOT_A_CORRIGER = fiche({
  genre: 'orthographe',
  mot: tache('fa000007', 'orthographe').mots[0],
});

/** L'élément d'une question de fiche, `?` pour une autre question. */
function elementDe(question: QuestionExamen): string {
  return question.genre === 'feuille' ? idDeLElement(question.element) : '?';
}

/**
 * Les cases pondérées des fiches, que parcourt le troisième nombre : `r` vaut 0,5 et `r2` 0,3,
 * entre les seuils `exercice` (0,25) et `feuille` (0,35) de la fixture.
 */
function ficheDeLaCase(c: CoursPrepare, k: number, cases: number): QuestionExamen {
  return premiere(c, { avecModules: true }, [0.5, 0.3, (k + 0.5) / cases]);
}

function examenDe(questions: QuestionExamen[], chapitres = [CHAPITRE_1, CHAPITRE_2]): Examen {
  return { questions, chapitres, minutes: 5, chrono: false };
}

/** L'indice de la bonne option, ou la bonne saisie. */
function bonne(question: QuestionExamen): ReponseExamen {
  const attendue = reponseAttendue(question);
  return question.options === undefined ? attendue : question.options.indexOf(attendue);
}

// ---------- Le barème ----------

it('bareme_suisse', () => {
  expect(noteSuisse(30, 50)).toBe(4);
  expect(noteSuisse(50, 50)).toBe(6);
  expect(noteSuisse(0, 20)).toBe(1);
  expect(noteSuisse(25, 50)).toBe(3.5);
});

it('bareme_suisse_arrondit_au_demi_point_le_plus_proche', () => {
  // 5 × points / questions + 1, arrondi au demi-point (H:1694) ; la moitié monte.
  expect(noteSuisse(31, 50)).toBe(4); // 4,1
  expect(noteSuisse(32, 50)).toBe(4); // 4,2
  expect(noteSuisse(33, 50)).toBe(4.5); // 4,3
  expect(noteSuisse(13, 20)).toBe(4.5); // 4,25 exactement
  expect(noteSuisse(15, 20)).toBe(5); // 4,75 exactement
  expect(noteSuisse(45, 50)).toBe(5.5);
  expect(noteSuisse(1, 50)).toBe(1); // 1,1
  expect(noteSuisse(2, 50)).toBe(1); // 1,2
  expect(noteSuisse(3, 50)).toBe(1.5); // 1,3
});

it('bareme_suisse_reste_entre_1_et_6', () => {
  expect(noteSuisse(60, 50)).toBe(6);
  expect(noteSuisse(-5, 50)).toBe(1);
  // Pas de question : rien à noter, la note la plus basse (le prototype donnait NaN).
  expect(noteSuisse(0, 0)).toBe(1);
});

// ---------- La composition ----------

it('examen_sans_module_examen_leve_une_erreur', () => {
  expect(() => composerExamen(coursSans('examen'), AUCUN, choix(), hasardDeterministe(1))).toThrow(
    RangeError,
  );
});

it('composition_reste_dans_les_chapitres_choisis_sans_doublon_de_carte', () => {
  // Le chapitre 1 n'a pas de mots : toutes ses questions sont des cartes. Il en a huit.
  const pool = cours.unites.filter((u) => u.module === CHAPITRE_1);
  const reponses = new Set(pool.map((u) => u.reponse));

  for (let graine = 1; graine <= 20; graine++) {
    const examen = composerExamen(
      cours,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1], taille: 8 }),
      hasardDeterministe(graine),
    );

    expect(examen.questions).toHaveLength(8);
    const cartes = examen.questions.map((q) => {
      if (q.genre !== 'carte') throw new Error(`genre inattendu : ${q.genre}`);
      expect(q.chapitre).toBe(CHAPITRE_1);
      expect(q.unite.module).toBe(CHAPITRE_1);
      // Les propositions viennent des cartes du chapitre choisi seulement.
      for (const option of q.options ?? []) expect(reponses.has(option)).toBe(true);
      return q.unite.carte;
    });
    // Une carte n'est posée qu'une fois, dans un sens ou dans l'autre : ici, les huit.
    expect(new Set(cartes).size).toBe(8);
  }
});

it('composition_s_arrete_quand_il_n_y_a_plus_de_question_possible', () => {
  // Le chapitre 1 n'a que huit cartes : une demande de 9 en donne 8, sans boucler.
  const examen = composerExamen(
    cours,
    AUCUN,
    choix({ chapitres: [CHAPITRE_1], taille: 9 }),
    hasardDeterministe(3),
  );

  expect(examen.questions).toHaveLength(8);
  // La durée suit les 8 questions posées (6 min), pas les 9 demandées (6,75 min, soit 7).
  expect(examen.minutes).toBe(6);
});

it('sans_chapitre_et_sans_module_l_examen_est_vide', () => {
  for (const chapitres of [[], ['inconnu0']]) {
    const examen = composerExamen(
      cours,
      AUCUN,
      choix({ chapitres, taille: 10 }),
      hasardDeterministe(4),
    );

    expect(examen.questions).toEqual([]);
    expect(examen.chapitres).toEqual([]);
  }
});

it('chapitres_de_l_examen_ceux_du_choix_connus_du_cours', () => {
  const composer = (chapitres: string[]) =>
    composerExamen(cours, AUCUN, choix({ chapitres, taille: 3 }), hasardDeterministe(5));

  // L'ordre du choix et les doublons n'y changent rien ; un chapitre inconnu n'y compte pas.
  expect(composer([CHAPITRE_2, CHAPITRE_1]).chapitres).toEqual([CHAPITRE_1, CHAPITRE_2]);
  expect(composer([CHAPITRE_1, CHAPITRE_1]).chapitres).toEqual([CHAPITRE_1]);
  expect(composer([CHAPITRE_2, 'inconnu0']).chapitres).toEqual([CHAPITRE_2]);
});

it('composition_ne_modifie_pas_le_choix', () => {
  const chapitres = Object.freeze([CHAPITRE_2, CHAPITRE_1]) as string[];

  composerExamen(cours, AUCUN, choix({ chapitres, taille: 5 }), hasardDeterministe(6));

  expect(chapitres).toEqual([CHAPITRE_2, CHAPITRE_1]);
});

it('composition_repetable_avec_la_meme_graine', () => {
  const composer = (graine: number) =>
    composerExamen(
      cours,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 20, avecModules: true }),
      hasardDeterministe(graine),
    );

  expect(composer(4242)).toEqual(composer(4242));
  expect(composer(4242)).not.toEqual(composer(4243));
});

it('duree_minimale_cinq_minutes', () => {
  const minutes = (taille: number) =>
    composerExamen(
      cours,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille, avecModules: true }),
      hasardDeterministe(7),
    ).minutes;

  // 3 questions à 45 s : 2,25 min, relevé à 5. 7 questions : 5,25 min, arrondi à 5.
  expect(minutes(3)).toBe(5);
  expect(minutes(7)).toBe(5);
  // 8 questions : 6 min ; 9 : 6,75 min, arrondi à 7 ; 25 : 18,75 min, arrondi à 19.
  expect(minutes(8)).toBe(6);
  expect(minutes(9)).toBe(7);
  expect(minutes(25)).toBe(19);
});

it('duree_selon_les_reglages_du_module', () => {
  const c = coursAvecReglages({ secondesParQuestion: 60, minutesMinimum: 2 });
  const minutes = (taille: number) =>
    composerExamen(
      c,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille }),
      hasardDeterministe(8),
    ).minutes;

  expect(minutes(1)).toBe(2);
  expect(minutes(2)).toBe(2);
  expect(minutes(9)).toBe(9);
});

it('chrono_est_celui_du_choix', () => {
  const composer = (chrono: boolean) =>
    composerExamen(cours, AUCUN, choix({ taille: 3, chrono }), hasardDeterministe(9));

  expect(composer(true).chrono).toBe(true);
  expect(composer(false).chrono).toBe(false);
});

// ---------- Le tirage ----------

it('tirage_des_modules_selon_les_seuils_du_cours', () => {
  const avecModules = { avecModules: true };
  // Le premier nombre est `r`, le second `r2` (H:1940-1943) ; `r2` choisit la question de module.
  const genre = (r2: number): string => premiere(cours, avecModules, [0.5, r2]).genre;

  expect(genre(0)).toBe('schema');
  expect(genre(0.099)).toBe('schema');
  expect(genre(0.1)).toBe('jeton');
  expect(genre(0.169)).toBe('jeton');
  expect(genre(0.17)).toBe('exercice');
  expect(genre(0.249)).toBe('exercice');
  expect(genre(0.25)).toBe('feuille');
  expect(genre(0.349)).toBe('feuille');
  expect(genre(0.35)).toBe('carte');
  expect(genre(0.99)).toBe('carte');
});

it('seuil_feuille_tire_une_question_de_fiche', () => {
  // `feuille` suit `exercice` dans le cumul (F1-D6) : entre les deux, une question de fiche.
  const c = coursAvecReglages({
    tirage: {
      schema: 0.1,
      texte: 0.2,
      exercice: 0.3,
      feuille: 0.8,
      mot: 0.9,
      direct: 0.95,
      aTaper: 1,
    },
  });
  const genre = (r2: number): string => premiere(c, { avecModules: true }, [0.99, r2]).genre;
  expect(genre(0.299)).toBe('exercice');
  expect(genre(0.3)).toBe('feuille');
  expect(genre(0.799)).toBe('feuille');
  expect(genre(0.8)).toBe('carte');

  // La première case pondérée : le QCM, le premier élément tirable de la feuille, avec ses quatre
  // options mélangées (le hasard scripté rend ensuite 0).
  const q = ficheDeLaCase(cours, 0, 15);
  if (q.genre !== 'feuille') throw new Error(`genre inattendu : ${q.genre}`);
  expect(q.feuille).toBe(feuille);
  expect(q.element).toEqual({ genre: 'qcm', question: tache('fa000003', 'qcm').questions[0] });
  expect([...(q.options ?? [])].sort()).toEqual([...(QCM.options ?? [])].sort());
  expect(reponseAttendue(q)).toBe('über dem Mass');
  // Un vrai/faux prend ses deux codes, dans l'ordre (F1-D7).
  const affirmation = ficheDeLaCase(cours, 3, 15);
  expect(affirmation).toEqual(AFFIRMATION_VRAIE);
  expect(reponseAttendue(affirmation)).toBe(VRAI);
  expect(reponseAttendue(AFFIRMATION_FAUSSE)).toBe(FAUX);
});

it('sans_tirage_feuille_aucune_question_de_fiche', () => {
  // Vigilance 1 : un contenu mis en cache par la version précédente a des feuilles, mais pas
  // `tirage.feuille`. Il vaut alors `tirage.exercice`, et la Prüfung ne tire aucune fiche (F1-D6).
  const servi = coursServiDeTest();
  const sansSeuil = (module: ModuleServi): ModuleServi => {
    if (module.type !== 'examen') return module;
    const { feuille: _feuille, ...tirage } = module.tirage;
    return { ...module, tirage };
  };
  const enCache = (types: ModuleServi['type'][]) =>
    preparerCours({
      ...servi,
      modules: servi.modules.filter((m) => !types.includes(m.type)).map(sansSeuil),
    });
  const c = enCache([]);
  expect(c.examen?.tirage).not.toHaveProperty('feuille');
  expect(c.feuilles).toHaveLength(1);

  for (const r2 of [0.25, 0.3, 0.349]) {
    expect(premiere(c, { avecModules: true }, [0.5, r2]).genre, String(r2)).toBe('carte');
  }
  for (let graine = 1; graine <= 20; graine++) {
    const examen = composerExamen(
      c,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 25, avecModules: true }),
      hasardDeterministe(graine),
    );
    expect(
      examen.questions.map((q) => q.genre),
      `graine ${graine}`,
    ).not.toContain('feuille');
  }
  // La case « avec modules » ne compte pas sur une feuille que le tirage ne pose jamais.
  expect(examenAvecModulesPossible(enCache(['schema', 'texte-annote', 'exercices']))).toBe(false);
});

it('phrase_a_deux_trous_jamais_tiree', () => {
  // Trois cases par élément tirable, dans l'ordre du papier : le QCM, les deux affirmations, la
  // phrase à un trou et le mot à corriger. Ni la phrase à deux trous `fb000010` (F1-D5), ni les
  // paires, les éléments à classer ou la question ouverte, qui ne se répondent pas en une fois.
  const cases = new Map<string, number>();
  for (let k = 0; k < 15; k++) {
    const id = elementDe(ficheDeLaCase(cours, k, 15));
    cases.set(id, (cases.get(id) ?? 0) + 1);
  }
  expect([...cases]).toEqual([
    ['fb000007', 3],
    ['fb000008', 3],
    ['fb000009', 3],
    ['fb000011', 3],
    ['fb000012', 3],
  ]);

  for (let graine = 1; graine <= 20; graine++) {
    const examen = composerExamen(
      cours,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 25, avecModules: true }),
      hasardDeterministe(graine),
    );
    expect(examen.questions.map(elementDe), `graine ${graine}`).not.toContain('fb000010');
  }
});

it('phrase_avec_liste_se_choisit_dans_sa_liste', () => {
  // La tâche à liste de la fixture gagne une phrase à un trou : elle est tirée, à choisir parmi la
  // liste, dans son ordre.
  const servi = coursServiDeTest();
  const phrase = { id: 'fb000014', texte: 'Die ___ bildet den Harn.', reponses: ['Niere'] };
  const c = preparerCours({
    ...servi,
    modules: servi.modules.map((m) =>
      m.type !== 'feuille'
        ? m
        : {
            ...m,
            parties: m.parties.map((partie) => ({
              ...partie,
              taches: partie.taches.map((x) =>
                x.id === 'fa000005' && x.genre === 'trous'
                  ? { ...x, phrases: [...x.phrases, { ...phrase, statut: 'source' as const }] }
                  : x,
              ),
            })),
          },
    ),
  });

  // Elle vient, dans l'ordre du papier, après les affirmations : la quatrième des six.
  const q = ficheDeLaCase(c, 9, 18);
  if (q.genre !== 'feuille') throw new Error(`genre inattendu : ${q.genre}`);
  expect(elementDe(q)).toBe('fb000014');
  expect(q.options).toEqual(['Herz', 'Leber', 'Niere']);
  expect(reponseAttendue(q)).toBe('Niere');
  expect(corrigerExamen(c, examenDe([q]), [2]).points).toBe(1);
  expect(corrigerExamen(c, examenDe([q]), [0]).points).toBe(0);
  // Une saisie ne répond pas à une question à choix.
  expect(corrigerExamen(c, examenDe([q]), ['Niere']).points).toBe(0);
});

it('orthographe_tapee_jugee_strictement', () => {
  // Un mot à corriger se tape, et se juge par `egalOrthographe` (F1-D4) : la casse et chaque
  // lettre comptent ; seuls les espaces ne comptent pas.
  const q = ficheDeLaCase(cours, 13, 15);
  expect(q).toEqual(MOT_A_CORRIGER);
  expect(q.options).toBeUndefined();
  expect(reponseAttendue(q)).toBe('Tachykardie');
  const juge = (saisie: ReponseExamen): boolean =>
    corrigerExamen(cours, examenDe([q]), [saisie]).points === 1;

  expect(juge('Tachykardie')).toBe(true);
  expect(juge('  Tachykardie ')).toBe(true);
  expect(juge('tachykardie')).toBe(false);
  // Une carte accepterait le c pour le k : pas un mot à corriger.
  expect(juge('Tachycardie')).toBe(false);
  expect(juge('Tachykardi')).toBe(false);
  expect(juge(0)).toBe(false);
});

it('trou_tape_juge_en_canonique', () => {
  // Une phrase sans liste se tape, et son trou se juge comme une carte (`canonique`, F1-D4).
  const q = ficheDeLaCase(cours, 10, 15);
  expect(q).toEqual(TROU);
  expect(q.options).toBeUndefined();
  expect(reponseAttendue(q)).toBe('tachy-');
  const juge = (saisie: ReponseExamen): boolean =>
    corrigerExamen(cours, examenDe([q]), [saisie]).points === 1;

  expect(juge('tachy-')).toBe(true);
  expect(juge(' Tachy ')).toBe(true);
  expect(juge('takhy')).toBe(true);
  expect(juge('brady-')).toBe(false);
  expect(juge('tachi')).toBe(false);
  expect(juge(0)).toBe(false);
});

it('tirage_des_modules_suit_les_seuils_du_module', () => {
  const c = coursAvecReglages({
    tirage: { schema: 0.5, texte: 0.6, exercice: 0.7, mot: 0.8, direct: 0.9, aTaper: 0.95 },
  });
  const genre = (r2: number): string => premiere(c, { avecModules: true }, [0.99, r2]).genre;

  expect(genre(0.49)).toBe('schema');
  expect(genre(0.5)).toBe('jeton');
  expect(genre(0.6)).toBe('exercice');
  expect(genre(0.7)).toBe('carte');
});

it('tirage_des_cartes_selon_les_seuils_du_cours', () => {
  const question = (r: number) => premiere(cours, {}, [r]);

  expect(question(0.119).genre).toBe('mot');
  // De 0,12 à 0,45 : le sens direct. Au-delà : l'inverse, à choix jusqu'à 0,72 puis à taper.
  for (const r of [0.12, 0.3, 0.449]) {
    const q = question(r);
    if (q.genre !== 'carte') throw new Error(`genre inattendu : ${q.genre}`);
    expect(q.unite.sens, String(r)).toBe('direct');
    expect(q.options, String(r)).toBeDefined();
  }
  for (const r of [0.45, 0.5, 0.719]) {
    const q = question(r);
    if (q.genre !== 'carte') throw new Error(`genre inattendu : ${q.genre}`);
    expect(q.unite.sens, String(r)).toBe('inverse');
    expect(q.options, String(r)).toBeDefined();
  }
  for (const r of [0.72, 0.9, 0.999]) {
    const q = question(r);
    if (q.genre !== 'carte') throw new Error(`genre inattendu : ${q.genre}`);
    expect(q.unite.sens, String(r)).toBe('inverse');
    expect(q.options, String(r)).toBeUndefined();
  }
});

it('tirage_des_cartes_suit_les_seuils_du_module', () => {
  const c = coursAvecReglages({
    tirage: { schema: 0.1, texte: 0.17, exercice: 0.25, mot: 0.3, direct: 0.6, aTaper: 0.8 },
  });
  const question = (r: number) => premiere(c, {}, [r]);
  const forme = (r: number): string => {
    const q = question(r);
    if (q.genre !== 'carte') return q.genre;
    return `${q.unite.sens}${q.options === undefined ? ' à taper' : ''}`;
  };

  expect(forme(0.29)).toBe('mot');
  expect(forme(0.3)).toBe('direct');
  expect(forme(0.59)).toBe('direct');
  expect(forme(0.6)).toBe('inverse');
  expect(forme(0.79)).toBe('inverse');
  expect(forme(0.8)).toBe('inverse à taper');
});

it('une_carte_sans_inverse_ne_se_tape_jamais', () => {
  // Le chapitre 2 sans inverse : toutes ses cartes sont des questions (type « q »).
  const servi = coursServiDeTest();
  const c = preparerCours({
    ...servi,
    modules: servi.modules.map((m) =>
      m.type === 'cartes' && m.id === CHAPITRE_2
        ? { ...m, cartes: m.cartes.map((x) => ({ ...x, type: 'q' })) }
        : m,
    ),
  });
  expect(c.unites.filter((u) => u.module === CHAPITRE_2 && u.sens === 'inverse')).toEqual([]);

  const q = premiere(c, {}, [0.99]);

  if (q.genre !== 'carte') throw new Error(`genre inattendu : ${q.genre}`);
  expect(q.unite.sens).toBe('direct');
  expect(q.options).toBeDefined();
});

it('l_examen_sans_modules_ne_tire_pas_le_second_nombre', () => {
  // Sans modules, `r2` n'est pas tiré : 0,01 ne devient pas le schéma, il est la suite du tirage.
  const q = premiere(cours, { avecModules: false }, [0.3, 0.01]);

  expect(q.genre).toBe('carte');
});

it('mots_seulement_si_un_chapitre_de_la_morphologie', () => {
  // Le Wortbaukasten de la fixture porte sur le chapitre 2 seulement.
  expect(morphologie.chapitres).toEqual([CHAPITRE_2]);

  expect(premiere(cours, { chapitres: [CHAPITRE_2] }, [0.05]).genre).toBe('mot');
  expect(premiere(cours, { chapitres: [CHAPITRE_1] }, [0.05]).genre).toBe('carte');
  expect(premiere(cours, { chapitres: [CHAPITRE_1, CHAPITRE_2] }, [0.05]).genre).toBe('mot');
  // Un chapitre inconnu n'ouvre pas les mots.
  expect(premiere(cours, { chapitres: ['inconnu0', CHAPITRE_1] }, [0.05]).genre).toBe('carte');

  const genres = (chapitres: string[], avecModules: boolean): Set<string> => {
    const vus = new Set<string>();
    for (let graine = 1; graine <= 40; graine++) {
      const examen = composerExamen(
        cours,
        AUCUN,
        choix({ chapitres, taille: 5, avecModules }),
        hasardDeterministe(graine),
      );
      for (const q of examen.questions) vus.add(q.genre);
    }
    return vus;
  };
  for (const avecModules of [false, true]) {
    expect(genres([CHAPITRE_1], avecModules).has('mot')).toBe(false);
    expect(genres([CHAPITRE_2], avecModules).has('mot')).toBe(true);
  }
});

it('mots_absents_du_cours_retombent_sur_les_cartes', () => {
  const q = premiere(coursSans('morphologie'), { chapitres: [CHAPITRE_2] }, [0.05]);

  expect(q.genre).toBe('carte');
});

it('question_de_mot_trois_autres_sens_et_la_bonne_reponse', () => {
  const q = premiere(cours, {}, [0.05]);

  if (q.genre !== 'mot') throw new Error(`genre inattendu : ${q.genre}`);
  expect(q.mot.id).toBe('w0000001');
  // Trois mots seulement dans la fixture : leur sens, une fois chacun.
  expect([...q.options].sort()).toEqual(
    ['Schmerz im Oberbauch', 'Leberentfernung', 'Puls über hundert Schläge'].sort(),
  );
  expect(reponseAttendue(q)).toBe('Schmerz im Oberbauch');
  // Le mot suivant du Wortbaukasten, avec un tirage à la moitié.
  const suivant = premiere(cours, {}, [0.05, 0.5]);
  if (suivant.genre !== 'mot') throw new Error(`genre inattendu : ${suivant.genre}`);
  expect(suivant.mot.id).toBe('w0000002');
});

/** Le cours de la fixture, dont le Wortbaukasten a ces mots, dans cet ordre. */
function coursAvecSensDesMots(sens: string[]): CoursPrepare {
  const servi = coursServiDeTest();
  return preparerCours({
    ...servi,
    modules: servi.modules.map((m) =>
      m.type === 'morphologie'
        ? {
            ...m,
            mots: sens.map((s, rang) => ({ ...m.mots[0], id: `w000000${rang + 1}`, sens: s })),
          }
        : m,
    ),
  });
}

it('question_de_mot_ecarte_les_sens_en_double', () => {
  // Les deux autres mots ont le même sens : il n'est proposé qu'une fois.
  const q = premiere(coursAvecSensDesMots(['A', 'B', 'B']), {}, [0.05]);
  if (q.genre !== 'mot') throw new Error(`genre inattendu : ${q.genre}`);
  expect([...q.options].sort()).toEqual(['A', 'B']);

  // Un autre mot qui a le sens du mot n'est pas une autre proposition : la réponse reste unique.
  const meme = premiere(coursAvecSensDesMots(['A', 'A', 'B']), {}, [0.05]);
  if (meme.genre !== 'mot') throw new Error(`genre inattendu : ${meme.genre}`);
  expect([...meme.options].sort()).toEqual(['A', 'B']);
});

it('question_de_mot_au_plus_quatre_options', () => {
  const c = coursAvecSensDesMots(['A', 'B', 'C', 'D', 'E', 'F']);
  let mots = 0;

  for (let graine = 1; graine <= 30; graine++) {
    const examen = composerExamen(c, AUCUN, choix({ taille: 6 }), hasardDeterministe(graine));
    for (const q of examen.questions) {
      if (q.genre !== 'mot') continue;
      mots++;
      expect(q.options, `graine ${graine}`).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.mot.sens);
    }
  }
  expect(mots).toBeGreaterThan(0);
});

it('question_de_schema_options_en_termes_du_schema', () => {
  const q = premiere(cours, { avecModules: true }, [0.5, 0.05]);

  if (q.genre !== 'schema') throw new Error(`genre inattendu : ${q.genre}`);
  expect(q.schema).toBe(schema);
  expect(q.point).toBe(0);
  const termes = schema.points.map((p) => p.terme);
  expect(q.options).toHaveLength(4);
  expect(new Set(q.options).size).toBe(4);
  for (const option of q.options) expect(termes).toContain(option);
  expect(q.options).toContain('Oberpol');
  expect(reponseAttendue(q)).toBe('Oberpol');
});

it('question_de_jeton_options_puisees_dans_tous_les_textes', () => {
  const q = premiere(cours, { avecModules: true }, [0.5, 0.12]);

  if (q.genre !== 'jeton') throw new Error(`genre inattendu : ${q.genre}`);
  expect(q.texte.id).toBe('t1000001');
  expect(q.jeton.forme).toBe('EL');
  // Quatre jetons au total, dans deux textes : les trois autres sens viennent des deux textes.
  expect([...q.options].sort()).toEqual(
    ['Esslöffel', 'Kartoffelgericht', 'Teelöffel', 'Kuchen'].sort(),
  );
});

it('question_d_exercice_a_choix_ou_a_taper', () => {
  // Les 15 cases pondérées : trois par exercice neuf, dans l'ordre du module.
  const artikel = premiere(cours, { avecModules: true }, [0.5, 0.2, 0]);
  const plural = premiere(cours, { avecModules: true }, [0.5, 0.2, 0.62]);

  if (artikel.genre !== 'exercice' || plural.genre !== 'exercice') throw new Error('genre');
  expect(artikel.famille.code).toBe('artikel');
  expect(artikel.exercice.id).toBe('e1000001');
  expect(artikel.options).toEqual(['der', 'die', 'das']);
  expect(reponseAttendue(artikel)).toBe('der');
  expect(plural.famille.code).toBe('plural');
  expect(plural.exercice.id).toBe('e2000001');
  expect(plural.options).toBeUndefined();
});

it('modules_seulement_si_demandes', () => {
  const genres = (avecModules: boolean): Set<string> => {
    const vus = new Set<string>();
    for (let graine = 1; graine <= 20; graine++) {
      const examen = composerExamen(
        cours,
        AUCUN,
        choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 12, avecModules }),
        hasardDeterministe(graine),
      );
      for (const q of examen.questions) vus.add(q.genre);
    }
    return vus;
  };

  expect([...genres(false)].sort()).toEqual(['carte', 'mot']);
  expect([...genres(true)].sort()).toEqual([
    'carte',
    'exercice',
    'feuille',
    'jeton',
    'mot',
    'schema',
  ]);
});

/** Les modules que la case « avec modules » mêle aux cartes. */
const MODULES_MELES: ModuleServi['type'][] = ['schema', 'texte-annote', 'exercices', 'feuille'];

it('avec_modules_possible_si_schema_texte_exercices_ou_feuille', () => {
  expect(examenAvecModulesPossible(cours)).toBe(true);
  // Un seul de ces quatre modules suffit.
  for (const garde of MODULES_MELES) {
    const autres = MODULES_MELES.filter((type) => type !== garde);
    expect(examenAvecModulesPossible(coursSans(...autres)), garde).toBe(true);
  }
  // Sans aucun des quatre, le tirage ne mêle rien de plus. La morphologie n'y change rien : ses
  // mots viennent avec leurs chapitres, que les modules soient demandés ou non.
  expect(examenAvecModulesPossible(coursSans(...MODULES_MELES))).toBe(false);
  expect(examenAvecModulesPossible(coursSans('morphologie', ...MODULES_MELES))).toBe(false);
});

it('avec_modules_possible_si_une_feuille_a_un_element_tirable', () => {
  // Une feuille faite de paires, d'éléments à classer et de questions ouvertes n'a rien à poser.
  const servi = coursServiDeTest();
  const sansTirable = preparerCours({
    ...servi,
    modules: servi.modules
      .filter((m) => !['schema', 'texte-annote', 'exercices'].includes(m.type))
      .map((m) =>
        m.type === 'feuille'
          ? {
              ...m,
              parties: m.parties.map((partie) => ({
                ...partie,
                taches: partie.taches.filter((x) =>
                  ['appariement', 'classement', 'ouverte'].includes(x.genre),
                ),
              })),
            }
          : m,
      ),
  });

  expect(sansTirable.feuilles).toHaveLength(1);
  expect(examenAvecModulesPossible(sansTirable)).toBe(false);
  // Et le tirage n'en pose pas : `r2` dans la part des feuilles retombe sur les cartes.
  expect(premiere(sansTirable, { avecModules: true }, [0.5, 0.3]).genre).toBe('carte');
});

it('avec_modules_possible_dit_si_le_choix_change_le_tirage', () => {
  const genres = (c: CoursPrepare, avecModules: boolean): string[] => {
    const vus = new Set<string>();
    for (let graine = 1; graine <= 20; graine++) {
      const examen = composerExamen(
        c,
        AUCUN,
        choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 12, avecModules }),
        hasardDeterministe(graine),
      );
      for (const q of examen.questions) vus.add(q.genre);
    }
    return [...vus].sort();
  };
  const seulementMots = coursSans(...MODULES_MELES);

  // Le choix ne change que les modules annexes : mots et cartes sortent dans les deux cas.
  expect(genres(seulementMots, true)).toEqual(['carte', 'mot']);
  expect(genres(seulementMots, false)).toEqual(['carte', 'mot']);
  expect(examenAvecModulesPossible(seulementMots)).toBe(false);
  expect(genres(cours, true)).not.toEqual(genres(cours, false));
  expect(examenAvecModulesPossible(cours)).toBe(true);
});

it('module_absent_retombe_sur_les_cartes', () => {
  const sans = (...types: ModuleServi['type'][]) => coursSans(...types);

  expect(premiere(sans('schema'), { avecModules: true }, [0.5, 0.05]).genre).toBe('carte');
  expect(premiere(sans('texte-annote'), { avecModules: true }, [0.5, 0.12]).genre).toBe('carte');
  expect(premiere(sans('exercices'), { avecModules: true }, [0.5, 0.2]).genre).toBe('carte');
  expect(premiere(sans('feuille'), { avecModules: true }, [0.5, 0.3]).genre).toBe('carte');
  // Les autres modules restent tirés.
  expect(premiere(sans('texte-annote'), { avecModules: true }, [0.5, 0.05]).genre).toBe('schema');
  expect(premiere(sans('schema'), { avecModules: true }, [0.5, 0.2]).genre).toBe('exercice');
});

it('module_sans_matiere_retombe_sur_les_cartes', () => {
  const servi = coursServiDeTest();
  const vide = (module: ModuleServi): ModuleServi => {
    if (module.type === 'schema') return { ...module, points: [] };
    if (module.type === 'texte-annote') {
      return {
        ...module,
        textes: module.textes.map((t) => ({ ...t, segments: [{ texte: 'Nur Text.' }] })),
      };
    }
    if (module.type === 'exercices') {
      return { ...module, familles: module.familles.map((f) => ({ ...f, exercices: [] })) };
    }
    return module;
  };
  const c = preparerCours({ ...servi, modules: servi.modules.map(vide) });

  for (const r2 of [0.05, 0.12, 0.2]) {
    expect(premiere(c, { avecModules: true }, [0.5, r2]).genre, String(r2)).toBe('carte');
  }
});

it('poids_des_schemas_des_exercices_et_des_fiches_selon_l_etat', () => {
  const acquis: EtatUnite = { boite: 4, echeance: '2026-10-20', justes: 3, fausses: 0 };
  const compter = (
    etats: ReadonlyMap<string, EtatUnite>,
    secondNombre: number,
    cases: number,
    cle: (q: QuestionExamen) => string,
  ): Map<string, number> => {
    const comptes = new Map<string, number>();
    for (let k = 0; k < cases; k++) {
      const valeurs = [0.5, secondNombre, ...(secondNombre < 0.1 ? [0] : []), (k + 0.5) / cases];
      const examen = composerExamen(
        cours,
        etats,
        choix({ avecModules: true }),
        hasardScripte(valeurs),
      );
      const sortie = cle(examen.questions[0]);
      comptes.set(sortie, (comptes.get(sortie) ?? 0) + 1);
    }
    return comptes;
  };
  const point = (q: QuestionExamen) => (q.genre === 'schema' ? q.schema.points[q.point].id : '?');
  const exo = (q: QuestionExamen) => (q.genre === 'exercice' ? q.exercice.id : '?');

  // Schéma : cinq points, trois cases chacun ; un point acquis n'en a plus qu'une.
  expect(compter(AUCUN, 0.05, 15, point).get('q0000001')).toBe(3);
  expect(compter(new Map([['q0000001', acquis]]), 0.05, 13, point).get('q0000001')).toBe(1);
  // Exercices : cinq exercices, trois cases chacun ; un exercice acquis n'en a plus qu'une.
  expect(compter(AUCUN, 0.2, 15, exo).get('e1000001')).toBe(3);
  expect(compter(new Map([['e1000001', acquis]]), 0.2, 13, exo).get('e1000001')).toBe(1);
  // Fiches : cinq éléments tirables, trois cases chacun ; un élément acquis n'en a plus qu'une,
  // comme un exercice.
  expect(compter(AUCUN, 0.3, 15, elementDe).get('fb000008')).toBe(3);
  expect(compter(new Map([['fb000008', acquis]]), 0.3, 13, elementDe).get('fb000008')).toBe(1);
  const presqueSu: EtatUnite = { boite: 4, echeance: '2026-10-20', justes: 1, fausses: 1 };
  expect(compter(new Map([['fb000008', presqueSu]]), 0.3, 15, elementDe).get('fb000008')).toBe(3);
});

it('examen_sans_doublon_d_unite_ni_de_jeton', () => {
  for (let graine = 1; graine <= 20; graine++) {
    const examen = composerExamen(
      cours,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 25, avecModules: true }),
      hasardDeterministe(graine),
    );
    const correction = corrigerExamen(cours, examen, []);
    const jetons = examen.questions.flatMap((q) => (q.genre === 'jeton' ? [q.jeton.id] : []));
    const cartes = examen.questions.flatMap((q) => (q.genre === 'carte' ? [q.unite.carte] : []));

    expect(examen.questions, `graine ${graine}`).toHaveLength(25);
    expect(new Set(jetons).size).toBe(jetons.length);
    expect(new Set(cartes).size).toBe(cartes.length);
    const unites = correction.reponses.map((r) => r.unite);
    expect(new Set(unites).size).toBe(unites.length);
    expect(unites).toHaveLength(examen.questions.length - jetons.length);
  }
});

// ---------- La correction ----------

it('non_repondue_comptee_fausse_et_journalisee', () => {
  const examen = composerExamen(
    cours,
    AUCUN,
    choix({ chapitres: [CHAPITRE_1], taille: 5 }),
    hasardDeterministe(10),
  );

  const correction = corrigerExamen(cours, examen, []);

  expect(correction.points).toBe(0);
  expect(correction.questions).toBe(5);
  expect(correction.note).toBe(1);
  expect(correction.reponses).toEqual(
    examen.questions.map((q) => ({
      unite: q.genre === 'carte' ? q.unite.id : 'inattendu',
      juste: false,
    })),
  );
  expect(correction.fautes.map((f) => f.question)).toEqual(examen.questions);
  expect(correction.fautes.every((f) => f.donnee === undefined)).toBe(true);
});

it('reponse_manquante_au_milieu_est_fausse_les_autres_comptent', () => {
  const questions = [
    carte('c1000001', ['Organ im Brustkorb', 'a', 'b']),
    carte('c1000002', ['x']),
    carte('c1000003', ['y']),
  ];
  // La question 2 est sautée ; la 3 est à choix mais la réponse donnée est une saisie.
  const reponses = [0, undefined, 'y'];

  const correction = corrigerExamen(cours, examenDe(questions), reponses);

  expect(correction.points).toBe(1);
  expect(correction.reponses).toEqual([
    { unite: 'c1000001', juste: true },
    { unite: 'c1000002', juste: false },
    { unite: 'c1000003', juste: false },
  ]);
});

it('jetons_sans_reponse_journalisee', () => {
  const juste = jetonQuestion(0, 0);
  const faux = jetonQuestion(0, 1);
  const sautee = jetonQuestion(1, 0);
  const examen = examenDe([juste, faux, sautee, carte('c1000001', ['Organ im Brustkorb', 'a'])]);

  const correction = corrigerExamen(cours, examen, [bonne(juste), 2, undefined, 0]);

  // Les jetons comptent dans la note (2 justes sur 4) mais ne produisent aucune réponse.
  expect(correction.points).toBe(2);
  expect(correction.questions).toBe(4);
  expect(correction.reponses).toEqual([{ unite: 'c1000001', juste: true }]);
  expect(correction.fautes.map((f) => f.question)).toEqual([faux, sautee]);
  expect(correction.fautes.map((f) => f.donnee)).toEqual(['y', undefined]);
});

it('unites_journalisees_selon_la_decision_8', () => {
  const questions = [
    carte('c1000001'),
    carte('c1000002:inverse'),
    motQuestion('w0000002'),
    schemaQuestion(3),
    exercice('e1000002'),
    jetonQuestion(0, 0),
    MOT_A_CORRIGER,
  ];

  const correction = corrigerExamen(cours, examenDe(questions), []);

  expect(correction.reponses.map((r) => r.unite)).toEqual([
    'c1000001',
    'c1000002:inverse',
    'w0000002',
    'q0000004',
    'e1000002',
    'fb000012',
  ]);
  for (const reponse of correction.reponses) {
    expect(cours.unitesConnues.has(reponse.unite), reponse.unite).toBe(true);
  }
});

it('une_reponse_par_unite_la_premiere_fait_foi', () => {
  const premiereQuestion = carte('c1000001', ['Organ im Brustkorb', 'a']);
  const doublon = carte('c1000001', ['Organ im Brustkorb', 'a']);
  const autreSens = carte('c1000001:inverse');

  const correction = corrigerExamen(cours, examenDe([premiereQuestion, doublon, autreSens]), [
    1,
    0,
    'Herz',
  ]);

  // Les trois questions comptent dans la note, mais l'unité `c1000001` n'a qu'une réponse.
  expect(correction.points).toBe(2);
  expect(correction.reponses).toEqual([
    { unite: 'c1000001', juste: false },
    { unite: 'c1000001:inverse', juste: true },
  ]);
});

it('saisie_de_carte_jugee_par_juger', () => {
  const q = carte('c1000001:inverse');
  const juge = (saisie: ReponseExamen): boolean =>
    corrigerExamen(cours, examenDe([q]), [saisie]).points === 1;

  expect(juge('Herz')).toBe(true);
  expect(juge('  herz ')).toBe(true);
  // Une faute de frappe est « presque », pas juste.
  expect(juge('Hertz')).toBe(false);
  expect(juge('Leber')).toBe(false);
  expect(juge('')).toBe(false);
});

it('saisie_de_carte_accepte_les_reponses_alternatives_de_la_carte', () => {
  const q = carte('c1000006:inverse');
  const juge = (saisie: string): boolean =>
    corrigerExamen(cours, examenDe([q]), [saisie]).points === 1;

  // `hyper-` a pour alternatives `hyper` et `ueber`.
  expect(juge('hyper-')).toBe(true);
  expect(juge('hyper')).toBe(true);
  expect(juge('ueber')).toBe(true);
  expect(juge('hypo')).toBe(false);
});

it('saisie_de_carte_accepte_les_reponses_des_cartes_a_la_meme_question', () => {
  // Deux cartes ont le même verso : la question inverse accepte les deux recto (ACCEPT).
  const servi = coursServiDeTest();
  const c = preparerCours({
    ...servi,
    modules: servi.modules.map((m) =>
      m.type === 'cartes' && m.id === CHAPITRE_1
        ? {
            ...m,
            cartes: [
              ...m.cartes,
              {
                id: 'c1000009',
                type: 'b',
                recto: 'Cardia',
                verso: 'Organ im Brustkorb',
                statut: 'source' as const,
              },
            ],
          }
        : m,
    ),
  });
  const inverse = c.unites.find((u) => u.id === 'c1000001:inverse');
  if (inverse === undefined) throw new Error('unité introuvable');
  const q: QuestionExamen = { genre: 'carte', chapitre: inverse.module, unite: inverse };

  expect(corrigerExamen(c, examenDe([q]), ['Cardia']).points).toBe(1);
  expect(corrigerExamen(c, examenDe([q]), ['Herz']).points).toBe(1);
});

it('saisie_d_exercice_jugee_par_egal_strict', () => {
  const q = exercice('e2000001');
  const juge = (saisie: string): boolean =>
    corrigerExamen(cours, examenDe([q]), [saisie]).points === 1;

  expect(juge('Musteri')).toBe(true);
  expect(juge('  musteri ')).toBe(true);
  // Pas de tolérance aux fautes de frappe, contrairement aux cartes.
  expect(juge('Musteru')).toBe(false);
  expect(juge('Musteris')).toBe(false);
  expect(juge('')).toBe(false);
});

it('reponse_a_choix_est_un_indice_d_option', () => {
  const q = exercice('e1000001');
  const juge = (reponse: ReponseExamen): boolean =>
    corrigerExamen(cours, examenDe([q]), [reponse]).points === 1;

  expect(juge(0)).toBe(true);
  expect(juge(1)).toBe(false);
  expect(juge(2)).toBe(false);
  // Un indice hors des options, une saisie pour une question à choix : faux.
  expect(juge(3)).toBe(false);
  expect(juge(-1)).toBe(false);
  expect(juge(0.5)).toBe(false);
  expect(juge('der')).toBe(false);
});

it('saisie_pour_une_question_a_taper_pas_un_indice', () => {
  const q = exercice('e2000001');

  expect(corrigerExamen(cours, examenDe([q]), [0]).points).toBe(0);
  expect(corrigerExamen(cours, examenDe([q]), [0]).fautes[0].donnee).toBeUndefined();
});

it('fautes_donnent_ce_qui_a_ete_repondu', () => {
  const choixFaux = exercice('e1000002'); // die
  const saisieFausse = exercice('e2000002'); // Probelae
  const sautee = schemaQuestion(0);
  const juste = motQuestion('w0000001');

  const correction = corrigerExamen(cours, examenDe([choixFaux, saisieFausse, sautee, juste]), [
    2,
    'Probela',
    undefined,
    bonne(juste),
  ]);

  expect(correction.fautes).toEqual([
    { question: choixFaux, donnee: 'das' },
    { question: saisieFausse, donnee: 'Probela' },
    { question: sautee, donnee: undefined },
  ]);
});

it('par_groupe_compte_juste_et_total', () => {
  const questions = [
    carte('c1000001', ['Organ im Brustkorb', 'a']),
    carte('c1000002', ['Grosse Drüse im Oberbauch', 'a']),
    carte('c2000001:inverse'),
    motQuestion('w0000001'),
    schemaQuestion(1),
    jetonQuestion(0, 1),
    exercice('e2000001'),
    exercice('e1000003'),
  ];
  const reponses: ReponseExamen[] = [
    0, // juste
    1, // fausse
    'tachy-', // juste (saisie)
    1, // mot : options[1] = « a », fausse
    0, // schéma : juste
    bonne(questions[5]), // jeton : juste
    'Musteri', // juste
    undefined, // sautée
  ];

  const correction = corrigerExamen(cours, examenDe(questions), reponses);

  expect([...correction.parGroupe]).toEqual([
    [CHAPITRE_1, { justes: 1, total: 2 }],
    [CHAPITRE_2, { justes: 1, total: 1 }],
    ['mots', { justes: 0, total: 1 }],
    ['schemas', { justes: 1, total: 1 }],
    ['textes', { justes: 1, total: 1 }],
    ['exercices', { justes: 1, total: 2 }],
  ]);
  expect(correction.points).toBe(5);
  expect(correction.questions).toBe(8);
  expect(correction.note).toBe(noteSuisse(5, 8));
});

it('par_groupe_ordonne_les_chapitres_du_cours_puis_les_modules', () => {
  // Les questions arrivent dans le désordre ; les groupes sortent dans l'ordre du cours.
  const questions = [
    TROU,
    exercice('e2000001'),
    schemaQuestion(0),
    carte('c2000001', ['schnell', 'a']),
    jetonQuestion(0, 0),
    carte('c1000001', ['Organ im Brustkorb', 'a']),
    motQuestion('w0000001'),
  ];

  const correction = corrigerExamen(cours, examenDe(questions), []);

  expect([...correction.parGroupe.keys()]).toEqual([
    CHAPITRE_1,
    CHAPITRE_2,
    'mots',
    'schemas',
    'textes',
    'exercices',
    'feuilles',
  ]);
});

it('correction_groupe_feuilles', () => {
  const questions = [
    QCM,
    carte('c1000001', ['Organ im Brustkorb', 'a']),
    AFFIRMATION_VRAIE,
    AFFIRMATION_FAUSSE,
    exercice('e2000001'),
    TROU,
    MOT_A_CORRIGER,
  ];
  const reponses: ReponseExamen[] = [
    1, // QCM : « über dem Mass », juste
    1, // carte : fausse
    0, // affirmation vraie : « Richtig », juste
    0, // affirmation fausse : « Richtig », faux
    'Musteri', // exercice : juste
    'tachy', // trou : juste
    'Tachykardi', // mot : faux
  ];

  const correction = corrigerExamen(cours, examenDe(questions), reponses);

  // Les fiches font un groupe, après les modules du prototype.
  expect([...correction.parGroupe]).toEqual([
    [CHAPITRE_1, { justes: 0, total: 1 }],
    ['exercices', { justes: 1, total: 1 }],
    ['feuilles', { justes: 3, total: 5 }],
  ]);
  expect(correction.points).toBe(4);
  // Chaque élément reçoit sa réponse sous son propre identifiant, et compte pour sa fiche (F1-D3).
  expect(correction.reponses).toEqual([
    { unite: 'fb000007', juste: true },
    { unite: 'c1000001', juste: false },
    { unite: 'fb000008', juste: true },
    { unite: 'fb000009', juste: false },
    { unite: 'e2000001', juste: true },
    { unite: 'fb000011', juste: true },
    { unite: 'fb000012', juste: false },
  ]);
  for (const { unite } of correction.reponses) {
    expect(cours.unitesConnues.has(unite), unite).toBe(true);
  }
  // Les fautes disent ce qui a été répondu : le code d'un vrai/faux, ou la saisie.
  expect(correction.fautes.map((f) => [elementDe(f.question), f.donnee])).toEqual([
    ['?', 'a'],
    ['fb000009', VRAI],
    ['fb000012', 'Tachykardi'],
  ]);
});

it('par_groupe_garde_un_chapitre_que_le_cours_ne_connait_pas', () => {
  const inconnue: QuestionExamen = {
    genre: 'carte',
    chapitre: 'inconnu0',
    unite: unite('c1000001'),
  };

  const correction = corrigerExamen(cours, examenDe([inconnue, carte('c2000001')]), []);

  expect([...correction.parGroupe.keys()]).toEqual([CHAPITRE_2, 'inconnu0']);
});

it('groupe_de_chaque_genre_de_question', () => {
  expect(groupeDeQuestion(carte('c2000001'))).toBe(CHAPITRE_2);
  expect(groupeDeQuestion(motQuestion('w0000001'))).toBe('mots');
  expect(groupeDeQuestion(schemaQuestion(0))).toBe('schemas');
  expect(groupeDeQuestion(jetonQuestion(0, 0))).toBe('textes');
  expect(groupeDeQuestion(exercice('e1000001'))).toBe('exercices');
  for (const q of [QCM, AFFIRMATION_VRAIE, TROU, MOT_A_CORRIGER]) {
    expect(groupeDeQuestion(q)).toBe('feuilles');
  }
});

it('reponse_attendue_de_chaque_genre_de_question', () => {
  expect(reponseAttendue(carte('c1000001'))).toBe('Organ im Brustkorb');
  expect(reponseAttendue(carte('c1000001:inverse'))).toBe('Herz');
  expect(reponseAttendue(motQuestion('w0000003'))).toBe('Leberentfernung');
  expect(reponseAttendue(schemaQuestion(2))).toBe('Unterpol');
  expect(reponseAttendue(jetonQuestion(1, 0))).toBe('Teelöffel');
  expect(reponseAttendue(exercice('e2000002'))).toBe('Probelae');
  expect(reponseAttendue(QCM)).toBe('über dem Mass');
  expect(reponseAttendue(AFFIRMATION_VRAIE)).toBe(VRAI);
  expect(reponseAttendue(AFFIRMATION_FAUSSE)).toBe(FAUX);
  expect(reponseAttendue(TROU)).toBe('tachy-');
  expect(reponseAttendue(MOT_A_CORRIGER)).toBe('Tachykardie');
});

it('chapitres_de_la_correction_sont_ceux_de_l_examen', () => {
  const q = [carte('c1000001')];

  expect(corrigerExamen(cours, examenDe(q, [CHAPITRE_1, CHAPITRE_2]), []).chapitres).toBe(2);
  expect(corrigerExamen(cours, examenDe(q, [CHAPITRE_2]), []).chapitres).toBe(1);
  // Le nombre de chapitres choisis, pas celui des groupes qui ont reçu une question.
  expect(corrigerExamen(cours, examenDe(q, [CHAPITRE_1, CHAPITRE_2]), []).parGroupe.size).toBe(1);
});

it('examen_sans_question_note_un', () => {
  const correction = corrigerExamen(cours, examenDe([], []), []);

  expect(correction).toEqual({
    points: 0,
    questions: 0,
    note: 1,
    chapitres: 0,
    parGroupe: new Map(),
    fautes: [],
    reponses: [],
  });
});

it('correction_ne_modifie_ni_l_examen_ni_les_reponses', () => {
  const examen = composerExamen(
    cours,
    AUCUN,
    choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 12, avecModules: true }),
    hasardDeterministe(11),
  );
  const avant = structuredClone(examen);
  const reponses = Object.freeze(examen.questions.map(bonne));

  corrigerExamen(cours, examen, reponses);

  expect(examen).toEqual(avant);
});

it('examen_complet_de_la_fixture_toutes_justes', () => {
  for (let graine = 1; graine <= 20; graine++) {
    const examen = composerExamen(
      cours,
      AUCUN,
      choix({ chapitres: [CHAPITRE_1, CHAPITRE_2], taille: 20, avecModules: true, chrono: true }),
      hasardDeterministe(graine),
    );

    const correction = corrigerExamen(cours, examen, examen.questions.map(bonne));

    expect(correction.points, `graine ${graine}`).toBe(20);
    expect(correction.note).toBe(6);
    expect(correction.fautes).toEqual([]);
    expect(correction.reponses.every((r) => r.juste)).toBe(true);
  }
});
