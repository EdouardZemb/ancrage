import { defineConfig, devices } from '@playwright/test';
import { ORIGINE } from './e2e/mise-a-jour/aide-versions.js';

// Le test des deux versions (2a-D8, `pnpm e2e:mise-a-jour`), à part de la suite principale : il
// lance lui-même ses serveurs, l'un après l'autre sur la même origine, chaque test sur sa base
// (`e2e/mise-a-jour/aide-versions.ts`). D'où ni `webServer` ni `globalSetup`. Il sert le serveur
// construit (`pnpm build`) et les deux clients de `scripts/construire-deux-clients.mjs`.
export default defineConfig({
  testDir: './e2e/mise-a-jour',
  workers: 1,
  // Par test, deux installations du service worker, deux démarrages du serveur et une ou deux
  // attentes de 2 s : près de 20 s sur un poste, davantage sur un runner.
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: ORIGINE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 7'] } }],
});
