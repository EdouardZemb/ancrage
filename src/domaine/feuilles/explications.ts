import type { PaireAppariee, PhraseATrous, QuestionAChoix } from '../contenu/modele.js';

/*
 * La règle des explications d'une fiche (lot M10) : ce qui se montre après tel choix, les lignes
 * d'« Ergebnis ». Une fonction pure, mutée (M10-D4). Les champs se lisent sans rigueur, comme `aide` :
 * une valeur qui n'est pas un texte ne bloque rien, elle ne montre rien.
 */

/** Un élément qui peut porter une explication (M10-C1). */
export type ElementExplique = QuestionAChoix | PhraseATrous | PaireAppariee;

/** Ce que montre une question après un choix : le choix d'abord, puis la bonne réponse (M10-C7). */
export interface ExplicationsDuChoix {
  choix?: string;
  reponse?: string;
}

export interface ExplicationDeDistracteur {
  distracteur: string;
  texte: string;
}

/** Ce que montre une ligne d'« Ergebnis » (M10-C5). */
export interface ExplicationsDErgebnis {
  reponse?: string;
  /** Dans l'ordre de `distracteurs`, seulement après une dernière réponse fausse. */
  distracteurs: ExplicationDeDistracteur[];
}

function texteNonVide(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur : undefined;
}

/** L'explication de l'élément : un texte qui n'est pas fait que d'espaces, sinon rien. */
export function explicationDe(element: ElementExplique): string | undefined {
  return texteNonVide(element.explication);
}

/**
 * L'explication du distracteur `choisi`, lue sans rigueur (M10-C2) : `choisi` est l'un des
 * `distracteurs`, `explicationsDistracteurs` est un objet (`typeof … === 'object'`), non nul, qui
 * n'est pas une liste (une liste et un texte ont des clés propres : `'x'` a la clé `0`), la clé est
 * propre (`Object.hasOwn`), et sa valeur est un texte qui n'est pas fait que d'espaces.
 */
export function explicationDuDistracteur(
  question: QuestionAChoix,
  choisi: string,
): string | undefined {
  if (!question.distracteurs.includes(choisi)) return undefined;
  const objet: unknown = question.explicationsDistracteurs;
  if (typeof objet !== 'object' || objet === null || Array.isArray(objet)) return undefined;
  if (!Object.hasOwn(objet, choisi)) return undefined;
  return texteNonVide((objet as Record<string, unknown>)[choisi]);
}

/**
 * Après le choix `choisi` : l'explication du distracteur choisi, toujours ; celle de la bonne
 * réponse si `montrerLaReponse` (l'appelant passe `montrerLAide(rebelle, juste)`, M10-C5).
 * `undefined` s'il n'y a rien ; une clé absente plutôt qu'`undefined`.
 */
export function explicationsApresLeChoix(
  question: QuestionAChoix,
  choisi: string,
  montrerLaReponse: boolean,
): ExplicationsDuChoix | undefined {
  const resultat: ExplicationsDuChoix = {};
  const choix = explicationDuDistracteur(question, choisi);
  if (choix !== undefined) resultat.choix = choix;
  const reponse = montrerLaReponse ? explicationDe(question) : undefined;
  if (reponse !== undefined) resultat.reponse = reponse;
  return Object.keys(resultat).length > 0 ? resultat : undefined;
}

/**
 * La ligne d'« Ergebnis » : l'explication de l'élément, toujours ; celles des distracteurs d'une
 * question quand la dernière réponse est fausse (`derniere?.juste === false`). `undefined` s'il
 * n'y a rien.
 */
export function explicationsDErgebnis(
  element: ElementExplique,
  derniere: { juste: boolean } | null,
): ExplicationsDErgebnis | undefined {
  const distracteurs: ExplicationDeDistracteur[] = [];
  if (
    derniere?.juste === false &&
    'distracteurs' in element &&
    Array.isArray(element.distracteurs)
  ) {
    for (const distracteur of element.distracteurs) {
      const texte = explicationDuDistracteur(element, distracteur);
      if (texte !== undefined) distracteurs.push({ distracteur, texte });
    }
  }
  const reponse = explicationDe(element);
  if (reponse === undefined && distracteurs.length === 0) return undefined;
  return reponse === undefined ? { distracteurs } : { reponse, distracteurs };
}
