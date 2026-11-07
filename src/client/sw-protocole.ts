/*
 * Le protocole entre l'application et son service worker (2a-D1, 2a-D6). Ce fichier n'importe rien
 * du DOM : il est compilé aussi pour le worker (`tsconfig.sw.json`).
 */

/** Le message par lequel une page demande au service worker en attente de prendre la main. */
export const MESSAGE_PRENDRE_LA_MAIN = 'ancrage:prendre-la-main';

/**
 * Le cache-marque : le service worker le crée à son activation. Sa présence dit qu'une version
 * qui connaît le protocole a déjà été active. Il ne contient rien, et n'est pas le précache.
 */
export const CACHE_PROTOCOLE = 'ancrage-protocole-1';

/**
 * Le premier service worker qui connaît le protocole prend la main dès son installation, car la
 * version d'avant ne sait pas envoyer le message. Il ne le fait que s'il remplace une version
 * active qui ne l'a pas encore connu.
 */
export function prendreLaMainALInstallation(etat: {
  versionActive: boolean;
  protocoleConnu: boolean;
}): boolean {
  return etat.versionActive && !etat.protocoleConnu;
}
