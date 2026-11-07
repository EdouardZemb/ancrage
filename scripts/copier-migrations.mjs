// `tsc` ne copie pas les fichiers SQL : on recopie les migrations à côté du code compilé,
// là où `appliquerMigrations` les cherche (`dist/serveur/base/migrations`).
import fs from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const source = path.join(racine, 'src', 'serveur', 'base', 'migrations');
const cible = path.join(racine, 'dist', 'serveur', 'base', 'migrations');

fs.rmSync(cible, { recursive: true, force: true });
fs.cpSync(source, cible, { recursive: true });
console.log(`migrations copiées : ${path.relative(racine, cible)}`);
