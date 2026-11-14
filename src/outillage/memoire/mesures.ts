import { ordonnanceurDuCours } from '../../client/cours/ordonnanceur-du-cours.js';
import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { type Evenement, MODES_DE_REPONSE } from '../../domaine/journal/evenement.js';
import { ajouterJours, jourDe } from '../../domaine/journal/temps.js';
import { estDue, journalSansDoublon } from '../../domaine/progression/etat.js';
import { posablesDuCours } from '../../domaine/seances/heute.js';

/*
 * Les mesures d'un journal (M3, rapport de suivi) : des comptes, jamais de texte. Une fonction
 * pure : le journal d'une personne, le cours et le jour du rapport donnent les mêmes mesures. Rien
 * ici ne nomme une personne ; le rapport d'ensemble additionne les mesures de chaque journal
 * (`sommerMesures`) et n'en tire aucun détail par personne.
 */

/** Une case d'un découpage : de combien de réponses, dont combien de justes. */
export interface Cellule {
  reponses: number;
  justes: number;
}

/**
 * Le moment où une unité revient, d'après sa réponse d'avant : `premiere` (jamais répondue),
 * `meme-jour` (redonnée le jour même), `boite-N` (à son échéance ou après, depuis la boîte N) et
 * `avant-echeance` (revue avant son échéance, de n'importe quelle boîte).
 */
export const CLES_DE_DELAI = [
  'premiere',
  'meme-jour',
  'boite-1',
  'boite-2',
  'boite-3',
  'boite-4',
  'boite-5',
  'avant-echeance',
] as const;
export type CleDeDelai = (typeof CLES_DE_DELAI)[number];

/** Les modes de réponse, puis les réponses qui n'en portent pas. */
export const CLES_DE_MODE = [...MODES_DE_REPONSE, 'sans-mode'] as const;
export type CleDeMode = (typeof CLES_DE_MODE)[number];

export interface Mesures {
  premierJour: string | null;
  dernierJour: string | null;
  reponses: number;
  /** Par jour local où il y a eu une réponse : leur nombre, et les unités répondues pour la première fois. */
  parJour: Record<string, { reponses: number; decouvertes: number }>;
  delais: Record<CleDeDelai, Cellule>;
  modes: Record<CleDeMode, Cellule>;
  /** Les éléments du cours par boîte, de 0 (jamais vus) à 5, d'après l'état du jour. */
  boites: number[];
  /** Les éléments qui se posent seuls, dans le cours (ou leur somme, pour plusieurs journaux). */
  elements: number;
  /** Les éléments dus au jour du rapport. */
  dues: number;
  /** Les écarts, en secondes, entre deux réponses qui se suivent à moins de deux minutes, triés. */
  ecarts: number[];
  /** Leur médiane, en secondes ; `null` s'il n'y en a aucun. */
  ecartMedian: number | null;
}

/** Au-dessous, une case d'un rapport d'ensemble est omise ou fondue (M3-P6). */
export const MINIMUM_D_UNE_CASE = 20;

/** Il faut trois personnes actives au moins pour un rapport d'ensemble (M3-P6). */
export const PERSONNES_ACTIVES_MINIMUM = 3;

/** Aucune personne ne fait plus de 70 % (en pour cent) des réponses d'une case d'un rapport d'ensemble. */
export const PART_MAXIMALE_D_UNE_PERSONNE = 70;
const POURCENT = 100;

/**
 * La règle d'une case d'un rapport d'ensemble, la seule : `comptes` est le nombre de réponses (ou
 * d'éléments) de chaque personne dans la case. Il faut au moins `PERSONNES_ACTIVES_MINIMUM` personnes
 * distinctes qui y comptent, au moins `MINIMUM_D_UNE_CASE` en tout, et aucune personne à plus de
 * `PART_MAXIMALE_D_UNE_PERSONNE` du total : sans quoi la case décrirait une personne.
 */
export function caseAdmise(comptes: readonly number[]): boolean {
  const presents = comptes.filter((compte) => compte > 0);
  const total = presents.reduce((somme, compte) => somme + compte, 0);
  const plusGrand = Math.max(0, ...presents);
  return (
    presents.length >= PERSONNES_ACTIVES_MINIMUM &&
    total >= MINIMUM_D_UNE_CASE &&
    plusGrand * POURCENT <= total * PART_MAXIMALE_D_UNE_PERSONNE
  );
}

