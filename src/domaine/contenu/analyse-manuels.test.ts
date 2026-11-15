import { expect, it } from 'vitest';
import { analyserContenus } from './analyse.js';
import { exempleDeCours, modifier } from './exemple.fixture.js';

const COURS = 'essai/cours.yaml';
const CARTES_1 = 'essai/cartes/01-grundbegriffe.yaml';
const CARTES_2 = 'essai/cartes/02-vorsilben.yaml';
const MORPHOLOGIE = 'essai/morphologie.yaml';
const SCHEMA = 'essai/schemas/muster.yaml';
const ALPHA = 'b7k2m9qd';
const BETA = 'c8n3p5rt';
const AUTRE = 'd9p4q6sv';

/** Le bloc `manuels` de cours.yaml, d'après des paires (id, titre) ; `reste` est ajouté tel quel. */
function bloc(manuels: [string, string][], reste = ''): string {
  const lignes = manuels.map(([id, titre]) => `  - id: "${id}"\n    titre: "${titre}"\n`);
  return `manuels:\n${lignes.join('')}${reste}`;
}

const DEUX = bloc([
  [ALPHA, 'Lehrbuch Alpha'],
  [BETA, 'Lehrbuch Beta'],
]);

/** Ajoute `cles` (des lignes YAML) après la ligne `apres` d'un fichier de l'exemple. */
function avec(fichiers: Map<string, string>, chemin: string, apres: string, cles: string) {
  return modifier(fichiers, chemin, `${apres}\n`, `${apres}\n${cles}\n`);
}

/** L'exemple avec ses `ids.lock` : chaque identifiant de `ids` y est inscrit. */
function verrouille(fichiers: Map<string, string>, ids: string[]) {
  return modifier(fichiers, 'ids.lock', 'j5by5stz\n', `j5by5stz\n${ids.join('\n')}\n`);
}

/** Un cours à deux manuels, dont chaque module de cartes porte ses trois clés. */
function coursAvecManuels(manuels = DEUX, ids = [ALPHA, BETA]): Map<string, string> {
  const fichiers = exempleDeCours();
  modifier(fichiers, COURS, 'modules:\n', `${manuels}modules:\n`);
  avec(fichiers, CARTES_1, 'numero: 1', `manuel: "${ALPHA}"\nchapitre: 2\nunit: 1`);
  avec(fichiers, CARTES_2, 'numero: 2', `manuel: "${BETA}"\nchapitre: 1\nunit: 2`);
  avec(fichiers, SCHEMA, 'titre: "Das Musterorgan"', `manuel: "${ALPHA}"`);
  return verrouille(fichiers, ids);
}

function erreurs(fichiers: Map<string, string>) {
  return analyserContenus(fichiers).erreurs;
}

function uneErreur(fichier: string, lieu: string, message: string) {
  return [{ fichier, lieu, message }];
}

it('manuels_deux_manuels_acceptes_et_recopies', () => {
  const { cours, erreurs: refus } = analyserContenus(coursAvecManuels());
  expect(refus).toEqual([]);
  expect(cours[0].manuels).toEqual([
    { id: ALPHA, titre: 'Lehrbuch Alpha' },
    { id: BETA, titre: 'Lehrbuch Beta' },
  ]);
  const modules = cours[0].modules;
  expect(modules.find((m) => m.fichier === CARTES_1)).toMatchObject({
    manuel: ALPHA,
    chapitre: 2,
    unit: 1,
  });
  expect(modules.find((m) => m.fichier === CARTES_2)).toMatchObject({
    manuel: BETA,
    chapitre: 1,
    unit: 2,
  });
  expect(modules.find((m) => m.fichier === SCHEMA)).toMatchObject({ manuel: ALPHA });
});

it('manuels_absents_ni_le_cours_ni_les_modules_n_ont_les_cles', () => {
  const { cours, erreurs: refus } = analyserContenus(exempleDeCours());
  expect(refus).toEqual([]);
  expect(cours[0]).not.toHaveProperty('manuels');
  for (const module of cours[0].modules) {
    for (const cle of ['manuel', 'chapitre', 'unit']) expect(module).not.toHaveProperty(cle);
  }
});

it('manuels_l_id_de_chaque_manuel_est_releve_avec_son_lieu', () => {
  // Un identifiant de manuel vu deux fois dans le contenu : le refus cite `manuels[0].id`.
  const fichiers = coursAvecManuels(DEUX.replace(ALPHA, 'epas79zz'), [BETA]);
  modifier(fichiers, CARTES_1, `manuel: "${ALPHA}"`, 'manuel: "epas79zz"');
  modifier(fichiers, SCHEMA, `manuel: "${ALPHA}"`, 'manuel: "epas79zz"');
  expect(erreurs(fichiers)).toEqual(
    uneErreur(
      CARTES_1,
      'id',
      `Identifiant epas79zz en double : il figure en essai/cours.yaml:manuels[0].id et en ${CARTES_1}:id.`,
    ),
  );
});

