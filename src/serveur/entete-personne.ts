/*
 * L'en-tête `x-ancrage-personne` : la personne dont l'écran est ouvert. C'est celle dont le
 * téléphone envoie la file (R21), sous laquelle il range ce qu'il lit, journal (R32), liste des
 * cours ou contenu (R36), dont il supprime le compte (1e-R13), lit les appareils (1e-R15), change
 * le profil ou crée et annule le lien pour un autre appareil (`routes-compte.ts`). Sur un téléphone
 * partagé, une autre personne a pu se connecter entre-temps (un autre onglet, un cookie changé) :
 * ce que la page d'une personne envoie, range ou change ne doit jamais passer sous la session d'une
 * autre. Le refus est `409 {"erreur":"autre_personne"}` ; le client le traite comme une session
 * expirée.
 *
 * Le journal et la suppression du compte l'exigent (`refusDeLaPersonne`). Les autres routes, qui
 * existaient avant lui, ne le contrôlent que s'il est présent (`autrePersonneNommee`) :
 * l'application de la version précédente, gardée au précache, ne l'envoie pas (invariant 8).
 *
 * Ce contrôle vient toujours après celui des droits (`acces/`) : sans droit, la réponse reste
 * celle d'un cours inexistant (invariant 1). Voir aussi `src/client/api.ts`.
 *
 * Le module `acces` le lit aussi sans session : s'il nomme un compte du registre des suppressions,
 * le 401 devient `compte_supprime` (2d-D2). Une session valide l'emporte toujours.
 */
import type { FastifyRequest } from 'fastify';
import { ENTETE_PERSONNE, personneConnectee } from './acces/index.js';

// Défini par le module `acces`, qui lit aussi l'en-tête sans session (2d-D2) ; réexporté ici pour
// que les importateurs ne changent pas.
export { ENTETE_PERSONNE } from './acces/index.js';
export const AUTRE_PERSONNE = Object.freeze({ erreur: 'autre_personne' });
export const REQUETE_SANS_PERSONNE = Object.freeze({ erreur: 'requete' });

/**
 * Vrai si l'en-tête est présent et ne nomme pas la personne de la session : une autre personne,
 * une valeur vide, ou un en-tête répété, que Node joint (« a, b ») et qui ne nomme personne.
 * Absent, il ne dit rien : faux. À n'appeler que sur une route classée `connecte` ou `cours`.
 */
export function autrePersonneNommee(requete: FastifyRequest): boolean {
  const nommee = requete.headers[ENTETE_PERSONNE];
  return nommee !== undefined && nommee !== personneConnectee(requete).id;
}

/**
 * Le refus d'une requête dont l'en-tête `x-ancrage-personne` manque ou est vide (400), ou nomme
 * une autre personne que celle de la session (409) ; `undefined` si c'est la sienne. Pour les
 * routes qui l'exigent (le journal, la suppression du compte). Un en-tête répété arrive joint par
 * Node (« a, b ») : il ne nomme aucune personne, refusé en 409.
 */
export function refusDeLaPersonne(
  requete: FastifyRequest,
): [400, typeof REQUETE_SANS_PERSONNE] | [409, typeof AUTRE_PERSONNE] | undefined {
  const attendue = requete.headers[ENTETE_PERSONNE];
  if (typeof attendue !== 'string' || attendue === '') return [400, REQUETE_SANS_PERSONNE];
  return autrePersonneNommee(requete) ? [409, AUTRE_PERSONNE] : undefined;
}
