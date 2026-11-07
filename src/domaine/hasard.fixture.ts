import type { Hasard } from './hasard.js';

/**
 * Un hasard scripté : rend les valeurs données, dans l'ordre, puis `parDefaut`. Les tests s'en
 * servent pour choisir exactement l'indice que tire la première étape d'une fonction de tirage
 * (`(k + 0.5) / n` désigne l'indice `k` sur `n`), les mélanges qui suivent recevant `parDefaut`.
 */
export function hasardScripte(valeurs: readonly number[], parDefaut = 0): Hasard {
  let rang = 0;
  return () => (rang < valeurs.length ? valeurs[rang++] : parDefaut);
}

/**
 * Le nombre de fois où chaque résultat sort quand le premier tirage parcourt les `n` cases d'une
 * liste pondérée. Les poids se lisent directement : un élément de poids 3 sort 3 fois.
 */
export function poidsObserves<T>(n: number, tirer: (hasard: Hasard) => T, cle: (x: T) => string) {
  const poids = new Map<string, number>();
  for (let k = 0; k < n; k++) {
    const sortie = cle(tirer(hasardScripte([(k + 0.5) / n])));
    poids.set(sortie, (poids.get(sortie) ?? 0) + 1);
  }
  return poids;
}
