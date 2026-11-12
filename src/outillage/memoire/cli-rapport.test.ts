import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { executer } from './cli-rapport.js';
import { coursDExemple, DOSSIER_EXEMPLE, journalDeCours } from './cours-exemple.fixture.js';
import { ecrireJournal, installerDossierTemporaire } from './ecrire-journal.fixture.js';

const dossierDuTest = installerDossierTemporaire();
const base = () => path.join(dossierDuTest(), 'copie.sqlite');
const sortie = () => path.join(dossierDuTest(), 'rapport.html');
const cours = coursDExemple();
const AUJOURDHUI = '2026-03-02';

async function lancerLe(aujourdhui: string, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await executer(
    argv,
    { out: (ligne) => out.push(ligne), err: (ligne) => err.push(ligne) },
    { aujourdhui },
  );
  return { code, texte: [...out, ...err].join('\n') };
}

const lancer = (...argv: string[]) => lancerLe(AUJOURDHUI, ...argv);

/** Les arguments d'un rapport complet ; `en` en remplace ou en ajoute. */
const arguments_ = (...en: string[]) => [
  '--base',
  base(),
  '--cours',
  cours.cours.id,
  '--contenu',
  DOSSIER_EXEMPLE,
  '--sortie',
  sortie(),
  '--jusquau',
  '2026-05-01',
  ...en,
];

function actif(personne: number): Evenement[] {
  return journalDeCours(cours, {
    debut: '2026-02-01',
    jours: 28,
    parJour: 30,
    graine: personne,
    personne,
  });
}

function preparer(nombreDePersonnes = 3) {
  return ecrireJournal(
    base(),
    Array.from({ length: nombreDePersonnes }, (_, i) => actif(i + 1)),
  );
}

const rienEcrit = () => expect(fs.existsSync(sortie())).toBe(false);

test('un_usage_incorrect_rend_64_sans_rien_ecrire', async () => {
  preparer();
  expect((await lancer()).code).toBe(64);
  expect((await lancer('--base', base(), '--cours', cours.cours.id)).code).toBe(64);
  expect((await lancer(...arguments_('--autre', 'x'))).code).toBe(64);
  expect((await lancer(...arguments_('--jusquau', 'demain'))).code).toBe(64);
  rienEcrit();
});

test('une_personne_sans_accord_rend_64_et_un_accord_sans_personne_aussi', async () => {
  const personnes = preparer();
  const sans = await lancer(...arguments_('--personne', personnes[0]?.id ?? ''));
  expect(sans.code).toBe(64);
  expect(sans.texte).not.toContain(personnes[0]?.id);
  expect((await lancer(...arguments_('--accord', '25/02/2026'))).code).toBe(64);
  rienEcrit();
});

test('une_date_d_accord_mal_formee_ou_future_rend_64', async () => {
  const personnes = preparer();
  const id = personnes[0]?.id ?? '';
  for (const accord of ['2026-02-25', '31/02/2026', '5/2/2026', '03/03/2026', '', 'hier']) {
    const resultat = await lancer(...arguments_('--personne', id, '--accord', accord));
    expect(resultat.code, accord).toBe(64);
    expect(resultat.texte).not.toContain(id);
  }
  rienEcrit();
});

test('un_accord_du_jour_est_accepte', async () => {
  const personnes = preparer();
  const resultat = await lancer(
    ...arguments_('--personne', personnes[0]?.id ?? '', '--accord', '02/03/2026'),
  );
  expect(resultat.code).toBe(0);
});

test('une_sortie_dans_un_depot_git_est_refusee', async () => {
  preparer();
  fs.mkdirSync(path.join(dossierDuTest(), 'depot', '.git'), { recursive: true });
  fs.mkdirSync(path.join(dossierDuTest(), 'depot', 'sous', 'dossier'), { recursive: true });
  for (const chemin of [
    path.join(dossierDuTest(), 'depot', 'rapport.html'),
    path.join(dossierDuTest(), 'depot', 'sous', 'dossier', 'rapport.html'),
  ]) {
    const resultat = await lancer(
      '--base',
      base(),
      '--cours',
      cours.cours.id,
      '--contenu',
      DOSSIER_EXEMPLE,
      '--sortie',
      chemin,
      '--jusquau',
      '2026-05-01',
    );
    expect(resultat.code).toBe(64);
    expect(resultat.texte).toMatch(/dépôt git/);
    expect(fs.existsSync(chemin)).toBe(false);
  }
});

