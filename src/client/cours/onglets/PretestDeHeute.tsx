/*
 * Le pré-test d'une étape dans « Heute » (M4, B-D13 à B-D16) : l'offre, qui paraît de un à trois
 * jours avant l'ouverture d'une étape de cours, puis ses cinq questions à choix sur ses cartes
 * neuves. Une erreur n'y est pas une faute : l'option choisie, fausse, garde un style neutre, et
 * aucun compte de justes ne se dit. Chaque réponse va au journal à son geste, sous le mode
 * `pretest`, que rien ne compte dans la progression (B-D9).
 *
 * Les questions sont figées au démarrage dans l'état de l'onglet : un détour par un autre onglet
 * retrouve la même question, et le pré-test commencé retient la mise à jour de l'application
 * (`pretestEnCours`).
 */
import { useRef } from 'preact/hooks';
import type { CoursPrepare } from '../../../domaine/cours/prepare.js';
import type { Hasard } from '../../../domaine/hasard.js';
import { type PretestPropose, questionsDuPretest } from '../../../domaine/seances/pretest.js';
import { useCours } from '../contexte-cours.js';
import { QuestionAChoix, type QuestionDeChoix } from '../questions/QuestionAChoix.js';
import { formater } from '../textes-cours.js';

/**
 * Le pré-test commencé. `rang` est la question posée (le nombre de questions à la fin), `faites` le
 * nombre de réponses données.
 */
export interface EtatDuPretest {
  /** Le titre de l'étape, tel que le cours le sert. */
  etape: string;
  questions: QuestionDeChoix[];
  rang: number;
  faites: number;
}

/** Le pré-test qui commence : ses questions sont tirées ici, et figées (B-D13). */
export function demarrerPretest(
  propose: PretestPropose,
  cours: CoursPrepare,
  hasard: Hasard,
): EtatDuPretest {
  const questions = questionsDuPretest(propose, cours.index, hasard).map(
    ({ unite, options }): QuestionDeChoix => ({
      id: unite.id,
      reponse: unite.reponse,
      enonce: { unite },
      options,
      choisie: null,
    }),
  );
  return { etape: propose.etape.titre, questions, rang: 0, faites: 0 };
}

/** Le cadre en tête de « Heute » : l'étape qui vient, l'effet du pré-test, et le bouton. */
export function OffreDePretest(props: { etape: string; commencer(): void }) {
  const { t } = useCours();
  return (
    <div class="pretest">
      <p>{formater(t.heute_pretest_angebot, { etape: props.etape })}</p>
      <p class="muted">{t.heute_pretest_warum}</p>
      <div class="controls">
        <button type="button" class="primary" onClick={props.commencer}>
          {t.heute_pretest_starten}
        </button>
      </div>
    </div>
  );
}

/** Le pré-test commencé, à la place de la séance du jour : une question, ou sa fin. */
export function PretestDeHeute(props: {
  etat: EtatDuPretest;
  /** Le pré-test suivant, ou `null` : retour à la séance du jour, qui est restée gardée. */
  changer(suivant: EtatDuPretest | null): void;
}) {
  const { etat, changer } = props;
  const { t, enregistrer, finDeSeance } = useCours();
  // La dernière réponse enregistrée : la synchronisation attend qu'elle soit rangée.
  const rangement = useRef<Promise<boolean>>(Promise.resolve(true));
  const { questions, rang, faites } = etat;
  const question = questions[rang];
  const retour = (
    <button type="button" class="small-btn" onClick={() => changer(null)}>
      {t.heute_pretest_zurueck}
    </button>
  );

  if (question === undefined) {
    return (
      <section>
        <div class="done">
          <h2>{t.heute_pretest_fin}</h2>
          <p class="muted">{formater(t.heute_pretest_fertig, { etape: etat.etape })}</p>
          <div class="controls">
            <button type="button" class="primary" onClick={() => changer(null)}>
              {t.heute_pretest_zurueck}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Un geste, une écriture : la réponse au journal, la question jugée et le compte, d'un bloc.
  const repondre = (i: number, juste: boolean) => {
    rangement.current = enregistrer(question.id, juste, 'pretest');
    changer({
      ...etat,
      questions: questions.map((q, j) => (j === rang ? { ...q, choisie: i } : q)),
      faites: faites + 1,
    });
    if (rang === questions.length - 1) void rangement.current.then(() => finDeSeance());
  };

  return (
    <section>
      <div class="controls">
        <span class="progressline">
          {formater(t.heute_pretest_frage, { i: rang + 1, n: questions.length })}
        </span>
        {retour}
      </div>
      <QuestionAChoix
        question={question}
        libelleSuivante={t.suivante}
        sansFaute
        onChoix={repondre}
        onSuivante={() => changer({ ...etat, rang: rang + 1 })}
      />
      {question.choisie !== null && <p class="muted">{t.heute_pretest_danach}</p>}
    </section>
  );
}
