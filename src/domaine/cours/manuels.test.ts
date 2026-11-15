import { expect, it } from 'vitest';
import type { Manuel } from '../contenu/modele.js';
import {
  CHAPITRE_1,
  CHAPITRE_2,
  coursAvecManuels,
  coursServiDeTest,
  SCHEMA_2,
} from './cours.fixture.js';
import {
  divisionsDuCours,
  lireManuels,
  numeroAffiche,
  numeroDeLUnite,
  rangementDuChapitre,
} from './manuels.js';
import { type CoursPrepare, preparerCours } from './prepare.js';

/* Données factices, écrites à la main (invariant 7). */

const A: Manuel = { id: 'b7k2m9qd', titre: 'Lehrbuch Alpha' };
const B: Manuel = { id: 'c8n3p5rt', titre: 'Lehrbuch Beta' };

it('lireManuels_rend_une_liste_valide_telle_quelle', () => {
  expect(lireManuels([A, B])).toEqual([A, B]);
});

it('lireManuels_retire_une_cle_inconnue', () => {
  expect(lireManuels([{ ...A, auteur: 'x' }])).toStrictEqual([A]);
});

it.each([
  ['undefined', undefined],
  ['un nombre', 42],
  ['un objet', {}],
  ['une liste vide', []],
  ['un manuel sans id', [{ titre: 'Lehrbuch Alpha' }]],
  ['un id qui n’est pas un texte', [{ id: 7, titre: 'Lehrbuch Alpha' }]],
  ['un manuel sans titre', [{ id: A.id }]],
  ['un titre qui n’est pas un texte', [{ id: A.id, titre: 7 }]],
  ['deux fois le même id', [A, { id: A.id, titre: 'Lehrbuch Beta' }]],
  ['un bon manuel puis un mauvais', [A, null]],
])('lireManuels_rend_vide_pour_%s', (_nom, lu) => {
  expect(lireManuels(lu)).toEqual([]);
});

it('rangementDuChapitre_garde_le_manuel_le_chapitre_et_la_unit', () => {
  const lu = rangementDuChapitre({ manuel: B.id, chapitre: 3, unit: 2 }, [A, B]);
  expect(lu).toStrictEqual({ manuel: B.id, chapitre: 3, unit: 2 });
});

it.each([
  ['un manuel inconnu', { manuel: 'epas79zz', chapitre: 3, unit: 2 }],
  ['un manuel qui n’est pas un texte', { manuel: 7, chapitre: 3, unit: 2 }],
  ['un chapitre absent', { manuel: B.id, unit: 2 }],
  ['un chapitre nul', { manuel: B.id, chapitre: 0, unit: 2 }],
  ['un chapitre négatif', { manuel: B.id, chapitre: -1, unit: 2 }],
  ['un chapitre décimal', { manuel: B.id, chapitre: 2.5, unit: 2 }],
  ['un chapitre en texte', { manuel: B.id, chapitre: '2', unit: 2 }],
  ['pas de manuel', { chapitre: 3, unit: 2 }],
])('rangementDuChapitre_perd_manuel_et_chapitre_pour_%s', (_nom, module) => {
  expect(rangementDuChapitre(module, [A, B])).toStrictEqual({ unit: 2 });
});

it.each([
  ['nulle', 0],
  ['décimale', 2.5],
  ['en texte', '2'],
  ['négative', -1],
])('rangementDuChapitre_perd_une_unit_%s', (_nom, unit) => {
  expect(rangementDuChapitre({ manuel: B.id, chapitre: 3, unit }, [A, B])).toStrictEqual({
    manuel: B.id,
    chapitre: 3,
  });
  expect(rangementDuChapitre({ unit }, [])).toStrictEqual({});
});

it('rangementDuChapitre_garde_une_unit_sans_manuel', () => {
  expect(rangementDuChapitre({ unit: 4 }, [])).toStrictEqual({ unit: 4 });
});

it('numeroAffiche_rend_le_chapitre_sinon_le_numero', () => {
  expect(numeroAffiche({ numero: 5, chapitre: 2 })).toBe(2);
  expect(numeroAffiche({ numero: 5 })).toBe(5);
});

it('numeroDeLUnite_rend_le_numero_affiche_du_chapitre_de_l_unite', () => {
  const cours = preparerCours(coursAvecManuels());
  expect(numeroDeLUnite(cours, { module: CHAPITRE_1, numero: 1 })).toBe(2);
  expect(numeroDeLUnite(cours, { module: CHAPITRE_2, numero: 2 })).toBe(1);
});

