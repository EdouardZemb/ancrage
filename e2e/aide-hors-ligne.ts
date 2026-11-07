/*
 * Le hors-ligne vu des tests de bout en bout : attendre que le service worker soit actif, savoir
 * s'il contrôle la page, prouver que le réseau est coupé, et le rendre.
 *
 * Le service worker n'appelle ni `skipWaiting` ni `clientsClaim` d'office (2a-D1) : la page qui
 * l'enregistre n'est pas contrôlée par lui, celle d'après l'est. Pour travailler hors ligne, on
 * attend donc qu'il soit actif, puis on recharge la page (`pageControlee`).
 *
 * Le réseau se coupe par `context.setOffline(true)`, qui coupe aussi le service worker sous
 * Chromium. Mais Playwright (1.64, Chromium) ne change pas `navigator.onLine` et n'émet ni
 * `offline` ni `online` : le retour du réseau les émet lui-même (`retourDuReseau`).
 */
import { expect, type Page } from '@playwright/test';

// L'installation remplit le précache (près de 600 Kio) : sur un runner lent, elle peut dépasser
// les 5 s par défaut d'`expect.poll`.
export const DELAI_ACTIVATION_MS = 15_000;

/** Attend que le service worker de la page soit `activated`, donc que le précache soit rempli. */
export async function serviceWorkerActif(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state),
      { message: 'état du service worker', timeout: DELAI_ACTIVATION_MS },
    )
    .toBe('activated');
}

/** L'adresse du service worker qui contrôle la page, ou `null` s'il n'y en a pas. */
export function controleur(page: Page): Promise<string | null> {
  return page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
}

/**
 * Attend que le service worker de la page chargée soit actif, puis recharge : la page est
 * contrôlée. Il s'enregistre à chaque chargement complet, y compris celui qui suit une
 * déconnexion.
 */
export async function pageControlee(page: Page): Promise<void> {
  await serviceWorkerActif(page);
  await page.reload();
  expect(await controleur(page)).not.toBeNull();
}

/**
 * Rend le réseau au téléphone, comme il revient sur un vrai : le navigateur d'un téléphone émet
 * alors `online` dans la page, ce que Playwright ne fait pas. L'application synchronise à cet
 * événement (décision 15).
 */
export async function retourDuReseau(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/**
 * Demande `/api/sante`, depuis la page ou depuis le service worker (à passer à `evaluate`) :
 * `injoignable` si la requête échoue, ce qui prouve que le réseau est coupé pour lui.
 */
export async function essayerLaSante(): Promise<'joignable' | 'injoignable'> {
  try {
    await fetch('/api/sante');
    return 'joignable';
  } catch {
    return 'injoignable';
  }
}
