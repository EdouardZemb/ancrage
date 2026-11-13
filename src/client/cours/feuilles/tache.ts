/*
 * Le contrat d'un composant de tâche de l'onglet « Arbeitsblätter » : il reçoit sa tâche, et rend à
 * l'onglet le résultat de chacun de ses éléments, une seule fois, dès que l'élément est jugé (R17).
 * - Un genre qui juge élément par élément (`qcm`, `vrai-faux`, `orthographe`, `ouverte`) rend
 *   chaque élément au moment où il est répondu : une réponse vue est une réponse enregistrée, même
 *   si la personne quitte la fiche, recharge la page ou voit l'application fermée avant la fin.
 * - Un genre jugé d'un coup par « Prüfen » (`trous`, `appariement`, `classement`) rend tous ses
 *   éléments ensemble, à ce clic.
 * L'onglet enregistre chaque résultat reçu, un événement par élément (ADR-0004), et ignore un
 * élément déjà reçu ; il propose la tâche suivante quand tous ses éléments l'ont été.
 */
import type { GenreDeTache, Tache } from '../../../domaine/contenu/modele.js';
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import { useCours } from '../contexte-cours.js';
import { tacheEntamee } from '../seances-en-cours.js';

/** La clé de l'onglet dans la mémoire des onglets ; l'état d'une tâche y est une sous-clé. */
export const CLE_FEUILLES = 'feuilles';

/** La réponse à un élément de la tâche (une question, une affirmation…), sur son identifiant. */
export interface ResultatDElement {
  id: string;
  juste: boolean;
  /** Le geste de la réponse : `choix`, `saisie`, `association` ou `montree`. */
  mode: ModeDeReponse;
}

export interface PropsDeTache<G extends GenreDeTache> {
  tache: Extract<Tache, { genre: G }>;
  onRepondu(resultats: readonly ResultatDElement[]): void;
}

/** L'état de chaque élément d'une tâche, rangé par identifiant d'élément. */
export type EtatsDesElements<T> = Readonly<Record<string, T>>;

/**
 * Les états initiaux des éléments, tels que `initial` les a donnés, pour chaque état de tâche que
 * `useEtatDesElements` construit. La séance se lit en les comparant (2b-D5), sans rappeler
 * `initial`, qui tire au hasard (les options d'une question, l'ordre de la réserve). L'état gardé
 * dans la mémoire des onglets est toujours l'un d'eux : il retrouve ses états initiaux après un
 * détour par un autre onglet. La table est faible : un état oublié l'est aussi d'ici.
 */
const initiauxDes = new WeakMap<object, EtatsDesElements<unknown>>();

/**
 * La tâche est une séance en cours (2b-D5) : un élément au moins n'est plus dans son état initial.
 * Un état dont les états initiaux ne sont pas connus (qu'un autre que ce module aurait écrit)
 * n'en est pas une.
 */
function tacheEnCours(etats: EtatsDesElements<unknown>): boolean {
  const initiaux = initiauxDes.get(etats);
  return initiaux !== undefined && tacheEntamee(etats, initiaux);
}

/**
 * L'état de chaque élément d'une tâche en cours (les options tirées, la réponse donnée…), gardé
 * dans la mémoire des onglets sous `feuilles/<id de la tâche>` : une fiche quittée en route se
 * retrouve telle quelle. L'onglet l'oublie à chaque déroulé qui commence (`oublierEtatDOnglet`).
 *
 * L'état est rangé par identifiant d'élément, jamais par rang : si la tâche reçue change (un élément
 * de plus, de moins, ou à une autre place), chaque élément garde le sien, et un élément nouveau
 * reçoit son `initial`, aussitôt gardé. Les changements d'un même geste s'enchaînent : chacun part
 * de l'état laissé par le précédent (un terme posé qui en déloge un autre).
 *
 * Une tâche entamée est une séance journalisée (2b-D5) : tant qu'un élément n'est plus dans son
 * état initial, la nouvelle version de l'application attend, et la saisie n'est pas perdue. La
 * fiche oublie l'état d'une tâche faite (« Weiter ») : seule la tâche affichée compte.
 */
export function useEtatDesElements<E extends { id: string }, T>(
  tache: Tache,
  elements: readonly E[],
  initial: (element: E) => T,
): [EtatsDesElements<T>, (id: string, etat: T) => void] {
  const { useEtatDOnglet } = useCours();
  const completer = (gardes: EtatsDesElements<T>): EtatsDesElements<T> => {
    const nouveaux = elements.filter(({ id }) => !Object.hasOwn(gardes, id));
    if (nouveaux.length === 0) return gardes;
    const recus = Object.fromEntries(nouveaux.map((e) => [e.id, initial(e)]));
    const completes = { ...gardes, ...recus };
    initiauxDes.set(completes, { ...initiauxDes.get(gardes), ...recus });
    return completes;
  };
  const [gardes, ecrire] = useEtatDOnglet<EtatsDesElements<T>>(
    `${CLE_FEUILLES}/${tache.id}`,
    () => completer({}),
    tacheEnCours,
  );
  const etats = completer(gardes);
  // Un élément nouveau : son état initial est gardé tout de suite, pour rester le même ensuite.
  if (etats !== gardes) ecrire(etats);
  let courants = etats;
  const changer = (id: string, etat: T): void => {
    const initiaux = initiauxDes.get(courants);
    courants = { ...courants, [id]: etat };
    if (initiaux !== undefined) initiauxDes.set(courants, initiaux);
    ecrire(courants);
  };
  return [etats, changer];
}

/**
 * Les résultats de tous les éléments d'une tâche jugée d'un coup (« Prüfen »), dans son ordre, ou
 * `undefined` tant que l'un d'eux attend sa réponse (`juger` rend alors `undefined`). Seuls
 * comptent les éléments de la tâche reçue, quel que soit l'état gardé pour d'autres.
 */
export function resultatsDeTache<E extends { id: string }, T>(
  elements: readonly E[],
  etats: EtatsDesElements<T>,
  juger: (element: E, etat: T) => boolean | undefined,
  mode: ModeDeReponse,
): ResultatDElement[] | undefined {
  const resultats: ResultatDElement[] = [];
  for (const element of elements) {
    const juste = juger(element, etats[element.id]);
    if (juste === undefined) return undefined;
    resultats.push({ id: element.id, juste, mode });
  }
  return resultats;
}
