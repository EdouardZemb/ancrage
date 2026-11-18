/*
 * La question et la réponse d'un posable, telles que la liste des éléments rebelles de Fortschritt
 * les montre (M6, T2-D10) : une seule fonction pour tous les genres, que la liste partage avec les
 * questions par `AideDuRebelle`. L'aide est celle de T2-D8 : l'aide d'une carte et sa confusion,
 * les morceaux d'un mot, la règle d'un exercice, la `correction` d'une affirmation, la `note` d'un
 * schéma.
 */
import {
  type AideDeCarte,
  aideDeLUnite,
  type UniteDeCarte,
} from '../../../domaine/cartes/unites.js';
import { reponseDeLElement } from '../../../domaine/seances/feuilles.js';
import type { Posable } from '../../../domaine/seances/heute.js';
import { libelleDOption } from '../composants-cours.js';
import type { CleTexteCours } from '../textes-cours.js';
import { reponseMontree } from './QuestionDExercice.js';

export interface QuestionEtReponse {
  question: string;
  reponse: string;
  /** Ce qui situe la question : le titre du schéma d'un point. */
  indication?: string;
  aide?: AideDeCarte;
}

const sansAide = (texte: string | undefined): { aide?: AideDeCarte } =>
  texte === undefined || texte.trim() === '' ? {} : { aide: { texte } };

export function questionEtReponse(
  posable: Posable,
  t: Record<CleTexteCours, string>,
  unites: readonly UniteDeCarte[],
): QuestionEtReponse {
  switch (posable.genre) {
    case 'carte': {
      const aide = aideDeLUnite(posable.unite, unites);
      return {
        question: posable.unite.question,
        reponse: posable.unite.reponse,
        ...(aide === undefined ? {} : { aide }),
      };
    }
    case 'mot':
      return {
        question: posable.mot.mot,
        reponse: posable.mot.sens,
        ...sansAide(posable.mot.segments.map((segment) => segment.texte).join('·')),
      };
    case 'point': {
      const point = posable.schema.points[posable.rang];
      return {
        question: point.sens,
        reponse: point.terme,
        indication: posable.schema.titre,
        ...sansAide(posable.schema.note),
      };
    }
    case 'exercice':
      return {
        question: posable.exercice.invite,
        reponse: reponseMontree(posable.exercice),
        ...sansAide(posable.exercice.regle),
      };
    case 'fermee': {
      const { element } = posable;
      return element.genre === 'qcm'
        ? { question: element.question.question, reponse: element.question.reponse }
        : {
            question: element.affirmation.affirmation,
            // Un vrai/faux montre « Richtig » ou « Falsch », jamais le code du domaine.
            reponse: libelleDOption(reponseDeLElement(element), t),
            ...sansAide(element.affirmation.correction),
          };
    }
  }
}