/** Une personne est active à 20 réponses au moins dans les 28 jours qui finissent au jour du rapport. */
const REPONSES_D_UNE_PERSONNE_ACTIVE = 20;
const JOURS_D_ACTIVITE = 28;
const MS_PAR_SECONDE = 1000;
const ECART_MAXIMAL_EN_SECONDES = 120;
const REUSSITE_PAR_DEFAUT = 0.5;
const BOITES = [1, 2, 3, 4, 5] as const;

const cellule = (): Cellule => ({ reponses: 0, justes: 0 });

function cellules<T extends string>(cles: readonly T[]): Record<T, Cellule> {
  return Object.fromEntries(cles.map((cle) => [cle, cellule()])) as Record<T, Cellule>;
}

function compter(cible: Cellule, juste: boolean): void {
  cible.reponses += 1;
  if (juste) cible.justes += 1;
}

function mediane(triees: readonly number[]): number | null {
  if (triees.length === 0) return null;
  const milieu = Math.floor(triees.length / 2);
  const bas = triees[milieu - 1] ?? 0;
  const haut = triees[milieu] ?? 0;
  return triees.length % 2 === 1 ? haut : (bas + haut) / 2;
}

function mesuresVides(): Mesures {
  return {
    premierJour: null,
    dernierJour: null,
    reponses: 0,
    parJour: {},
    delais: cellules(CLES_DE_DELAI),
    modes: cellules(CLES_DE_MODE),
    boites: [0, 0, 0, 0, 0, 0],
    elements: 0,
    dues: 0,
    ecarts: [],
    ecartMedian: null,
  };
}

/** La case d'un jour, créée à la première réponse. */
function caseDuJour(parJour: Mesures['parJour'], jour: string): Mesures['parJour'][string] {
  const existante = parJour[jour];
  if (existante !== undefined) return existante;
  const neuve = { reponses: 0, decouvertes: 0 };
  parJour[jour] = neuve;
  return neuve;
}

type Reponse = Evenement & { type: 'reponse' };

/** Les réponses du journal, sans doublon, dans l'ordre du journal. */
function reponsesDe(journal: readonly Evenement[]): Reponse[] {
  return journalSansDoublon(journal).filter(
    (evenement): evenement is Reponse => evenement.type === 'reponse',
  );
}

/** La case de délai de `reponse`, d'après les réponses d'avant de son unité. */
function delaiDe(
  reponse: Reponse,
  avant: readonly Evenement[],
  ordonnanceur: ReturnType<typeof ordonnanceurDuCours>,
): CleDeDelai {
  const derniere = avant.at(-1);
  if (derniere === undefined) return 'premiere';
  const jour = jourDe(reponse.repondu_a);
  if (jourDe(derniere.repondu_a) === jour) return 'meme-jour';
  // L'état d'une unité ne dépend que de ses propres réponses : chaque algorithme rejoue une unité
  // sans regarder les autres.
  const etat = ordonnanceur(avant).get(reponse.unite);
  if (etat?.echeance === null || etat?.echeance === undefined || etat.echeance > jour) {
    return 'avant-echeance';
  }
  return `boite-${etat.boite}` as CleDeDelai;
}

/** Les mesures du `journal` d'une personne, pour `cours`, au jour `aujourdhui` du rapport. */
export function mesures(
  journal: readonly Evenement[],
  cours: CoursPrepare,
  aujourdhui: string,
): Mesures {
  const reponses = reponsesDe(journal);
  const ordonnanceur = ordonnanceurDuCours(cours);
  const resultat = mesuresVides();
  resultat.reponses = reponses.length;

  const parUnite = new Map<string, Evenement[]>();
  let instantDAvant: number | undefined;
  for (const reponse of reponses) {
    const jour = jourDe(reponse.repondu_a);
    resultat.premierJour ??= jour;
    resultat.dernierJour = jour;
    const duJour = caseDuJour(resultat.parJour, jour);
    duJour.reponses += 1;
    compter(resultat.modes[reponse.resultat.mode ?? 'sans-mode'], reponse.resultat.juste);

    const instant = Date.parse(reponse.repondu_a);
    if (instantDAvant !== undefined) {
      const ecart = (instant - instantDAvant) / MS_PAR_SECONDE;
      if (ecart >= 0 && ecart < ECART_MAXIMAL_EN_SECONDES) resultat.ecarts.push(ecart);
    }
    instantDAvant = instant;

    const avant = parUnite.get(reponse.unite) ?? [];
    parUnite.set(reponse.unite, avant);
    const delai = delaiDe(reponse, avant, ordonnanceur);
    if (delai === 'premiere') duJour.decouvertes += 1;
    compter(resultat.delais[delai], reponse.resultat.juste);
    avant.push(reponse);
  }
  resultat.ecarts.sort((a, b) => a - b);
  resultat.ecartMedian = mediane(resultat.ecarts);

  const etats = ordonnanceur(reponses);
  for (const { id } of posablesDuCours(cours)) {
    const etat = etats.get(id);
    const boite = etat?.boite ?? 0;
    resultat.elements += 1;
    resultat.boites[boite] = (resultat.boites[boite] ?? 0) + 1;
    if (etat !== undefined && estDue(etat, aujourdhui)) resultat.dues += 1;
  }
  return resultat;
}

