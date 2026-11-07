// Les deux clients du test des deux versions (2a-D8, `pnpm e2e:mise-a-jour`) : l'application
// construite deux fois, avec une révision différente (`REVISION`, que `vite.config.ts` inscrit
// dans le code), dans `dist-e2e/a` et `dist-e2e/b`. Leur code diffère, donc la liste de leur
// précache, donc leur service worker : pour un téléphone qui a la première, la seconde est une
// nouvelle version.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const vite = path.join(racine, 'node_modules', 'vite', 'bin', 'vite.js');

for (const version of ['a', 'b']) {
  const sortie = path.join(racine, 'dist-e2e', version);
  const resultat = spawnSync(process.execPath, [vite, 'build', '--outDir', sortie], {
    cwd: racine,
    env: { ...process.env, REVISION: `e2e-${version}` },
    stdio: 'inherit',
  });
  if (resultat.status !== 0) {
    console.error(`construction du client ${version} en échec (${resultat.status})`);
    process.exit(resultat.status ?? 1);
  }
}
