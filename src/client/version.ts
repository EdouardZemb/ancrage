import type { ReponseSante } from '../domaine/sante.js';
import { formater } from './cours/textes-cours.js';

/** La révision du code que ce téléphone fait tourner, posée à la construction (`REVISION`). */
export const REVISION_CLIENT: string = __ANCRAGE_REVISION__;

/**
 * Le texte du pied de page : `environnement · version · révision`, lus sur le serveur. Quand le code
 * du téléphone n'est pas celui du serveur, on y ajoute la révision du téléphone (2a-D5).
 * `libelleAppareil` est le modèle `version_appareil`, avec son repère `{revision}`.
 */
export function texteDeVersion(
  sante: ReponseSante,
  revisionClient: string,
  libelleAppareil: string,
): string {
  const texte = `${sante.environnement} · ${sante.version} · ${sante.revision.slice(0, 7)}`;
  if (revisionClient === sante.revision) {
    return texte;
  }
  return `${texte} · ${formater(libelleAppareil, { revision: revisionClient.slice(0, 7) })}`;
}
