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
 * Le pré-test d'une étape (M4, B-D11 à B-D13) : de un à trois jours avant l'ouverture d'une étape
 * de cours, « Heute » propose au plus cinq questions à choix sur ses cartes neuves. Le domaine ne lit
 * ni l'horloge ni le hasard : le jour et le hasard sont des paramètres. « Fait » se lit dans le
 * journal seul.
 */

/** Le nombre de questions d'un pré-test, au plus (B-D13). */
export const TAILLE_DU_PRETEST = 5;

/** Le pré-test se propose de un à ce nombre de jours avant l'ouverture (B-D11). */
export const FENETRE_DU_PRETEST = 3;

export interface PretestPropose {
  etape: EtapeDePlanning;
  /** Les unités directes neuves de l'étape, dans l'ordre du cours. */
  neuves: UniteDeCarte[];
  /** Les unités directes des modules que l'étape ouvre : le pool des options. */
  pool: UniteDeCarte[];
}

/**
 * Les modules que l'étape ouvre : ceux qu'aucune étape ouverte avant elle ne cite. À ouverture
 * égale, l'étape placée avant dans le planning l'emporte (B-D12).
 */
function modulesOuverts(etape: EtapeDePlanning, planning: Planning, depart: string): string[] {
  const rang = planning.etapes.indexOf(etape);
  const ouverture = ouvertureDe(etape, depart);
  const dejaCites = new Set<string>();
  planning.etapes.forEach((autre, i) => {
    const quand = ouvertureDe(autre, depart);
    if (quand < ouverture || (quand === ouverture && i < rang)) {
      for (const module of autre.modules) dejaCites.add(module);
    }
  });
  return etape.modules.filter((module) => !dejaCites.has(module));
}

/**
 * Le journal porte une réponse `pretest` à une unité d'un module que l'étape ouvre (B-D12).
 * Exportée pour son test : l'étape doit être celle du planning, pas une copie (`indexOf`).
 */
export function pretestFait(
  etape: EtapeDePlanning,
  planning: Planning,
  depart: string,
  unites: readonly UniteDeCarte[],
  evenements: readonly Evenement[],
): boolean {
  const ouverts = modulesOuverts(etape, planning, depart);
  const ids = new Set(unites.filter(({ module }) => ouverts.includes(module)).map(({ id }) => id));
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
    const ouverts = modulesOuverts(etape, planning, depart);
    const pool = unites.filter(({ module, sens }) => sens === 'direct' && ouverts.includes(module));
    // `optionsQcm` écarte les réponses égales à la bonne : il faut deux réponses distinctes.
    if (new Set(pool.map(({ reponse }) => reponse)).size < 2) continue;
    const neuves = pool.filter(({ id }) => etatDe(etats, id).boite === 0);
    if (neuves.length === 0) continue;
    if (pretestFait(etape, planning, depart, unites, evenements)) continue;
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
