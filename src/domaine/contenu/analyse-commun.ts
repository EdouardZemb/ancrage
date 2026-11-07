import type { ErreurContenu } from './erreurs.js';
import type { Etat, Statut } from './modele.js';
import type { ModuleEcrit } from './schemas.js';

/** Ce que les résolutions de module partagent : l'analyse en cours et les aides communes. */
export type Ecrit<T extends ModuleEcrit['type']> = Extract<ModuleEcrit, { type: T }>;

export interface Analyse {
  fichiers: ReadonlyMap<string, string>;
  erreurs: ErreurContenu[];
  identifiants: Map<string, string>;
  /**
   * Faux dès qu'un fichier qui porte des identifiants manque ou n'a pas pu être lu. Le verrou
   * n'est alors pas confronté au contenu : chaque identifiant non relevé y paraîtrait disparu.
   */
  complet: boolean;
}

export function signaler(analyse: Analyse, fichier: string, lieu: string, message: string): void {
  analyse.erreurs.push({ fichier, lieu, message });
}

/** Un identifiant est unique dans tout le dossier de contenu. */
export function noterIdentifiant(
  analyse: Analyse,
  id: string,
  fichier: string,
  lieu: string,
): void {
  const emplacement = `${fichier}:${lieu}`;
  const premier = analyse.identifiants.get(id);
  if (premier === undefined) {
    analyse.identifiants.set(id, emplacement);
  } else {
    signaler(
      analyse,
      fichier,
      lieu,
      `Identifiant ${id} en double : il figure en ${premier} et en ${emplacement}.`,
    );
  }
}

export function etatPropre(statut: Statut, verifieLe: string | undefined): Etat {
  return verifieLe === undefined ? { statut } : { statut, verifieLe };
}

/** Un élément sans `statut` prend l'état de son parent. */
export function etatHerite(ecrit: { statut?: Statut; verifie_le?: string }, parent: Etat): Etat {
  return ecrit.statut === undefined ? parent : etatPropre(ecrit.statut, ecrit.verifie_le);
}

/** Signale chaque valeur déjà vue, en citant le lieu de sa première occurrence. */
export function signalerDoublons(
  analyse: Analyse,
  fichier: string,
  valeurs: readonly string[],
  lieu: (rang: number) => string,
  nom: string,
): void {
  const premiers = new Map<string, number>();
  valeurs.forEach((valeur, rang) => {
    const premier = premiers.get(valeur);
    if (premier === undefined) premiers.set(valeur, rang);
    else signaler(analyse, fichier, lieu(rang), `${nom} en double : déjà en ${lieu(premier)}.`);
  });
}

export function aDesDoublons(valeurs: readonly string[]): boolean {
  return new Set(valeurs).size !== valeurs.length;
}

/** Les distracteurs d'une question à choix sont distincts, et aucun n'est égal à la réponse. */
export function controlerDistracteurs(
  analyse: Analyse,
  fichier: string,
  question: { reponse: string; distracteurs: readonly string[] },
  lieu: string,
): void {
  if (aDesDoublons(question.distracteurs)) {
    signaler(analyse, fichier, `${lieu}.distracteurs`, 'Distracteurs en double.');
  }
  if (question.distracteurs.includes(question.reponse)) {
    signaler(analyse, fichier, `${lieu}.distracteurs`, 'Un distracteur est égal à la réponse.');
  }
}
