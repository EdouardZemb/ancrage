/*
 * « Prüfung », l'examen blanc (`renderExam`, H:2004-2069, `finishExam`, H:1973-1991, et les touches
 * de H:2257) : on règle les chapitres, la taille, le chrono et les modules, on répond aux questions
 * en pouvant revenir en arrière, on remet l'examen après confirmation (ou quand le temps est
 * écoulé), puis on lit la note, les groupes et les fautes.
 *
 * L'examen en cours vit dans l'écran du cours (`useEtatDOnglet`), comme la variable `exam` du
 * prototype : questions, réponses, question courante, échéance du chrono (un instant absolu) et
 * résultat survivent à un détour par un autre onglet. Le chrono se calcule depuis l'échéance : au
 * retour, il montre le temps restant, et s'il est écoulé l'examen est remis (H:2001). Un chrono ne
 * court que pendant que l'onglet est affiché.
 *
 * La remise journalise une réponse par question, puis l'examen (`enregistrerExamen`), puis demande
 * la synchronisation (`finDeSeance`, décision 15). Elle a lieu une fois par examen. Sa durée est la
 * durée réelle arrondie, d'au moins une minute (H:1986) ; remis par le chrono, après une absence,
 * l'examen compte la durée accordée et non le temps passé ailleurs. Commencé et pas remis, l'examen
 * est une séance retenue (2a-D3) : une absence longue ne l'abandonne pas, car ses réponses ne sont
 * pas encore au journal (2a-D4).
 *
 * Les questions de feuille (F1) portent le titre de leur feuille ; un vrai/faux y montre
 * « Richtig » et « Falsch », jusque dans la liste des fautes (F1-D7).
 *
 * « Fehler als Karteikarten üben » (H:2041-2045) range une séance de cartes dans la mémoire des
 * onglets, sous une sous-clé de celle des cartes (`CLE_SEANCE_IMPOSEE`), puis ouvre l'onglet des
 * cartes : l'écran du cours la lui passe, et c'est son objet, jamais une copie, qu'il reconnaît.
 */
import { useRef } from 'preact/hooks';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { SeanceCartes } from '../../../domaine/seances/cartes.js';
import {
  corrigerExamen,
  type Examen as ExamenComposee,
  type ReponseExamen,
  reponseAttendue,
} from '../../../domaine/seances/examen.js';
import { useTouches } from '../clavier.js';
import { classeDeLaQuestion, focaliser } from '../composants-cours.js';
import { CLE_SEANCE_IMPOSEE, useCours } from '../contexte-cours.js';
import { DessinSchema } from '../DessinSchema.js';
import { examenEnCours } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';
import { Minuteur } from './ExamenMinuteur.js';
import { MS_PAR_MINUTE, Reglages } from './ExamenReglages.js';
import {
  enonceDe,
  etiquetteDe,
  libelleDe,
  libelleDuGroupe,
  type Passage,
  type Remis,
} from './examen-libelles.js';

/** Les touches 1 à 4 choisissent la première à la quatrième option (H:2257). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];
/** Ce que la liste des fautes montre d'une question sans réponse (H:1979). */
const SANS_REPONSE = '—';

export function Examen() {
  const { cours } = useCours();
  return cours.examen === undefined ? null : <ExamenDuModule module={cours.examen} />;
}

