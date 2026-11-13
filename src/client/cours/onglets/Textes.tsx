/*
 * « Berichte » (`renderReports`, H:2113-2170, et les touches de H:2251) : un texte annoté dont on
 * traduit d'abord les termes marqués, puis dont on répond aux questions, avant le bilan. Les mauvais
 * sens d'un terme viennent de tous les termes du module (H:1666), de même nature de préférence.
 *
 * Seul le texte entier est journalisé, à son bilan : juste si au moins `reussite` (le contenu) de
 * ses réponses le sont, termes et questions confondus (H:2166). Les termes et les questions ne
 * produisent pas d'événement (décision 8). Le sélecteur marque d'un « ✓ » les textes déjà réussis.
 *
 * Le texte en cours vit dans l'écran du cours (`useEtatDOnglet`) : un détour par un autre onglet le
 * retrouve. Commencé, et pas encore au bilan, il est une séance en cours (2a-D3) : une nouvelle
 * version de l'application ne s'applique pas sous ses yeux. Une absence longue n'abandonne pas le
 * texte en cours, car ses réponses ne sont pas encore au journal (2a-D4). Il recommence au
 * changement de texte. Un texte sans terme commence par ses questions, un texte sans question passe
 * au bilan après son dernier terme, et un module sans texte n'a rien à proposer : l'onglet le dit,
 * et ne plante pas.
 */
import { Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import type { Jeton, TexteAnnote } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { etatDe } from '../../../domaine/progression/etat.js';
import { reussis } from '../../../domaine/progression/statistiques.js';
import {
  jetonsDuModule,
  jetonsDuTexte,
  optionsDeJeton,
  optionsDeQuestion,
  texteReussi,
} from '../../../domaine/seances/textes.js';
import { useTouches } from '../clavier.js';
import { enGras, focaliser, Options } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { texteEnCours } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** Les touches 1 à 4 choisissent la première à la quatrième option (H:2251). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

/** Un texte en cours de lecture. */
interface Lecture {
  /** L'indice du texte dans le module, en texte. */
  cle: string;
  texte: TexteAnnote;
  jetons: Jeton[];
  phase: 'jetons' | 'questions' | 'bilan';
  /** Le terme en cours ; le nombre de termes une fois qu'ils sont tous traduits. */
  etape: number;
  resultats: boolean[];
  options: string[];
  /** La question en cours ; le nombre de questions une fois qu'elles sont toutes posées. */
  question: number;
  reponses: boolean[];
  optionsDesQuestions: string[][];
}

export function Textes() {
  const { cours } = useCours();
  return cours.textes === undefined ? null : <TextesDuModule module={cours.textes} />;
}

function TextesDuModule(props: { module: ModuleServiDe<'texte-annote'> }) {
  const { module } = props;
  const { t, etats, enregistrer, preferences, changerPreferences, hasard, useEtatDOnglet } =
    useCours();
  const total = module.textes.length;
  // Un indice gardé au-delà du dernier texte (le contenu a rétréci) prend le dernier.
  const indice = Math.min(preferences.textes.indice, total - 1);
  const cle = String(indice);
  const tousLesJetons = useMemo(() => jetonsDuModule(module), [module]);

  /** Le texte `rang` à son premier terme, avec des options neuves ; `null` s'il n'y en a pas. */
  const commencer = (rang: number): Lecture | null => {
    const texte = module.textes[rang];
    if (texte === undefined) return null;
    const jetons = jetonsDuTexte(texte);
    return {
      cle: String(rang),
      texte,
      jetons,
      phase: jetons.length > 0 ? 'jetons' : texte.questions.length > 0 ? 'questions' : 'bilan',
      etape: 0,
      resultats: [],
      options: jetons.length > 0 ? optionsDeJeton(jetons[0], tousLesJetons, hasard) : [],
      question: 0,
      reponses: [],
      optionsDesQuestions: texte.questions.map((question) => optionsDeQuestion(question, hasard)),
    };
  };
  const [courante, setCourante] = useEtatDOnglet<Lecture | null>(
    'textes',
    () => commencer(indice),
    texteEnCours,
    'retenue',
  );
  // Un autre texte : on recommence.
  let lecture = courante;
  if (courante?.cle !== cle) lecture = commencer(indice);
  if (lecture !== courante) setCourante(lecture);

  /** Range la lecture ; au bilan, journalise le texte, réussi ou non (une lecture vide, rien). */
  const avancer = (suivante: Lecture) => {
    setCourante(suivante);
    if (suivante.phase !== 'bilan') return;
    const reponses = [...suivante.resultats, ...suivante.reponses];
    if (reponses.length > 0) {
      void enregistrer(suivante.texte.id, texteReussi(reponses, module.reussite), 'lecture');
    }
  };

  const repondre = (i: number) => {
    if (lecture === null) return;
    const { texte } = lecture;
    if (lecture.phase === 'jetons') {
      const option = lecture.options[i];
      if (option === undefined) return;
      const resultats = [...lecture.resultats, option === lecture.jetons[lecture.etape].sens];
      const etape = lecture.etape + 1;
      if (etape < lecture.jetons.length) {
        const options = optionsDeJeton(lecture.jetons[etape], tousLesJetons, hasard);
        setCourante({ ...lecture, resultats, etape, options });
      } else {
        avancer({
          ...lecture,
          resultats,
          etape,
          phase: texte.questions.length > 0 ? 'questions' : 'bilan',
        });
      }
    } else if (lecture.phase === 'questions') {
      const option = lecture.optionsDesQuestions[lecture.question][i];
      if (option === undefined) return;
      const reponses = [...lecture.reponses, option === texte.questions[lecture.question].reponse];
      const question = lecture.question + 1;
      avancer({
        ...lecture,
        reponses,
        question,
        phase: question < texte.questions.length ? 'questions' : 'bilan',
      });
    }
  };

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [numero, () => repondre(i)]),
  );
  useTouches(touches, lecture !== null && lecture.phase !== 'bilan');

  const suivant = () => {
    const rang = (indice + 1) % total;
    changerPreferences({ ...preferences, textes: { indice: rang } });
    // Avec un seul texte, c'est le même : il recommence tout de même.
    setCourante(commencer(rang));
  };

  return (
    <section>
      <div class="controls">
        <select
          aria-label={t.textes_choix}
          value={cle}
          onChange={(e) =>
            changerPreferences({
              ...preferences,
              textes: { indice: Number(e.currentTarget.value) },
            })
          }
        >
          {module.textes.map((texte, i) => (
            <option key={texte.id} value={i}>
              {etatDe(etats, texte.id).justes > 0 ? '✓ ' : ''}
              {texte.titre}
            </option>
          ))}
        </select>
        <span class="progressline">
          {formater(t.textes_geschafft, {
            n: reussis(
              module.textes.map(({ id }) => id),
              etats,
            ),
            total,
          })}
        </span>
      </div>
      <p class="muted" style={{ fontSize: '.88rem' }}>
        {[module.consigne, t.textes_anleitung].filter(Boolean).join(' ')}
      </p>

      {lecture === null ? (
        <p class="muted">{t.onglet_vide}</p>
      ) : (
        <>
          <h2>{lecture.texte.titre}</h2>
          <div class="report">{texteMarque(lecture)}</div>
          <Suite lecture={lecture} repondre={repondre} />
          {lecture.phase === 'bilan' && (
            <Bilan
              lecture={lecture}
              suivant={suivant}
              recommencer={() => setCourante(commencer(indice))}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * Le texte, ses termes déjà traduits en vert ou en rouge avec leur sens, celui en cours mis en
 * avant, les suivants soulignés (H:2138-2143).
 */
function texteMarque(lecture: Lecture) {
  let rang = 0;
  return lecture.texte.segments.map((segment, i) => {
    if ('texte' in segment) return segment.texte;
    const { forme, sens } = segment.jeton;
    const n = rang++;
    if (n < lecture.etape) {
      return (
        <Fragment key={i}>
          <span class={lecture.resultats[n] ? 'tk ok' : 'tk ko'}>{forme}</span>
          <span class="gloss">{sens}</span>
        </Fragment>
      );
    }
    const enCours = n === lecture.etape && lecture.phase === 'jetons';
    return (
      <span key={i} class={enCours ? 'tk cur' : 'tk'}>
        {forme}
      </span>
    );
  });
}

/** Le terme à traduire ou la question à répondre, avec ses options (H:2144-2152). */
function Suite(props: { lecture: Lecture; repondre(i: number): void }) {
  const { lecture, repondre } = props;
  const { t } = useCours();
  if (lecture.phase === 'jetons') {
    const { forme } = lecture.jetons[lecture.etape];
    return (
      <>
        <p>
          {enGras(
            formater(t.textes_begriff, { n: lecture.etape + 1, total: lecture.jetons.length }),
            { forme: `«${forme}»` },
          )}
        </p>
        <Options options={lecture.options} choisir={repondre} />
      </>
    );
  }
  if (lecture.phase === 'questions') {
    const { questions } = lecture.texte;
    return (
      <>
        <p>
          {enGras(formater(t.textes_frage, { n: lecture.question + 1, total: questions.length }), {
            frage: questions[lecture.question].question,
          })}
        </p>
        <Options options={lecture.optionsDesQuestions[lecture.question]} choisir={repondre} />
      </>
    );
  }
  return null;
}

/** Le bilan : les chiffres, chaque question avec sa réponse, puis la suite (H:2153-2159). */
function Bilan(props: { lecture: Lecture; suivant(): void; recommencer(): void }) {
  const { lecture, suivant, recommencer } = props;
  const { t } = useCours();
  const termesJustes = lecture.resultats.filter(Boolean).length;
  const questionsJustes = lecture.reponses.filter(Boolean).length;
  const toutJuste =
    termesJustes + questionsJustes === lecture.resultats.length + lecture.reponses.length;
  return (
    <div class="done">
      <h2>{toutJuste ? t.textes_alles_richtig : t.textes_abgeschlossen}</h2>
      <p>
        {formater(t.textes_bilan, {
          termes_justes: termesJustes,
          termes: lecture.resultats.length,
          questions_justes: questionsJustes,
          questions: lecture.reponses.length,
        })}
      </p>
      {lecture.texte.questions.map((question, i) => (
        <p key={question.id} class="muted">
          {lecture.reponses[i] ? '✓' : '✗'} {question.question} → <b>{question.reponse}</b>
        </p>
      ))}
      <div class="controls">
        <button type="button" class="primary" ref={focaliser} onClick={suivant}>
          {t.textes_naechster}
        </button>
        <button type="button" class="ghost" onClick={recommencer}>
          {t.textes_nochmals}
        </button>
      </div>
    </div>
  );
}
