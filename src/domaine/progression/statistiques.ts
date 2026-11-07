import type { UniteDeCarte } from '../cartes/unites.js';
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
  unites: readonly UniteDeCarte[],
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

/**
 * « Schwierige Karten » : au plus `n` unités déjà fausses, les plus difficiles d'abord. La
 * difficulté est le nombre de fautes moins 0,3 fois celui de réussites ; à égalité, l'ordre du
 * cours.
 */
export function cartesDifficiles(
  unites: readonly UniteDeCarte[],
  etats: ReadonlyMap<string, EtatUnite>,
  n: number,
): { unite: UniteDeCarte; etat: EtatUnite }[] {
  const difficulte = (etat: EtatUnite): number => etat.fausses - etat.justes * 0.3;
  return unites
    .map((unite) => ({ unite, etat: etatDe(etats, unite.id) }))
    .filter(({ etat }) => etat.fausses > 0)
    .sort((a, b) => difficulte(b.etat) - difficulte(a.etat))
    .slice(0, n);
}

/** `wordsSolved`, `anatSolved`... : combien de ces unités ont reçu au moins une réponse juste. */
export function reussis(ids: readonly string[], etats: ReadonlyMap<string, EtatUnite>): number {
  return ids.filter((id) => etatDe(etats, id).justes > 0).length;
}
