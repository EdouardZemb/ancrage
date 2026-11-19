import { MODES_DE_REVISION } from '../../domaine/journal/evenement.js';

/*
 * Les cases d'un découpage des mesures (M3, M7) : des comptes, jamais de texte. Séparées de
 * `mesures.ts` pour que `reprises.ts` et `mesures.ts` ne s'importent pas l'un l'autre.
 */

/** Une case d'un découpage : de combien de réponses, dont combien de justes. */
export interface Cellule {
  reponses: number;
  justes: number;
}

/** Les modes d'une révision, puis les réponses qui n'en portent pas : jamais `pretest` (B-D9). */
export const CLES_DE_MODE = [...MODES_DE_REVISION, 'sans-mode'] as const;
export type CleDeMode = (typeof CLES_DE_MODE)[number];

export const celluleVide = (): Cellule => ({ reponses: 0, justes: 0 });

/** Une case vide par clé. */
export function cellules<T extends string>(cles: readonly T[]): Record<T, Cellule> {
  return Object.fromEntries(cles.map((cle) => [cle, celluleVide()])) as Record<T, Cellule>;
}

/** Ajoute une réponse à la case. */
export function compter(cible: Cellule, juste: boolean): void {
  cible.reponses += 1;
  if (juste) cible.justes += 1;
}

/** Ajoute les comptes de `source` à `cible`. */
export function ajouterCellule(cible: Cellule, source: Cellule): void {
  cible.reponses += source.reponses;
  cible.justes += source.justes;
}
