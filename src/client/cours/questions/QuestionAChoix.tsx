/*
 * L'écran d'une question à choix (`renderQuiz`, H:1836-1859, touches H:2244-2246) : l'énoncé, les
 * options, les touches 1 à 4 et le bouton de suite. Le Quiz et la séance « Heute » la posent de la
 * même façon ; le composant ne tire rien et ne tient aucun compte.
 */
import type { UniteDeCarte } from '../../../domaine/cartes/unites.js';
import type { Hasard } from '../../../domaine/hasard.js';
import {
  type ElementFerme,
  idDeLElement,
  optionsDeLElement,
  reponseDeLElement,
} from '../../../domaine/seances/feuilles.js';
import { useTouches } from '../clavier.js';
import {
  classeDeLaQuestion,
  Enonce,
  focaliser,
  libelleDOption,
  Options,
} from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';

/** Les touches 1 à 4 choisissent la première à la quatrième option (H:2245). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

export interface QuestionDeChoix {
  /** L'identifiant qui reçoit la réponse au journal : celui de la carte ou de l'élément. */
  id: string;
  /** La bonne réponse, parmi `options`. */
  reponse: string;
  /** Ce que la question montre : une carte, ou le texte d'un élément de feuille. */
  enonce: { unite: UniteDeCarte } | { texte: string };
  /** Les options, en codes pour un vrai/faux (`VRAI`, `FAUX`). */
  options: string[];
  /** L'index de l'option choisie, `null` tant que la question attend sa réponse. */
  choisie: number | null;
}

/** La question d'un élément fermé d'une fiche (`qcm` ou `vrai-faux`), ses options tirées. */
export function questionDeLElement(element: ElementFerme, hasard: Hasard): QuestionDeChoix {
  const texte =
    element.genre === 'qcm' ? element.question.question : element.affirmation.affirmation;
  return {
    id: idDeLElement(element),
    reponse: reponseDeLElement(element),
    enonce: { texte },
    // Une question fermée a toujours ses options.
    options: optionsDeLElement(element, hasard) as string[],
    choisie: null,
  };
}

export function QuestionAChoix(props: {
  question: QuestionDeChoix;
  /** Le texte du bouton de suite. */
  libelleSuivante: string;
  /** Le choix de l'option `i`, jugé : appelé une fois, tant que la question n'est pas répondue. */
  onChoix(i: number, juste: boolean): void;
  onSuivante(): void;
}) {
  const { question, libelleSuivante, onChoix, onSuivante } = props;
  const { t } = useCours();

  const repondre = (i: number) => {
    if (question.choisie !== null || question.options[i] === undefined) return;
    onChoix(i, question.options[i] === question.reponse);
  };

  // Un vrai/faux montre « Richtig » et « Falsch » : le domaine ne parle qu'en codes.
  const libelle = (option: string): string => libelleDOption(option, t);

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [numero, () => repondre(i)]),
  );
  useTouches(touches, question.choisie === null);

  return (
    <>
      <div class="card" style={{ minHeight: '160px' }}>
        {'unite' in question.enonce ? (
          <Enonce unite={question.enonce.unite} avecChapitre={false} />
        ) : (
          <span class={classeDeLaQuestion(question.enonce.texte)}>{question.enonce.texte}</span>
        )}
      </div>
      <Options
        options={question.options.map(libelle)}
        choisir={repondre}
        repondu={
          question.choisie === null
            ? undefined
            : { choisie: question.choisie, reponse: libelle(question.reponse) }
        }
      />
      {question.choisie === null ? (
        <p class="kbd">{t.quiz_touches}</p>
      ) : (
        <button type="button" class="primary" ref={focaliser} onClick={onSuivante}>
          {libelleSuivante}
        </button>
      )}
    </>
  );
}
