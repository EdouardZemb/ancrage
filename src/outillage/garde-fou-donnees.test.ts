import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { sansContenuMonte } from '../../e2e/amorcage.js';
import { lireConfig } from '../serveur/config.js';

// Le garde-fou des chemins de données (M-0006 § 4, S1-D6) : dans un dépôt de code, aucun test ne
// lit le contenu de l'instance. Le vrai cours se contrôle par la CLI de contenu, en CI.
//
// C'est une heuristique, ligne à ligne : elle voit un chemin écrit d'un seul tenant. Un chemin
// construit par morceaux, comme `path.join('instance', …)`, ne se voit pas.

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICI = path
  .relative(RACINE, fileURLToPath(import.meta.url))
  .split(path.sep)
  .join('/');

// Les fichiers qui nomment un chemin de données sans le lire, chacun avec sa raison.
const EXCEPTIONS = new Map<string, string>([
  [
    'src/outillage/documentation-seule.test.ts',
    'il classe des chemins de fichiers dans une liste de la PR, et n’en lit aucun',
  ],
]);

// Un import de code ne lit pas de données : `./contenus/…` et `serveur/contenus/…` sont du code. La
// ligne d'import est ancrée en tête : un `from` ou un `import` écrit dans un commentaire ou une
// chaîne n'excuse pas la ligne. Un import sur plusieurs lignes finit par `} from '…'`. Un `export`
// n'excuse que la réexportation (`export {`, `export *`, `export type {`), pas une constante.
const LIGNE_D_IMPORT =
  /^\s*import\b|^\s*export\s*(\*|\{|type\s*\{)|^\s*}\s*from\b|\brequire\(|vi\.(mock|importActual)\(/;

// Ce qui est interdit : le dossier `instance/`, les dossiers `contenu/` et `references/` du dépôt
// de données (S3-D5), les instantanés `tests/contenus`, et l'ancien dossier de données `contenus/`
// de la racine (une chaîne qui commence par `contenus/` ou vaut `contenus`, ou un chemin relatif
// qui y remonte).
const INTERDITS: { motif: RegExp; sauf?: RegExp }[] = [
  { motif: /instance\// },
  { motif: /['"`](\.\.\/)*(contenu|references)\//, sauf: LIGNE_D_IMPORT },
  { motif: /tests\/contenus/ },
  { motif: /['"`]contenus(\/|['"`])/ },
  { motif: /(\.\.\/)+contenus(\/|['"`])/, sauf: LIGNE_D_IMPORT },
];

function fichiers(dossier: string, accepte: (nom: string) => boolean): string[] {
  const trouves: string[] = [];
  for (const entree of fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory()) {
      if (entree.name !== 'node_modules') trouves.push(...fichiers(chemin, accepte));
    } else if (accepte(entree.name)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

function fichiersVises(): string[] {
  return [
    ...fichiers('src', (nom) => /\.(test|fixture)\.tsx?$/.test(nom)),
    ...fichiers('e2e', (nom) => nom.endsWith('.ts')),
    ...fs.readdirSync(RACINE).filter((nom) => /^playwright.*\.config\.ts$/.test(nom)),
    'vitest.config.ts',
  ].filter((chemin) => chemin !== ICI && !EXCEPTIONS.has(chemin));
}

function lire(chemin: string): string {
  return fs.readFileSync(path.join(RACINE, chemin), 'utf8');
}

test('aucun_test_ne_lit_l_instance', () => {
  const trouves: string[] = [];
  for (const chemin of fichiersVises()) {
    lire(chemin)
      .split('\n')
      .forEach((ligne, i) => {
        const motifs = INTERDITS.filter(
          ({ motif, sauf }) => motif.test(ligne) && !sauf?.test(ligne),
        );
        if (motifs.length > 0) {
          trouves.push(`${chemin}:${i + 1} : ${motifs.map(({ motif }) => motif).join(', ')}`);
        }
      });
  }
  expect(trouves).toEqual([]);
});

test('les_defauts_ne_visent_aucune_donnee_reelle', () => {
  expect(lireConfig({}).dossierContenus).toBeUndefined();

  const principale = lire('playwright.config.ts');
  const amorcage = lire('e2e/amorcage.ts');
  const aide = lire('e2e/mise-a-jour/aide-versions.ts');
  for (const texte of [principale, lire('playwright.mise-a-jour.config.ts'), amorcage, aide]) {
    expect(texte).not.toMatch(/ANCRAGE_CONTENUS\s*[:=]/);
  }
  // Une ANCRAGE_CONTENUS restée au poste n'entre pas dans l'e2e : elle est retirée, sous toutes
  // ses casses, du processus de Playwright (d'où le serveur de la suite principale et l'amorçage
  // tiennent leur environnement), et de la copie que reçoit chaque lancement.
  expect(sansContenuMonte({ ANCRAGE_CONTENUS: 'a', ancrage_contenus: 'b', PORT: '1' })).toEqual({
    PORT: '1',
  });
  expect(principale).toMatch(/^sansContenuMonte\(process\.env\);$/m);
  const copie = 'sansContenuMonte({ ...process.env })';
  for (const texte of [amorcage, aide]) {
    expect(texte).toContain(copie);
    expect(texte.replaceAll(copie, '')).not.toContain('...process.env');
  }
  // La base du serveur de la suite principale est sous le dossier temporaire.
  expect(principale).toMatch(/ANCRAGE_BASE:\s*baseJetable/);
  expect(principale).toMatch(/os\.tmpdir\(\)/);
  // Celle du test des deux versions est le paramètre `base` de `servirVersion` : l'aide ne pose
  // pas de base en dur.
  expect(aide).toMatch(/ANCRAGE_BASE:\s*base\b/);
});
