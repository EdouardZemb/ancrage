/*
 * L'aide d'une carte après une faute (M9), de bout en bout : dans Karteikarten, sur le premier
 * module de cartes du cours d'exemple, dans le sens « Bedeutung → Begriff » avec la saisie cochée,
 * un compte neuf donne une réponse fausse à chacune des neuf cartes. Après le verdict, les deux
 * cartes qui portent une aide, « Sieb » et « Reibe »
 * (`exemple-contenu/kueche/cartes/01-geraete.yaml`), la montrent, avec la confusion pour la
 * première ; les sept autres n'en montrent aucune. Aucune de ces cartes n'est un élément rebelle :
 * l'aide vient de la faute seule.
 *
 * Il tourne avec les tests des deux versions (`pnpm e2e:mise-a-jour`), sur son compte et sa base :
 * le lien du propriétaire de la suite principale ne sert qu'une fois (`compte-neuf.ts`).
 */
import { expect } from '@playwright/test';
import { formater, TEXTES_COURS } from '../../src/client/cours/textes-cours.js';
import { ouvrirOnglet } from '../aide-cours.js';
import { test } from '../aide-csp.js';
import { sansDefilementHorizontal } from '../aide-mise-en-page.js';
import type { VersionServie } from './aide-versions.js';
import { compteNeufSurHeute } from './compte-neuf.js';

// Les écrans en allemand, comme sur le téléphone de l'apprenante.
test.use({ locale: 'de-DE' });

const deCours = TEXTES_COURS.de;

/** Le premier module de cartes de l'exemple : neuf cartes, chacune dans les deux sens. */
const PREMIER_MODULE = 'n0sq3hfm';
const CARTES_DU_MODULE = 9;

/** Les deux cartes de l'exemple qui portent une aide, avec ce que celle-ci montre. */
const AIDES: Record<string, string[]> = {
  Sieb: ['Das Sieb lässt Wasser durch, die Reibe raffelt Käse.', deCours.aide_confusion, 'Reibe'],
  Reibe: ['Die Reibe hat scharfe Kanten, das Sieb nicht.'],
};

let serveur: VersionServie | undefined;

test.afterEach(async () => {
  await serveur?.arreter();
  serveur = undefined;
});

test('l_aide_d_une_carte_se_voit_apres_une_faute', async ({ page }) => {
  test.setTimeout(120_000);
  serveur = await compteNeufSurHeute(page, test.info().outputPath('ancrage.sqlite'));
  const cours = page.locator('.cours');

  await ouvrirOnglet(page, 'cartes');
  // Le chapitre et le sens, puis la saisie : neuf unités inverses, toutes neuves.
  await page.getByLabel(deCours.choix_chapitre, { exact: true }).selectOption(PREMIER_MODULE);
  await page.getByLabel(deCours.choix_sens, { exact: true }).selectOption('inverse');
  const saisie = page.getByRole('checkbox', { name: deCours.cartes_saisie });
  if (!(await saisie.isChecked())) await saisie.check();
  await expect(
    page.getByText(
      formater(deCours.cartes_progression, { faites: 0, restantes: CARTES_DU_MODULE }),
      {
        exact: true,
      },
    ),
  ).toBeVisible();

  const vues = new Set<string>();
  let mesure = false;
  for (let rang = 0; rang < CARTES_DU_MODULE; rang++) {
    await page.getByLabel(deCours.cartes_saisie_etiquette).fill('x');
    await page.getByRole('button', { name: deCours.cartes_verifier }).click();
    // Le verdict d'abord : une absence ne se constate qu'une fois la réponse jugée.
    await expect(cours.locator('.verdict.ko')).toBeVisible();
    const terme = (await cours.locator('.verdict b').textContent()) ?? '';
    vues.add(terme);

    const aide = cours.locator('.aide');
    const attendu = AIDES[terme];
    if (attendu === undefined) {
      await expect(aide, `aucune aide pour « ${terme} »`).toHaveCount(0);
    } else {
      await expect(aide, `l'aide de « ${terme} »`).toHaveCount(1);
      await expect(aide).toContainText(deCours.aide_titre);
      for (const morceau of attendu) await expect(aide).toContainText(morceau);
      if (!mesure) {
        mesure = true;
        const boite = await aide.boundingBox();
        expect(boite, 'le bloc de l’aide').not.toBeNull();
        const largeur = page.viewportSize()?.width ?? 0;
        test.info().annotations.push({
          type: 'mesure de l’aide',
          description: JSON.stringify({ boite, largeur }),
        });
        expect((boite?.x ?? 0) + (boite?.width ?? 0), 'bord droit de l’aide').toBeLessThanOrEqual(
          largeur,
        );
        await sansDefilementHorizontal(page);
        // L'aide est dans la carte, avant « Weiter » : le bas de l'un et l'autre reste dans l'écran.
        const hauteur = page.viewportSize()?.height ?? 0;
        const suivante = await page
          .getByRole('button', { name: deCours.cartes_suivante })
          .boundingBox();
        expect(suivante, 'le bouton « Weiter »').not.toBeNull();
        test.info().annotations.push({
          type: 'mesure du bas',
          description: JSON.stringify({ aide: boite, suivante, hauteur }),
        });
        expect((boite?.y ?? 0) + (boite?.height ?? 0), 'bas de l’aide').toBeLessThanOrEqual(
          hauteur,
        );
        expect(
          (suivante?.y ?? 0) + (suivante?.height ?? 0),
          'bas de « Weiter »',
        ).toBeLessThanOrEqual(hauteur);
      }
    }
    await page.getByRole('button', { name: deCours.cartes_suivante }).click();
  }

  // Une faute remet la carte en fin de file : après neuf réponses, chaque unité a été posée
  // une fois.
  expect(vues.size, 'termes distincts').toBe(CARTES_DU_MODULE);
  expect([...vues]).toEqual(expect.arrayContaining(Object.keys(AIDES)));
});
