import { canonique } from './cartes/reponses.js';

/*
 * La correction d'une saisie, reprise du prototype (`lev`, `judge`, `strictEq`) sans changer son
 * comportement (ADR-0005).
 */

/** `lev` : la distance de Levenshtein entre deux chaînes. */
export function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

export interface Jugement {
  juste: boolean;
  /** Fausse de peu : une faute de frappe, pas une autre réponse. Jamais vrai si `juste`. */
  presque: boolean;
}

/** `judge` : la saisie est-elle l'une des réponses acceptées, ou presque ? */
export function juger(saisie: string, acceptees: ReadonlySet<string>): Jugement {
  const g = canonique(saisie);
  if (g && acceptees.has(g)) return { juste: true, presque: false };
  const meilleure = Math.min(...[...acceptees].map((x) => distance(g, x)));
  return { juste: false, presque: g.length >= 4 && meilleure <= (g.length > 9 ? 2 : 1) };
}

/** `strictEq` : égalité à la casse, aux espaces et à la forme Unicode près, rien d'autre. */
export function egalStrict(a: string, b: string): boolean {
  const forme = (s: string): string => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  return forme(a) === forme(b);
}
