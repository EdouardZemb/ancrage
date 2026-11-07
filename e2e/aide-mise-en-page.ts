/*
 * Le geste commun de la mise en page, pour les tests de bout en bout : rien ne dépasse la largeur de
 * l'écran (1f-D4 : une seule copie).
 */
import { expect, type Page } from '@playwright/test';

/** Sur chaque écran une fois affiché (étape 8 du plan) : rien ne dépasse la largeur de l'écran. */
export async function sansDefilementHorizontal(page: Page): Promise<void> {
  // La version du pied de page, chargée à part : la mise en page est alors définitive.
  await expect(page.getByTestId('version')).toContainText('·');
  const { contenu, fenetre } = await page.evaluate(() => ({
    contenu: document.documentElement.scrollWidth,
    fenetre: window.innerWidth,
  }));
  expect(contenu).toBeLessThanOrEqual(fenetre);
  // Sur mobile, un contenu trop large agrandit `window.innerWidth` (le navigateur dézoome) : le
  // test ci-dessus ne verrait alors rien. On compare donc aussi à la largeur réelle de l'appareil.
  expect(contenu).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}
