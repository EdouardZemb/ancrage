import { expect, it } from 'vitest';
import {
  type Action,
  type Autorisation,
  type CoursAcces,
  coursVisibles,
  ouvertureAutorisee,
  type Permission,
  type Personne,
  peut,
} from './acces.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER.
 *
 * Les tests de mutation (`pnpm mutation`, `stryker.config.json`) relancent un test par son nom.
 * Le lanceur de Stryker 10.0.0 joint les noms de suite par une espace, Vitest 5 par « > » : un
 * test dans un `describe` n'est jamais retrouvé, Stryker ne rejoue rien et tout mutant paraît
 * survivre (score de 0 %). Chaque nom de test porte donc seul son contexte.
 *
 * Deux contournements dans `stryker.config.json`, qui n'accepte pas de commentaire :
 * - `tsconfigFile` désigne un fichier qui n'existe pas, exprès : Stryker réécrit sinon le
 *   tsconfig avec l'API JavaScript de TypeScript, absente de TypeScript 7 (la réécriture ne
 *   changerait rien ici, `tsconfig.json` n'ayant ni `extends` ni `references`) ;
 * - `plugins` nomme le lanceur vitest : avec pnpm, Stryker ne le trouve pas tout seul.
 */

const ID_COURS = 'cours-a';
const ID_AUTRE_COURS = 'cours-b';

const AUTORISATIONS: readonly Autorisation[] = [
  { cours: ID_COURS, permission: 'apprendre', sujet: { type: 'personne', id: 'personne-nommee' } },
  { cours: ID_COURS, permission: 'apprendre', sujet: { type: 'groupe', id: 'groupe-autorise' } },
  { cours: ID_AUTRE_COURS, permission: 'apprendre', sujet: { type: 'groupe', id: 'groupe-autre' } },
];

const PERSONNES = {
  aucune: undefined,
  proprietaire: { id: 'personne-proprietaire', proprietaire: true, groupes: [] },
  autorisee_nommement: { id: 'personne-nommee', proprietaire: false, groupes: [] },
  membre_d_un_groupe_autorise: {
    id: 'personne-membre',
    proprietaire: false,
    groupes: ['groupe-autorise'],
  },
  membre_d_un_autre_groupe: {
    id: 'personne-autre-groupe',
    proprietaire: false,
    groupes: ['groupe-autre'],
  },
  sans_aucun_droit: { id: 'personne-sans-droit', proprietaire: false, groupes: [] },
} satisfies Record<string, Personne | undefined>;

const COURS = {
  ordinaire: { id: ID_COURS, aVerifier: false, derogation: false },
  // Une dérogation sans élément « à vérifier » : sans effet, le cours est ouvert aux groupes.
  ordinaire_avec_derogation: { id: ID_COURS, aVerifier: false, derogation: true },
  a_verifier: { id: ID_COURS, aVerifier: true, derogation: false },
  a_verifier_avec_derogation: { id: ID_COURS, aVerifier: true, derogation: true },
} satisfies Record<string, CoursAcces>;

type NomPersonne = keyof typeof PERSONNES;
type NomCours = keyof typeof COURS;

/*
 * Une ligne par personne × cours × action, avec la réponse attendue écrite à la main. L'accès d'un
 * groupe à un cours « à vérifier » exige une dérogation : `peut` l'applique à chaque contrôle (le
 * droit d'un groupe s'éteint dès que le cours en a besoin) et `ouvertureAutorisee` l'applique déjà
 * quand on donne le droit. Le droit nominatif et le propriétaire n'en dépendent pas.
 */
