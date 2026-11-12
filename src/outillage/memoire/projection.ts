import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import { type Hasard, hasardDeterministe } from '../../domaine/hasard.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { ajouterJours, joursEntre } from '../../domaine/journal/temps.js';
import { etatsDesUnites } from '../../domaine/progression/etat.js';
import {
  type CarteFsrs,
  ordonnanceurFsrs,
  reviserFsrs,
  revuesDuJournal,
} from '../../domaine/progression/fsrs.js';
import { posablesDuCours } from '../../domaine/seances/heute.js';
import type { ReussiteObservee } from './mesures.js';

/*
 * La projection de la charge jusqu'à l'examen (M3, rapport de suivi). Elle part de l'état du jour et
 * simule jour après jour : les éléments dus sont répondus, puis `nouvellesParJour` éléments jamais
 * vus sont découverts, dans l'ordre du cours. Le verdict de chaque réponse se tire d'un hasard à
 * graine, et le résultat est la moyenne de 12 tirages : la même graine rend la même projection.
 *
 * - Leitner suit les intervalles du manifeste, et la réussite observée dans le journal : par boîte
 *   d'avant pour une révision, des premières réponses pour une découverte.
 * - FSRS se simule avec `ts-fsrs` réglé comme le rejeu (poids du cours, plafond d'examen). Sa
 *   réussite est la rétention visée du cours : c'est une hypothèse, que le rapport dit.
 * - Une faute se redonne une fois le même jour, avec la réussite observée des réponses redonnées le
 *   même jour. Une seconde faute remet l'élément au lendemain.
 * Une fonction pure : ni horloge, ni hasard caché.
 */

export const TIRAGES = 12;
const RETENTION_PAR_DEFAUT = 0.9;
const JOURS_PAR_SEMAINE = 7;
/** La stabilité, en jours, d'où un élément FSRS est dit sûr : la boîte 4 (M1-D4). */
const STABILITE_SURE = 8;
const BOITE_SURE = 4;
const BOITE_MAXIMALE = 5;

export interface OptionsDeProjection {
  /** Le jour du rapport, `AAAA-MM-JJ` : la simulation commence ce jour-là. */
  aujourdhui: string;
  /** Le jour de l'examen : la simulation s'arrête la veille, et la part sûre se lit ce jour-là. */
  jusquau: string;
  nouvellesParJour: number;
  algorithme: 'leitner' | 'fsrs';
  /** La graine du premier tirage ; les suivants la prennent à la suite. */
  graine: number;
  reussite: ReussiteObservee;
}

export interface Projection {
  /** Le nombre de jours simulés : d'aujourd'hui à la veille de l'examen. */
  jours: number;
  /** Les réponses de chaque jour simulé, en moyenne sur les tirages. */
  chargeParJour: number[];
  /** Les réponses par jour, en moyenne, sur toute la période. */
  chargeMoyenne: number;
  /** La moyenne par jour de chaque semaine de la période, la dernière pouvant être plus courte. */
  parSemaine: { debut: string; moyenne: number }[];
  /** Le jour où tout le cours est vu ; `null` s'il ne l'est pas avant l'examen. */
  jourToutVu: string | null;
  /** La part des éléments vus à l'examen, en moyenne. */
  partVue: number;
  /** La part des éléments sûrs à l'examen : boîtes 4 et 5 (Leitner), stabilité d'au moins 8 jours (FSRS). */
  partSure: number;
}

/** Ce que chaque algorithme sait d'un élément vu : où il en est, et quand le revoir. */
interface Suivi {
  echeance: string;
  /** La dernière réponse était juste. */
  juste: boolean;
  /** Leitner : la boîte, de 1 à 5. */
  boite: number;
  /** FSRS : la carte de la bibliothèque. */
  carte?: CarteFsrs;
}

interface Tirage {
  charge: number[];
  /** Le jour (index) où le dernier élément a été vu ; `null` s'il ne l'est pas. */
  toutVu: number | null;
  vues: number;
  sures: number;
}

/** Ce qui change d'un algorithme à l'autre : l'effet d'une réponse, et le seuil du « sûr ». */
interface Algorithme {
  depart: (journal: readonly Evenement[], ids: ReadonlySet<string>) => Map<string, Suivi>;
  repondre: (suivi: Suivi | undefined, jour: string, juste: boolean) => Suivi;
  /** La probabilité de rappel d'une révision, d'après l'élément tel qu'il était. */
  reussite: (suivi: Suivi) => number;
  sur: (suivi: Suivi) => boolean;
}

