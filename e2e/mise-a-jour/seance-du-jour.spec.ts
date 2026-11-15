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
import { formater, TEXTES_COURS } from '../../src/client/cours/textes-cours.js';
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
/** Le plafond de cartes neuves par jour du cours d'exemple (`nouvelles_par_seance`, M2-P9). */
const NOUVELLES_PAR_JOUR = 15;
/**
 * Les unités du premier chapitre du cours d'exemple, seul module ouvert en semaine 1 de son
 * planning (M4, B-D2) : 9 cartes, chacune dans les deux sens.
 */
const UNITES_DU_PREMIER_CHAPITRE = 18;
/**
 * Les jours d'aujourd'hui, compris, à l'ouverture de la semaine 2, exclue : l'horizon du rythme d'un
 * planning relatif, le premier jour (B-D4).
 */
const JOURS_JUSQU_A_LA_SEMAINE_2 = 7;
/** Les essais pour tomber sur une faute, quand une réponse choisie à l'aveugle se trouve juste. */
const ESSAIS_DE_FAUTE = 12;

/** L'examen inventé du cours d'exemple (`memoire.examen`, `exemple-contenu/kueche/cours.yaml`). */
const EXAMEN_DE_L_EXEMPLE = [2030, 6, 30] as const;

/**
 * Le compte à rebours que « Heute » dit (A1-D8). Le test lit l'horloge réelle contre l'examen
 * inventé, lointain : il tient jusqu'au 28/06/2030 inclus (à un jour et le jour même, l'onglet
 * prend un autre libellé), et le calcul est celui du jour local, comme l'onglet.
 */
function compteARebours(): string {
  const [annee, mois, jour] = EXAMEN_DE_L_EXEMPLE;
  const maintenant = new Date();
  const aujourdhui = Date.UTC(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate(),
  );
  const jours = Math.round((Date.UTC(annee, mois - 1, jour) - aujourdhui) / 86_400_000);
  if (jours < 2) throw new Error('l’examen inventé de l’exemple arrive : en reculer la date');
  return formater(deCours.heute_examen_n, { n: jours });
}

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
  // La carte ratée dans Karteikarten reçoit sa première réponse aujourd'hui : elle compte parmi les
  // découvertes du jour, et sort des neuves du premier chapitre.
  const decouvertes = 1;
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
    // Le rythme du premier jour (B-D3, B-D4) : les 18 unités du premier chapitre, ouvert seul,
    // réparties sur les 7 jours d'ici la semaine 2, sous le plafond. La carte découverte dans
    // Karteikarten compte dans ces 18 et dans le rythme : elle en retire une des neuves du jour ;
    // le plafond, lui, en retire aussi une.
    const rythme = Math.min(
      NOUVELLES_PAR_JOUR,
      Math.ceil(UNITES_DU_PREMIER_CHAPITRE / JOURS_JUSQU_A_LA_SEMAINE_2),
    );
    const neuves = Math.min(NOUVELLES_PAR_JOUR - decouvertes, rythme - decouvertes);
    expect(compte.neues, 'cartes neuves').toBe(neuves);
    expect(compte.faites).toBe(0);
    file = compte.restantes;
    expect(file, 'file de la séance').toBe(Math.min(TAILLE_DE_SEANCE, fautes + neuves));
    // Le compte à rebours, sur l'écran de la séance : l'exemple a un `examen`.
    await expect(page.locator('.cours .examenline', { hasText: compteARebours() })).toBeVisible();
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
    // Et sur l'écran de fin.
    await expect(page.locator('.cours .examenline', { hasText: compteARebours() })).toBeVisible();
    const { justes, faites } = resultat ?? { justes: 0, faites: 0 };
    // Le résultat compte des éléments : chaque élément de la file est passé une fois, qu'une faute
    // l'ait fait revenir ou non.
    expect(faites).toBe(file);
    expect(justes).toBeLessThanOrEqual(faites);
  });
});