/** La somme de plusieurs mesures : les comptes s'additionnent, les écarts se mêlent. */
export function sommerMesures(liste: readonly Mesures[]): Mesures {
  const somme = mesuresVides();
  const ajouter = (cible: Cellule, source: Cellule) => {
    cible.reponses += source.reponses;
    cible.justes += source.justes;
  };
  for (const m of liste) {
    if (
      m.premierJour !== null &&
      (somme.premierJour === null || m.premierJour < somme.premierJour)
    ) {
      somme.premierJour = m.premierJour;
    }
    if (
      m.dernierJour !== null &&
      (somme.dernierJour === null || m.dernierJour > somme.dernierJour)
    ) {
      somme.dernierJour = m.dernierJour;
    }
    somme.reponses += m.reponses;
    somme.elements += m.elements;
    somme.dues += m.dues;
    somme.ecarts.push(...m.ecarts);
    for (const [jour, valeurs] of Object.entries(m.parJour)) {
      const cible = caseDuJour(somme.parJour, jour);
      cible.reponses += valeurs.reponses;
      cible.decouvertes += valeurs.decouvertes;
    }
    for (const cle of CLES_DE_DELAI) ajouter(somme.delais[cle], m.delais[cle]);
    for (const cle of CLES_DE_MODE) ajouter(somme.modes[cle], m.modes[cle]);
    m.boites.forEach((nombre, rang) => {
      somme.boites[rang] = (somme.boites[rang] ?? 0) + nombre;
    });
  }
  somme.ecarts.sort((a, b) => a - b);
  somme.ecartMedian = mediane(somme.ecarts);
  return somme;
}

/** La part de justes d'une case, ou `undefined` si elle est vide. */
export function partDeJustes(c: Cellule): number | undefined {
  return c.reponses === 0 ? undefined : c.justes / c.reponses;
}

export interface ReussiteObservee {
  premiere: number;
  memeJour: number;
  /** À l'index de la boîte d'avant, de 1 à 5 ; l'index 0 n'est pas lu. */
  parBoite: number[];
}

/**
 * La réussite observée, pour la projection : la première réponse, la réponse redonnée le même jour,
 * et, à l'index de la boîte d'avant (de 1 à 5), la révision faite à l'échéance. Sans donnée, 0,5.
 */
export function reussiteObservee(m: Mesures): ReussiteObservee {
  return {
    premiere: partDeJustes(m.delais.premiere) ?? REUSSITE_PAR_DEFAUT,
    memeJour: partDeJustes(m.delais['meme-jour']) ?? REUSSITE_PAR_DEFAUT,
    parBoite: [
      REUSSITE_PAR_DEFAUT,
      ...BOITES.map((boite) => partDeJustes(m.delais[`boite-${boite}`]) ?? REUSSITE_PAR_DEFAUT),
    ],
  };
}

/**
 * Une personne est active : 20 réponses au moins dans les 28 jours qui finissent au jour du rapport
 * (`aujourdhui`, compris). Un compte dont les réponses sont plus anciennes n'est plus actif, et une
 * réponse d'après le jour du rapport ne compte pas.
 */
export function estActive(journal: readonly Evenement[], aujourdhui: string): boolean {
  const debut = ajouterJours(aujourdhui, 1 - JOURS_D_ACTIVITE);
  return (
    reponsesDe(journal).filter((reponse) => {
      const jour = jourDe(reponse.repondu_a);
      return jour >= debut && jour <= aujourdhui;
    }).length >= REPONSES_D_UNE_PERSONNE_ACTIVE
  );
}
