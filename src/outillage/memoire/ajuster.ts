import {
  computeParameters,
  FSRSBindingItem,
  FSRSBindingReview,
} from '@open-spaced-repetition/binding';
import { clipFSRS6Parameters, FSRS6_DEFAULT_WEIGHTS, FSRS6Model } from 'ts-fsrs/models/fsrs-6';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { joursEntre } from '../../domaine/journal/temps.js';
import { revuesDuJournal } from '../../domaine/progression/fsrs.js';
import { poidsFsrsValides } from '../../domaine/progression/reglages.js';

/*
 * L'ajustement des 21 poids de FSRS-6 sur les journaux d'un cours (M3, outil du poste ; M3-P10).
 *
 * Ce que lit l'optimiseur est ce que lit le rejeu : la suite des révisions de chaque unité vient de
 * `revuesDuJournal`, la fonction même d'`etatsFsrs`. Une réponse juste est la note « Good » (3), une
 * fausse « Again » (1) ; les réponses d'un même jour se suivent à zéro jour d'écart.
 *
 * Le rejeu tourne sans court terme (`enableShortTerm: false`) : l'optimiseur aussi. Il laisse alors
 * à leur valeur par défaut les poids de court terme (les poids 17 à 19), que le rejeu n'utilise pas.
 * La qualité n'est pas celle de l'optimiseur : elle se calcule ici, d'après le rejeu, sur les
 * révisions qui ne sont ni la première de leur unité ni du même jour que la précédente (pour
 * celles-là, la probabilité de rappel vaut 1 quel que soit le poids).
 */

/** Sous ce nombre de révisions exploitables, les poids ajustés ne vaudraient rien. */
export const MINIMUM_DE_REVUES = 1000;

const DECIMALES = 1e4;
const NOMBRE_DE_TRANCHES = 10;
/** Une probabilité jamais tout à fait 0 ni 1, pour que la perte logarithmique reste finie. */
const EPSILON = 1e-6;
const NOTE_JUSTE = 3;
const NOTE_FAUSSE = 1;

type Suite = ReturnType<typeof revuesDuJournal>[number];

/** Les suites de révisions de chaque unité de chaque journal, telles que le rejeu les lit. */
function suitesDe(journaux: readonly (readonly Evenement[])[]): Suite[] {
  return journaux.flatMap((journal) => revuesDuJournal(journal));
}

/**
 * Ce que reçoit l'optimiseur : un élément par révision après la première de son unité, qui porte
 * tout l'historique de l'unité jusqu'à elle. L'écart d'une révision est le nombre de jours depuis la
 * précédente, 0 pour celles du même jour et pour la première.
 */
export function elementsDEntrainement(
  journaux: readonly (readonly Evenement[])[],
): FSRSBindingItem[] {
  const elements: FSRSBindingItem[] = [];
  for (const { jours, justes } of suitesDe(journaux)) {
    for (let rang = 1; rang < jours.length; rang++) {
      elements.push(
        new FSRSBindingItem(
          jours
            .slice(0, rang + 1)
            .map(
              (jour, i) =>
                new FSRSBindingReview(
                  justes[i] === true ? NOTE_JUSTE : NOTE_FAUSSE,
                  i === 0 ? 0 : joursEntre(jours[i - 1] as string, jour),
                ),
            ),
        ),
      );
    }
  }
  return elements;
}

/** La probabilité de rappel que FSRS prédit juste avant une réponse, et ce qu'elle a été. */
export interface Prediction {
  probabilite: number;
  juste: boolean;
}

/**
 * Pour chaque révision qui n'est ni la première de son unité ni du même jour que la précédente, la
 * probabilité de rappel d'après la stabilité de l'unité (rejouée avec les `poids`, comme le rejeu) et
 * les jours écoulés, et le verdict.
 */
export function probabilitesPredites(
  poids: readonly number[],
  suites: readonly Suite[],
): Prediction[] {
  const modele = FSRS6Model.create({
    config: {
      weights: [...poids],
      enableShortTerm: false,
      numRelearningSteps: 0,
    },
  });
  const predictions: Prediction[] = [];
  for (const { jours, justes } of suites) {
    let memoire: ReturnType<typeof modele.step> | undefined;
    jours.forEach((jour, rang) => {
      const ecoules = rang === 0 ? 0 : joursEntre(jours[rang - 1] as string, jour);
      const juste = justes[rang] === true;
      if (memoire !== undefined && ecoules > 0) {
        predictions.push({ probabilite: modele.forgettingCurve(memoire, ecoules), juste });
      }
      memoire = modele.step({
        memoryState: memoire ?? null,
        rating: juste ? NOTE_JUSTE : NOTE_FAUSSE,
        elapsedDays: ecoules,
      });
    });
  }
  return predictions;
}

