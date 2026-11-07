import type { Morpheme, Mot } from '../contenu/modele.js';
import { type Hasard, melanger, tirerPondere, uniquesPar } from '../hasard.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { poidsSelonReponses } from './poids.js';

/*
 * Le Wortbaukasten, repris du prototype (H:1862-1928) sans changer son comportement : trouver le
 * sens des parties d'un mot, ou bâtir un mot avec des morphèmes.
 */

/**
 * `pickWord` : un mot, trois fois plus souvent s'il n'est pas encore acquis.
 *
 * @throws RangeError si `mots` est vide.
 */
export function choisirMot(
  mots: readonly Mot[],
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): Mot {
  return tirerPondere(mots, (mot) => poidsSelonReponses(etatDe(etats, mot.id)), hasard);
}

/**
 * `meaningOptions` : le sens du morphème et jusqu'à trois autres, mélangés. Les autres sens
 * viennent de morphèmes de la même catégorie (préfixe, radical ou suffixe), sans répéter un sens
 * ni reprendre celui de la réponse.
 */
export function optionsDeSens(
  morpheme: Morpheme,
  morphemes: readonly Morpheme[],
  hasard: Hasard,
): string[] {
  const autres = melanger(
    morphemes.filter((m) => m.categorie === morpheme.categorie && m.sens !== morpheme.sens),
    hasard,
  );
  const fausses = uniquesPar(autres, (m) => m.sens)
    .slice(0, 3)
    .map((m) => m.sens);
  return melanger([morpheme.sens, ...fausses], hasard);
}

/**
 * Les tuiles de « Wort bilden » : les morphèmes du mot, plus deux morphèmes au hasard de chaque
 * catégorie (préfixe, radical, suffixe) qui n'y sont pas, le tout mélangé. Ce sont des identifiants
 * de morphèmes, chacun une fois (un morphème répété dans un mot n'a qu'une tuile).
 */
export function tuilesDuMot(mot: Mot, morphemes: readonly Morpheme[], hasard: Hasard): string[] {
  const siens = mot.segments.map((segment) => segment.morpheme);
  const enPlus = (['p', 's', 'x'] as const).flatMap((categorie) =>
    melanger(
      morphemes.filter((m) => m.categorie === categorie && !siens.includes(m.id)),
      hasard,
    )
      .slice(0, 2)
      .map((m) => m.id),
  );
  return melanger(
    uniquesPar([...siens, ...enPlus], (id) => id),
    hasard,
  );
}

/** Le mot est bien formé si les tuiles choisies sont exactement ses morphèmes, dans l'ordre. */
export function motBienForme(mot: Mot, choisis: readonly string[]): boolean {
  return (
    choisis.length === mot.segments.length &&
    mot.segments.every((segment, rang) => segment.morpheme === choisis[rang])
  );
}
