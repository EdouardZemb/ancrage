import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Les outils de mémoire du poste ne vont pas dans l'image : le serveur et le domaine, seuls
// compilés dans `dist/`, ne les importent jamais, ni l'optimiseur, que l'image n'installe pas
// (dépendance de développement).

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function fichiers(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiers(chemin);
    return /\.tsx?$/.test(entree.name) ? [chemin] : [];
  });
}

test('rien_sous_serveur_ou_domaine_n_importe_les_outils_de_memoire_ni_l_optimiseur', () => {
  const interdits = /outillage\/memoire|open-spaced-repetition/;
  const trouves = ['serveur', 'domaine', 'client']
    .flatMap((dossier) => fichiers(path.join(RACINE, 'src', dossier)))
    .filter((fichier) => interdits.test(fs.readFileSync(fichier, 'utf8')))
    .map((fichier) => path.relative(RACINE, fichier).split(path.sep).join('/'));
  expect(trouves).toEqual([]);
});

test('l_optimiseur_est_une_dependance_de_developpement', () => {
  const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const nom = '@open-spaced-repetition/binding';
  expect(paquet.dependencies?.[nom]).toBeUndefined();
  expect(paquet.devDependencies?.[nom]).toMatch(/^\d+\.\d+\.\d+$/);
});
