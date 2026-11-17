import { distance, jugerCanonique } from '../correction.js';
import { canonique } from './reponses.js';
import { type IndexDesReponses, reponsesAcceptees, type UniteDeCarte } from './unites.js';

/*
 * Le jugement d'une carte saisie (lot M5) : celui de `juger`, plus trois tolérances, qui ne se
 * cumulent pas : « ue » tapé pour « ü » (M5-D8) ; un ou plusieurs trémas oubliés ou en trop, quelle
 * que soit la longueur (M5-D10) ; une lettre fausse sur une réponse d'au moins six caractères
 * (M5-D1). Les deux dernières ne jouent pas sur une réponse admise d'une autre carte (M5-D2), et le
 * tréma oublié pas non plus quand la saisie ou une réponse de la carte s'écrit avec « ae », « oe »
 * ou « ue » (« a » pour « ae » confondrait deux formes). Limite : une réponse admise venue d'une
 * autre carte à la même question n'est pas lue en brut pour ce digramme. La Prüfung ne passe pas
 * par ici : elle garde son jugement strict (M5-D4).
 */

export interface JugementDeCarte {
  juste: boolean;
  /** Fausse de peu. Jamais vrai si `juste`. */
  presque: boolean;
  /**
   * Comptée juste malgré une lettre fausse (M5-D1) ou un tréma oublié ou en trop (M5-D10). Jamais
   * vrai si la saisie est exacte.
   */
  frappe: boolean;
}

/** La longueur d'une réponse admise à partir de laquelle une lettre fausse est tolérée. */
export const LONGUEUR_TOLEREE = 6;

/** Une forme canonique, avec « ue » replié en « ü » comme « ae » et « oe » le sont déjà. */
export function plier(canonic: string): string {
  return canonic.replace(/ue/g, 'ü');
}

/** Un digramme que `canonique` ou `plier` replie en tréma. */
const DIGRAMME = /ae|oe|ue/i;

/** `ä`, `ö` et `ü` sans leur tréma. */
function sansTrema(s: string): string {
  return s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
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

  // Une réponse admise d'une autre carte n'est pas une faute de frappe (M5-D2).
  const frappe = { juste: true, presque: false, frappe: true };
  const autreReponse = () =>
    [...index.values()].some((reponses) => [...reponses].some((x) => plier(x) === g));
  const ecritsBruts = [saisie, unite.reponse, ...(unite.reponses ?? [])];
  const avecDigramme = ecritsBruts.some((e) => DIGRAMME.test(e.normalize('NFC')));
  const nu = sansTrema(g);
  if (!avecDigramme && [...pliees].some((x) => sansTrema(x) === nu) && !autreReponse()) {
    return frappe;
  }
  const voisine = [...pliees].some((x) => x.length >= LONGUEUR_TOLEREE && distance(g, x) === 1);
  if (voisine && !autreReponse()) return frappe;
  return { ...jugement, frappe: false };
}
