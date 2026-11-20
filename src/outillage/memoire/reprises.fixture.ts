/*
 * Des journaux inventés pour les tests des reprises du jour (M7) : écrits à la main, sur des unités
 * inventées, aucune donnée réelle (invariant 7). Partagés par `reprises.test.ts` et
 * `rapport-reprises.test.ts`. Exclu de la construction, comme tout `*.fixture.ts`.
 */
import type { Evenement, ModeDeReponse } from '../../domaine/journal/evenement.js';
import { horodatage } from '../../domaine/journal/temps.js';
import { COURS_DE_TEST, reponseInventee } from './ecrire-journal.fixture.js';

const MS_PAR_SECONDE = 1000;
const MS_PAR_JOUR = 86_400_000;

/** Une réponse inventée dont le jour local suit `decalageMinutes` (le journal se range par instant). */
export function reponseDecalee(
  instant: number,
  rang: number,
  unite: string,
  juste: boolean,
  decalageMinutes: number,
  cours = COURS_DE_TEST,
  mode?: ModeDeReponse,
): Evenement {
  const reponse = reponseInventee(instant, rang, unite, juste, cours, mode);
  return { ...reponse, repondu_a: horodatage(instant, decalageMinutes) };
}

export interface ElementDeMotif {
  unite: string;
  /** Les verdicts, dans l'ordre : `J` juste, `F` faux (« FJFJF »). */
  motif: string;
  /** Le nombre d'autres éléments (d'autres unités, une réponse chacune) entre deux réponses. */
  intercales?: number;
  mode?: ModeDeReponse;
}

export interface OptionsDeJournee {
  /** L'instant de la première réponse, en millisecondes. */
  debut: number;
  /** Le rang de la première réponse (les identifiants en dépendent). */
  rangDepart: number;
  elements: readonly ElementDeMotif[];
  /** Le préfixe des unités intercalées : à varier d'une journée à l'autre d'une même personne. */
  prefixe?: string;
  cours?: string;
}

/**
 * Une journée d'une personne : chaque élément, l'un après l'autre, répond selon son motif, avec
 * `intercales` autres éléments (une réponse chacun, juste, d'une unité neuve) entre deux de ses
 * réponses. Une réponse par seconde.
 */
export function journeeDeMotifs({
  debut,
  rangDepart,
  elements,
  prefixe = 'i',
  cours = COURS_DE_TEST,
}: OptionsDeJournee): Evenement[] {
  const evenements: Evenement[] = [];
  const ajouter = (unite: string, juste: boolean, mode?: ModeDeReponse) => {
    const n = evenements.length;
    evenements.push(
      reponseInventee(debut + n * MS_PAR_SECONDE, rangDepart + n, unite, juste, cours, mode),
    );
  };
  for (const { unite, motif, intercales = 0, mode } of elements) {
    [...motif].forEach((verdict, rang) => {
      if (rang > 0) {
        for (let i = 0; i < intercales; i++) ajouter(`${prefixe}${evenements.length}`, true);
      }
      ajouter(unite, verdict === 'J', mode);
    });
  }
  return evenements;
}

const MOTIFS_DE_COUPLES = [
  'F',
  'FJ',
  'FJF',
  'FJFJ',
  'FJFJF',
  'J',
  'JF',
  'JFJ',
  'JFJF',
  'JFJFJ',
] as const;
const INTERCALES_PAR_CLASSE = [0, 1, 3, 6, 11] as const;
const EXEMPLAIRES = 7;
const DEBUT_D_UN_JOUR = Date.UTC(2026, 0, 5, 8);
const RANG_PAR_PERSONNE = 100_000;

/**
 * `n` personnes actives qui ont toutes le même journal, le 05/01/2026 puis le 06/01/2026. Chaque
 * motif de couple (de 0 à 4 reprises, une première réponse fausse ou juste) a 7 exemplaires, sur
 * des unités à eux, dont les intervalles tournent sur les cinq classes d'espacement et dont le mode
 * alterne entre `retournee` et `saisie`. Chaque exemplaire est répondu une fois le lendemain (juste
 * un exemplaire sur deux). Chaque personne a donc au moins 7 réponses à chaque case de chaque
 * moitié du rang, de l'espacement et des deux modes, 7 couples à chaque case de chaque moitié de la
 * répartition et 7 jours de faute suivis à chaque case de « Après un jour de faute » ; avec trois
 * personnes, au moins 21 par case, un tiers chacune.
 */
export function journauxAuxReprises(n: number, cours = COURS_DE_TEST): Evenement[][] {
  return Array.from({ length: n }, (_, personne) => {
    const rangDepart = personne * RANG_PAR_PERSONNE;
    const veille: ElementDeMotif[] = [];
    MOTIFS_DE_COUPLES.forEach((motif, m) => {
      for (let exemplaire = 0; exemplaire < EXEMPLAIRES; exemplaire++) {
        veille.push({
          unite: `u${m}x${exemplaire}`,
          motif,
          intercales: INTERCALES_PAR_CLASSE[exemplaire % INTERCALES_PAR_CLASSE.length],
          mode: exemplaire % 2 === 0 ? 'retournee' : 'saisie',
        });
      }
    });
    const duJour = journeeDeMotifs({ debut: DEBUT_D_UN_JOUR, rangDepart, elements: veille, cours });
    const lendemain = journeeDeMotifs({
      debut: DEBUT_D_UN_JOUR + MS_PAR_JOUR,
      rangDepart: rangDepart + duJour.length,
      prefixe: 'l',
      cours,
      elements: veille.map(({ unite }, rang) => ({ unite, motif: rang % 2 === 0 ? 'J' : 'F' })),
    });
    return [...duJour, ...lendemain];
  });
}
