/*
 * L'écran d'une question d'exercice (`renderGram`, H:2173-2197, touches H:2252-2253) : la carte, la
 * saisie ou les options, le verdict avec la bonne réponse et sa règle, et le bouton de suite. Un
 * exercice qui a des options se répond par un choix ; sans options, on tape la réponse, jugée à la
 * graphie exacte (`egalStrict`). L'onglet « Grammatik » et la séance « Heute » la posent de la même
 * façon.
 */
import type { Exercice, FamilleExercices } from '../../../domaine/contenu/modele.js';
import { egalStrict } from '../../../domaine/correction.js';
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import { useTouches } from '../clavier.js';
import { classeDeLaQuestion, focaliser, Options, SaisieDeLaReponse } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';

/** L'invite d'un article commence ainsi : la bonne réponse vient la compléter (H:2181). */
const TROU_D_ARTICLE = /^___\s*/;
/** Les touches de 1 à 9 choisissent la première à la neuvième option. */
const OPTIONS_PAR_TOUCHE = 9;

/** Ce que la personne a répondu, et si c'était juste. */
export interface ReponseDExercice {
  juste: boolean;
  donnee: string;
}

/** La réponse telle que le verdict la montre : un article est suivi de son mot. */
function reponseMontree(exercice: Exercice): string {
  return TROU_D_ARTICLE.test(exercice.invite)
    ? `${exercice.reponse} ${exercice.invite.replace(TROU_D_ARTICLE, '')}`
    : exercice.reponse;
}

export function QuestionDExercice(props: {
  famille: FamilleExercices;
  exercice: Exercice;
  /** `null` tant que l'exercice attend sa réponse. */
  reponse: ReponseDExercice | null;
  /** La réponse jugée : appelée une fois, tant que l'exercice n'est pas répondu. */
  onReponse(reponse: ReponseDExercice, mode: ModeDeReponse): void;
  onSuivante(): void;
}) {
  const { famille, exercice, reponse, onReponse, onSuivante } = props;
  const { t } = useCours();
  const options = exercice.options;

  const repondre = (donnee: string) => {
    if (reponse !== null) return;
    onReponse(
      { juste: egalStrict(donnee, exercice.reponse), donnee },
      // Des options : une proposition choisie ; sinon, la réponse est tapée.
      options === undefined ? 'saisie' : 'choix',
    );
  };

  const touches = Object.fromEntries(
    (options ?? [])
      .slice(0, OPTIONS_PAR_TOUCHE)
      .map((option, i) => [String(i + 1), () => repondre(option)]),
  );
  useTouches(touches, options !== undefined && reponse === null);

  return (
    <>
      <div class="card" style={{ minHeight: '180px' }}>
        <span class="kind">{famille.libelle}</span>
        <span class={classeDeLaQuestion(exercice.invite)}>{exercice.invite}</span>
        {options === undefined && reponse === null && <SaisieDeLaReponse onVerifier={repondre} />}
        {reponse !== null && (
          <>
            <div class={`verdict ${reponse.juste ? 'ok' : 'ko'}`}>
              <span>{reponse.juste ? t.verdict_juste : t.verdict_fausse}</span>
              {!reponse.juste && reponse.donnee !== '' && <s>{reponse.donnee}</s>}
              <b>{reponseMontree(exercice)}</b>
            </div>
            {exercice.regle ? <p class="rule">{exercice.regle}</p> : null}
          </>
        )}
      </div>
      {options !== undefined && reponse === null && (
        <Options options={options} choisir={(i) => repondre(options[i])} />
      )}
      {reponse !== null && (
        <button type="button" class="primary" ref={focaliser} onClick={onSuivante}>
          {t.suivante}
        </button>
      )}
      <p class="kbd">{t.exercices_hinweis}</p>
    </>
  );
}
