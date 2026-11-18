/*
 * Les rebelles que « Heute » ne pose plus aujourd'hui (M6, T2-D3). Le journal dit ceux qui ont une
 * réponse du jour ; l'onglet tient en plus ceux auxquels il a lui-même fait répondre, car la réponse
 * peut n'être pas encore au journal, ou n'y entrer jamais si son écriture échoue. Cet ensemble vaut
 * pour un jour : il vit dans l'état de l'onglet, avec le jour qu'il concerne, et se perd au
 * rechargement de la page, où le journal fait foi.
 */

/** La clé de la mémoire des onglets : une sous-clé de « Heute », sans prédicat de séance. */
export const CLE_REBELLES_REPONDUS = 'heute/rebelles';

export interface RebellesRepondus {
  /** Le jour que concerne cet ensemble. */
  jour: string;
  ids: readonly string[];
}

/** Les écartés du moment : ceux du journal, et ceux que l'onglet a notés aujourd'hui. */
export function ecartesDuMoment(
  duJournal: ReadonlySet<string>,
  repondus: RebellesRepondus,
  aujourdhui: string,
): ReadonlySet<string> {
  return repondus.jour === aujourdhui && repondus.ids.length > 0
    ? new Set([...duJournal, ...repondus.ids])
    : duJournal;
}

/** L'ensemble de l'onglet avec un rebelle de plus, répondu `aujourdhui` ; un autre jour repart à zéro. */
export function avecRepondu(
  repondus: RebellesRepondus,
  id: string,
  aujourdhui: string,
): RebellesRepondus {
  const avant = repondus.jour === aujourdhui ? repondus.ids : [];
  return { jour: aujourdhui, ids: avant.includes(id) ? avant : [...avant, id] };
}
