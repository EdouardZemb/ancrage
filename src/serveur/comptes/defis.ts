/*
 * Les défis des cérémonies WebAuthn (décision 9) : gardés en mémoire seulement, 5 minutes au plus,
 * et à usage unique. Un redémarrage annule les cérémonies en cours, ce qui est acceptable : la
 * personne recommence.
 */

const DUREE_DEFI_MS = 5 * 60 * 1000;
// Les options s'obtiennent sans compte : sans plafond, un client pourrait remplir la mémoire. Plein,
// le magasin oublie le défi le plus ancien.
const CAPACITE_PAR_DEFAUT = 10_000;

export interface MagasinDefis<T> {
  /** Garde le défi sous cette clé pour 5 minutes. */
  poser(cle: string, defi: T): void;
  /** Rend le défi et l'oublie : un second appel rend `undefined`, comme un défi périmé. */
  prendre(cle: string): T | undefined;
  /** Oublie les défis périmés. */
  nettoyer(): void;
}

export function creerMagasinDefis<T>(
  horloge: () => Date,
  capacite: number = CAPACITE_PAR_DEFAUT,
): MagasinDefis<T> {
  const defis = new Map<string, { defi: T; expireLe: number }>();
  const perime = (expireLe: number) => horloge().getTime() >= expireLe;

  function nettoyer(): void {
    // L'ordre d'insertion est celui des expirations : on s'arrête au premier défi encore valable.
    for (const [cle, { expireLe }] of defis) {
      if (!perime(expireLe)) {
        return;
      }
      defis.delete(cle);
    }
  }

  return {
    poser(cle, defi) {
      nettoyer();
      defis.delete(cle);
      for (const plusAncien of defis.keys()) {
        if (defis.size < capacite) {
          break;
        }
        defis.delete(plusAncien);
      }
      defis.set(cle, { defi, expireLe: horloge().getTime() + DUREE_DEFI_MS });
    },

    prendre(cle) {
      const entree = defis.get(cle);
      if (entree === undefined) {
        return undefined;
      }
      defis.delete(cle);
      return perime(entree.expireLe) ? undefined : entree.defi;
    },

    nettoyer,
  };
}
