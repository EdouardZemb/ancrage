import type { EtapeDePlanning, Planning } from '../contenu/modele.js';
import type { CoursPrepare } from '../cours/prepare.js';
import { type EtatUnite, etatDe } from '../progression/etat.js';
import { statistiquesDeChapitre } from '../progression/statistiques.js';
import type { SensChoisi } from './cartes.js';
import { elementsTirables, GENRES_FERMES, idDeLElement } from './feuilles.js';
import type { Posable } from './heute.js';
import { ouvertureDe } from './planning.js';
import { horizonDuRythme } from './rythme.js';

/*
 * La vue du semestre d'un cours qui a un planning (M4, C-D3 à C-D5) : l'étape en cours, et, pour
 * chaque étape, son état (à venir, ouverte, sûre), son avancement et son retard. Tout se dérive du
 * manifeste, du journal et du jour. Le domaine ne lit ni l'horloge ni le hasard : le jour est un
 * paramètre.
 */

/** Ce que lisent la vue et les révisions : le planning lu, son départ, l'examen du cours. */
export interface PlanningDuJour {
  planning: Planning;
  depart: string;
  examen: string | undefined;
}

export type EtatDEtape = 'a-venir' | 'ouverte' | 'sure';

export interface EtapeDuSemestre {
  etape: EtapeDePlanning;
  /** Le jour de son ouverture (A1-D4, A1-D5). */
  ouverture: string;
  etat: EtatDEtape;
  /** L'étape en cours (C-D3). */
  enCours: boolean;
  /** Ses éléments, les cartes dans les deux sens : leur nombre, leurs boîtes, leurs sûrs (C-D4). */
  total: number;
  boites: number[];
  sures: number;
  /** Ses cartes neuves au sens choisi si elle est dépassée ; 0 sinon (C-D5). */
  retard: number;
}

/** Le module de chaque posable : module de cartes, schéma, morphologie, exercices ou feuille. */
export function modulesDesPosables(cours: CoursPrepare): ReadonlyMap<string, string> {
  const modules = new Map<string, string>();
  for (const unite of cours.unites) modules.set(unite.id, unite.module);
  const { morphologie, exercices } = cours;
  if (morphologie !== undefined) {
    for (const mot of morphologie.mots) modules.set(mot.id, morphologie.id);
  }
  for (const schema of cours.schemas) {
    for (const point of schema.points) modules.set(point.id, schema.id);
  }
  if (exercices !== undefined) {
    for (const famille of exercices.familles) {
      for (const exercice of famille.exercices) modules.set(exercice.id, exercices.id);
    }
  }
  for (const { feuille, element } of elementsTirables(cours.feuilles, GENRES_FERMES)) {
    modules.set(idDeLElement(element), feuille.id);
  }
  return modules;
}

/**
 * La dernière étape ouverte, tant qu'aujourd'hui précède l'horizon du rythme ; une dernière étape
 * `revision`, jusqu'au jour de l'examen compris quand il tombe à sa date plus sept jours ou après
 * (C-D3).
 */
export function etapeEnCours(lu: PlanningDuJour, aujourdhui: string): EtapeDePlanning | undefined {
  const { planning, depart, examen } = lu;
  const ouvertes = planning.etapes.filter((etape) => ouvertureDe(etape, depart) <= aujourdhui);
  const derniere = ouvertes[ouvertes.length - 1];
  // Stryker disable next-line ConditionalExpression: seul le mutant `false` est équivalent. Sans
  // étape ouverte, l'horizon suit `aujourdhui` et le code rend avant `derniere.genre` : ce chemin
  // est inaccessible (le test garde le typage).
  if (derniere === undefined) return undefined;
  // Des dates `AAAA-MM-JJ` se classent comme des chaînes.
  if (aujourdhui < horizonDuRythme(planning, depart, aujourdhui, examen)) return derniere;
  // Arrivé ici, aujourd'hui est à la dernière ouverture plus sept jours ou après : une étape
  // suivante, non ouverte, ferait précéder l'horizon (`derniere` est donc la dernière du planning),
  // et un examen avant ce jour ne peut plus être atteint (C-D3). L'équivalence avec la lettre de
  // C-D3 tient à `JOURS_APRES_LA_DERNIERE_ETAPE` (7), l'horizon d'une dernière étape.
  if (derniere.genre !== 'revision') return undefined;
  // Stryker disable next-line ConditionalExpression: seul le mutant `false` est équivalent : sans
  // examen, `aujourdhui <= undefined` est faux (le test garde le typage).
  if (examen === undefined) return undefined;
  return aujourdhui <= examen ? derniere : undefined;
}

/** Les étapes dans l'ordre du planning, chacune avec son état et son retard (C-D4, C-D5). */
export function etapesDuSemestre(
  posables: readonly Posable[],
  modules: ReadonlyMap<string, string>,
  etats: ReadonlyMap<string, EtatUnite>,
  lu: PlanningDuJour,
  aujourdhui: string,
  sens: SensChoisi,
): EtapeDuSemestre[] {
  const { planning, depart } = lu;
  const courante = etapeEnCours(lu, aujourdhui);
  const passees = planning.etapes
    .map((etape) => ouvertureDe(etape, depart))
    .filter((ouverture) => ouverture <= aujourdhui)
    .sort();
  // Sans ouverture passée, aucune étape n'est dépassée : `''` précède toute date.
  const derniere = passees[passees.length - 1] ?? '';
  return planning.etapes.map((etape): EtapeDuSemestre => {
    const ouverture = ouvertureDe(etape, depart);
    const citees = new Set(etape.modules);
    // Stryker disable next-line StringLiteral: tout posable du cours a son module, donc le repli
    // n'est jamais lu (équivalent).
    const elements = posables.filter((p) => citees.has(modules.get(p.id) ?? ''));
    const { total, boites, sures } = statistiquesDeChapitre(elements, etats, aujourdhui);
    const sure = total > 0 && sures === total;
    // Une étape dépassée : ouverte avant la dernière ouverture passée, et pas en cours (C-D5).
    const retard =
      etape !== courante && ouverture < derniere
        ? elements.filter(
            (p) =>
              p.genre === 'carte' &&
              (sens === 'mix' || p.unite.sens === sens) &&
              etatDe(etats, p.id).boite === 0,
          ).length
        : 0;
    return {
      etape,
      ouverture,
      etat: sure ? 'sure' : ouverture > aujourdhui ? 'a-venir' : 'ouverte',
      enCours: etape === courante,
      total,
      boites,
      sures,
      retard,
    };
  });
}

/** Un jour `AAAA-MM-JJ` en `JJ.MM.AAAA`, comme la notice allemande. */
export function jourAffiche(jour: string): string {
  const [annee, mois, jourDuMois] = jour.split('-');
  return `${jourDuMois}.${mois}.${annee}`;
}
