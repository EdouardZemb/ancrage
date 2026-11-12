import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { executer } from './cli-ajuster.js';
import {
  COURS_DE_TEST,
  ecrireJournal,
  installerDossierTemporaire,
  journalSimule,
  POIDS_SIMULES,
} from './ecrire-journal.fixture.js';

const dossierDuTest = installerDossierTemporaire();
const base = () => path.join(dossierDuTest(), 'copie.sqlite');

async function lancer(...argv: string[]) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  const code = await executer(argv, {
    out: (ligne) => sortie.push(ligne),
    err: (ligne) => erreurs.push(ligne),
  });
  return { code, sortie: sortie.join('\n'), erreurs: erreurs.join('\n') };
}

test('sans_base_ou_sans_cours_ou_avec_une_option_inconnue_le_code_est_64', async () => {
  expect((await lancer()).code).toBe(64);
  expect((await lancer('--base', base())).code).toBe(64);
  expect((await lancer('--cours', COURS_DE_TEST)).code).toBe(64);
  expect((await lancer('--base', base(), '--cours', COURS_DE_TEST, '--autre', 'x')).code).toBe(64);
});

test('une_base_illisible_rend_1_sans_rien_creer', async () => {
  const resultat = await lancer('--base', base(), '--cours', COURS_DE_TEST);
  expect(resultat.code).toBe(1);
  expect(resultat.erreurs).not.toBe('');
  expect(fs.readdirSync(dossierDuTest())).toEqual([]);

  fs.writeFileSync(base(), 'ceci n’est pas une base');
  expect((await lancer('--base', base(), '--cours', COURS_DE_TEST)).code).toBe(1);
});

test('un_journal_de_200_revues_rend_2_et_n_ecrit_aucun_parametre', async () => {
  const personnes = ecrireJournal(base(), [
    journalSimule({ unites: 25, passages: 9, graine: 31, poids: POIDS_SIMULES }),
    journalSimule({ unites: 5, passages: 4, graine: 32, poids: POIDS_SIMULES }),
  ]);
  const resultat = await lancer('--base', base(), '--cours', COURS_DE_TEST);
  expect(resultat.code).toBe(2);
  expect(resultat.sortie).not.toContain('parametres');
  expect(resultat.sortie + resultat.erreurs).toMatch(/1[  ]?000/);
  for (const personne of personnes) {
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.id);
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.nom);
  }
});

test('un_journal_assez_long_rend_0_le_bloc_yaml_et_la_qualite_sans_nommer_personne', async () => {
  const personnes = ecrireJournal(base(), [
    journalSimule({ unites: 170, passages: 9, graine: 41, poids: POIDS_SIMULES }),
    journalSimule({ unites: 170, passages: 9, graine: 42, poids: POIDS_SIMULES }),
  ]);
  const avant = fs.readFileSync(base());

  const resultat = await lancer('--base', base(), '--cours', COURS_DE_TEST);

  expect(resultat.code).toBe(0);
  const ligne = resultat.sortie.split('\n').find((l) => l.startsWith('parametres: ['));
  expect(ligne).toMatch(/^parametres: \[(-?\d+\.\d{4}, ){20}-?\d+\.\d{4}\]$/);
  expect(resultat.sortie).toMatch(/perte logarithmique/i);
  expect(resultat.sortie).toMatch(/avant/i);
  expect(resultat.sortie).toMatch(/après/i);
  expect(resultat.sortie).toMatch(/0 à 10 %/);
  expect(resultat.sortie).toMatch(/90 à 100 %/);
  for (const personne of personnes) {
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.id);
    expect(resultat.sortie + resultat.erreurs).not.toContain(personne.nom);
  }
  // La copie n'a pas bougé, et rien n'est apparu à côté.
  expect(fs.readFileSync(base()).equals(avant)).toBe(true);
  expect(fs.readdirSync(dossierDuTest())).toEqual(['copie.sqlite']);
}, 60_000);
