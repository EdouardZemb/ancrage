import type { IndexDesReponses, UniteDeCarte } from '../cartes/unites.js';
import type { EtapeDePlanning, Planning } from '../contenu/modele.js';
import type { Hasard } from '../hasard.js';
import { melanger } from '../hasard.js';
import { type Evenement, estPretest } from '../journal/evenement.js';
import { joursEntre } from '../journal/temps.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { ouvertureDe } from './planning.js';
import { optionsQcm } from './quiz.js';

/*
 * Le pré-test d'une étape (M4, B-D11 à B-D13) : trois jours avant l'ouverture d'une étape de cours,
 * « Heute » propose cinq questions à choix sur ses cartes neuves. Le domaine ne lit ni l'horloge ni
 * le hasard : le jour et le hasard sont des paramètres. « Fait » se lit dans le journal seul.
 */

/** Le nombre de questions d'un pré-test, au plus (B-D13). */
export const TAILLE_DU_PRETEST = 5;

/** Le pré-test se propose de un à ce nombre de jours avant l'ouverture (B-D11). */
export const FENETRE_DU_PRETEST = 3;

export interface PretestPropose {
  etape: EtapeDePlanning;
  /** Les unités directes neuves de l'étape, dans l'ordre du cours. */
  neuves: UniteDeCarte[];
  /** Les unités directes des modules de l'étape : le pool des options. */
  pool: UniteDeCarte[];
}

/** Le journal porte une réponse `pretest` à une unité d'un module de l'étape (B-D12). */
export function pretestFait(
  etape: EtapeDePlanning,
  unites: readonly UniteDeCarte[],
  evenements: readonly Evenement[],
): boolean {
  const ids = new Set(
    unites.filter(({ module }) => etape.modules.includes(module)).map(({ id }) => id),
  );
  return evenements.some((evenement) => estPretest(evenement) && ids.has(evenement.unite));
}

/** Le pré-test que « Heute » propose aujourd'hui, ou `undefined` (B-D11). */
export function pretestDuJour(
  planning: Planning,
  depart: string,
  aujourdhui: string,
  unites: readonly UniteDeCarte[],
  etats: ReadonlyMap<string, EtatUnite>,
  evenements: readonly Evenement[],
): PretestPropose | undefined {
  for (const etape of planning.etapes) {
    if (etape.genre !== 'cours') continue;
    const jours = joursEntre(aujourdhui, ouvertureDe(etape, depart));
    if (jours < 1 || jours > FENETRE_DU_PRETEST) continue;
    const pool = unites.filter(
      ({ module, sens }) => sens === 'direct' && etape.modules.includes(module),
    );
    // `optionsQcm` écarte les réponses égales à la bonne : il faut deux réponses distinctes.
    if (new Set(pool.map(({ reponse }) => reponse)).size < 2) continue;
    const neuves = pool.filter(({ id }) => etatDe(etats, id).boite === 0);
    if (neuves.length === 0) continue;
    if (pretestFait(etape, unites, evenements)) continue;
    return { etape, neuves, pool };
  }
  return undefined;
}

/** Les questions du pré-test, au plus `TAILLE_DU_PRETEST`, une par carte (B-D13). */
export function questionsDuPretest(
  propose: PretestPropose,
  index: IndexDesReponses,
  hasard: Hasard,
): { unite: UniteDeCarte; options: string[] }[] {
  return melanger(propose.neuves, hasard)
    .slice(0, TAILLE_DU_PRETEST)
    .map((unite) => ({ unite, options: optionsQcm(unite, propose.pool, index, hasard) }));
}