/** Les cas de refus : chacun attend exactement une erreur (`superRefine` revérifie, zod 4). */
const REFUS: [string, () => Map<string, string>, string, string, string][] = [
  [
    'liste vide',
    () =>
      verrouille(modifier(exempleDeCours(), COURS, 'modules:\n', 'manuels: []\nmodules:\n'), []),
    COURS,
    'manuels',
    'Attendu au moins un manuel.',
  ],
  [
    'clé inconnue dans un manuel',
    () =>
      coursAvecManuels(
        DEUX.replace(
          `    titre: "Lehrbuch Alpha"\n`,
          `    titre: "Lehrbuch Alpha"\n    auteur: "x"\n`,
        ),
      ),
    COURS,
    'manuels[0].auteur',
    "Clé inconnue : le format 1 ne l'admet pas ici.",
  ],
  [
    'manuel sans titre',
    () => coursAvecManuels(DEUX.replace(`    titre: "Lehrbuch Alpha"\n`, '')),
    COURS,
    'manuels[0].titre',
    'Champ obligatoire absent.',
  ],
  [
    'titre fait d’espaces',
    () => coursAvecManuels(DEUX.replace('Lehrbuch Alpha', '   ')),
    COURS,
    'manuels[0].titre',
    'Le titre est vide.',
  ],
  [
    'id mal formé',
    () => coursAvecManuels(DEUX.replace(ALPHA, 'AB'), [BETA]),
    COURS,
    'manuels[0].id',
    'Identifiant mal formé : attendu 8 caractères parmi 0-9 et a-z, sans i, l, o ni u.',
  ],
  [
    'deux manuels du même id',
    () => modifier(coursAvecManuels(DEUX.replace(BETA, ALPHA), [ALPHA]), CARTES_2, BETA, ALPHA),
    COURS,
    'manuels[1].id',
    `Identifiant ${ALPHA} en double : il figure en essai/cours.yaml:manuels[0].id et en essai/cours.yaml:manuels[1].id.`,
  ],
  [
    'id égal à celui d’un module',
    () =>
      modifier(
        coursAvecManuels(DEUX.replace(BETA, 'epas79zz'), [ALPHA]),
        CARTES_2,
        BETA,
        'epas79zz',
      ),
    CARTES_1,
    'id',
    `Identifiant epas79zz en double : il figure en essai/cours.yaml:manuels[1].id et en ${CARTES_1}:id.`,
  ],
  [
    'id absent d’ids.lock',
    () => modifier(coursAvecManuels(), 'ids.lock', `${BETA}\n`, ''),
    COURS,
    'manuels[1].id',
    `L'identifiant ${BETA} est absent d'ids.lock : l'y ajouter avec « corepack pnpm contenus:verrouiller » avant de le publier.`,
  ],
  [
    'deux manuels du même titre',
    () => coursAvecManuels(DEUX.replace('Lehrbuch Beta', 'Lehrbuch Alpha')),
    COURS,
    'manuels[1].titre',
    'Titre en double : déjà en manuels[0].titre.',
  ],
  [
    'module de cartes sans manuel',
    () => modifier(coursAvecManuels(), CARTES_1, `manuel: "${ALPHA}"\n`, ''),
    CARTES_1,
    'manuel',
    'Champ obligatoire absent : cours.yaml nomme ses manuels.',
  ],
  [
    'module de cartes sans chapitre',
    () => modifier(coursAvecManuels(), CARTES_1, 'chapitre: 2\n', ''),
    CARTES_1,
    'chapitre',
    'Champ obligatoire absent : cours.yaml nomme ses manuels.',
  ],
  [
    'module de cartes sans unit',
    () => modifier(coursAvecManuels(), CARTES_1, 'unit: 1\n', ''),
    CARTES_1,
    'unit',
    'Champ obligatoire absent : cours.yaml nomme ses manuels.',
  ],
  [
    'manuel qui ne désigne aucun manuel (cartes)',
    () => modifier(coursAvecManuels(), CARTES_1, ALPHA, AUTRE),
    CARTES_1,
    'manuel',
    'Ce manuel ne désigne aucun manuel de ce cours.',
  ],
  [
    'manuel qui ne désigne aucun manuel (schéma)',
    () => modifier(coursAvecManuels(), SCHEMA, ALPHA, AUTRE),
    SCHEMA,
    'manuel',
    'Ce manuel ne désigne aucun manuel de ce cours.',
  ],
  [
    'même chapitre du même manuel',
    () =>
      modifier(
        coursAvecManuels(),
        CARTES_2,
        `manuel: "${BETA}"\nchapitre: 1`,
        `manuel: "${ALPHA}"\nchapitre: 2`,
      ),
    CARTES_2,
    'chapitre',
    `Chapitre 2 de ce manuel en double : c'est déjà celui de ${CARTES_1}.`,
  ],
  [
    'chapitre nul',
    () => modifier(coursAvecManuels(), CARTES_1, 'chapitre: 2', 'chapitre: 0'),
    CARTES_1,
    'chapitre',
    'Attendu un nombre entier positif.',
  ],
  [
    'chapitre en texte',
    () => modifier(coursAvecManuels(), CARTES_1, 'chapitre: 2', 'chapitre: "3"'),
    CARTES_1,
    'chapitre',
    'Attendu un nombre, trouvé un texte.',
  ],
  [
    'unit nulle',
    () => modifier(coursAvecManuels(), CARTES_1, 'unit: 1', 'unit: 0'),
    CARTES_1,
    'unit',
    'Attendu un nombre entier positif.',
  ],
  [
    'unit en texte',
    () => modifier(coursAvecManuels(), CARTES_1, 'unit: 1', 'unit: "2"'),
    CARTES_1,
    'unit',
    'Attendu un nombre, trouvé un texte.',
  ],
  [
    'unit décimale',
    () => modifier(coursAvecManuels(), CARTES_1, 'unit: 1', 'unit: 2.5'),
    CARTES_1,
    'unit',
    'Attendu un nombre entier, trouvé un nombre.',
  ],
  [
    'manuel sur la morphologie',
    () => avec(coursAvecManuels(), MORPHOLOGIE, 'id: "v1xmwpyr"', `manuel: "${ALPHA}"`),
    MORPHOLOGIE,
    'manuel',
    "Clé inconnue : le format 1 ne l'admet pas ici.",
  ],
  [
    'chapitre sur un schéma',
    () => avec(coursAvecManuels(), SCHEMA, 'id: "zp42j4eq"', 'chapitre: 1'),
    SCHEMA,
    'chapitre',
    "Clé inconnue : le format 1 ne l'admet pas ici.",
  ],
  [
    'manuel sur un cours sans manuels (cartes)',
    () => avec(exempleDeCours(), CARTES_1, 'numero: 1', `manuel: "${ALPHA}"`),
    CARTES_1,
    'manuel',
    "N'est admis que si cours.yaml nomme ses manuels.",
  ],
  [
    'unit seule sur un cours sans manuels',
    () => avec(exempleDeCours(), CARTES_1, 'numero: 1', 'unit: 1'),
    CARTES_1,
    'unit',
    "N'est admis que si cours.yaml nomme ses manuels.",
  ],
  [
    'manuel sur un schéma d’un cours sans manuels',
    () => avec(exempleDeCours(), SCHEMA, 'titre: "Das Musterorgan"', `manuel: "${ALPHA}"`),
    SCHEMA,
    'manuel',
    "N'est admis que si cours.yaml nomme ses manuels.",
  ],
];

