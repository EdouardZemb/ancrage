/*
 * Les jetons secrets des sessions et des liens. Le jeton ne vit que chez la personne (cookie,
 * lien) ; la base n'en garde que l'empreinte, et c'est elle qu'on compare.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const OCTETS_PAR_JETON = 32;

/** Un jeton de 256 bits tirés au hasard, en base64url (43 caractères). */
export function nouveauJeton(): string {
  return randomBytes(OCTETS_PAR_JETON).toString('base64url');
}

/** L'empreinte SHA-256 du jeton, en hexadécimal : la seule forme stockée. */
export function empreinte(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}

/** Compare deux empreintes en temps constant. Faux si leurs longueurs diffèrent. */
export function memeEmpreinte(a: string, b: string): boolean {
  const octetsA = Buffer.from(a, 'utf8');
  const octetsB = Buffer.from(b, 'utf8');
  return octetsA.length === octetsB.length && timingSafeEqual(octetsA, octetsB);
}
