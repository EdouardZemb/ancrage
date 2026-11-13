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
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import { reussis } from '../../../domaine/progression/statistiques.js';
import { choisirExercice } from '../../../domaine/seances/exercices.js';
import { ChoixDeMode } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { QuestionDExercice, type ReponseDExercice } from '../questions/QuestionDExercice.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

interface Tirage {
  famille: FamilleExercices;
  exercice: Exercice;
}

/** `tirage` est `null` quand le choix n'a aucun exercice. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  tirage: Tirage | null;
  reponse: ReponseDExercice | null;
}

export function Exercices() {
  const { cours } = useCours();
  return cours.exercices === undefined ? null : <ExercicesDuModule module={cours.exercices} />;
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

  const repondre = (jugee: ReponseDExercice, mode: ModeDeReponse) => {
    if (tirage === null || reponse !== null) return;
    setCourante({
      ...serie,
      faites: serie.faites + 1,
      justes: serie.justes + (jugee.juste ? 1 : 0),
      reponse: jugee,
    });
    void enregistrer(tirage.exercice.id, jugee.juste, mode);
  };

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
        <QuestionDExercice
          famille={tirage.famille}
          exercice={tirage.exercice}
          reponse={reponse}
          onReponse={repondre}
          onSuivante={() => setCourante({ ...serie, tirage: tirer(), reponse: null })}
        />
      )}
    </section>
  );
}
