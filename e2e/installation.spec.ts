/*
 * L'installation sur Android (Pixel 7) : le manifeste et ses icônes, le service worker qui
 * précache l'application (et seulement elle), et l'ouverture hors ligne.
 *
 * Le service worker n'appelle ni `skipWaiting` ni `clientsClaim` d'office (2a-D1) : la page qui
 * l'enregistre n'est pas contrôlée par lui, celle d'après l'est. Les tests attendent donc qu'il
 * soit actif, puis rechargent la page. Chaque test a son propre contexte, donc son propre
 * enregistrement. Aucun ne doit enfreindre la politique de sécurité du contenu (R37,
 * `aide-csp.ts`), la console du service worker comprise.
 */
import { expect } from '@playwright/test';
import { textes } from '../src/client/textes.js';
import { test } from './aide-csp.js';
import {
  controleur,
  essayerLaSante,
  pageControlee,
  serviceWorkerActif,
} from './aide-hors-ligne.js';

// Les écrans en allemand, comme sur le téléphone de l'apprenante.
test.use({ locale: 'de-DE' });

interface IconeDuManifeste {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** La largeur et la hauteur d'une image PNG, lues dans son en-tête (bloc IHDR). */
function dimensionsPng(octets: Buffer): string {
  return `${octets.readUInt32BE(16)}x${octets.readUInt32BE(20)}`;
}

test('manifeste_installable', async ({ page, request }) => {
  await page.goto('/');
  const lien = page.locator('link[rel="manifest"]');
  await expect(lien).toHaveCount(1);
  const adresse = new URL((await lien.getAttribute('href')) ?? '', page.url()).href;

  const reponse = await request.get(adresse);
  expect(reponse.status()).toBe(200);
  const manifeste = await reponse.json();
  expect(manifeste).toMatchObject({
    name: 'ancrage',
    short_name: 'ancrage',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f7f8',
    theme_color: '#0b7f8f',
    lang: 'de',
  });

  const icones = manifeste.icons as IconeDuManifeste[];
  const declarees = icones.map((icone) => `${icone.sizes} ${icone.purpose ?? 'any'}`);
  expect(declarees.sort()).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icone of icones) {
    const image = await request.get(new URL(icone.src, adresse).href);
    expect(image.status(), icone.src).toBe(200);
    expect(image.headers()['content-type'], icone.src).toBe('image/png');
    expect(icone.type, icone.src).toBe('image/png');
    expect(dimensionsPng(await image.body()), icone.src).toBe(icone.sizes);
  }

  // Le jugement de Chromium lui-même, celui qui propose « Zum Startbildschirm hinzufügen ».
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
});

test('service_worker_controle_la_page_apres_rechargement', async ({ page, baseURL }) => {
  const origine = new URL(baseURL ?? '').origin;
  await page.goto('/');
  await serviceWorkerActif(page);
  // Sans `clientsClaim`, la page qui a enregistré le service worker reste sans contrôleur.
  expect(await controleur(page)).toBeNull();

  const rechargee = await page.reload();

  expect(await controleur(page)).toBe(`${origine}/sw.js`);
  // La navigation elle-même a été servie par le service worker (`index.html` du précache).
  expect(rechargee?.fromServiceWorker()).toBe(true);
});

test('precache_contient_l_application_et_rien_de_l_api', async ({ page }) => {
  await page.goto('/');
  await pageControlee(page);
  // La page contrôlée a fait ses appels à l'API (session, santé) : aucun ne doit être en cache.
  await expect(page.getByTestId('version')).toContainText('·');

  const adresses = await page.evaluate(async () => {
    const toutes: string[] = [];
    for (const nom of await caches.keys()) {
      const cache = await caches.open(nom);
      for (const requete of await cache.keys()) toutes.push(new URL(requete.url).pathname);
    }
    return toutes;
  });

  expect(adresses.filter((adresse) => adresse.startsWith('/api'))).toEqual([]);
  expect(adresses).toContain('/index.html');
  expect(adresses).toContain('/manifest.webmanifest');
  expect(adresses).toContain('/icone-192.png');
  expect(adresses.some((adresse) => /^\/assets\/index-.+\.js$/.test(adresse))).toBe(true);
  expect(adresses.some((adresse) => /^\/assets\/index-.+\.css$/.test(adresse))).toBe(true);
  // Les polices, latin et latin-ext, de chaque famille.
  for (const famille of ['archivo', 'source-sans-3', 'jetbrains-mono']) {
    for (const sousEnsemble of ['latin', 'latin-ext']) {
      // `archivo-latin-wdth-normal-<hachage>.woff2`, `archivo-latin-ext-wdth-normal-…` : le
      // sous-ensemble latin ne doit pas reconnaître un fichier latin-ext.
      const motif = new RegExp(
        `^/assets/${famille}-${sousEnsemble}-(?!ext-)[a-z0-9]+-normal-.+\\.woff2$`,
      );
      expect(
        adresses.some((adresse) => motif.test(adresse)),
        `${famille} ${sousEnsemble}`,
      ).toBe(true);
    }
  }
});

test('aucune_requete_vers_un_tiers', async ({ page, baseURL }) => {
  const origine = new URL(baseURL ?? '').origin;
  const adresses: string[] = [];
  // Le contexte voit aussi les requêtes du service worker (son précache).
  page.context().on('request', (requete) => adresses.push(requete.url()));

  await page.goto('/');
  await expect(page.getByTestId('version')).toContainText('·');
  await page.evaluate(() => document.fonts.ready);
  await serviceWorkerActif(page);

  expect(adresses.filter((adresse) => new URL(adresse).origin !== origine)).toEqual([]);
  // Les polices sont bien du nombre des requêtes examinées.
  expect(adresses.some((adresse) => adresse.endsWith('.woff2'))).toBe(true);
});

test('hors_ligne_l_application_s_ouvre', async ({ page, context }) => {
  await page.goto('/');
  await pageControlee(page);

  await context.setOffline(true);
  // La preuve que le réseau est coupé, pour la page comme pour son service worker : une requête
  // de l'une ou de l'autre échoue. Sous Chromium, Playwright coupe aussi le service worker.
  expect(await page.evaluate(essayerLaSante)).toBe('injoignable');
  const [serviceWorker] = context.serviceWorkers();
  expect(serviceWorker, 'le service worker du contexte').toBeDefined();
  expect(await serviceWorker?.evaluate(essayerLaSante)).toBe('injoignable');

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'ancrage' })).toBeVisible();
  await expect(page.getByTestId('version')).toHaveText(textes.de.serveur_injoignable);
});