const MATRICE: readonly [NomPersonne, NomCours, Action, boolean][] = [
  ['aucune', 'ordinaire', 'lister', false],
  ['aucune', 'ordinaire', 'lire', false],
  ['aucune', 'ordinaire', 'administrer', false],
  ['aucune', 'ordinaire_avec_derogation', 'lister', false],
  ['aucune', 'ordinaire_avec_derogation', 'lire', false],
  ['aucune', 'ordinaire_avec_derogation', 'administrer', false],
  ['aucune', 'a_verifier', 'lister', false],
  ['aucune', 'a_verifier', 'lire', false],
  ['aucune', 'a_verifier', 'administrer', false],
  ['aucune', 'a_verifier_avec_derogation', 'lister', false],
  ['aucune', 'a_verifier_avec_derogation', 'lire', false],
  ['aucune', 'a_verifier_avec_derogation', 'administrer', false],

  ['proprietaire', 'ordinaire', 'lister', true],
  ['proprietaire', 'ordinaire', 'lire', true],
  ['proprietaire', 'ordinaire', 'administrer', true],
  ['proprietaire', 'ordinaire_avec_derogation', 'lister', true],
  ['proprietaire', 'ordinaire_avec_derogation', 'lire', true],
  ['proprietaire', 'ordinaire_avec_derogation', 'administrer', true],
  ['proprietaire', 'a_verifier', 'lister', true],
  ['proprietaire', 'a_verifier', 'lire', true],
  ['proprietaire', 'a_verifier', 'administrer', true],
  ['proprietaire', 'a_verifier_avec_derogation', 'lister', true],
  ['proprietaire', 'a_verifier_avec_derogation', 'lire', true],
  ['proprietaire', 'a_verifier_avec_derogation', 'administrer', true],

  ['autorisee_nommement', 'ordinaire', 'lister', true],
  ['autorisee_nommement', 'ordinaire', 'lire', true],
  ['autorisee_nommement', 'ordinaire', 'administrer', false],
  ['autorisee_nommement', 'ordinaire_avec_derogation', 'lister', true],
  ['autorisee_nommement', 'ordinaire_avec_derogation', 'lire', true],
  ['autorisee_nommement', 'ordinaire_avec_derogation', 'administrer', false],
  ['autorisee_nommement', 'a_verifier', 'lister', true],
  ['autorisee_nommement', 'a_verifier', 'lire', true],
  ['autorisee_nommement', 'a_verifier', 'administrer', false],
  ['autorisee_nommement', 'a_verifier_avec_derogation', 'lister', true],
  ['autorisee_nommement', 'a_verifier_avec_derogation', 'lire', true],
  ['autorisee_nommement', 'a_verifier_avec_derogation', 'administrer', false],

  ['membre_d_un_groupe_autorise', 'ordinaire', 'lister', true],
  ['membre_d_un_groupe_autorise', 'ordinaire', 'lire', true],
  ['membre_d_un_groupe_autorise', 'ordinaire', 'administrer', false],
  ['membre_d_un_groupe_autorise', 'ordinaire_avec_derogation', 'lister', true],
  ['membre_d_un_groupe_autorise', 'ordinaire_avec_derogation', 'lire', true],
  ['membre_d_un_groupe_autorise', 'ordinaire_avec_derogation', 'administrer', false],
  ['membre_d_un_groupe_autorise', 'a_verifier', 'lister', false],
  ['membre_d_un_groupe_autorise', 'a_verifier', 'lire', false],
  ['membre_d_un_groupe_autorise', 'a_verifier', 'administrer', false],
  ['membre_d_un_groupe_autorise', 'a_verifier_avec_derogation', 'lister', true],
  ['membre_d_un_groupe_autorise', 'a_verifier_avec_derogation', 'lire', true],
  ['membre_d_un_groupe_autorise', 'a_verifier_avec_derogation', 'administrer', false],

  ['membre_d_un_autre_groupe', 'ordinaire', 'lister', false],
  ['membre_d_un_autre_groupe', 'ordinaire', 'lire', false],
  ['membre_d_un_autre_groupe', 'ordinaire', 'administrer', false],
  ['membre_d_un_autre_groupe', 'ordinaire_avec_derogation', 'lister', false],
  ['membre_d_un_autre_groupe', 'ordinaire_avec_derogation', 'lire', false],
  ['membre_d_un_autre_groupe', 'ordinaire_avec_derogation', 'administrer', false],
  ['membre_d_un_autre_groupe', 'a_verifier', 'lister', false],
  ['membre_d_un_autre_groupe', 'a_verifier', 'lire', false],
  ['membre_d_un_autre_groupe', 'a_verifier', 'administrer', false],
  ['membre_d_un_autre_groupe', 'a_verifier_avec_derogation', 'lister', false],
  ['membre_d_un_autre_groupe', 'a_verifier_avec_derogation', 'lire', false],
  ['membre_d_un_autre_groupe', 'a_verifier_avec_derogation', 'administrer', false],

  ['sans_aucun_droit', 'ordinaire', 'lister', false],
  ['sans_aucun_droit', 'ordinaire', 'lire', false],
  ['sans_aucun_droit', 'ordinaire', 'administrer', false],
  ['sans_aucun_droit', 'ordinaire_avec_derogation', 'lister', false],
  ['sans_aucun_droit', 'ordinaire_avec_derogation', 'lire', false],
  ['sans_aucun_droit', 'ordinaire_avec_derogation', 'administrer', false],
  ['sans_aucun_droit', 'a_verifier', 'lister', false],
  ['sans_aucun_droit', 'a_verifier', 'lire', false],
  ['sans_aucun_droit', 'a_verifier', 'administrer', false],
  ['sans_aucun_droit', 'a_verifier_avec_derogation', 'lister', false],
  ['sans_aucun_droit', 'a_verifier_avec_derogation', 'lire', false],
  ['sans_aucun_droit', 'a_verifier_avec_derogation', 'administrer', false],
];

