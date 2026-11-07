import type { EtatUnite } from '../progression/etat.js';

/**
 * Le poids d'une unité dans les tirages des mots, des schémas et des exercices (H:1862, H:1652,
 * H:1675) : 1 si ses réponses justes l'emportent sur les fausses, 3 sinon. Une unité neuve, ou
 * autant juste que fausse, a donc trois fois plus de chances de sortir qu'une unité acquise.
 */
export function poidsSelonReponses(etat: EtatUnite): number {
  return etat.justes > etat.fausses ? 1 : 3;
}
