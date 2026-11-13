/*
 * « Quiz », le choix multiple (`renderQuiz`, H:1836-1859, et les touches de H:2244-2246) : une
 * carte du chapitre et du sens choisis, quatre options au plus. La réponse entre au journal et
 * colore les options, puis « Nächste Frage » tire une autre carte. Une carte pas encore sue (boîte
 * inférieure à 4) sort trois fois plus souvent que les autres.
 *
 * Le choix « Arbeitsblätter » tire plutôt une question fermée des feuilles (`qcm` ou `vrai-faux`,
 * F1-D7) ; la réponse entre au journal sous l'identifiant de l'élément, et le sens ne joue pas.
 *
 * La série (le score) recommence à chaque changement de chapitre ou de sens. Elle vit dans l'écran
 * du cours (`useEtatDOnglet`) : un détour par un autre onglet retrouve la même question. Un choix
 * sans carte n'a pas de question : l'onglet le dit, et ne plante pas.
 */
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import { unitesDuChoix } from '../../../domaine/seances/cartes.js';
import {
  elementsTirables,
  GENRES_FERMES,
  idDeLElement,
  questionFermee,
  reponseDeLElement,
} from '../../../domaine/seances/feuilles.js';
import { questionDeQuiz } from '../../../domaine/seances/quiz.js';
import { ChoixDeCartes } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { QuestionAChoix, type QuestionDeChoix } from '../questions/QuestionAChoix.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** `question` est `null` quand le choix n'a aucune carte. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  question: QuestionDeChoix | null;
}

export function Quiz() {
  const { cours, t, etats, enregistrer, preferences, changerPreferences, hasard, useEtatDOnglet } =
    useCours();
  const { chapitre, sens } = preferences.quiz;
  const cle = `${chapitre}|${sens}`;

  const tirerFeuille = (): QuestionDeChoix | null => {
    const elements = elementsTirables(cours.feuilles, GENRES_FERMES);
    if (elements.length === 0) return null;
    const { element, options } = questionFermee(elements, etats, hasard);
    const texte =
      element.genre === 'qcm' ? element.question.question : element.affirmation.affirmation;
    return {
      id: idDeLElement(element),
      reponse: reponseDeLElement(element),
      enonce: { texte },
      options,
      choisie: null,
    };
  };
  const tirer = (): QuestionDeChoix | null => {
    if (chapitre === 'feuilles') return tirerFeuille();
    const pool = unitesDuChoix(cours, chapitre, sens);
    if (pool.length === 0) return null;
    // Les mauvaises réponses viennent du chapitre, dans les deux sens (H:1833).
    const { unite, options } = questionDeQuiz(
      pool,
      etats,
      cours.index,
      unitesDuChoix(cours, chapitre, 'mix'),
      hasard,
    );
    return { id: unite.id, reponse: unite.reponse, enonce: { unite }, options, choisie: null };
  };
  const demarrer = (): Serie => ({ cle, faites: 0, justes: 0, question: tirer() });
  const [courante, setCourante] = useEtatDOnglet<Serie>('quiz', demarrer, serieCommencee);
  // Un autre chapitre ou un autre sens : on recommence.
  let serie = courante;
  if (courante.cle !== cle) serie = demarrer();
  if (serie !== courante) setCourante(serie);

  const { question } = serie;

  const choisir = (suite: Partial<Preferences['quiz']>) =>
    changerPreferences({ ...preferences, quiz: { ...preferences.quiz, ...suite } });

  const repondre = (i: number, juste: boolean, mode: ModeDeReponse) => {
    if (question === null) return;
    setCourante({
      ...serie,
      faites: serie.faites + 1,
      justes: serie.justes + (juste ? 1 : 0),
      question: { ...question, choisie: i },
    });
    void enregistrer(question.id, juste, mode);
  };

  return (
    <section>
      <div class="controls">
        <ChoixDeCartes
          chapitre={chapitre}
          sens={sens}
          avecFeuilles={elementsTirables(cours.feuilles, GENRES_FERMES).length > 0}
          choisir={choisir}
        />
        <span class="progressline">
          {formater(t.quiz_resultat, { justes: serie.justes, faites: serie.faites })}
        </span>
      </div>

      {question === null ? (
        <p class="muted">{t.quiz_vide}</p>
      ) : (
        <QuestionAChoix
          question={question}
          libelleSuivante={t.quiz_suivante}
          onChoix={repondre}
          onSuivante={() => setCourante({ ...serie, question: tirer() })}
        />
      )}
    </section>
  );
}
