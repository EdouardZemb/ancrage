/*
 * La séance en cours : l'écran du cours déclare ici s'il y en a une, et de quel genre (2a-D3) ;
 * l'écran du compte aussi, le temps d'une opération (2b-D5). Le moment d'une mise à jour de
 * l'application s'en sert pour ne jamais tomber en pleine séance (2a-D4).
 */

/**
 * Le genre d'une séance en cours.
 * - `journalisee` : ses réponses vont au journal à mesure (les séries, les cartes, une fiche), et
 *   une absence longue l'abandonne (2a-D4).
 * - `retenue` : ses réponses n'y vont qu'à la fin (la Prüfung à sa remise, un Bericht à son bilan),
 *   et rien ne l'abandonne, car on les perdrait toutes. Une déconnexion ou une suppression du
 *   compte en cours l'est aussi (2b-D5) : un rechargement la couperait.
 */
export type Seance = 'journalisee' | 'retenue';

const sources = new Set<() => Seance | null>();

/** Déclare une source de séance, qui dit la séance en cours ou `null` ; rend son retrait. */
export function declarerSeance(source: () => Seance | null): () => void {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
}

/**
 * La séance que disent les sources déclarées, `null` sans séance. Une séance `retenue` l'emporte
 * sur une `journalisee` : toutes les sources sont lues tant qu'aucune ne dit `retenue`.
 */
export function seanceEnCours(): Seance | null {
  let seance: Seance | null = null;
  for (const source of sources) {
    const lue = source();
    if (lue === 'retenue') return lue;
    if (lue !== null) seance = lue;
  }
  return seance;
}
