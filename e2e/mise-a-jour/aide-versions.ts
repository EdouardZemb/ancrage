/*
 * Deux versions de l'application, servies l'une après l'autre sur la même origine (2a-D8) : le
 * serveur construit (`dist/serveur`, après `pnpm build`), avec le client `dist-e2e/a` ou
 * `dist-e2e/b` (`scripts/construire-deux-clients.mjs`). Un téléphone qui a ouvert la première
 * trouve la seconde comme après une mise en ligne : son service worker n'est plus le même.
 *
 * Playwright ne cache pas une page sans tête : le retour sur l'application se simule
 * (`simulerRetour`).
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { DELAI_ACTIVATION_MS } from '../aide-hors-ligne.js';
import { sansContenuMonte } from '../amorcage.js';

/** L'origine des deux versions : la même, sinon le téléphone n'y verrait pas une mise à jour. */
export const ORIGINE = 'http://localhost:3100';

export type Version = 'a' | 'b';

/** Le dossier du dépôt, d'où le serveur construit se lance (`exemple-contenu`, `dist-e2e`). */
export const DOSSIER_DU_DEPOT = path.resolve(import.meta.dirname, '..', '..');

// Le démarrage applique les migrations et valide les contenus : quelques secondes sur un runner.
const DELAI_DEMARRAGE_MS = 15_000;
// Un arrêt qui traîne au-delà (une connexion qui ne se ferme pas) est forcé.
const DELAI_ARRET_MS = 5_000;

/** Vrai si l'origine répond, et que c'est la version `v` qui répond : jamais celle d'avant. */
async function sertLaVersion(v: Version): Promise<boolean> {
  try {
    const reponse = await fetch(`${ORIGINE}/api/sante`);
    if (!reponse.ok) return false;
    const sante = (await reponse.json()) as { revision?: unknown };
    return sante.revision === `e2e-${v}`;
  } catch {
    return false;
  }
}

/** Vrai si quelque chose répond déjà sur l'origine, quoi que ce soit : le port n'est pas libre. */
async function origineRepond(): Promise<boolean> {
  try {
    await fetch(`${ORIGINE}/api/sante`);
    return true;
  } catch {
    return false;
  }
}

/** Une version servie : son arrêt, et ce que son serveur a écrit jusque-là. */
export interface VersionServie {
  arreter(): Promise<void>;
  journal(): string;
}

/**
 * Lance le serveur de la version `v` sur la base `base`, et attend qu'il réponde. S'il s'arrête
 * avant, son journal est dans l'erreur ; ensuite, `journal` le rend, pour qu'un test en échec le
 * montre.
 */
export async function servirVersion(v: Version, base: string): Promise<VersionServie> {
  // Avant le lancement : un serveur resté sur le port (même version, même révision) répondrait à la
  // place du nôtre, qui échouerait en `EADDRINUSE` sans que l'attente s'en aperçoive.
  if (await origineRepond()) {
    throw new Error(`${ORIGINE} répond déjà avant le lancement de la version ${v} : port occupé`);
  }
  const serveur = spawn(process.execPath, ['dist/serveur/main.js'], {
    cwd: DOSSIER_DU_DEPOT,
    env: {
      ...sansContenuMonte({ ...process.env }),
      PORT: '3100',
      ANCRAGE_ENV: 'ci',
      ANCRAGE_URL_PUBLIQUE: ORIGINE,
      ANCRAGE_BASE: base,
      // Sans ANCRAGE_CONTENUS, même restée au poste (`sansContenuMonte`), hors de la prod : le
      // serveur sert le cours d'exemple (S1-D3).
      ANCRAGE_CLIENT: `dist-e2e/${v}`,
      ANCRAGE_REVISION: `e2e-${v}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let journal = '';
  const noter = (morceau: Buffer) => {
    journal += morceau.toString('utf8');
  };
  serveur.stdout.on('data', noter);
  serveur.stderr.on('data', noter);
  const termine = () => serveur.exitCode !== null || serveur.signalCode !== null;

  const arreter = async () => {
    if (termine()) return;
    const fin = once(serveur, 'exit');
    serveur.kill();
    const force = setTimeout(() => serveur.kill('SIGKILL'), DELAI_ARRET_MS);
    await fin;
    clearTimeout(force);
  };

  const limite = Date.now() + DELAI_DEMARRAGE_MS;
  // Un serveur lancé qui s'est arrêté (`EADDRINUSE` ou autre) fait échouer l'attente, même si un
  // autre, resté de la même version, répond sur le port : cette réponse n'est pas la sienne.
  for (;;) {
    const repond = await sertLaVersion(v);
    if (termine() || (!repond && Date.now() > limite)) {
      await arreter();
      throw new Error(`le serveur de la version ${v} ne répond pas sur ${ORIGINE} :\n${journal}`);
    }
    if (repond) break;
    await new Promise((fin) => setTimeout(fin, 100));
  }
  return { arreter, journal: () => journal };
}

/**
 * Le retour sur l'application, tel que le navigateur d'un téléphone le dit à la page : elle passe
 * à `hidden`, puis à `visible`, avec chaque fois `visibilitychange`. Puis le document retrouve son
 * `visibilityState` d'origine.
 */
export async function simulerRetour(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const etat of ['hidden', 'visible'] as const) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat });
      document.dispatchEvent(new Event('visibilitychange'));
    }
    Reflect.deleteProperty(document, 'visibilityState');
  });
}

/** Vrai si une version attend (`registration.waiting`) : aucune prise de main ne l'a activée. */
export function uneVersionAttend(page: Page): Promise<boolean> {
  return page.evaluate(
    async () => ((await navigator.serviceWorker.getRegistration('/'))?.waiting ?? null) !== null,
  );
}

/**
 * Attend qu'une version attende : installée, son précache rempli, elle ne prend pas la main
 * d'elle-même (2a-D1).
 */
export async function versionEnAttente(page: Page): Promise<void> {
  await expect
    .poll(() => uneVersionAttend(page), {
      message: 'une version en attente',
      timeout: DELAI_ACTIVATION_MS,
    })
    .toBe(true);
}
