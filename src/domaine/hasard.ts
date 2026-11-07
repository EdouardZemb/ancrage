/*
 * Le hasard des séances, repris du prototype (`rnd`, `shuffle`, `uniqBy`, H:1514-1516) sans
 * changer son comportement. Toute fonction de tirage reçoit son `hasard` (décision 21) : en
 * production, `Math.random` ; en test, `hasardDeterministe(graine)`.
 */

/** Un tirage dans [0, 1[, comme `Math.random`. */
export type Hasard = () => number;

/** `rnd` : un entier de 0 à `n` - 1. */
export function entier(n: number, hasard: Hasard): number {
  return Math.floor(hasard() * n);
}

/** `shuffle` : une copie mélangée (Fisher-Yates, de la fin au début). L'entrée n'est pas touchée. */
export function melanger<T>(t: readonly T[], hasard: Hasard): T[] {
  const copie = t.slice();
  for (let i = copie.length - 1; i > 0; i--) {
    const j = entier(i + 1, hasard);
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** `uniqBy` : le premier élément de chaque clé, dans l'ordre. */
export function uniquesPar<T>(t: readonly T[], cle: (x: T) => string): T[] {
  const vues = new Set<string>();
  return t.filter((x) => {
    const k = cle(x);
    if (vues.has(k)) return false;
    vues.add(k);
    return true;
  });
}

/**
 * Tire un élément selon son poids, comme le prototype : chaque élément est répété `poids` fois
 * dans une liste, et un seul tirage choisit une case. Un élément de poids 3 sort donc trois fois
 * plus souvent qu'un élément de poids 1. Les poids sont des entiers positifs ; un poids nul écarte
 * l'élément.
 *
 * @throws RangeError s'il n'y a aucun élément à tirer.
 */
export function tirerPondere<T>(
  elements: readonly T[],
  poids: (x: T) => number,
  hasard: Hasard,
): T {
  const cases = elements.flatMap((x) => Array.from({ length: poids(x) }, () => x));
  if (cases.length === 0) throw new RangeError('Aucun élément à tirer.');
  return cases[entier(cases.length, hasard)];
}

/**
 * Un hasard répétable pour les tests : mulberry32, un générateur de 32 bits. La même graine rend la
 * même suite de nombres dans [0, 1[.
 */
export function hasardDeterministe(graine: number): Hasard {
  let etat = graine | 0;
  return () => {
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
