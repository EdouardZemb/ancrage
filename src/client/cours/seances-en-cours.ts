/*
 * Ce qui fait d'un état d'onglet une séance en cours (2a-D3). Les formes sont structurelles et
 * minimales : les types des onglets ne sont pas importés.
 */

/** Quiz, Wörter, Schemata, Übungen : au moins une réponse. Ces séries n'ont pas de fin. */
export function serieCommencee(s: { faites: number }): boolean {
  return s.faites > 0;
}

/** Karteikarten : au moins une carte faite, et la file n'est pas vide. */
export function cartesEnCours(s: {
  seance: { faites: number; file: readonly unknown[] };
}): boolean {
  return s.seance.faites > 0 && s.seance.file.length > 0;
}

/**
 * « Heute » : la file n'est pas vide, et une réponse a été comptée ou attend sa suite. La file
 * n'avance qu'à la suite : sans `repondue`, la séance ne serait pas en cours pendant le verdict de
 * la première réponse.
 */
export function heuteEnCours(s: {
  seance: { faites: number; file: readonly unknown[] };
  repondue: boolean | null;
}): boolean {
  return s.seance.file.length > 0 && (s.seance.faites > 0 || s.repondue !== null);
}

/** Prüfung : un passage commencé et pas remis. */
export function examenEnCours(p: { resultat: unknown } | null): boolean {
  return p !== null && p.resultat === null;
}

/** Arbeitsblätter : au moins une réponse, et une tâche qui reste. */
export function feuilleEnCours(
  d: { resultats: Record<string, boolean>; rang: number } | null,
  nombreDeTaches: number,
): boolean {
  return d !== null && Object.keys(d.resultats).length > 0 && d.rang < nombreDeTaches;
}

/**
 * Arbeitsblätter, une tâche (2b-D5) : au moins un élément dont l'état n'est plus celui qu'il a
 * reçu (`initiaux`), à la valeur près. Un élément revenu à son état initial (une case vidée, un
 * terme rendu à la réserve) ne compte plus. Elle couvre la saisie qu'aucune réponse ne garde
 * encore : une tâche jugée d'un coup par « Prüfen », avant ce clic.
 */
export function tacheEntamee(
  etats: Readonly<Record<string, unknown>>,
  initiaux: Readonly<Record<string, unknown>>,
): boolean {
  return Object.keys(etats).some((id) => !memeValeur(etats[id], initiaux[id]));
}

/** Deux états égaux, à la valeur près : des valeurs simples, des tableaux et des objets. */
function memeValeur(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const gauche = a as Record<string, unknown>;
  const droite = b as Record<string, unknown>;
  const cles = Object.keys(gauche);
  return (
    cles.length === Object.keys(droite).length &&
    cles.every((cle) => Object.hasOwn(droite, cle) && memeValeur(gauche[cle], droite[cle]))
  );
}

/** Berichte : au moins une réponse (terme ou question), et pas encore le bilan. */
export function texteEnCours(
  l: { phase: string; resultats: readonly unknown[]; reponses: readonly unknown[] } | null,
): boolean {
  return l !== null && l.phase !== 'bilan' && (l.resultats.length > 0 || l.reponses.length > 0);
}