const ACTIONS: readonly Action[] = ['lister', 'lire', 'administrer'];

function lecteur(id: string, groupes: readonly string[] = []): Personne {
  return { id, proprietaire: false, groupes };
}

function droitPersonne(cours: string, id: string): Autorisation {
  return { cours, permission: 'apprendre', sujet: { type: 'personne', id } };
}

function droitGroupe(cours: string, id: string): Autorisation {
  return { cours, permission: 'apprendre', sujet: { type: 'groupe', id } };
}

it.each(MATRICE)(
  'matrice_exhaustive_%s_sur_cours_%s_action_%s_attendu_%s',
  (personne, cours, action, attendu) => {
    expect(peut(PERSONNES[personne], action, COURS[cours], AUTORISATIONS)).toBe(attendu);
  },
);

it('matrice_exhaustive_couvre_chaque_personne_cours_et_action_une_seule_fois', () => {
  const attendues = Object.keys(PERSONNES).flatMap((personne) =>
    Object.keys(COURS).flatMap((cours) =>
      ACTIONS.map((action) => `${personne}|${cours}|${action}`),
    ),
  );
  const lignes = MATRICE.map(([personne, cours, action]) => `${personne}|${cours}|${action}`);

  expect(lignes).toHaveLength(attendues.length);
  expect(new Set(lignes).size).toBe(lignes.length);
  expect([...lignes].sort()).toEqual([...attendues].sort());
});

it('cours_inconnu_refuse_meme_au_proprietaire_pour_lire', () => {
  expect(peut(PERSONNES.proprietaire, 'lire', undefined, AUTORISATIONS)).toBe(false);
});

it('cours_inconnu_refuse_pour_toute_action_et_toute_personne', () => {
  for (const personne of Object.values(PERSONNES)) {
    for (const action of ACTIONS) {
      expect(peut(personne, action, undefined, AUTORISATIONS)).toBe(false);
    }
  }
});

it('personne_inconnue_refusee_meme_si_une_autorisation_existe', () => {
  const cours = COURS.ordinaire;
  for (const action of ACTIONS) {
    expect(peut(undefined, action, cours, AUTORISATIONS)).toBe(false);
  }
  expect(peut(undefined, 'lire', undefined, AUTORISATIONS)).toBe(false);
});

it('proprietaire_peut_tout_sans_aucune_autorisation', () => {
  for (const action of ACTIONS) {
    expect(peut(PERSONNES.proprietaire, action, COURS.a_verifier, [])).toBe(true);
  }
});