test('un_dossier_de_sortie_absent_rend_64', async () => {
  preparer();
  const resultat = await lancer(
    ...arguments_().map((a) =>
      a === sortie() ? path.join(dossierDuTest(), 'absent', 'r.html') : a,
    ),
  );
  expect(resultat.code).toBe(64);
});

test('un_fichier_existant_n_est_ecrase_qu_avec_ecraser', async () => {
  preparer();
  fs.writeFileSync(sortie(), 'ancien');
  expect((await lancer(...arguments_())).code).toBe(64);
  expect(fs.readFileSync(sortie(), 'utf8')).toBe('ancien');
  expect((await lancer(...arguments_('--ecraser'))).code).toBe(0);
  expect(fs.readFileSync(sortie(), 'utf8')).toContain('<!doctype html>');
});

test('une_base_un_contenu_ou_un_cours_illisibles_rendent_1_sans_rien_ecrire', async () => {
  expect((await lancer(...arguments_())).code).toBe(1);
  preparer();
  expect(
    (
      await lancer(
        ...arguments_().map((a) =>
          a === DOSSIER_EXEMPLE ? path.join(dossierDuTest(), 'vide') : a,
        ),
      )
    ).code,
  ).toBe(1);
  expect(
    (await lancer(...arguments_().map((a) => (a === cours.cours.id ? 'z9999999' : a)))).code,
  ).toBe(1);
  rienEcrit();
});

test('une_personne_inconnue_rend_1_sans_repeter_son_identifiant', async () => {
  preparer();
  const resultat = await lancer(
    ...arguments_('--personne', 'identifiant-secret-inconnu', '--accord', '25/02/2026'),
  );
  expect(resultat.code).toBe(1);
  expect(resultat.texte).not.toContain('identifiant-secret-inconnu');
  rienEcrit();
});

test('un_rapport_d_ensemble_s_ecrit_sans_rien_qui_nomme_une_personne', async () => {
  const personnes = preparer();
  const avant = fs.readFileSync(base());
  const resultat = await lancer(...arguments_());
  expect(resultat.code).toBe(0);
  const html = fs.readFileSync(sortie(), 'utf8');
  expect(html).toContain('chiffres d’ensemble');
  expect(html).toContain('<svg');
  for (const personne of personnes) {
    for (const texte of [resultat.texte, html]) {
      expect(texte).not.toContain(personne.id);
      expect(texte).not.toContain(personne.nom);
    }
  }
  // Ni la base ni son dossier n'ont bougé.
  expect(fs.readFileSync(base()).equals(avant)).toBe(true);
  expect(fs.readdirSync(dossierDuTest()).sort()).toEqual(['copie.sqlite', 'rapport.html']);
});

test('un_rapport_d_ensemble_de_deux_personnes_s_arrete_aux_totaux', async () => {
  preparer(2);
  const resultat = await lancer(...arguments_());
  expect(resultat.code).toBe(0);
  expect(resultat.texte).toMatch(/moins de trois/);
  expect(fs.readFileSync(sortie(), 'utf8')).not.toContain('<svg');
});

test('un_rapport_de_personne_dit_l_accord_et_ne_nomme_personne', async () => {
  const personnes = preparer();
  const resultat = await lancer(
    ...arguments_('--personne', personnes[1]?.id ?? '', '--accord', '25/02/2026'),
  );
  expect(resultat.code).toBe(0);
  const html = fs.readFileSync(sortie(), 'utf8');
  expect(html).toContain('Accord donné le 25/02/2026, d’après la déclaration du responsable');
  expect(html).toContain('la personne suivie');
  for (const personne of personnes) {
    for (const texte of [resultat.texte, html]) {
      expect(texte).not.toContain(personne.id);
      expect(texte).not.toContain(personne.nom);
    }
  }
  // Ses seuls chiffres : 28 jours de 30 réponses.
  expect(html).toContain('840 réponses');
});

test('la_date_d_examen_du_manifeste_sert_a_defaut_de_jusquau', async () => {
  preparer();
  const sansOption = arguments_().filter(
    (a, i, tous) => a !== '--jusquau' && tous[i - 1] !== '--jusquau',
  );
  // Le rapport est daté de deux mois avant l'examen de l'exemple : la projection reste courte.
  const resultat = await lancerLe('2030-05-01', ...sansOption);
  expect(resultat.code).toBe(0);
  // Le manifeste de l'exemple fixe l'examen au 30/06/2030.
  expect(fs.readFileSync(sortie(), 'utf8')).toContain('examen le 30/06/2030');
});