function algorithmeLeitner(cours: CoursPrepare, options: OptionsDeProjection): Algorithme {
  const { intervalles } = cours.cours.leitner;
  return {
    depart: (journal, ids) =>
      new Map(
        [...etatsDesUnites(journal, cours.cours.leitner)]
          .filter(([unite, etat]) => ids.has(unite) && etat.echeance !== null)
          .map(([unite, etat]) => [
            unite,
            {
              echeance: etat.echeance as string,
              boite: etat.boite,
              // L'état de Leitner ne garde pas le verdict : une boîte 1 est une faute (ou une
              // première réponse juste, qui reviendra demain).
              juste: etat.boite > 1,
            },
          ]),
      ),
    repondre: (suivi, jour, juste) => {
      if (!juste) return { echeance: jour, boite: 1, juste: false };
      const boite = Math.min(BOITE_MAXIMALE, (suivi?.boite ?? 0) + 1);
      return {
        echeance: ajouterJours(jour, intervalles[boite] ?? 1),
        boite,
        juste: true,
      };
    },
    reussite: (suivi) => options.reussite.parBoite[suivi.boite] ?? 0.5,
    sur: (suivi) => suivi.boite >= BOITE_SURE,
  };
}

function algorithmeFsrs(cours: CoursPrepare): Algorithme {
  const memoire = memoireDuCours(cours.cours);
  const retention = memoire?.retention ?? RETENTION_PAR_DEFAUT;
  const examen = memoire?.examen;
  const planificateur = ordonnanceurFsrs({ retention, parametres: memoire?.parametres, examen });
  const reviser = (suivi: Suivi | undefined, jour: string, juste: boolean): Suivi => {
    const { carte, intervalle } = reviserFsrs(planificateur, suivi?.carte, jour, juste, examen);
    return {
      echeance: juste ? ajouterJours(jour, intervalle) : jour,
      boite: 0,
      juste,
      carte,
    };
  };
  return {
    depart: (journal, ids) => {
      const depart = new Map<string, Suivi>();
      for (const { unite, jours, justes } of revuesDuJournal(journal)) {
        if (!ids.has(unite)) continue;
        let suivi: Suivi | undefined;
        jours.forEach((jour, rang) => {
          suivi = reviser(suivi, jour, justes[rang] === true);
        });
        if (suivi !== undefined) depart.set(unite, suivi);
      }
      return depart;
    },
    repondre: reviser,
    reussite: () => retention,
    sur: (suivi) => suivi.juste && (suivi.carte?.stability ?? 0) >= STABILITE_SURE,
  };
}

/** Une simulation, d'un hasard donné. */
function simuler(
  depart: ReadonlyMap<string, Suivi>,
  ids: readonly string[],
  algorithme: Algorithme,
  options: OptionsDeProjection,
  jours: number,
  hasard: Hasard,
): Tirage {
  const suivis = new Map(depart);
  const jamaisVus = ids.filter((id) => !suivis.has(id));
  let prochain = 0;
  const charge: number[] = [];
  let toutVu: number | null = jamaisVus.length === 0 ? 0 : null;

  /** Répond une fois, et redonne une fois le même jour après une faute. Rend le nombre de réponses. */
  const repondre = (id: string, jour: string, probabilite: number): number => {
    const premiere = hasard() < probabilite;
    suivis.set(id, algorithme.repondre(suivis.get(id), jour, premiere));
    if (premiere) return 1;
    const reprise = hasard() < options.reussite.memeJour;
    const suivi = algorithme.repondre(suivis.get(id), jour, reprise);
    // Une seconde faute remet l'élément au lendemain : il ne se redonne pas indéfiniment.
    suivis.set(id, reprise ? suivi : { ...suivi, echeance: ajouterJours(jour, 1) });
    return 2;
  };

  for (let rang = 0; rang < jours; rang++) {
    const jour = ajouterJours(options.aujourdhui, rang);
    let reponses = 0;
    for (const id of ids) {
      const suivi = suivis.get(id);
      if (suivi === undefined || suivi.echeance > jour) continue;
      reponses += repondre(id, jour, algorithme.reussite(suivi));
    }
    const decouvertes = jamaisVus.slice(prochain, prochain + options.nouvellesParJour);
    prochain += decouvertes.length;
    for (const id of decouvertes) reponses += repondre(id, jour, options.reussite.premiere);
    charge.push(reponses);
    if (toutVu === null && prochain >= jamaisVus.length) toutVu = rang;
  }
  let sures = 0;
  for (const suivi of suivis.values()) if (algorithme.sur(suivi)) sures += 1;
  return { charge, toutVu, vues: suivis.size, sures };
}