it('sans_autorisation_personne_ne_voit_rien', () => {
  for (const action of ACTIONS) {
    expect(peut(PERSONNES.autorisee_nommement, action, COURS.ordinaire, [])).toBe(false);
    expect(peut(PERSONNES.membre_d_un_groupe_autorise, action, COURS.ordinaire, [])).toBe(false);
  }
});

it('autorisation_d_un_autre_cours_ignoree', () => {
  const personne = lecteur('personne-nommee', ['groupe-autorise']);
  const autorisations = [
    droitPersonne(ID_AUTRE_COURS, 'personne-nommee'),
    droitGroupe(ID_AUTRE_COURS, 'groupe-autorise'),
  ];

  expect(peut(personne, 'lire', COURS.ordinaire, autorisations)).toBe(false);
  expect(peut(personne, 'lister', COURS.ordinaire, autorisations)).toBe(false);
  // Contrôle : les mêmes autorisations ouvrent bien l'autre cours.
  const autreCours: CoursAcces = { id: ID_AUTRE_COURS, aVerifier: false, derogation: false };
  expect(peut(personne, 'lire', autreCours, autorisations)).toBe(true);
});

it('autorisation_pour_une_autre_personne_ignoree', () => {
  const autorisations = [droitPersonne(ID_COURS, 'quelqu-un-d-autre')];

  expect(peut(lecteur('personne-nommee'), 'lire', COURS.ordinaire, autorisations)).toBe(false);
});

it('le_type_du_sujet_compte_un_groupe_n_est_pas_une_personne', () => {
  // Un identifiant de groupe égal à celui de la personne, ou l'inverse, ne donne rien.
  const personne = lecteur('identifiant-commun', ['identifiant-groupe']);

  expect(
    peut(personne, 'lire', COURS.ordinaire, [droitGroupe(ID_COURS, 'identifiant-commun')]),
  ).toBe(false);
  expect(
    peut(personne, 'lire', COURS.ordinaire, [droitPersonne(ID_COURS, 'identifiant-groupe')]),
  ).toBe(false);
});

it('les_droits_se_cumulent_et_l_ordre_des_autorisations_est_sans_effet', () => {
  const personne = lecteur('personne-nommee', ['groupe-x', 'groupe-autorise', 'groupe-y']);
  const hors = [
    droitPersonne(ID_AUTRE_COURS, 'personne-nommee'),
    droitGroupe(ID_COURS, 'groupe-z'),
    droitPersonne(ID_COURS, 'quelqu-un-d-autre'),
  ];

  // Personne nommée seule, en dernier de la liste.
  expect(
    peut(personne, 'lire', COURS.ordinaire, [...hors, droitPersonne(ID_COURS, 'personne-nommee')]),
  ).toBe(true);
  // Groupe seul (le deuxième des trois groupes), en dernier de la liste.
  expect(
    peut(personne, 'lire', COURS.ordinaire, [...hors, droitGroupe(ID_COURS, 'groupe-autorise')]),
  ).toBe(true);
  // Les deux, en tête de la liste.
  expect(
    peut(personne, 'lire', COURS.ordinaire, [
      droitGroupe(ID_COURS, 'groupe-autorise'),
      droitPersonne(ID_COURS, 'personne-nommee'),
      ...hors,
    ]),
  ).toBe(true);
  // Aucun droit utile parmi les autorisations.
  expect(peut(personne, 'lire', COURS.ordinaire, hors)).toBe(false);
});

it('administrer_reste_reserve_au_proprietaire_malgre_les_droits_cumules', () => {
  const personne = lecteur('personne-nommee', ['groupe-autorise']);

  expect(peut(personne, 'administrer', COURS.ordinaire, AUTORISATIONS)).toBe(false);
});