function ExamenDuModule(props: { module: ModuleServiDe<'examen'> }) {
  const { module } = props;
  const { cours, enregistrerExamen, finDeSeance, useEtatDOnglet } = useCours();
  const [passage, setPassage] = useEtatDOnglet<Passage | null>(
    'examen',
    () => null,
    examenEnCours,
    'retenue',
  );
  // L'examen déjà remis. Un double clic, ou le chrono qui expire pendant une remise, repasse par
  // ici avec le même état de départ : seul cet objet, lu à l'instant même, les distingue.
  const remis = useRef<ExamenComposee | null>(null);

  const remettre = () => {
    if (passage === null || passage.resultat !== null || remis.current === passage.examen) return;
    remis.current = passage.examen;
    const maintenant = Date.now();
    const fin = passage.echeance === null ? maintenant : Math.min(maintenant, passage.echeance);
    const minutes = Math.max(1, Math.round((fin - passage.debut) / MS_PAR_MINUTE));
    const correction = corrigerExamen(cours, passage.examen, passage.reponses);
    setPassage({ ...passage, confirmer: false, resultat: { correction, minutes } });
    // La synchronisation lit la file : elle attend que l'examen y soit.
    void enregistrerExamen(
      {
        points: correction.points,
        questions: correction.questions,
        note: correction.note,
        minutes,
        chapitres: correction.chapitres,
      },
      correction.reponses,
    ).then(() => finDeSeance());
  };

  if (passage === null) return <Reglages module={module} commencer={setPassage} />;
  if (passage.resultat !== null) {
    return (
      <Resultat module={module} remis={passage.resultat} recommencer={() => setPassage(null)} />
    );
  }
  return <Epreuve passage={passage} changer={setPassage} remettre={remettre} />;
}

/** Une question de l'examen en cours (H:2050-2069). */
function Epreuve(props: { passage: Passage; changer(passage: Passage): void; remettre(): void }) {
  const { passage, changer, remettre } = props;
  const { cours, t } = useCours();
  const { examen, indice, reponses } = passage;
  const question = examen.questions[indice];
  const reponse = reponses[indice];
  const enonce = enonceDe(question, t);
  const options = question.options;

  /** Après une réponse, ou en sautant : la question suivante, ou la confirmation à la dernière. */
  const avancer = (suivantes: ReponseExamen[]) =>
    indice < examen.questions.length - 1
      ? changer({ ...passage, reponses: suivantes, indice: indice + 1 })
      : changer({ ...passage, reponses: suivantes, confirmer: true });
  const repondre = (valeur: ReponseExamen) => {
    const suivantes = [...reponses];
    suivantes[indice] = valeur;
    avancer(suivantes);
  };
  const choisir = (i: number) => {
    if (options?.[i] !== undefined) repondre(i);
  };

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [numero, () => choisir(i)]),
  );
  useTouches(touches, options !== undefined);

  return (
    <section>
      <div class="controls">
        <span class="progressline">
          {formater(t.examen_frage, {
            n: indice + 1,
            total: examen.questions.length,
            beantwortet: reponses.filter((x) => x !== undefined).length,
          })}
        </span>
        {passage.echeance !== null && <Minuteur echeance={passage.echeance} remettre={remettre} />}
        <span style={{ flex: 1 }} />
        {passage.confirmer ? (
          <span class="confirm">
            {t.examen_jetzt_abgeben}{' '}
            <button type="button" class="ghost" onClick={remettre}>
              {t.examen_abgeben}
            </button>
            <button
              type="button"
              class="ghost"
              onClick={() => changer({ ...passage, confirmer: false })}
            >
              {t.suivante}
            </button>
          </span>
        ) : (
          <button
            type="button"
            class="ghost"
            onClick={() => changer({ ...passage, confirmer: true })}
          >
            {t.examen_abgeben}
          </button>
        )}
      </div>

      <div class="card" style={{ minHeight: '160px' }}>
        <span class="kind">{etiquetteDe(question, cours, t)}</span>
        <span class={classeDeLaQuestion(enonce)}>{enonce}</span>
        {question.genre === 'schema' && (
          <DessinSchema schema={question.schema} cible={question.point} />
        )}
        {options === undefined && (
          <form
            key={indice}
            class="typed"
            autocomplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              const champ = e.currentTarget.elements.namedItem('saisie') as HTMLInputElement;
              const saisie = champ.value.trim();
              // Une saisie vide ne répond à rien, et ne défait pas une réponse donnée (H:2063).
              if (saisie === '') avancer(reponses);
              else repondre(saisie);
            }}
          >
            <input
              name="saisie"
              ref={focaliser}
              aria-label={t.examen_antwort}
              placeholder={t.examen_antwort_modele}
              spellcheck={false}
              autocapitalize="off"
              defaultValue={typeof reponse === 'string' ? reponse : ''}
            />
            <button type="submit" class="small-btn">
              {t.suivante}
            </button>
          </form>
        )}
      </div>
      {options !== undefined && (
        <div class="options">
          {options.map((option, i) => (
            <button
              key={`${i}|${option}`}
              type="button"
              class={reponse === i ? 'sel' : ''}
              aria-pressed={reponse === i}
              onClick={() => choisir(i)}
            >
              <span class="mono muted">{i + 1}</span>&nbsp; {libelleDe(question, option, t)}
            </button>
          ))}
        </div>
      )}

      <div class="controls">
        <button
          type="button"
          class="ghost"
          disabled={indice === 0}
          onClick={() => changer({ ...passage, indice: indice - 1 })}
        >
          {t.examen_zurueck}
        </button>
        <button type="button" class="ghost" onClick={() => avancer(reponses)}>
          {indice === examen.questions.length - 1 ? t.examen_zur_abgabe : t.examen_ueberspringen}
        </button>
      </div>
    </section>
  );
}

