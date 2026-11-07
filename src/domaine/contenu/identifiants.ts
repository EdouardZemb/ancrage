/** Base 32 de Crockford en minuscules : pas de `i`, `l`, `o` ni `u`, qu'on confond ou qui choquent. */
export const ALPHABET_IDENTIFIANT = '0123456789abcdefghjkmnpqrstvwxyz';

export const FORMAT_IDENTIFIANT = /^[0-9abcdefghjkmnpqrstvwxyz]{8}$/;

/** La règle d'un identifiant, telle que les messages la disent après leur début. */
export const REGLE_IDENTIFIANT = '8 caractères parmi 0-9 et a-z, sans i, l, o ni u';

const LONGUEUR_IDENTIFIANT = 8;

export function estIdentifiant(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && FORMAT_IDENTIFIANT.test(valeur);
}

function octetsAleatoires(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Tire un identifiant opaque de 8 caractères, absent de `dejaPris`.
 * `aleatoire` ne sert qu'aux tests : par défaut, le hasard vient de `crypto.getRandomValues`.
 * Chaque octet donne un caractère par `octet & 31`, sans biais puisque 256 = 8 × 32.
 */
export function nouvelIdentifiant(
  dejaPris: ReadonlySet<string>,
  aleatoire: (n: number) => Uint8Array = octetsAleatoires,
): string {
  for (;;) {
    const octets = aleatoire(LONGUEUR_IDENTIFIANT);
    let id = '';
    for (let i = 0; i < LONGUEUR_IDENTIFIANT; i++) {
      id += ALPHABET_IDENTIFIANT.charAt(octets[i] & 31);
    }
    if (!dejaPris.has(id)) return id;
  }
}