it.each(REFUS)('manuels_refus_%s', (_nom, fichiers, fichier, lieu, message) => {
  expect(erreurs(fichiers())).toEqual(uneErreur(fichier, lieu, message));
});

it('manuels_deux_modules_sans_chapitre_n_ont_pas_de_double', () => {
  const fichiers = modifier(coursAvecManuels(), CARTES_1, 'chapitre: 2\n', '');
  modifier(fichiers, CARTES_2, 'chapitre: 1\n', '');
  modifier(fichiers, CARTES_2, `manuel: "${BETA}"`, `manuel: "${ALPHA}"`);
  const absente = 'Champ obligatoire absent : cours.yaml nomme ses manuels.';
  expect(erreurs(fichiers)).toEqual([
    { fichier: CARTES_1, lieu: 'chapitre', message: absente },
    { fichier: CARTES_2, lieu: 'chapitre', message: absente },
  ]);
});

it('manuels_un_manuel_que_aucun_module_ne_cite_est_admis', () => {
  const fichiers = modifier(
    coursAvecManuels(),
    COURS,
    `    titre: "Lehrbuch Beta"\n`,
    `    titre: "Lehrbuch Beta"\n  - id: "${AUTRE}"\n    titre: "Lehrbuch Gamma"\n`,
  );
  verrouille(fichiers, [AUTRE]);
  expect(erreurs(fichiers)).toEqual([]);
});