it('groupe_perd_l_acces_si_le_cours_devient_a_verifier', () => {
  const membre = lecteur('personne-membre', ['groupe-autorise']);
  const autorisations = [droitGroupe(ID_COURS, 'groupe-autorise')];
  const ouvert: CoursAcces = { id: ID_COURS, aVerifier: false, derogation: false };
  // Le même cours, ouvert au groupe, puis un élément « à vérifier » y apparaît.
  const devenu: CoursAcces = { ...ouvert, aVerifier: true };

  expect(peut(membre, 'lire', ouvert, autorisations)).toBe(true);
  expect(peut(membre, 'lire', devenu, autorisations)).toBe(false);
  expect(peut(membre, 'lister', devenu, autorisations)).toBe(false);
  expect(coursVisibles(membre, [ouvert], autorisations)).toEqual([ouvert]);
  expect(coursVisibles(membre, [devenu], autorisations)).toEqual([]);
});

it('droit_nominatif_garde_l_acces_sur_cours_a_verifier', () => {
  const nommee = lecteur('personne-nommee', ['groupe-x']);
  const aVerifier: CoursAcces = { id: ID_COURS, aVerifier: true, derogation: false };
  const autorisations = [
    droitPersonne(ID_COURS, 'personne-nommee'),
    droitGroupe(ID_COURS, 'groupe-x'),
  ];

  // Le droit par le groupe est éteint, le droit nominatif suffit.
  expect(peut(nommee, 'lire', aVerifier, autorisations)).toBe(true);
  expect(peut(nommee, 'lister', aVerifier, autorisations)).toBe(true);
  expect(peut(nommee, 'administrer', aVerifier, autorisations)).toBe(false);
  expect(coursVisibles(nommee, [aVerifier], autorisations)).toEqual([aVerifier]);
});

it('groupe_garde_l_acces_avec_derogation', () => {
  const membre = lecteur('personne-membre', ['groupe-autorise']);
  const autorisations = [droitGroupe(ID_COURS, 'groupe-autorise')];
  const deroge: CoursAcces = { id: ID_COURS, aVerifier: true, derogation: true };

  expect(peut(membre, 'lire', deroge, autorisations)).toBe(true);
  expect(peut(membre, 'lister', deroge, autorisations)).toBe(true);
  expect(peut(membre, 'administrer', deroge, autorisations)).toBe(false);
  expect(coursVisibles(membre, [deroge], autorisations)).toEqual([deroge]);
});

it('une_permission_inconnue_n_ouvre_aucun_droit', () => {
  // Quand `relire` ou `modifier` arriveront (ADR-0001), elles ne donneront pas `apprendre`.
  const inconnue = 'relire' as unknown as Permission;
  const autorisations: Autorisation[] = [
    { cours: ID_COURS, permission: inconnue, sujet: { type: 'personne', id: 'personne-nommee' } },
    { cours: ID_COURS, permission: inconnue, sujet: { type: 'groupe', id: 'groupe-autorise' } },
  ];
  const personne = lecteur('personne-nommee', ['groupe-autorise']);

  expect(peut(personne, 'lire', COURS.ordinaire, autorisations)).toBe(false);
  expect(peut(personne, 'lister', COURS.ordinaire, autorisations)).toBe(false);
});

it('une_action_inconnue_est_refusee_meme_avec_un_droit', () => {
  const inconnue = 'supprimer' as unknown as Action;

  expect(peut(PERSONNES.autorisee_nommement, inconnue, COURS.ordinaire, AUTORISATIONS)).toBe(false);
});

const LISTE_DE_COURS: CoursAcces[] = [
  { id: 'cours-1', aVerifier: false, derogation: false },
  { id: 'cours-2', aVerifier: true, derogation: false },
  { id: 'cours-3', aVerifier: false, derogation: true },
  { id: 'cours-4', aVerifier: false, derogation: false },
];
const AUTORISATIONS_DE_LA_LISTE = [
  droitGroupe('cours-4', 'groupe-classe'),
  droitPersonne('cours-1', 'personne-lectrice'),
  droitPersonne('cours-3', 'personne-lectrice'),
  droitPersonne('cours-2', 'quelqu-un-d-autre'),
];

