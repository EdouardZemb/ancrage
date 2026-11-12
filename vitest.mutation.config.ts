import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

// La configuration que lit Stryker (`stryker.config.json`). Elle retire les tests des outils du
// poste (`src/outillage/memoire/`) : ils rejouent des journaux entiers à travers les fichiers mutés
// (`fsrs.ts`, `etat.ts`, `heute.ts`), si bien que chaque mutant les relançait, et la passe du
// groupe `domaine` passait de 7 à 20 minutes. Les fichiers mutés gardent leurs propres tests, qui
// sont ceux que la mutation éprouve.
export default mergeConfig(
  base,
  defineConfig({
    test: { exclude: [...configDefaults.exclude, 'src/outillage/memoire/**'] },
  }),
);
