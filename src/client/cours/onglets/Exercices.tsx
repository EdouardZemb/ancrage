/*
 * « Grammatik » (`renderGram`, H:2173-2197, et les touches de H:2252-2253) : un exercice à la fois,
 * tiré dans une famille ou dans toutes (« Gemischt »). Les invites, les libellés des familles, les
 * options et les règles sont dans le contenu. Un exercice qui a des options se répond par un choix ;
 * sans options, on tape la réponse, jugée à la graphie exacte (`egalStrict`, « Hier zählt die genaue
 * Schreibweise »).
 *
 * Après la réponse, le verdict montre la bonne réponse et, si l'exercice en a une, sa règle. Une
 * invite qui commence par « ___ » (un article à trouver) y est complétée : la réponse suivie du mot
 * (H:2181). Chaque réponse est journalisée sur l'exercice.
 *
 * La série (le score) et l'exercice en cours vivent dans l'écran du cours (`useEtatDOnglet`) : un
 * détour par un autre onglet les retrouve. Elle recommence au changement de famille. Un choix sans
 * exercice n'a rien à poser : l'onglet le dit, et ne plante pas.
 */
import type { Exercice, FamilleExercices } from '../../../domaine/contenu/modele.js';
import { egalStrict } from '../../../domaine/correction.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { reussis } from '../../../domaine/progression/statistiques.js';
import { choisirExercice } from '../../../domaine/seances/exercices.js';
import { useTouches } from '../clavier.js';
import {
  ChoixDeMode,
  classeDeLaQuestion,
  focaliser,
  Options,
  SaisieDeLaReponse,
} from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** L'invite d'un article commence ainsi : la bonne réponse vient la compléter (H:2181). */
const TROU_D_ARTICLE = /^___\s*/;
/** Les touches de 1 à 9 choisissent la première à la neuvième option. */
const OPTIONS_PAR_TOUCHE = 9;

interface Tirage {
  famille: FamilleExercices;
  exercice: Exercice;
}

/** Ce que la personne a répondu, et si c'était juste. */
interface Reponse {
  juste: boolean;
  donnee: string;
}

/** `tirage` est `null` quand le choix n'a aucun exercice. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  tirage: Tirage | null;
  reponse: Reponse | null;
}

export function Exercices() {
  const { cours } = useCours();
  return cours.exercices === undefined ? null : <ExercicesDuModule module={cours.exercices} />;
}

/** La réponse telle que le verdict la montre : un article est suivi de son mot. */
function reponseMontree(exercice: Exercice): string {
  return TROU_D_ARTICLE.test(exercice.invite)
    ? `${exercice.reponse} ${exercice.invite.replace(TROU_D_ARTICLE, '')}`
    : exercice.reponse;
}

function ExercicesDuModule(props: { module: ModuleServiDe<'exercices'> }) {
  const { module } = props;
  const { t, etats, enregistrer, preferences, changerPreferences, hasard, useEtatDOnglet } =
    useCours();
  const choix = preferences.exercices.famille;

  const tirer = (): Tirage | null => {
    // Un code que le module n'a plus vaut le mélange (`choisirExercice`).
    const choisie = module.familles.find(({ code }) => code === choix);
    const candidats = (choisie === undefined ? module.familles : [choisie]).flatMap(
      (famille) => famille.exercices,
    );
    return candidats.length === 0 ? null : choisirExercice(module, etats, choix, hasard);
  };
  const demarrer = (): Serie => ({
    cle: choix,
    faites: 0,
    justes: 0,
    tirage: tirer(),
    reponse: null,
  });
  const [courante, setCourante] = useEtatDOnglet<Serie>('exercices', demarrer, serieCommencee);
  // Une autre famille : on recommence.
  let serie = courante;
  if (courante.cle !== choix) serie = demarrer();
  if (serie !== courante) setCourante(serie);

  const { tirage, reponse } = serie;
  const options = tirage?.exercice.options;

  const repondre = (donnee: string) => {
    if (tirage === null || reponse !== null) return;
    const juste = egalStrict(donnee, tirage.exercice.reponse);
    setCourante({
      ...serie,
      faites: serie.faites + 1,
      justes: serie.justes + (juste ? 1 : 0),
      reponse: { juste, donnee },
    });
    void enregistrer(tirage.exercice.id, juste);
  };

  const touches = Object.fromEntries(
    (options ?? [])
      .slice(0, OPTIONS_PAR_TOUCHE)
      .map((option, i) => [String(i + 1), () => repondre(option)]),
  );
  useTouches(touches, options !== undefined && reponse === null);

  const exercices = module.familles.flatMap((famille) => famille.exercices);
  const acquis = reussis(
    exercices.map(({ id }) => id),
    etats,
  );

  return (
    <section>
      <div class="controls">
        <ChoixDeMode
          valeur={choix}
          modes={module.familles.map(({ code, libelle }) => ({ valeur: code, libelle }))}
          onChoix={(famille) => changerPreferences({ ...preferences, exercices: { famille } })}
        />
        <span class="progressline">
          {formater(t.serie_resultat, { justes: serie.justes, faites: serie.faites })}
          {' · '}
          {formater(t.exercices_gekonnt, { n: acquis, total: exercices.length })}
        </span>
      </div>

      {tirage === null ? (
        <p class="muted">{t.onglet_vide}</p>
      ) : (
        <>
          <div class="card" style={{ minHeight: '180px' }}>
            <span class="kind">{tirage.famille.libelle}</span>
            <span class={classeDeLaQuestion(tirage.exercice.invite)}>{tirage.exercice.invite}</span>
            {options === undefined && reponse === null && (
              <SaisieDeLaReponse onVerifier={repondre} />
            )}
            {reponse !== null && (
              <>
                <div class={`verdict ${reponse.juste ? 'ok' : 'ko'}`}>
                  <span>{reponse.juste ? t.verdict_juste : t.verdict_fausse}</span>
                  {!reponse.juste && reponse.donnee !== '' && <s>{reponse.donnee}</s>}
                  <b>{reponseMontree(tirage.exercice)}</b>
                </div>
                {tirage.exercice.regle ? <p class="rule">{tirage.exercice.regle}</p> : null}
              </>
            )}
          </div>
          {options !== undefined && reponse === null && (
            <Options options={options} choisir={(i) => repondre(options[i])} />
          )}
          {reponse !== null && (
            <button
              type="button"
              class="primary"
              ref={focaliser}
              onClick={() => setCourante({ ...serie, tirage: tirer(), reponse: null })}
            >
              {t.suivante}
            </button>
          )}
          <p class="kbd">{t.exercices_hinweis}</p>
        </>
      )}
    </section>
  );
}
