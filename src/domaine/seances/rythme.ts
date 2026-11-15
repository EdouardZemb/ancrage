import type { Sens } from '../cartes/unites.js';
import type { Planning } from '../contenu/modele.js';
import type { CoursPrepare } from '../cours/prepare.js';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours, joursEntre } from '../journal/temps.js';
import type { EtatUnite } from '../progression/etat.js';
import { type SensChoisi, unitesDuChoix } from './cartes.js';
import { cartesNeuves, decouvertesLe, type NeuvesDuJour, type Posable } from './heute.js';
import { modulesFermes, ouvertureDe } from './planning.js';

/*
 * Le rythme des cartes neuves d'un cours qui a un planning (M4, B-D2 à B-D6) : « Heute » les tire
 * des modules ouverts, dans l'ordre du planning, à raison de ce qui est ouvert réparti sur les
 * jours qui restent avant l'horizon. Sans planning, rien ne change (B-D1). Le domaine ne lit ni
 * l'horloge ni le hasard : le jour est un paramètre.
 */

/** L'horizon après la dernière ouverture : le pas d'un planning relatif (B-D4). */
export const JOURS_APRES_LA_DERNIERE_ETAPE = 7;

/**
 * Les unités des modules ouverts, dans l'ordre où « Heute » tire ses cartes neuves (B-D2) : les
 * modules des étapes ouvertes, étape après étape et dans l'ordre où chacune les cite, puis ceux
 * qu'aucune étape ne nomme, dans l'ordre du cours. Dans un module, les unités directes dans l'ordre
 * du cours, puis ses inverses. Un module que seules des étapes fermées citent n'y est pas.
 */
export function unitesDuPlanning<U extends { module: string; sens: Sens }>(
  planning: Planning,
  depart: string,
  aujourdhui: string,
  unites: readonly U[],
): U[] {
  const fermes = modulesFermes(planning, depart, aujourdhui);
  const rang = new Map<string, number>();
  for (const etape of planning.etapes) {
    const ouverte = ouvertureDe(etape, depart) <= aujourdhui;
    for (const module of etape.modules) {
      if (ouverte && !rang.has(module)) rang.set(module, rang.size);
    }
  }
  for (const { module } of unites) {
    // Un module cité seulement par des étapes fermées prend ici un rang, mais `fermes` l'écarte.
    if (!rang.has(module)) rang.set(module, rang.size);
  }
  const rangDe = (unite: U): number =>
    (rang.get(unite.module) ?? 0) * 2 + (unite.sens === 'inverse' ? 1 : 0);
  // Le tri est stable : à rang égal, l'ordre du cours tient.
  return unites.filter(({ module }) => !fermes.has(module)).sort((a, b) => rangDe(a) - rangDe(b));
}

/**
 * Le jour avant lequel tout ce qui est ouvert devrait être vu (B-D4) : la première ouverture,
 * strictement après aujourd'hui ; sinon la dernière plus `JOURS_APRES_LA_DERNIERE_ETAPE` ; puis,
 * s'il tombe après aujourd'hui et avant ce jour, l'examen.
 */
export function horizonDuRythme(
  planning: Planning,
  depart: string,
  aujourdhui: string,
  examen: string | undefined,
): string {
  // Des dates `AAAA-MM-JJ` se classent comme des chaînes.
  const ouvertures = planning.etapes.map((etape) => ouvertureDe(etape, depart)).sort();
  const suivante = ouvertures.find((ouverture) => ouverture > aujourdhui);
  const derniere = ouvertures[ouvertures.length - 1] ?? aujourdhui;
  const horizon = suivante ?? ajouterJours(derniere, JOURS_APRES_LA_DERNIERE_ETAPE);
  // Stryker disable next-line ConditionalExpression,EqualityOperator: sans examen, `undefined > jour`
  // est faux ; un examen au jour de l'horizon rend ce même jour (équivalents).
  if (examen !== undefined && examen > aujourdhui && examen < horizon) return examen;
  return horizon;
}

/** ⌈neuvesAuMatin / J⌉, au plus `plafond`, `J` d'au moins un jour (B-D3). */
export function rythmeDuJour(
  neuvesAuMatin: number,
  aujourdhui: string,
  horizon: string,
  plafond: number,
): number {
  const jours = Math.max(1, joursEntre(aujourdhui, horizon));
  return Math.min(plafond, Math.ceil(neuvesAuMatin / jours));
}

/**
 * Les cartes neuves de la séance et leur quota. Sans planning (B-D1) : les cartes neuves du choix
 * de Karteikarten, et le plafond moins les cartes découvertes aujourd'hui. Avec un planning (B-D2,
 * B-D3) : les `quota` premières unités neuves de `unitesDuPlanning` au sens choisi, le quota étant
 * `max(0, min(plafond − Dc, rythme − Dp))`.
 */
export function neuvesDuJour(
  cours: CoursPrepare,
  posables: readonly Posable[],
  journal: {
    etats: ReadonlyMap<string, EtatUnite>;
    evenements: readonly Evenement[];
    aujourdhui: string;
  },
  choix: { chapitre: string | 'tous'; sens: SensChoisi },
  planning?: { planning: Planning; depart: string; examen: string | undefined },
): NeuvesDuJour {
  const { etats, evenements, aujourdhui } = journal;
  const plafond = cours.cours.leitner.nouvellesParSeance;
  const decouvertesDuCours = decouvertesLe(
    evenements,
    aujourdhui,
    new Set(cours.unites.map(({ id }) => id)),
  );
  const cartes = new Map(posables.map((p): [string, Posable] => [p.id, p]));
  const enPosables = (unites: readonly { id: string }[]): Posable[] =>
    unites.flatMap(({ id }) => cartes.get(id) ?? []);

  if (planning === undefined) {
    const candidates = cartesNeuves(
      enPosables(unitesDuChoix(cours, choix.chapitre, choix.sens)),
      etats,
    );
    return { candidates, quota: Math.max(0, plafond - decouvertesDuCours) };
  }

  const ordre = unitesDuPlanning(
    planning.planning,
    planning.depart,
    aujourdhui,
    unitesDuChoix(cours, 'tous', choix.sens),
  );
  const neuves = cartesNeuves(enPosables(ordre), etats);
  const decouvertesDuPlanning = decouvertesLe(
    evenements,
    aujourdhui,
    new Set(ordre.map(({ id }) => id)),
  );
  const horizon = horizonDuRythme(planning.planning, planning.depart, aujourdhui, planning.examen);
  const rythme = rythmeDuJour(neuves.length + decouvertesDuPlanning, aujourdhui, horizon, plafond);
  const quota = Math.max(0, Math.min(plafond - decouvertesDuCours, rythme - decouvertesDuPlanning));
  return { candidates: neuves.slice(0, quota), quota };
}
