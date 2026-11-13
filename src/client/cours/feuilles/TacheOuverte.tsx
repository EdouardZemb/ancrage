/*
 * Une tâche à question ouverte (`ouverte`) : la question, puis « Antwort zeigen », la réponse modèle
 * et enfin « Nicht gewusst » / « Gewusst », comme une carte. C'est la personne qui juge : l'appli ne
 * corrige pas un texte libre. Chaque question jugée est rendue aussitôt à l'onglet (R17).
 *
 * L'état de chaque question (réponse montrée, jugement) vit dans la mémoire de l'onglet, rangé par
 * identifiant de question.
 */
import type { QuestionOuverte } from '../../../domaine/contenu/modele.js';
import { useCours } from '../contexte-cours.js';
import { type PropsDeTache, useEtatDesElements } from './tache.js';

interface Etat {
  montree: boolean;
  /** Le jugement de la personne, `null` tant qu'elle n'a pas jugé. */
  juste: boolean | null;
}

export function TacheOuverte(props: PropsDeTache<'ouverte'>) {
  const { tache, onRepondu } = props;
  const { t } = useCours();
  const [etats, changer] = useEtatDesElements<QuestionOuverte, Etat>(
    tache,
    tache.questions,
    () => ({ montree: false, juste: null }),
  );

  const juger = (question: QuestionOuverte, juste: boolean) => {
    changer(question.id, { montree: true, juste });
    onRepondu([{ id: question.id, juste, mode: 'montree' }]);
  };

  return (
    <>
      {tache.questions.map((question) => {
        const { montree, juste } = etats[question.id];
        return (
          <div key={question.id} class="element">
            <p class="enonce">{question.question}</p>
            {!montree && (
              <button
                type="button"
                class="small-btn"
                onClick={() => changer(question.id, { montree: true, juste: null })}
              >
                {t.feuilles_zeigen}
              </button>
            )}
            {montree && <p class="correction">{question.reponse}</p>}
            {montree && juste === null && (
              <div class="boutons-jugement">
                <button type="button" class="ghost" onClick={() => juger(question, false)}>
                  {t.cartes_pas_su}
                </button>
                <button type="button" class="small-btn" onClick={() => juger(question, true)}>
                  {t.cartes_su}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
