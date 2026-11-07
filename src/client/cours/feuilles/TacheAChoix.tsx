/*
 * Une tâche à choix multiple (`qcm`) : ses questions l'une sous l'autre, chacune avec la réponse et
 * ses trois distracteurs mélangés. Un choix répond aussitôt : la question se colore comme dans le
 * Quiz, ne répond plus, et son résultat est rendu à l'onglet sans attendre les autres (R17).
 *
 * Les options tirées et le choix de chaque question vivent dans la mémoire de l'onglet, rangés par
 * identifiant de question (`useEtatDesElements`) : après un détour par un autre onglet, la tâche
 * revient telle qu'elle était, et chaque question est jugée sur ses propres options.
 *
 * Le vrai/faux (`TacheVraiFaux`) suit le même patron, avec deux boutons par affirmation.
 */
import type { Affirmation, QuestionAChoix } from '../../../domaine/contenu/modele.js';
import { FAUX, optionsDeQcm, VRAI } from '../../../domaine/feuilles/correction.js';
import { Options } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { type PropsDeTache, useEtatDesElements } from './tache.js';

interface Choix {
  /** Les options de la question, mélangées une fois pour toutes. */
  options: string[];
  /** L'index de l'option choisie, `null` tant que la question attend. */
  choisie: number | null;
}

export function TacheAChoix(props: PropsDeTache<'qcm'>) {
  const { tache, onRepondu } = props;
  const { hasard } = useCours();
  const [choix, changer] = useEtatDesElements<QuestionAChoix, Choix>(
    tache,
    tache.questions,
    (question) => ({ options: optionsDeQcm(question, hasard), choisie: null }),
  );

  const choisir = (question: QuestionAChoix, i: number) => {
    const avant = choix[question.id];
    if (avant.choisie !== null) return;
    changer(question.id, { ...avant, choisie: i });
    onRepondu([{ id: question.id, juste: avant.options[i] === question.reponse }]);
  };

  return (
    <>
      {tache.questions.map((question) => {
        const { options, choisie } = choix[question.id];
        return (
          <fieldset key={question.id} class="element">
            <legend>{question.question}</legend>
            <Options
              options={options}
              choisir={(i) => choisir(question, i)}
              repondu={choisie === null ? undefined : { choisie, reponse: question.reponse }}
            />
          </fieldset>
        );
      })}
    </>
  );
}

/** Les deux réponses d'une affirmation : le code du domaine (F1-D7), dans l'ordre des boutons. */
const CODES = [VRAI, FAUX];

/**
 * Une tâche vrai/faux : chaque affirmation avec `Richtig` puis `Falsch`. Le choix répond aussitôt,
 * comme au QCM, et montre la correction de l'affirmation, si elle en a une. Le choix gardé est le
 * code du domaine (`vrai` ou `faux`), rangé par identifiant d'affirmation.
 */
export function TacheVraiFaux(props: PropsDeTache<'vrai-faux'>) {
  const { tache, onRepondu } = props;
  const { t } = useCours();
  const libelles = [t.feuille_richtig, t.feuille_falsch];
  const [choix, changer] = useEtatDesElements<Affirmation, string | null>(
    tache,
    tache.affirmations,
    () => null,
  );

  const choisir = (affirmation: Affirmation, i: number) => {
    if (choix[affirmation.id] !== null) return;
    changer(affirmation.id, CODES[i]);
    onRepondu([{ id: affirmation.id, juste: (CODES[i] === VRAI) === affirmation.vrai }]);
  };

  return (
    <>
      {tache.affirmations.map((affirmation) => {
        const code = choix[affirmation.id];
        return (
          <fieldset key={affirmation.id} class="element">
            <legend>{affirmation.affirmation}</legend>
            <Options
              options={libelles}
              choisir={(i) => choisir(affirmation, i)}
              repondu={
                code === null
                  ? undefined
                  : { choisie: CODES.indexOf(code), reponse: libelles[affirmation.vrai ? 0 : 1] }
              }
            />
            {code !== null && affirmation.correction !== undefined && (
              <p class="correction">{affirmation.correction}</p>
            )}
          </fieldset>
        );
      })}
    </>
  );
}
