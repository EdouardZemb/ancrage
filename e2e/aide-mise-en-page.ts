/*
 * Le geste commun de la mise en page, pour les tests de bout en bout : rien ne dépasse la largeur de
 * l'écran (1f-D4 : une seule copie), et un bloc d'aide ou d'explication tient dans l'écran avec
 * « Weiter » (M9, M10).
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

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

/**
 * Un bloc (l'aide d'une carte, l'explication d'une question) est dans l'écran, avec le bouton qui le
 * suit : son bord droit tient dans la largeur, rien ne défile à l'horizontale, son bas est entre 0 et
 * la hauteur de l'écran, et le bas du bouton est dans la hauteur. La borne basse est nécessaire : un
 * bloc sorti par le haut passerait sinon « bas ≤ hauteur ». Les mesures sont notées en annotation.
 */
export async function blocEtBoutonDansLEcran(
  page: Page,
  bloc: Locator,
  bouton: Locator,
  nom: string,
): Promise<void> {
  const boite = await bloc.boundingBox();
  expect(boite, `le bloc de ${nom}`).not.toBeNull();
  const largeur = page.viewportSize()?.width ?? 0;
  test.info().annotations.push({
    type: `mesure de ${nom}`,
    description: JSON.stringify({ boite, largeur }),
  });
  expect((boite?.x ?? 0) + (boite?.width ?? 0), `bord droit de ${nom}`).toBeLessThanOrEqual(
    largeur,
  );
  await sansDefilementHorizontal(page);
  // Le bloc est dans la carte, avant « Weiter » : le bas de l'un et l'autre reste dans l'écran.
  const hauteur = page.viewportSize()?.height ?? 0;
  const suivante = await bouton.boundingBox();
  expect(suivante, 'le bouton « Weiter »').not.toBeNull();
  test.info().annotations.push({
    type: `mesure du bas de ${nom}`,
    description: JSON.stringify({ bloc: boite, suivante, hauteur }),
  });
  const basDuBloc = (boite?.y ?? 0) + (boite?.height ?? 0);
  expect(basDuBloc, `bas de ${nom}`).toBeLessThanOrEqual(hauteur);
  expect(basDuBloc, `bas de ${nom} (borne basse)`).toBeGreaterThan(0);
  expect((suivante?.y ?? 0) + (suivante?.height ?? 0), 'bas de « Weiter »').toBeLessThanOrEqual(
    hauteur,
  );
}
