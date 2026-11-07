/*
 * L'identifiant d'utilisateur de WebAuthn (le `userHandle`) : l'identifiant opaque de la personne,
 * en UTF-8. Le serveur le pose à la création de la passkey et le compare à la connexion ;
 * le client le signale au téléphone par l'API Signal. Les deux encodent par cette seule fonction :
 * un encodage écrit deux fois finirait par diverger, et le téléphone garderait des passkeys que le
 * serveur ne reconnaît plus.
 *
 * Ce module est pur : ni le navigateur ni Node n'y entrent, seulement `TextEncoder`, que les deux
 * fournissent.
 */

/** Les octets de l'identifiant de la personne : son UTF-8. Chacun en tire sa forme (base64url…). */
export function octetsDeLIdentifiant(personne: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(personne);
}
