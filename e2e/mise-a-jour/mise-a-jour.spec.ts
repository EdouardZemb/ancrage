/*
 * La dernière version sans vider le cache (ancrage-donnees#115, 2a-D8) : deux versions du client, servies l'une
 * après l'autre sur la même origine. Le téléphone a ouvert la version A ; B est mise en ligne ; il
 * la découvre au retour sur l'application, et elle attend. Elle s'applique au moment suivant
 * (2a-D2) : la première navigation hors séance, ou la sortie du cours en séance (2a-D3), jamais en
 * pleine séance.
 *
 * Une marque posée dans `window` avant le changement de serveur dit si la page a été rechargée.
 * Le pied de page dit ensuite quel code tourne : celui du serveur, sans `Gerät` (2a-D5).
 *
 * Chaque test a sa base, dans son dossier de sortie, et son contexte, donc son propre
 * enregistrement du service worker. Aucun ne doit enfreindre la politique de sécurité du contenu
 * (R37, `aide-csp.ts`), service worker compris. La CI ne publie ni rapport ni trace : un test en
 * échec écrit dans sa sortie les journaux de ses serveurs.
 */
import { expect, type Page } from '@playwright/test';
import { DELAI_DE_PRISE_DE_MAIN_MS } from '../../src/client/mise-a-jour.js';
import { textes } from '../../src/client/textes.js';
import { ouvrirOnglet, repondreGewusst } from '../aide-cours.js';
import { test } from '../aide-csp.js';
import { pageControlee } from '../aide-hors-ligne.js';
import { ajouterAuthentificateur } from '../aide-webauthn.js';
import { lienDuProprietaire } from '../amorcage.js';
import {
  DOSSIER_DU_DEPOT,
  ORIGINE,
  servirVersion,
  simulerRetour,
  uneVersionAttend,
  type Version,
  type VersionServie,
  versionEnAttente,
} from './aide-versions.js';

// Les écrans en allemand, comme sur le téléphone de l'apprenante.
test.use({ locale: 'de-DE' });

const de = textes.de;

/** Le pied de page de la version B, servie et tournant sur le téléphone. */
const VERSION_B = 'ci · dev · e2e-b';

/**
 * Le temps laissé à un rechargement fautif pour se produire : le message à la version qui attend,
 * son activation et le rechargement de la page en prennent bien moins.
 */
const DELAI_SANS_RECHARGEMENT_MS = 2_000;

/**
 * Le temps laissé au rechargement voulu : la prise de main, qui ne répond au geste que dans
 * `DELAI_DE_PRISE_DE_MAIN_MS` (`mise-a-jour.ts`), puis le rechargement de la page.
 */
const DELAI_DE_RECHARGEMENT_MS = DELAI_DE_PRISE_DE_MAIN_MS + 5_000;

const MARQUE = 'marqueAvantLaNouvelleVersion';

/** La version servie, s'il y en a une. */
let servie: VersionServie | undefined;
/** Les serveurs lancés par le test, dans l'ordre, avec leur journal. */
let serveurs: { version: Version; journal: () => string }[] = [];

/** Arrête la version servie, s'il y en a une, puis sert `v` sur la base du test. */
async function servir(v: Version): Promise<void> {
  await servie?.arreter();
  servie = undefined;
  servie = await servirVersion(v, test.info().outputPath('ancrage.sqlite'));
  serveurs.push({ version: v, journal: servie.journal });
}

// En échec, les journaux des serveurs vont à la sortie du test, que le rapporteur `list` affiche.
test.afterEach(async () => {
  await servie?.arreter();
  servie = undefined;
  const info = test.info();
  if (info.status !== info.expectedStatus) {
    for (const { version, journal } of serveurs) {
      console.log(`Journal du serveur de la version ${version} :\n${journal()}`);
    }
  }
  serveurs = [];
});

/** Pose la marque dans la page : un rechargement l'efface. */
async function poserLaMarque(page: Page): Promise<void> {
  await page.evaluate((nom) => {
    Object.assign(window, { [nom]: true });
  }, MARQUE);
}

