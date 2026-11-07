import { expect } from '@playwright/test';
// Sans violation de la politique de sécurité du contenu (R37).
import { test } from './aide-csp.js';
import { sansDefilementHorizontal } from './aide-mise-en-page.js';

test('affiche_le_nom_et_la_version', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'ancrage' })).toBeVisible();
  await expect(page.getByTestId('version')).toContainText(process.env.E2E_ENV ?? 'ci');
});

test('pas_de_defilement_horizontal', async ({ page }) => {
  await page.goto('/');

  await sansDefilementHorizontal(page);
});
