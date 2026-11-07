import type { ElementDeFeuille, PartieDeFeuille, Tache } from './modele.js';

/*
 * Ce que le serveur et le client lisent d'une feuille : ses trous et ses éléments. Le client reçoit
 * aussi des feuilles servies par une version suivante, dont une tâche peut être d'un genre qu'il ne
 * connaît pas (F1-D11) : il l'ignore, sans planter.
 */

/** La marque d'un trou dans le texte d'une phrase : trois tirets bas (F1-D5). */
export const MARQUE_DE_TROU = '___';

/** Les morceaux du texte autour de ses trous : n + 1 morceaux pour n trous, vides compris. */
export function morceauxDePhrase(texte: string): string[] {
  return texte.split(MARQUE_DE_TROU);
}

/** Les éléments d'une tâche, ce qui reçoit une réponse, dans l'ordre du papier. */
export function elementsDeTache(tache: Tache): readonly ElementDeFeuille[] {
  switch (tache.genre) {
    case 'appariement':
      return tache.paires;
    case 'classement':
      return tache.elements;
    case 'qcm':
      return tache.questions;
    case 'vrai-faux':
      return tache.affirmations;
    case 'trous':
      return tache.phrases;
    case 'orthographe':
      return tache.mots;
    case 'ouverte':
      return tache.questions;
    default: {
      // Un nouveau genre doit dire ici où sont ses éléments : `pnpm types` échoue tant que ce n'est
      // pas fait. Une tâche d'un genre inconnu, servie par une version suivante, n'en a aucun.
      const _exhaustif: never = tache;
      return [];
    }
  }
}

export function idsDeTache(tache: Tache): string[] {
  return elementsDeTache(tache).map((element) => element.id);
}

/** Les identifiants des éléments de la feuille, dans l'ordre du papier : ni ses tâches, ni elle. */
export function idsDeFeuille(feuille: { parties: readonly PartieDeFeuille[] }): string[] {
  return feuille.parties.flatMap((partie) => partie.taches.flatMap(idsDeTache));
}
