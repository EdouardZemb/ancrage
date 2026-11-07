import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { sansContenuMonte } from './e2e/amorcage.js';

// Avec E2E_URL, on teste un serveur déjà lancé (l'image Docker en CI). Sans, on lance le serveur
// construit (`pnpm build` d'abord) sur une base jetable.
const urlExterne = process.env.E2E_URL;
// `localhost` et non `127.0.0.1` : WebAuthn refuse une adresse IP comme identifiant de la partie
// de confiance (décision 7).
const URL_LOCALE = 'http://localhost:3000';

// La base jetable, fixée une fois par exécution : chaque processus de Playwright relit cette
// configuration, et l'amorçage (`e2e/amorcage.ts`) doit ouvrir la base du serveur. Les processus
// lancés ensuite héritent de la variable.
const baseJetable =
  process.env.E2E_BASE ?? path.join(os.tmpdir(), `ancrage-e2e-${process.pid}`, 'ancrage.sqlite');
process.env.E2E_BASE = baseJetable;

// Le contenu monté du poste n'entre jamais dans l'e2e. Playwright passe au serveur l'environnement
// de ce processus, complété par `webServer.env` : la variable est retirée de ce processus même, et
// ni le serveur, ni l'amorçage, ni les processus lancés ensuite ne la reçoivent.
sansContenuMonte(process.env);

export default defineConfig({
  testDir: './e2e',
  // Le test des deux versions a sa configuration (`playwright.mise-a-jour.config.ts`) : il lance
  // ses propres serveurs. Playwright compare ce motif au chemin absolu du fichier.
  testIgnore: ['**/mise-a-jour/**'],
  // Le lien d'invitation du propriétaire, pour `parcours-compte.spec.ts`.
  globalSetup: './e2e/amorcage.ts',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: urlExterne ?? URL_LOCALE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'android', use: { ...devices['Pixel 7'] } }],
  webServer: urlExterne
    ? undefined
    : {
        command: 'node dist/serveur/main.js',
        env: {
          ANCRAGE_ENV: 'ci',
          ANCRAGE_BASE: baseJetable,
          ANCRAGE_URL_PUBLIQUE: URL_LOCALE,
          // Sans ANCRAGE_CONTENUS (retirée plus haut), hors de la prod : le serveur sert le cours
          // d'exemple (S1-D3).
          PORT: '3000',
        },
        url: `${URL_LOCALE}/api/sante`,
        reuseExistingServer: false,
      },
});
