/*
 * L'enregistrement du service worker (`sw.ts`, construit en `/sw.js`). En production seulement :
 * le serveur de développement de Vite ne le construit pas. Un navigateur sans service worker (ou
 * une page hors d'un contexte sécurisé) n'en enregistre pas, et un échec ne casse rien :
 * l'application marche alors en ligne, comme avant.
 */

/** Ce dont l'enregistrement dépend, que les tests remplacent. */
export interface EnvironnementSw {
  /** Une construction de production (`vite build`). */
  production: boolean;
  /** `navigator.serviceWorker`, absent d'un navigateur ou d'un contexte qui n'en a pas. */
  conteneur: Pick<ServiceWorkerContainer, 'register'> | undefined;
}

function environnementDeLaPage(): EnvironnementSw {
  return {
    production: import.meta.env.PROD,
    conteneur: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  };
}

/** Enregistre `/sw.js` pour tout le site ; rend `true` si l'enregistrement a réussi. */
export async function enregistrerSw(
  environnement: EnvironnementSw = environnementDeLaPage(),
): Promise<boolean> {
  const { production, conteneur } = environnement;
  if (!production || conteneur === undefined) {
    return false;
  }
  try {
    await conteneur.register('/sw.js', { scope: '/' });
    return true;
  } catch {
    // Pas de service worker : ni précache ni hors-ligne, mais l'application marche en ligne.
    return false;
  }
}
