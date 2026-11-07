/*
 * Le verrouillage d'écran d'un téléphone, pour les tests de bout en bout : un authentificateur
 * virtuel de Chromium, posé par CDP. Il crée des passkeys résidentes, vérifie l'utilisateur et
 * répond seul, sans geste à simuler. Il appartient à la page : un par téléphone simulé.
 */
import type { Page } from '@playwright/test';

export async function ajouterAuthentificateur(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}