it('coursVisibles_garde_l_ordre_et_filtre', () => {
  const lectrice = lecteur('personne-lectrice', ['groupe-classe']);

  expect(
    coursVisibles(lectrice, LISTE_DE_COURS, AUTORISATIONS_DE_LA_LISTE).map((c) => c.id),
  ).toEqual(['cours-1', 'cours-3', 'cours-4']);
  // L'ordre d'entrée prévaut, pas celui des autorisations.
  expect(
    coursVisibles(lectrice, [...LISTE_DE_COURS].reverse(), AUTORISATIONS_DE_LA_LISTE).map(
      (c) => c.id,
    ),
  ).toEqual(['cours-4', 'cours-3', 'cours-1']);
});

it('coursVisibles_rend_les_objets_d_entree_avec_leurs_champs_en_plus', () => {
  const riches = [
    { id: 'cours-1', aVerifier: false, derogation: false, titre: 'Premier' },
    { id: 'cours-2', aVerifier: false, derogation: false, titre: 'Second' },
  ];

  const visibles = coursVisibles(lecteur('personne-lectrice'), riches, AUTORISATIONS_DE_LA_LISTE);

  expect(visibles).toEqual([riches[0]]);
  expect(visibles[0]).toBe(riches[0]);
  expect(visibles[0].titre).toBe('Premier');
});

it('coursVisibles_le_proprietaire_voit_tout', () => {
  expect(coursVisibles(PERSONNES.proprietaire, LISTE_DE_COURS, []).map((c) => c.id)).toEqual([
    'cours-1',
    'cours-2',
    'cours-3',
    'cours-4',
  ]);
});

it('coursVisibles_personne_inconnue_ou_sans_droit_ne_voit_rien', () => {
  expect(coursVisibles(undefined, LISTE_DE_COURS, AUTORISATIONS_DE_LA_LISTE)).toEqual([]);
  expect(
    coursVisibles(lecteur('personne-sans-droit'), LISTE_DE_COURS, AUTORISATIONS_DE_LA_LISTE),
  ).toEqual([]);
  expect(coursVisibles(PERSONNES.proprietaire, [], AUTORISATIONS_DE_LA_LISTE)).toEqual([]);
});

it('coursVisibles_ne_modifie_pas_la_liste_d_entree', () => {
  const copie = structuredClone(LISTE_DE_COURS);

  coursVisibles(lecteur('personne-lectrice'), LISTE_DE_COURS, AUTORISATIONS_DE_LA_LISTE);

  expect(LISTE_DE_COURS).toEqual(copie);
});

const SUJET_GROUPE = { type: 'groupe', id: 'groupe-classe' } as const;
const SUJET_PERSONNE = { type: 'personne', id: 'personne-nommee' } as const;

it('ouverture_groupe_refusee_sur_cours_a_verifier_sans_derogation', () => {
  expect(
    ouvertureAutorisee(SUJET_GROUPE, { id: ID_COURS, aVerifier: true, derogation: false }),
  ).toBe('cours_a_verifier_sans_derogation');
});

it('ouverture_groupe_acceptee_avec_derogation', () => {
  expect(
    ouvertureAutorisee(SUJET_GROUPE, { id: ID_COURS, aVerifier: true, derogation: true }),
  ).toBe(undefined);
});

it('ouverture_groupe_acceptee_sur_cours_sans_element_a_verifier', () => {
  expect(
    ouvertureAutorisee(SUJET_GROUPE, { id: ID_COURS, aVerifier: false, derogation: false }),
  ).toBe(undefined);
  expect(
    ouvertureAutorisee(SUJET_GROUPE, { id: ID_COURS, aVerifier: false, derogation: true }),
  ).toBe(undefined);
});

it('ouverture_personne_toujours_acceptee', () => {
  for (const aVerifier of [false, true]) {
    for (const derogation of [false, true]) {
      expect(ouvertureAutorisee(SUJET_PERSONNE, { id: ID_COURS, aVerifier, derogation })).toBe(
        undefined,
      );
    }
  }
});
