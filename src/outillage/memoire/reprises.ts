import { jourDe } from '../../domaine/journal/temps.js';
import {
  ajouterCellule,
  type Cellule,
  CLES_DE_DELAI,
  CLES_DE_MODE,
  type CleDeDelai,
  type CleDeMode,
  cellules,
  compter,
  dansLaFenetre,
} from './cellules.js';

/*
 * Les reprises du jour (M7, rapport de suivi) : ce que valent les réponses redonnées à un élément le
 * jour même. Des comptes, jamais de texte ni de personne. Un « couple » est la suite des réponses
 * d'un élément le même jour local ; une reprise est une réponse qui n'ouvre pas son couple, donc la
 * même réponse que `delaiDe` range dans `meme-jour`. Tout se dérive du journal, en une passe.
 */

/** Le verdict de la réponse d'avant (ou de la première réponse du couple, pour la répartition). */
export const CLES_DE_VERDICT = ['faute', 'juste'] as const;
export type CleDeVerdict = (typeof CLES_DE_VERDICT)[number];

/** Le rang d'une reprise : le nombre de réponses du couple avant elle. */
export const CLES_DE_RANG = ['rang-1', 'rang-2', 'rang-3', 'rang-4-et-plus'] as const;
export type CleDeRang = (typeof CLES_DE_RANG)[number];

/** Le nombre d'autres réponses entre la réponse d'avant de l'élément et la reprise. */
export const CLES_D_ESPACEMENT = [
  'ecart-0',
  'ecart-1-2',
  'ecart-3-5',
  'ecart-6-10',
  'ecart-11-et-plus',
] as const;
export type CleDEspacement = (typeof CLES_D_ESPACEMENT)[number];

/** Le nombre de reprises d'un couple. */
export const CLES_DE_REPARTITION = [
  'reprises-0',
  'reprises-1',
  'reprises-2',
  'reprises-3',
  'reprises-4-et-plus',
] as const;
export type CleDeRepartition = (typeof CLES_DE_REPARTITION)[number];

/** Les reprises qui suivent la première faute d'un couple, pour la réponse d'un autre jour. */
export const CLES_APRES_UNE_FAUTE = [
  'apres-faute-0',
  'apres-faute-1',
  'apres-faute-2',
  'apres-faute-3-et-plus',
] as const;
export type CleApresUneFaute = (typeof CLES_APRES_UNE_FAUTE)[number];

/** Les bornes hautes des quatre premières classes d'espacement ; au-delà, la dernière. */
const BORNES_D_ESPACEMENT = [0, 2, 5, 10] as const;

export interface MesuresDeReprises {
  /** Par verdict de la réponse d'avant, puis par rang. */
  rangs: Record<CleDeVerdict, Record<CleDeRang, Cellule>>;
  espacements: Record<CleDeVerdict, Record<CleDEspacement, Cellule>>;
  modes: Record<CleDeVerdict, Record<CleDeMode, Cellule>>;
  /** Des couples (élément, jour), par verdict de leur première réponse : des nombres. */
  repartition: Record<CleDeVerdict, Record<CleDeRepartition, number>>;
  /** La première réponse d'un autre jour, selon les reprises qui suivent la première faute. */
  apresUnJourDeFaute: Record<CleApresUneFaute, Cellule>;
  /**
   * Ces mêmes réponses d'un autre jour, par moment (le délai de `mesures`) et par mode : le rapport
   * d'ensemble en tire ce qui reste d'une ligne de moment ou de mode hors de ces réponses (M7-D6).
   */
  apresParMoment: Record<CleApresUneFaute, Record<CleDeDelai, number>>;
  apresParMode: Record<CleApresUneFaute, Record<CleDeMode, number>>;
}

export interface ReponseSuivie {
  unite: string;
  repondu_a: string;
  juste: boolean;
  mode: CleDeMode;
  /** Le moment où elle revient, selon `delaiDe`. */
  delai: CleDeDelai;
}

function parVerdict<T>(fabrique: () => T): Record<CleDeVerdict, T> {
  return { faute: fabrique(), juste: fabrique() };
}

function nombres<T extends string>(cles: readonly T[]): Record<T, number> {
  return Object.fromEntries(cles.map((cle) => [cle, 0])) as Record<T, number>;
}

export function reprisesVides(): MesuresDeReprises {
  return {
    rangs: parVerdict(() => cellules(CLES_DE_RANG)),
    espacements: parVerdict(() => cellules(CLES_D_ESPACEMENT)),
    modes: parVerdict(() => cellules(CLES_DE_MODE)),
    repartition: parVerdict(() => nombres(CLES_DE_REPARTITION)),
    apresUnJourDeFaute: cellules(CLES_APRES_UNE_FAUTE),
    apresParMoment: Object.fromEntries(
      CLES_APRES_UNE_FAUTE.map((cle) => [cle, nombres(CLES_DE_DELAI)]),
    ) as MesuresDeReprises['apresParMoment'],
    apresParMode: Object.fromEntries(
      CLES_APRES_UNE_FAUTE.map((cle) => [cle, nombres(CLES_DE_MODE)]),
    ) as MesuresDeReprises['apresParMode'],
  };
}

