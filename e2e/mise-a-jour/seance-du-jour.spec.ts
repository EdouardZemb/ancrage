/*
 * « Heute » (M2), la séance du jour, de bout en bout : sur le cours d'exemple, un compte neuf fait
 * une faute sûre dans trois onglets (une carte, un mot, un exercice), les quitte sans y répondre
 * juste, puis ouvre « Heute ». La séance mêle alors ces trois dues et des cartes neuves ; chaque
 * question reçoit une réponse, quel que soit son genre, jusqu'à l'écran de fin.
 *
 * Il tourne avec les tests des deux versions (`pnpm e2e:mise-a-jour`) : le lien du propriétaire ne
 * sert qu'une fois, et la suite principale le consomme pour son parcours de compte. Ici, le test
 * lance son propre serveur, sur sa propre base, et sert la version A.
 */
import { expect, type Page } from '@playwright/test';
import { TEXTES_COURS } from '../../src/client/cours/textes-cours.js';
import { textes } from '../../src/client/textes.js';
import {
  compteDeHeute,
  type GenreDeHeute,
  ouvrirOnglet,
  repondreALaTete,
  resultatDeHeute,
} from '../aide-cours.js';
import { test } from '../aide-csp.js';
import { ajouterAuthentificateur } from '../aide-webauthn.js';
import { lienDuProprietaire } from '../amorcage.js';
import { DOSSIER_DU_DEPOT, ORIGINE, servirVersion, type VersionServie } from './aide-versions.js';

// Les écrans en allemand, comme sur le téléphone de l'apprenante.
test.use({ locale: 'de-DE' });

const de = textes.de;
const deCours = TEXTES_COURS.de;

/** La taille d'une séance (`TAILLE_DE_SEANCE`) : la boucle des réponses ne dépasse jamais le double. */
const TAILLE_DE_SEANCE = 20;
/** Les cartes neuves d'une séance du cours d'exemple (`nouvelles_par_seance`). */
const NOUVELLES_PAR_SEANCE = 15;
/** Les essais pour tomber sur une faute, quand une réponse choisie à l'aveugle se trouve juste. */
const ESSAIS_DE_FAUTE = 12;

let serveur: VersionServie | undefined;

test.afterEach(async () => {
  await serveur?.arreter();
  serveur = undefined;
});

/** Une carte « Nicht gewusst » : elle redevient due le jour même. */
async function fauteSurUneCarte(page: Page): Promise<void> {
  await ouvrirOnglet(page, 'cartes');
  // Retournée sans saisie, quel que soit le sens de la carte tirée.
  await page.getByRole('checkbox', { name: deCours.cartes_saisie }).uncheck();
  await page.getByRole('button', { name: deCours.cartes_retourner }).click();
  await page.getByRole('button', { name: deCours.cartes_pas_su, exact: true }).click();
}

/** Un mot bâti d'une seule tuile (« Wörter bilden ») : faux, sauf un mot d'un segment, et alors suivant. */
async function fauteSurUnMot(page: Page): Promise<void> {
  await ouvrirOnglet(page, 'mots');
  await page.getByLabel(deCours.choix_exercice).selectOption('bilden');
  for (let essai = 0; essai < ESSAIS_DE_FAUTE; essai++) {
    await page.locator('.cours .tiles .tile:enabled').first().click();
    await page.getByRole('button', { name: deCours.pruefen, exact: true }).click();
    if (await page.locator('.cours .verdict.ko').isVisible()) return;
    await page.getByRole('button', { name: deCours.mots_naechstes }).click();
  }
  throw new Error('aucun mot raté d’une seule tuile');
}

/** Un exercice de grammaire raté : une réponse inventée, ou des propositions l'une après l'autre. */
async function fauteSurUnExercice(page: Page): Promise<void> {
  await ouvrirOnglet(page, 'exercices');
  for (let essai = 0; essai < ESSAIS_DE_FAUTE; essai++) {
    const saisie = page.getByLabel(deCours.exercices_antwort);
    if (await saisie.isVisible()) {
      await saisie.fill('x');
      await page.getByRole('button', { name: deCours.pruefen, exact: true }).click();
    } else {
      const propositions = page.locator('.cours .options button');
      await propositions.nth(essai % (await propositions.count())).click();
    }
    if (await page.locator('.cours .verdict.ko').isVisible()) return;
    await page.getByRole('button', { name: deCours.suivante, exact: true }).click();
  }
  throw new Error('aucun exercice raté');
}

test('la_seance_du_jour_mele_les_types', async ({ page }) => {
  test.setTimeout(120_000);
  await ajouterAuthentificateur(page);

  await test.step('1. un compte neuf arrive sur « Heute »', async () => {
    serveur = await servirVersion('a', test.info().outputPath('ancrage.sqlite'));
    const lien = lienDuProprietaire({
      dossier: DOSSIER_DU_DEPOT,
      base: test.info().outputPath('ancrage.sqlite'),
      urlPublique: ORIGINE,
    });
    await page.goto(lien);
    await page.getByLabel(de.nom_affiche).fill('Prüfer Test');
    await page.getByRole('button', { name: de.creer_passkey }).click();
    await expect(page).toHaveURL(/\/cours\/[0-9a-z]{8}\/heute$/);
  });

  // Les unités dont la dernière réponse est fausse : une faute chacune, dans un onglet.
  let fautes = 0;
  await test.step('2. trois fautes sûres, dans trois onglets', async () => {
    await fauteSurUneCarte(page);
    fautes++;
    await fauteSurUnMot(page);
    fautes++;
    await fauteSurUnExercice(page);
    fautes++;
  });

  let file = 0;
  await test.step('3. « Heute » compte les fautes pour dues, et pose des cartes neuves', async () => {
    await ouvrirOnglet(page, 'heute');
    await expect(page).toHaveURL(/\/cours\/[0-9a-z]{8}\/heute$/);
    const compte = await compteDeHeute(page);
    expect(compte.dues, 'unités dues').toBe(fautes);
    expect(compte.neues, 'cartes neuves').toBe(NOUVELLES_PAR_SEANCE);
    expect(compte.faites).toBe(0);
    file = compte.restantes;
    expect(file, 'file de la séance').toBe(
      Math.min(TAILLE_DE_SEANCE, fautes + NOUVELLES_PAR_SEANCE),
    );
  });

  const genres = new Set<GenreDeHeute>();
  await test.step('4. chaque question reçoit une réponse, jusqu’à l’écran de fin', async () => {
    const fin = page.getByRole('heading', { name: deCours.heute_fin });
    for (let reponse = 0; reponse < 2 * TAILLE_DE_SEANCE && !(await fin.isVisible()); reponse++) {
      genres.add(await repondreALaTete(page));
    }
    await expect(fin, 'l’écran de fin, dans la borne des réponses').toBeVisible();
    // Au moins un mot et un exercice : les fautes d'hier sont revenues, avec leur genre.
    expect([...genres], 'genres posés').toEqual(
      expect.arrayContaining(['carte', 'mot', 'exercice']),
    );
  });

  await test.step('5. la fin dit le résultat', async () => {
    const resultat = await resultatDeHeute(page);
    expect(resultat, deCours.heute_resultat).toBeDefined();
    const { justes, faites } = resultat ?? { justes: 0, faites: 0 };
    // Toute question de la file a reçu une réponse, et une faute en ajoute une seconde.
    expect(faites).toBeGreaterThanOrEqual(file);
    expect(justes).toBeLessThanOrEqual(faites);
  });
});
