import { type EtatUnite, estDue, etatDe } from './etat.js';

/*
 * Les statistiques de la progression, reprises du prototype (H:1627-1633, H:2200-2216) sans
 * changer leur comportement. Elles se calculent sur les unités du cours : un état que le journal
 * garde pour une unité retirée du cours n'y entre pas.
 */

/** La première des deux boîtes qui comptent pour « sûres » (4 et 5). */
const BOITE_SURE = 4;

/**
 * `chapterStats` : le nombre d'unités, leur répartition par boîte (de 0, neuves, à 5), le nombre de
 * sûres (boîtes 4 et 5) et le nombre de dues aujourd'hui.
 */
export function statistiquesDeChapitre(
  unites: readonly { id: string }[],
  etats: ReadonlyMap<string, EtatUnite>,
  aujourdhui: string,
): { total: number; boites: number[]; sures: number; dues: number } {
  const boites = [0, 0, 0, 0, 0, 0];
  let dues = 0;
  for (const unite of unites) {
    const etat = etatDe(etats, unite.id);
    boites[etat.boite]++;
    if (estDue(etat, aujourdhui)) dues++;
  }
  return {
    total: unites.length,
    boites,
    sures: boites.slice(BOITE_SURE).reduce((somme, n) => somme + n, 0),
    dues,
  };
}

/** `wordsSolved`, `anatSolved`... : combien de ces unités ont reçu au moins une réponse juste. */
export function reussis(ids: readonly string[], etats: ReadonlyMap<string, EtatUnite>): number {
  return ids.filter((id) => etatDe(etats, id).justes > 0).length;
}
