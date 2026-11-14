import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { executer } from './cli-ajuster.js';
import { coursDExemple, DOSSIER_EXEMPLE } from './cours-exemple.fixture.js';
import {
  ecrireJournal,
  installerDossierTemporaire,
  journalSimule,
  POIDS_SIMULES,
  passerEnWal,
} from './ecrire-journal.fixture.js';

const dossierDuTest = installerDossierTemporaire();
const base = () => path.join(dossierDuTest(), 'copie.sqlite');
const cours = coursDExemple();
const COURS = cours.cours.id;
/** Le chapitre FSRS de l'exemple (`par-chapitre`), puis ses deux autres modules de cartes. */
const CHAPITRE_FSRS = 'n0sq3hfm';
const AUTRES_CHAPITRES = ['7dty0tg7', 'cntctqb2'];
const cartesDe = (...modules: string[]) =>
  cours.unites.filter((unite) => modules.includes(unite.module)).map((unite) => unite.id);
const arguments_ = (...en: string[]) => [
  '--base',
  base(),
  '--cours',
  COURS,
  '--contenu',
  DOSSIER_EXEMPLE,
  ...en,
];

async function lancer(...argv: string[]) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  const code = await executer(argv, {
    out: (ligne) => sortie.push(ligne),
    err: (ligne) => erreurs.push(ligne),
  });
  return { code, sortie: sortie.join('\n'), erreurs: erreurs.join('\n') };
}

const journalDeCartes = (
  graine: number,
  options: { unites: number; passages: number; modules?: string[] },
) =>
  journalSimule({
    unites: options.unites,
    passages: options.passages,
    graine,
    poids: POIDS_SIMULES,
    identifiants: cartesDe(...(options.modules ?? [CHAPITRE_FSRS])),
    cours: COURS,
  });

test('sans_base_cours_ou_contenu_ou_avec_une_option_inconnue_le_code_est_64', async () => {
  expect((await lancer()).code).toBe(64);
  expect((await lancer('--base', base())).code).toBe(64);
  expect((await lancer('--cours', COURS, '--contenu', DOSSIER_EXEMPLE)).code).toBe(64);
  // Sans --contenu : 64, même avec une base et un cours.
  expect((await lancer('--base', base(), '--cours', COURS)).code).toBe(64);
  expect((await lancer(...arguments_('--autre', 'x'))).code).toBe(64);
});

test('un_chapitre_qui_n_est_pas_un_module_de_cartes_rend_64_avec_son_identifiant', async () => {
  ecrireJournal(base(), [journalDeCartes(30, { unites: 3, passages: 3 })]);
  const resultat = await lancer(
    ...arguments_('--chapitre', CHAPITRE_FSRS, '--chapitre', 'zzzzzzzz'),
  );
  expect(resultat.code).toBe(64);
  expect(resultat.erreurs).toContain('zzzzzzzz');
});

test('un_contenu_illisible_rend_1', async () => {
  ecrireJournal(base(), [journalDeCartes(30, { unites: 3, passages: 3 })]);
  const resultat = await lancer('--base', base(), '--cours', COURS, '--contenu', dossierDuTest());
  expect(resultat.code).toBe(1);
});

test('une_base_illisible_rend_1_sans_rien_creer', async () => {
  const resultat = await lancer(...arguments_());
  expect(resultat.code).toBe(1);
  expect(resultat.erreurs).not.toBe('');
  expect(fs.readdirSync(dossierDuTest())).toEqual([]);

  fs.writeFileSync(base(), 'ceci n’est pas une base');
  expect((await lancer(...arguments_())).code).toBe(1);
});

test('une_copie_brute_en_wal_rend_1_et_dit_vacuum_into_sans_rien_creer', async () => {
  ecrireJournal(base(), [journalDeCartes(33, { unites: 3, passages: 3 })]);
  passerEnWal(base());
  const avant = fs.readdirSync(dossierDuTest()).sort();
  const resultat = await lancer(...arguments_());
  expect(resultat.code).toBe(1);
  expect(resultat.erreurs).toContain('VACUUM INTO');
  expect(fs.readdirSync(dossierDuTest()).sort()).toEqual(avant);
});

test('un_journal_de_200_revues_rend_2_et_n_ecrit_aucun_parametre', async () => {
  const personnes = ecrireJournal(base(), [journalDeCartes(31, { unites: 18, passages: 12 })]);
  const resultat = await lancer(...arguments_());
  expect(resultat.code).toBe(2);
  expect(resultat.sortie).not.toContain('parametres');
  expect(resultat.sortie + resultat.erreurs).toMatch(/1[  ]?000/);
  for (const personne of personnes) {
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.id);
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.nom);
  }
});

test('l_ajustement_n_apprend_que_sur_les_cartes_que_fsrs_planifiera', async () => {
  // Peu de réponses au chapitre FSRS, beaucoup aux deux autres modules de cartes (34 cartes × 40
  // passages) et quelques-unes à des unités qui ne sont pas des cartes : le manifeste est en
  // `par-chapitre`, il ne garde que le premier chapitre.
  ecrireJournal(base(), [
    journalDeCartes(51, { unites: 18, passages: 9 }),
    journalDeCartes(52, { unites: 34, passages: 40, modules: AUTRES_CHAPITRES }),
    journalSimule({ unites: 4, passages: 3, graine: 53, cours: COURS }),
  ]);
  const parDefaut = await lancer(...arguments_());
  expect(parDefaut.code).toBe(2);
  // 34 × 40 réponses aux autres modules, plus 4 × 3 à des unités qui ne sont pas des cartes.
  expect(parDefaut.erreurs).toContain('1372 réponse(s) écartée(s)');

  const avecLesAutres = await lancer(
    ...arguments_('--chapitre', AUTRES_CHAPITRES[0] ?? '', '--chapitre', AUTRES_CHAPITRES[1] ?? ''),
  );
  expect(avecLesAutres.code).toBe(0);
  expect(avecLesAutres.sortie).toContain('2 module(s)');
  expect(avecLesAutres.sortie).toContain('réponse(s) écartée(s)');
}, 60_000);

test('un_journal_assez_long_rend_0_le_bloc_yaml_et_la_qualite_sans_nommer_personne', async () => {
  const personnes = ecrireJournal(base(), [
    journalDeCartes(41, { unites: 18, passages: 45 }),
    journalDeCartes(42, { unites: 18, passages: 45 }),
  ]);
  const avant = fs.readFileSync(base());

  const resultat = await lancer(...arguments_());

  expect(resultat.code).toBe(0);
  const ligne = resultat.sortie.split('\n').find((l) => l.startsWith('parametres: ['));
  expect(ligne).toMatch(/^parametres: \[(-?\d+\.\d{4}, ){20}-?\d+\.\d{4}\]$/);
  expect(resultat.sortie).toMatch(/perte logarithmique/i);
  expect(resultat.sortie).toMatch(/avant/i);
  expect(resultat.sortie).toMatch(/après/i);
  expect(resultat.sortie).toMatch(/0 à 10 %/);
  expect(resultat.sortie).toMatch(/90 à 100 %/);
  expect(resultat.sortie).toContain('0 réponse(s) écartée(s)');
  for (const personne of personnes) {
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.id);
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.nom);
  }
  // La copie n'a pas bougé, et rien n'est apparu à côté.
  expect(fs.readFileSync(base()).equals(avant)).toBe(true);
  expect(fs.readdirSync(dossierDuTest())).toEqual(['copie.sqlite']);
}, 60_000);