/** Additionne `source` dans `cible`, case par case. */
export function ajouterReprises(cible: MesuresDeReprises, source: MesuresDeReprises): void {
  for (const verdict of CLES_DE_VERDICT) {
    for (const cle of CLES_DE_RANG) {
      ajouterCellule(cible.rangs[verdict][cle], source.rangs[verdict][cle]);
    }
    for (const cle of CLES_D_ESPACEMENT) {
      ajouterCellule(cible.espacements[verdict][cle], source.espacements[verdict][cle]);
    }
    for (const cle of CLES_DE_MODE) {
      ajouterCellule(cible.modes[verdict][cle], source.modes[verdict][cle]);
    }
    for (const cle of CLES_DE_REPARTITION) {
      cible.repartition[verdict][cle] += source.repartition[verdict][cle];
    }
  }
  for (const cle of CLES_APRES_UNE_FAUTE) {
    ajouterCellule(cible.apresUnJourDeFaute[cle], source.apresUnJourDeFaute[cle]);
    for (const moment of CLES_DE_DELAI) {
      cible.apresParMoment[cle][moment] += source.apresParMoment[cle][moment];
    }
    for (const mode of CLES_DE_MODE)
      cible.apresParMode[cle][mode] += source.apresParMode[cle][mode];
  }
}

const verdictDe = (juste: boolean): CleDeVerdict => (juste ? 'juste' : 'faute');

/** La clé d'une liste dont la dernière classe est « n et plus » : `indice` part de zéro. */
const parIndice = <T extends string>(cles: readonly T[], indice: number): T =>
  cles[Math.min(indice, cles.length - 1)] as T;

function classeDEspacement(autres: number): CleDEspacement {
  const indice = BORNES_D_ESPACEMENT.findIndex((borne) => autres <= borne);
  return CLES_D_ESPACEMENT[indice === -1 ? BORNES_D_ESPACEMENT.length : indice] as CleDEspacement;
}

/** Le couple (élément, jour) encore ouvert d'un élément. */
interface Couple {
  jour: string;
  reponses: number;
  premiereJuste: boolean;
  derniereJuste: boolean;
  indiceDeLaDerniere: number;
  /** Les réponses après la première faute du couple ; `null` sans faute. */
  apresLaFaute: number | null;
}

/**
 * Le suivi des reprises, une réponse après l'autre, dans l'ordre du journal. `indice` est le rang de
 * la réponse dans la liste des réponses que le rapport compte : il sert à compter les autres
 * réponses entre deux réponses d'un élément. `finir` clôt les couples encore ouverts.
 *
 * Avec `depuis` (M8), une reprise et un couple ne comptent que si leur jour local est dans la
 * fenêtre, et l'effet au lendemain que si le jour de faute et celui de la réponse mesurée y sont :
 * l'état des couples se tient, lui, sur toutes les réponses.
 */
export function suivreLesReprises(depuis?: string): {
  repondre(reponse: ReponseSuivie, indice: number): void;
  finir(): MesuresDeReprises;
} {
  const resultat = reprisesVides();
  const ouverts = new Map<string, Couple>();

  const clore = (couple: Couple): void => {
    if (!dansLaFenetre(couple.jour, depuis)) return;
    resultat.repartition[verdictDe(couple.premiereJuste)][
      parIndice(CLES_DE_REPARTITION, couple.reponses - 1)
    ] += 1;
  };

  return {
    repondre(reponse, indice) {
      const jour = jourDe(reponse.repondu_a);
      const couple = ouverts.get(reponse.unite);
      if (couple !== undefined && couple.jour === jour) {
        if (dansLaFenetre(jour, depuis)) {
          const verdict = verdictDe(couple.derniereJuste);
          const autres = indice - couple.indiceDeLaDerniere - 1;
          const rang = parIndice(CLES_DE_RANG, couple.reponses - 1);
          compter(resultat.rangs[verdict][rang], reponse.juste);
          compter(resultat.espacements[verdict][classeDEspacement(autres)], reponse.juste);
          compter(resultat.modes[verdict][reponse.mode], reponse.juste);
        }
        couple.reponses += 1;
        if (couple.apresLaFaute !== null) couple.apresLaFaute += 1;
        else if (!reponse.juste) couple.apresLaFaute = 0;
        couple.derniereJuste = reponse.juste;
        couple.indiceDeLaDerniere = indice;
        return;
      }
      if (couple !== undefined) {
        clore(couple);
        if (
          couple.apresLaFaute !== null &&
          dansLaFenetre(couple.jour, depuis) &&
          dansLaFenetre(jour, depuis)
        ) {
          const cle = parIndice(CLES_APRES_UNE_FAUTE, couple.apresLaFaute);
          compter(resultat.apresUnJourDeFaute[cle], reponse.juste);
          resultat.apresParMoment[cle][reponse.delai] += 1;
          resultat.apresParMode[cle][reponse.mode] += 1;
        }
      }
      ouverts.set(reponse.unite, {
        jour,
        reponses: 1,
        premiereJuste: reponse.juste,
        derniereJuste: reponse.juste,
        indiceDeLaDerniere: indice,
        apresLaFaute: reponse.juste ? null : 0,
      });
    },
    finir() {
      for (const couple of ouverts.values()) clore(couple);
      ouverts.clear();
      return resultat;
    },
  };
}
