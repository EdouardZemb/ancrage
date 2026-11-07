/*
 * Le type d'appareil, grossier, tiré du User-Agent : c'est tout ce qu'on garde d'une session ou
 * d'une passkey pour que la personne les reconnaisse. Le User-Agent lui-même n'est jamais stocké
 * (ADR-0007 §1).
 */

export type TypeAppareil = 'Android' | 'iPhone' | 'iPad' | 'Windows' | 'Mac' | 'Linux' | 'autre';

// L'ordre compte : un User-Agent Android contient « Linux », et ceux de l'iPhone et de l'iPad
// « Mac OS X ». Un iPad récent en mode bureau se présente comme un Mac : il sera « Mac ».
const RECONNAISSANCES: readonly [RegExp, TypeAppareil][] = [
  [/Android/, 'Android'],
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Windows/, 'Windows'],
  [/Macintosh/, 'Mac'],
  [/Linux/, 'Linux'],
];

export function typeAppareil(userAgent: string | undefined): TypeAppareil {
  if (userAgent === undefined) {
    return 'autre';
  }
  for (const [motif, type] of RECONNAISSANCES) {
    if (motif.test(userAgent)) {
      return type;
    }
  }
  return 'autre';
}
