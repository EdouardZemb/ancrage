/*
 * Le compte neuf des tests de la suite des deux versions (`pnpm e2e:mise-a-jour`) qui veulent un
 * compte à eux : le lien du propriétaire ne sert qu'une fois, et la suite principale consomme le
 * sien pour son parcours de compte. Une seule copie du bloc, que jscpd refuserait recopié.
 */
import { expect, type Page } from '@playwright/test';
import { textes } from '../../src/client/textes.js';
import { ajouterAuthentificateur } from '../aide-webauthn.js';
import { lienDuProprietaire } from '../amorcage.js';
import { DOSSIER_DU_DEPOT, ORIGINE, servirVersion, type VersionServie } from './aide-versions.js';

const de = textes.de;

/**
 * Un compte neuf sur sa propre base : la version A servie sur `base`, un authentificateur virtuel,
 * le lien du propriétaire tiré de cette base, puis la passkey ; rend la version servie, que le test
 * arrête, une fois la page sur « Heute ».
 *
 * Si une étape échoue après le lancement du serveur, il est arrêté avant de relancer l'erreur : le
 * test n'a pas encore reçu la version servie, son `afterEach` ne l'arrêterait pas, et le test
 * suivant trouverait le port occupé.
 */
export async function compteNeufSurHeute(page: Page, base: string): Promise<VersionServie> {
  await ajouterAuthentificateur(page);
  const serveur = await servirVersion('a', base);
  try {
    const lien = lienDuProprietaire({ dossier: DOSSIER_DU_DEPOT, base, urlPublique: ORIGINE });
    await page.goto(lien);
    await page.getByLabel(de.nom_affiche).fill('Prüfer Test');
    await page.getByRole('button', { name: de.creer_passkey }).click();
    await expect(page).toHaveURL(/\/cours\/[0-9a-z]{8}\/heute$/);
  } catch (erreur) {
    await serveur.arreter();
    throw erreur;
  }
  return serveur;
}
