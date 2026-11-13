/*
 * Ce que chaque onglet d'un cours reçoit (`useCours`) : le cours préparé, ses libellés, le journal
 * et l'état qui en dérive, de quoi enregistrer une réponse ou un examen, les préférences, le hasard
 * des tirages et la navigation entre onglets. `EcranCours` le fournit ; un test d'onglet fournit le
 * sien (`contexte-cours.fixture.tsx`).
 */
import { createContext } from 'preact';
import { useCallback, useContext, useState } from 'preact/hooks';
import type { CoursPrepare, Onglet } from '../../domaine/cours/prepare.js';
import type { Hasard } from '../../domaine/hasard.js';
import type { Evenement, ModeDeReponse, ResultatExamen } from '../../domaine/journal/evenement.js';
import type { EtatUnite } from '../../domaine/progression/etat.js';
import type { Seance } from '../seance.js';
import type { Preferences } from './preferences.js';
import type { CleTexteCours } from './textes-cours.js';

export interface ContexteCours {
  cours: CoursPrepare;
  /** Les libellés dans la langue du cours (décision 3). */
  t: Record<CleTexteCours, string>;
  /** Le journal de la personne dans ce cours, sans doublon, dans l'ordre du journal. */
  evenements: readonly Evenement[];
  etats: ReadonlyMap<string, EtatUnite>;
  /** Le jour local de l'appareil, `AAAA-MM-JJ`. */
  aujourdhui: string;
  /**
   * Journalise une réponse à une unité (décision 8). Elle ne rejette jamais : `false` si
   * l'appareil n'a pas pu la ranger (l'écran le signale), et l'onglet continue comme si de rien
   * n'était.
   */
  enregistrer(unite: string, juste: boolean, mode: ModeDeReponse): Promise<boolean>;
  /**
   * Journalise un examen remis : une réponse par question, puis l'examen (décision 8). Comme
   * `enregistrer`, `false` si le rangement a échoué.
   */
  enregistrerExamen(
    resultat: ResultatExamen,
    reponses: readonly { unite: string; juste: boolean; mode: ModeDeReponse }[],
  ): Promise<boolean>;
  /** La fin d'une série de cartes, la remise d'un examen : déclenche une synchronisation (décision 15). */
  finDeSeance(): void;
  preferences: Preferences;
  changerPreferences(p: Preferences): void;
  hasard: Hasard;
  /** Ouvre un autre onglet du cours. */
  aller(onglet: Onglet): void;
  /**
   * L'état d'un onglet (sa série, sa question, son examen en cours), qui survit au changement
   * d'onglet comme les variables du prototype (`session`, `quiz`, H:1699) : la valeur de `cle`
   * est gardée par l'écran du cours, `initial` ne sert qu'à la première fois. Une clé par onglet.
   * L'écran du cours remet la mémoire à zéro quand le cours ou son contenu change ; les réglages
   * et les préférences, eux, ne passent pas par là. `enCours`, s'il est donné, dit si l'état est
   * une séance en cours (2a-D3) : l'écran du cours le déclare tant qu'il est vrai, du genre
   * `seance` (`journalisee` par défaut ; `retenue` si ses réponses ne vont au journal qu'à la fin).
   */
  useEtatDOnglet<T>(
    cle: string,
    initial: () => T,
    enCours?: (etat: T) => boolean,
    seance?: Seance,
  ): [T, (suivant: T) => void];
  /**
   * Oublie l'état gardé sous `cle` : l'onglet qui s'ouvre ensuite repart de son `initial`. Les
   * actions du prototype qui remettaient `session` ou `quiz` à `null` (« Lernen », H:1738, et
   * « Zum Quiz », H:1766) l'appellent avant d'ouvrir l'onglet. Les sous-clés de `cle` (`cle/…`)
   * sont oubliées avec elle.
   */
  oublierEtatDOnglet(cle: string): void;
}

/**
 * Le `useEtatDOnglet` d'une mémoire : une table par écran de cours. Écrire une valeur la range
 * et redessine l'onglet qui l'a écrite.
 */
export function etatDOngletSur(
  memoire: Map<string, unknown>,
  predicats: PredicatsDeSeance = new Map(),
): ContexteCours['useEtatDOnglet'] {
  return function useEtatDOnglet<T>(
    cle: string,
    initial: () => T,
    enCours?: (etat: T) => boolean,
    seance: Seance = 'journalisee',
  ): [T, (suivant: T) => void] {
    const [, redessiner] = useState(0);
    if (!memoire.has(cle)) memoire.set(cle, initial());
    // Le prédicat du moment : il ferme sur le cours et le contenu courants.
    if (enCours !== undefined) {
      predicats.set(cle, { enCours: enCours as (etat: unknown) => boolean, seance });
    }
    const ecrire = useCallback(
      (suivant: T) => {
        memoire.set(cle, suivant);
        redessiner((n) => n + 1);
      },
      [memoire, cle],
    );
    return [memoire.get(cle) as T, ecrire];
  };
}

/** Les prédicats de séance des onglets, par clé de mémoire, avec le genre de leur séance. */
export type PredicatsDeSeance = Map<
  string,
  { enCours: (etat: unknown) => boolean; seance: Seance }
>;

/**
 * La séance en cours dans la mémoire : celle des états qui satisfont le prédicat de leur clé, `null`
 * s'il n'y en a pas. Une séance `retenue` l'emporte sur une `journalisee`.
 */
export function seanceDansLaMemoire(
  memoire: Map<string, unknown>,
  predicats: PredicatsDeSeance,
): Seance | null {
  let trouvee: Seance | null = null;
  for (const [cle, { enCours, seance }] of predicats) {
    if (!memoire.has(cle) || !enCours(memoire.get(cle))) continue;
    if (seance === 'retenue') return seance;
    trouvee = seance;
  }
  return trouvee;
}

export const ContexteDuCours = createContext<ContexteCours | undefined>(undefined);

export function useCours(): ContexteCours {
  const contexte = useContext(ContexteDuCours);
  if (contexte === undefined) {
    throw new Error("useCours : l'onglet est affiché hors d'un cours");
  }
  return contexte;
}

/**
 * La clé de la séance de cartes imposée par un examen (« Fehler als Karteikarten üben »). C'est une
 * sous-clé de `'cartes'` : oublier la série des cartes oublie aussi cette séance, si bien que
 * « Lernen » repart du chapitre choisi et non des erreurs du dernier examen.
 */
export const CLE_SEANCE_IMPOSEE = 'cartes/imposee';

/**
 * Le `oublierEtatDOnglet` d'une mémoire : retire la clé, que personne ne l'ait écrite ou non, et
 * ses sous-clés (`cle/…`), qui n'ont de sens qu'avec elle, avec leurs prédicats de séance.
 */
export function oubliDOngletSur(
  memoire: Map<string, unknown>,
  predicats: PredicatsDeSeance = new Map(),
): ContexteCours['oublierEtatDOnglet'] {
  return (cle) => {
    memoire.delete(cle);
    predicats.delete(cle);
    for (const autre of [...memoire.keys(), ...predicats.keys()]) {
      if (autre.startsWith(`${cle}/`)) {
        memoire.delete(autre);
        predicats.delete(autre);
      }
    }
  };
}