const somme = (valeurs: readonly number[]): number => valeurs.reduce((a, b) => a + b, 0);

/**
 * La projection du `journal` d'une personne, pour `cours`, jusqu'à `options.jusquau`. Les éléments
 * sont les unités qui se posent seules, dans l'ordre du cours.
 */
export function projeter(
  journal: readonly Evenement[],
  cours: CoursPrepare,
  options: OptionsDeProjection,
): Projection {
  const ids = posablesDuCours(cours).map((posable) => posable.id);
  const connus = new Set(ids);
  const jours = Math.max(0, joursEntre(options.aujourdhui, options.jusquau));
  const algorithme =
    options.algorithme === 'fsrs' ? algorithmeFsrs(cours) : algorithmeLeitner(cours, options);
  const depart = algorithme.depart(journal, connus);

  const tirages = Array.from({ length: TIRAGES }, (_, rang) =>
    simuler(depart, ids, algorithme, options, jours, hasardDeterministe(options.graine + rang)),
  );
  const chargeParJour = Array.from(
    { length: jours },
    (_, rang) => somme(tirages.map((tirage) => tirage.charge[rang] ?? 0)) / TIRAGES,
  );
  const parSemaine: Projection['parSemaine'] = [];
  for (let debut = 0; debut < jours; debut += JOURS_PAR_SEMAINE) {
    const semaine = chargeParJour.slice(debut, debut + JOURS_PAR_SEMAINE);
    parSemaine.push({
      debut: ajouterJours(options.aujourdhui, debut),
      moyenne: somme(semaine) / semaine.length,
    });
  }
  const toutVu = tirages[0]?.toutVu ?? null;
  const total = Math.max(1, ids.length);
  return {
    jours,
    chargeParJour,
    chargeMoyenne: jours === 0 ? 0 : somme(chargeParJour) / jours,
    parSemaine,
    jourToutVu: toutVu === null ? null : ajouterJours(options.aujourdhui, toutVu),
    partVue: somme(tirages.map((tirage) => tirage.vues)) / TIRAGES / total,
    partSure: somme(tirages.map((tirage) => tirage.sures)) / TIRAGES / total,
  };
}

const moyenne = (valeurs: readonly number[]): number =>
  valeurs.length === 0 ? 0 : somme(valeurs) / valeurs.length;

/**
 * La moyenne de projections de même durée, une par personne : la charge par personne. Le jour où
 * tout est vu est le dernier de ceux des personnes, ou `null` si l'une d'elles ne l'atteint pas.
 */
export function moyenneDeProjections(projections: readonly Projection[]): Projection {
  const [premiere] = projections;
  if (premiere === undefined) throw new RangeError('aucune projection à moyenner');
  const jours = premiere.jours;
  const jourToutVu = projections.some((projection) => projection.jourToutVu === null)
    ? null
    : (projections
        .map((projection) => projection.jourToutVu ?? '')
        .sort()
        .at(-1) ?? null);
  return {
    jours,
    chargeParJour: Array.from({ length: jours }, (_, rang) =>
      moyenne(projections.map((projection) => projection.chargeParJour[rang] ?? 0)),
    ),
    chargeMoyenne: moyenne(projections.map((projection) => projection.chargeMoyenne)),
    parSemaine: premiere.parSemaine.map((semaine, rang) => ({
      debut: semaine.debut,
      moyenne: moyenne(projections.map((projection) => projection.parSemaine[rang]?.moyenne ?? 0)),
    })),
    jourToutVu,
    partVue: moyenne(projections.map((projection) => projection.partVue)),
    partSure: moyenne(projections.map((projection) => projection.partSure)),
  };
}
