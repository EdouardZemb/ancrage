import { canonique } from '../cartes/reponses.js';
import type { PhraseATrous, QuestionAChoix } from '../contenu/modele.js';
import { type Hasard, melanger } from '../hasard.js';

/*
 * Les règles de correction des feuilles (F1-D4, F1-D5, F1-D7). Le domaine parle en codes pour le
 * vrai/faux ; le client affiche les libellés.
 */

/** Les deux réponses d'une affirmation (F1-D7). */
export const VRAI = 'vrai';
export const FAUX = 'faux';

/** La forme comparée d'une saisie d'orthographe : NFC, espaces de bord retirés, internes réduits. */
function formeOrthographe(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * `orthographe` (F1-D4) : la casse et les accents comptent ; seuls la forme Unicode et les espaces
 * ne comptent pas. L'analyse du contenu compare de la même façon.
 */
export function egalOrthographe(saisie: string, attendue: string): boolean {
  return formeOrthographe(saisie) === formeOrthographe(attendue);
}

/**
 * Un trou (F1-D4). Sans liste, la saisie est tapée et se compare comme une carte (`canonique`) ;
 * avec une liste, elle est choisie et doit être l'option exacte.
 */
export function trouJuste(saisie: string, attendue: string, avecListe: boolean): boolean {
  return avecListe ? saisie === attendue : canonique(saisie) === canonique(attendue);
}

/** Une phrase est juste si tous ses trous le sont (F1-D5) ; un nombre de saisies différent du nombre de trous la rend fausse. */
export function phraseJuste(
  saisies: readonly string[],
  phrase: PhraseATrous,
  avecListe: boolean,
): boolean {
  return (
    saisies.length === phrase.reponses.length &&
    phrase.reponses.every((attendue, rang) => trouJuste(saisies[rang], attendue, avecListe))
  );
}

/** Les options d'un QCM : la réponse et les 3 distracteurs, mélangés. */
export function optionsDeQcm(question: QuestionAChoix, hasard: Hasard): string[] {
  return melanger([question.reponse, ...question.distracteurs], hasard);
}
