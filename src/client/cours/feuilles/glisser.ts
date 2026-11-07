/*
 * Le calcul du glisser-déposer des feuilles (F1, ancrage-donnees#90), sans DOM : la cible sous un point, et les
 * termes posés. Un appariement n'a qu'un terme par case ; un classement en reçoit plusieurs par zone.
 */

/** Le cadre d'une cible à l'écran, en pixels, comme `getBoundingClientRect`. Les bords en sont. */
export interface Cadre {
  gauche: number;
  haut: number;
  droite: number;
  bas: number;
}

/** Les termes posés : l'identifiant du terme, vers sa cible (appariement) ou sa catégorie. */
export type Placements = ReadonlyMap<string, string>;

/** En dessous de ce déplacement, en pixels, le geste est un toucher, pas un glisser. */
export const SEUIL_DE_GLISSER = 8;

/** La cible dont le cadre contient le point, ou `null` hors de toutes. */
export function cibleSous(
  x: number,
  y: number,
  cibles: readonly { id: string; cadre: Cadre }[],
): string | null {
  const trouvee = cibles.find(
    ({ cadre }) => x >= cadre.gauche && x <= cadre.droite && y >= cadre.haut && y <= cadre.bas,
  );
  return trouvee?.id ?? null;
}

/**
 * Le terme posé sur la cible, d'où qu'il vienne. Avec `unique` (appariement), le terme qui occupait
 * la cible retourne dans la réserve. L'entrée n'est pas touchée.
 */
export function placer(
  placements: Placements,
  terme: string,
  cible: string,
  unique: boolean,
): Placements {
  const suivants = new Map(placements);
  if (unique) {
    for (const [autre, sa] of placements) if (sa === cible) suivants.delete(autre);
  }
  suivants.set(terme, cible);
  return suivants;
}

/** Le terme rendu à la réserve. L'entrée n'est pas touchée. */
export function retirer(placements: Placements, terme: string): Placements {
  const suivants = new Map(placements);
  suivants.delete(terme);
  return suivants;
}
