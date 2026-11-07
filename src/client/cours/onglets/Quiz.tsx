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
import type { UniteDeCarte } from '../../../domaine/cartes/unites.js';
import { unitesDuChoix } from '../../../domaine/seances/cartes.js';
import {
  elementsTirables,
  GENRES_FERMES,
  idDeLElement,
  questionFermee,
  reponseDeLElement,
} from '../../../domaine/seances/feuilles.js';
import { questionDeQuiz } from '../../../domaine/seances/quiz.js';
import { useTouches } from '../clavier.js';
import {
  ChoixDeCartes,
  classeDeLaQuestion,
  Enonce,
  focaliser,
  libelleDOption,
  Options,
} from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** Les touches 1 à 4 choisissent la première à la quatrième option (H:2245). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

interface Question {
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

/** `question` est `null` quand le choix n'a aucune carte. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  question: Question | null;
}

export function Quiz() {
  const { cours, t, etats, enregistrer, preferences, changerPreferences, hasard, useEtatDOnglet } =
    useCours();
  const { chapitre, sens } = preferences.quiz;
  const cle = `${chapitre}|${sens}`;

  const tirerFeuille = (): Question | null => {
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
  const tirer = (): Question | null => {
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

  const repondre = (i: number) => {
    if (question === null || question.choisie !== null || question.options[i] === undefined) {
      return;
    }
    const juste = question.options[i] === question.reponse;
    setCourante({
      ...serie,
      faites: serie.faites + 1,
      justes: serie.justes + (juste ? 1 : 0),
      question: { ...question, choisie: i },
    });
    void enregistrer(question.id, juste);
  };

  // Un vrai/faux montre « Richtig » et « Falsch » : le domaine ne parle qu'en codes.
  const libelle = (option: string): string => libelleDOption(option, t);

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [numero, () => repondre(i)]),
  );
  useTouches(touches, question !== null && question.choisie === null);

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
            <button
              type="button"
              class="primary"
              ref={focaliser}
              onClick={() => setCourante({ ...serie, question: tirer() })}
            >
              {t.quiz_suivante}
            </button>
          )}
        </>
      )}
    </section>
  );
}