/** Le résultat d'un examen remis (H:2030-2048). */
function Resultat(props: { module: ModuleServiDe<'examen'>; remis: Remis; recommencer(): void }) {
  const { module, remis, recommencer } = props;
  const { cours, t, aller, useEtatDOnglet } = useCours();
  const [, imposer] = useEtatDOnglet<SeanceCartes | undefined>(CLE_SEANCE_IMPOSEE, () => undefined);
  const { correction, minutes } = remis;
  const bestanden = correction.note >= module.noteSuffisante;

  // Les cartes fausses, dans l'ordre de l'examen : les autres questions n'ont pas de carte.
  const cartesFausses = correction.fautes.flatMap(({ question }) =>
    question.genre === 'carte' ? [question.unite] : [],
  );
  const reviser = () => {
    imposer({ file: cartesFausses, faites: 0, justes: 0, deLExamen: true });
    aller('cartes');
  };

  return (
    <section>
      <div class="done" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <span class="kind">{t.examen_resultat}</span>
        <span class="grade">{correction.note.toFixed(1)}</span>
        <span class={`pill ${bestanden ? 'ok' : 'ko'}`}>
          {bestanden ? t.examen_bestanden : t.examen_nicht_bestanden}
        </span>
        <p>
          {formater(t.examen_punkte, {
            points: correction.points,
            questions: correction.questions,
            pourcent: Math.round((correction.points / correction.questions) * 100),
            minutes,
          })}
        </p>
      </div>

      <h2>{t.examen_nach_kapitel}</h2>
      <div class="table">
        {[...correction.parGroupe].map(([groupe, { justes, total }]) => (
          <div key={groupe}>
            <b>{libelleDuGroupe(groupe, cours, t)}</b>
            <span>{formater(t.examen_richtig, { justes, total })}</span>
            <em
              style={{
                color: `var(${justes / total >= module.seuilChapitre ? '--good' : '--bad'})`,
              }}
            >
              {Math.round((justes / total) * 100)} %
            </em>
          </div>
        ))}
      </div>

      {correction.fautes.length > 0 ? (
        <>
          <h2>{formater(t.examen_fehler, { n: correction.fautes.length })}</h2>
          <div class="table fautes">
            {correction.fautes.map(({ question, donnee }, i) => (
              <div key={`${i}|${enonceDe(question, t)}`}>
                <b>{enonceDe(question, t)}</b>
                <span>{libelleDe(question, reponseAttendue(question), t)}</span>
                <em>{donnee === undefined ? SANS_REPONSE : libelleDe(question, donnee, t)}</em>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p>{t.examen_keine_fehler}</p>
      )}

      <div class="controls">
        {cartesFausses.length > 0 && (
          <button type="button" class="primary" onClick={reviser}>
            {t.examen_fehler_ueben}
          </button>
        )}
        <button type="button" class="ghost" onClick={recommencer}>
          {t.examen_neue}
        </button>
      </div>
    </section>
  );
}
