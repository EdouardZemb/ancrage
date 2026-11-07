/*
 * La politique de sécurité du contenu (R37) vue des tests de bout en bout. Chromium écrit chaque
 * violation dans la console (« Refused to … because it violates the following Content Security
 * Policy directive … »), et une évaluation refusée peut lever une erreur dans la page. On écoute
 * l'une et l'autre dans chaque page d'un contexte, et la console de ses service workers : le
 * parcours doit n'en produire aucune.
 */
import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
  type Worker,
} from '@playwright/test';

const VIOLATION = /Content.Security.Policy/i;

/**
 * Écoute les pages et les service workers de `contexte`, présents et à venir, une fois le script
 * d'injection posé. Rend la liste des violations vues, tenue à jour.
 */
export async function surveillerLaCsp(contexte: BrowserContext): Promise<string[]> {
  const violations: string[] = [];
  const noter = (texte: string) => {
    if (VIOLATION.test(texte)) violations.push(texte);
  };
  const surveillerLaPage = (page: Page) => {
    page.on('console', (message) => noter(message.text()));
    page.on('pageerror', (erreur) => noter(erreur.message));
  };
  const surveillerLeServiceWorker = (serviceWorker: Worker) => {
    serviceWorker.on('console', (message) => noter(message.text()));
  };
  for (const page of contexte.pages()) surveillerLaPage(page);
  for (const serviceWorker of contexte.serviceWorkers()) surveillerLeServiceWorker(serviceWorker);
  contexte.on('page', surveillerLaPage);
  contexte.on('serviceworker', surveillerLeServiceWorker);
  // Chromium ne dit pas toutes les violations dans la console (un `eval` refusé va au panneau
  // « Issues ») : chaque page les y écrit elle-même, depuis l'événement que le navigateur émet.
  // Le script ne s'applique pas aux workers : la violation d'un service worker n'est vue que si
  // Chromium l'écrit dans la console du service worker.
  await contexte.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (violation) => {
      console.error(
        `Content Security Policy : ${violation.effectiveDirective} refuse ${violation.blockedURI}`,
      );
    });
  });
  return violations;
}

/** Aucune violation n'a été vue. */
export function aucuneViolation(violations: readonly string[]): void {
  expect(violations, 'violations de la politique de sécurité du contenu').toEqual([]);
}

/** `test`, dont le contexte est surveillé : une violation de la CSP fait échouer le test. */
export const test = base.extend<{ surveillanceDeLaCsp: undefined }>({
  surveillanceDeLaCsp: [
    async ({ context }, use) => {
      const violations = await surveillerLaCsp(context);
      await use(undefined);
      aucuneViolation(violations);
    },
    { auto: true },
  ],
});