/** Une tranche de probabilité prédite, de `de` à `a` pour cent. */
export interface Tranche {
  de: number;
  a: number;
  revues: number;
  /** La probabilité de rappel prédite, en moyenne (0 à 1) ; 0 sans révision. */
  predite: number;
  /** La part des réponses justes (0 à 1) ; 0 sans révision. */
  observee: number;
}

/** La qualité de la prédiction de FSRS pour des poids, sur des journaux. */
export interface Qualite {
  /** La perte logarithmique moyenne : plus elle est basse, meilleure est la prédiction. */
  perte: number;
  revues: number;
  tranches: Tranche[];
}

function qualiteDesPredictions(predictions: readonly Prediction[]): Qualite {
  const pas = 100 / NOMBRE_DE_TRANCHES;
  const cases = Array.from({ length: NOMBRE_DE_TRANCHES }, () => ({
    revues: 0,
    somme: 0,
    justes: 0,
  }));
  let perte = 0;
  for (const { probabilite, juste } of predictions) {
    const p = Math.min(1 - EPSILON, Math.max(EPSILON, probabilite));
    perte -= juste ? Math.log(p) : Math.log(1 - p);
    const tranche = cases[Math.min(NOMBRE_DE_TRANCHES - 1, Math.floor(probabilite * 10))];
    if (tranche === undefined) continue;
    tranche.revues++;
    tranche.somme += probabilite;
    tranche.justes += juste ? 1 : 0;
  }
  return {
    perte: predictions.length === 0 ? 0 : perte / predictions.length,
    revues: predictions.length,
    tranches: cases.map(({ revues, somme, justes }, rang) => ({
      de: rang * pas,
      a: (rang + 1) * pas,
      revues,
      predite: revues === 0 ? 0 : somme / revues,
      observee: revues === 0 ? 0 : justes / revues,
    })),
  };
}

/** La qualité de la prédiction de FSRS avec ces `poids`, sur ces journaux. */
export function qualiteDe(
  poids: readonly number[],
  journaux: readonly (readonly Evenement[])[],
): Qualite {
  return qualiteDesPredictions(probabilitesPredites(poids, suitesDe(journaux)));
}

export type Ajustement =
  | { ajuste: false; revues: number }
  | {
      ajuste: true;
      /** Les 21 poids, arrondis à 4 décimales, valides pour le manifeste. */
      parametres: number[];
      revues: number;
      /** La qualité avec les poids par défaut. */
      avant: Qualite;
      /** La qualité avec les poids ajustés. */
      apres: Qualite;
    };

/**
 * Ajuste les poids sur les `journaux` (un par personne, tous comptes confondus). Avec moins de
 * `MINIMUM_DE_REVUES` révisions exploitables, ne rend aucun paramètre.
 */
export async function ajuster(journaux: readonly (readonly Evenement[])[]): Promise<Ajustement> {
  const avant = qualiteDe(FSRS6_DEFAULT_WEIGHTS, journaux);
  if (avant.revues < MINIMUM_DE_REVUES) return { ajuste: false, revues: avant.revues };
  const bruts = await computeParameters(elementsDEntrainement(journaux), {
    modelVersion: 'FSRS-6',
    enableShortTerm: false,
    numRelearningSteps: 0,
  });
  // L'optimiseur peut rendre un poids sous la borne du modèle (une stabilité initiale de 0,0008 jour
  // pour une unité jamais sue) : on ramène chaque poids dans les bornes de FSRS-6, comme le fait
  // la bibliothèque qui rejoue, après l'arrondi.
  const parametres = clipFSRS6Parameters(
    bruts.map((poids) => Math.round(poids * DECIMALES) / DECIMALES),
    0,
    false,
  );
  if (!poidsFsrsValides(parametres)) {
    throw new Error("l'optimiseur a rendu des poids que FSRS-6 refuse");
  }
  return {
    ajuste: true,
    parametres,
    revues: avant.revues,
    avant,
    apres: qualiteDe(parametres, journaux),
  };
}