/** Si la marque est dans la page. */
function marquee(page: Page): Promise<boolean> {
  return page.evaluate((nom) => nom in window, MARQUE);
}

/**
 * La page n'est pas rechargée : la marque est toujours là, un moment après le dernier geste. Et la
 * version attend toujours : aucune prise de main n'a eu lieu, ce qui ne dépend d'aucun délai.
 */
async function toujoursMarquee(page: Page): Promise<void> {
  await page.waitForTimeout(DELAI_SANS_RECHARGEMENT_MS);
  expect(await marquee(page), 'la marque, que seul un rechargement efface').toBe(true);
  expect(await uneVersionAttend(page), 'la version en attente, sans prise de main').toBe(true);
}

/** La page a été rechargée : la marque a disparu. Pendant le rechargement, la page ne répond pas. */
async function rechargee(page: Page): Promise<void> {
  await expect
    .poll(() => marquee(page).catch(() => true), {
      message: 'la marque, après le geste',
      timeout: DELAI_DE_RECHARGEMENT_MS,
    })
    .toBe(false);
}

/** B est mise en ligne à la place de A, puis le téléphone revient sur l'application. */
async function miseEnLigneDeB(page: Page): Promise<void> {
  await servir('b');
  await simulerRetour(page);
  await versionEnAttente(page);
}

test('hors_seance_la_navigation_suivante_charge_la_nouvelle_version', async ({ page }) => {
  const version = page.getByTestId('version');

  await test.step('1. A sert la notice, et contrôle la page', async () => {
    await servir('a');
    await page.goto('/confidentialite');
    await pageControlee(page);
    await expect(version).toHaveText('ci · dev · e2e-a');
    await poserLaMarque(page);
  });

  await test.step('2. B est mise en ligne : elle attend, la page reste', async () => {
    await miseEnLigneDeB(page);
    await toujoursMarquee(page);
  });

  await test.step('3. un lien interne : la page passe à B', async () => {
    await page.getByRole('link', { name: de.notice_lien }).click();
    await rechargee(page);
    await expect(page).toHaveURL(`${ORIGINE}/confidentialite`);
    await expect(version).toHaveText(VERSION_B);
  });
});

test('en_seance_la_version_attend_la_sortie_du_cours', async ({ page }) => {
  const version = page.getByTestId('version');
  await ajouterAuthentificateur(page);

  await test.step('1. le propriétaire crée son compte par son lien', async () => {
    await servir('a');
    const lien = lienDuProprietaire({
      dossier: DOSSIER_DU_DEPOT,
      base: test.info().outputPath('ancrage.sqlite'),
      urlPublique: ORIGINE,
    });
    await page.goto(lien);
    await page.getByLabel(de.nom_affiche).fill('Prüfer Test');
    await page.getByRole('button', { name: de.creer_passkey }).click();
  });

  await test.step('2. sur le cours, il répond à une carte : une séance commence', async () => {
    await expect(page).toHaveURL(/\/cours\/[0-9a-z]{8}$/);
    await pageControlee(page);
    await repondreGewusst(page, 1);
    await expect(version).toHaveText('ci · dev · e2e-a');
    await poserLaMarque(page);
  });

  await test.step('3. B est mise en ligne : elle attend, la page reste', async () => {
    await miseEnLigneDeB(page);
    await toujoursMarquee(page);
  });

  await test.step('4. un autre onglet du cours : la séance continue, la page reste', async () => {
    await ouvrirOnglet(page, 'apercu');
    await toujoursMarquee(page);
  });

  await test.step('5. le compte : la séance est finie, la page passe à B', async () => {
    await page.getByRole('link', { name: de.compte_lien, exact: true }).click();
    await rechargee(page);
    await expect(page).toHaveURL(`${ORIGINE}/compte`);
    await expect(version).toHaveText(VERSION_B);
  });
});