it('numeroDeLUnite_rend_le_numero_de_l_unite_si_le_module_n_est_pas_un_chapitre', () => {
  const cours = preparerCours(coursAvecManuels());
  expect(numeroDeLUnite(cours, { module: 'mc999999', numero: 7 })).toBe(7);
});

it('divisionsDuCours_est_indefinie_sans_manuel_lu', () => {
  expect(divisionsDuCours(preparerCours(coursServiDeTest()))).toBeUndefined();
  expect(divisionsDuCours(preparerCours({ ...coursAvecManuels(), manuels: 42 }))).toBeUndefined();
});

it('divisionsDuCours_est_indefinie_si_aucun_module_n_a_de_manuel_lisible', () => {
  const cours = coursAvecManuels();
  const modules = cours.modules.map((module) =>
    module.type === 'cartes' || module.type === 'schema'
      ? { ...module, manuel: 'epas79zz' }
      : module,
  );
  expect(divisionsDuCours(preparerCours({ ...cours, modules }))).toBeUndefined();
});

it('divisionsDuCours_range_par_manuel_puis_une_derniere_division_sans_manuel', () => {
  const divisions = divisionsDuCours(preparerCours(coursAvecManuels()));
  if (divisions === undefined) throw new Error('le mode des divisions est allumé');
  // Gamma, que nul module ne cite, ne se montre pas.
  expect(divisions.map((d) => d.manuel?.titre)).toEqual([
    'Lehrbuch Alpha',
    'Lehrbuch Beta',
    undefined,
  ]);
  const [alpha, beta, uebungen] = divisions;
  expect(alpha.chapitres).toEqual([]);
  expect(alpha.schemas.map((s) => s.id)).toEqual(['sc000001']);
  // L'ordre du livre : le chapitre 1 de Beta (CHAPITRE_2) avant le chapitre 2 (CHAPITRE_1).
  expect(beta.chapitres.map((c) => c.id)).toEqual([CHAPITRE_2, CHAPITRE_1]);
  expect(beta.schemas).toEqual([]);
  expect(uebungen.chapitres).toEqual([]);
  expect(uebungen.schemas.map((s) => s.id)).toEqual([SCHEMA_2]);
});

it('divisionsDuCours_garde_l_ordre_du_cours_a_egalite_de_chapitre', () => {
  const cours = coursAvecManuels();
  const modules = cours.modules.map((module) =>
    module.type === 'cartes' ? { ...module, chapitre: 1 } : module,
  );
  const divisions = divisionsDuCours(preparerCours({ ...cours, modules }));
  expect(divisions?.[1].chapitres.map((c) => c.id)).toEqual([CHAPITRE_1, CHAPITRE_2]);
});

it('divisionsDuCours_un_schema_seul_dans_un_manuel_allume_le_mode', () => {
  const cours = coursAvecManuels();
  const modules = cours.modules.map((module) =>
    module.type === 'cartes' ? { ...module, manuel: undefined } : module,
  );
  const divisions = divisionsDuCours(preparerCours({ ...cours, modules }));
  expect(divisions?.map((d) => [d.manuel?.titre, d.chapitres.length, d.schemas.length])).toEqual([
    ['Lehrbuch Alpha', 0, 1],
    [undefined, 2, 1],
  ]);
});

it('divisionsDuCours_la_division_sans_manuel_reunit_les_chapitres_a_manuel_illisible', () => {
  const cours = coursAvecManuels();
  const modules = cours.modules.map((module) =>
    module.type === 'cartes' && module.id === CHAPITRE_2
      ? { ...module, manuel: 'epas79zz' }
      : module,
  );
  const divisions = divisionsDuCours(preparerCours({ ...cours, modules }));
  expect(divisions?.map((d) => d.chapitres.map((c) => c.id))).toEqual([
    [],
    [CHAPITRE_1],
    [CHAPITRE_2],
  ]);
});

it('divisionsDuCours_se_calcule_sur_les_chapitres_prepares_seuls', () => {
  const prepare = preparerCours(coursAvecManuels());
  const seul: Pick<CoursPrepare, 'manuels' | 'chapitres' | 'schemas'> = {
    manuels: prepare.manuels,
    chapitres: prepare.chapitres,
    schemas: prepare.schemas,
  };
  expect(divisionsDuCours(seul)).toEqual(divisionsDuCours(prepare));
});
