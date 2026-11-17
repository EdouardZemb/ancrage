import { distance, jugerCanonique } from '../correction.js';
import { canonique } from './reponses.js';
import { type IndexDesReponses, reponsesAcceptees, type UniteDeCarte } from './unites.js';

/*
 * Le jugement d'une carte saisie (lot M5) : celui de `juger`, plus le tréma écrit « ue » (M5-D8) et
 * la faute de frappe comptée juste (M5-D1). La Prüfung ne passe pas par ici : elle garde son
 * jugement strict (M5-D4).
 */

export interface JugementDeCarte {
  juste: boolean;
  /** Fausse de peu. Jamais vrai si `juste`. */
  presque: boolean;
  /** Comptée juste malgré une lettre fausse (M5-D1). Jamais vrai si la saisie est exacte. */
  frappe: boolean;
}

/** La longueur d'une réponse admise à partir de laquelle une lettre fausse est tolérée. */
export const LONGUEUR_TOLEREE = 6;

/** Une forme canonique, avec « ue » replié en « ü » comme « ae » et « oe » le sont déjà. */
function plier(canonic: string): string {
  return canonic.replace(/ue/g, 'ü');
}

export function jugerLaCarte(
  saisie: string,
  unite: UniteDeCarte,
  index: IndexDesReponses,
): JugementDeCarte {
  const g = plier(canonique(saisie));
  // Les réponses admises sont déjà canoniques : on n'y applique que le repli de « ue ».
  const pliees = new Set([...reponsesAcceptees(unite, index)].map(plier));
  const jugement = jugerCanonique(g, pliees);
  if (jugement.juste) return { ...jugement, frappe: false };

  const voisine = [...pliees].some((x) => x.length >= LONGUEUR_TOLEREE && distance(g, x) === 1);
  if (voisine) {
    // Une réponse admise d'une autre carte n'est pas une faute de frappe (M5-D2).
    const autreReponse = [...index.values()].some((reponses) =>
      [...reponses].some((x) => plier(x) === g),
    );
    if (!autreReponse) return { juste: true, presque: false, frappe: true };
  }
  return { ...jugement, frappe: false };
}
