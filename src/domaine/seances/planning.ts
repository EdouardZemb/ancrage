import * as z from 'zod';
import type { EtapeDePlanning, Planning } from '../contenu/modele.js';
import type { CoursServi } from '../cours/servi.js';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours, jourDe, joursEntre } from '../journal/temps.js';
import { journalSansDoublon } from '../progression/etat.js';
import { estDateIso, SEMAINE_MAX } from '../progression/reglages.js';

/*
 * Le planning d'un cours tel que le client le lit (A1-D9). Le serveur a déjà contrôlé la clé en
 * strict (`contenu/schemas.ts`, `analyse.ts`) : ici, un planning que ce client ne comprend pas vaut
 * « pas de planning », et tout est ouvert. L'ordre des étapes, la semaine 1 en tête et les modules
 * ne sont pas revérifiés.
 */

const etape = z.object({
  titre: z.string(),
  seance: z.string().refine(estDateIso).optional(),
  semaine: z.number().int().min(1).max(SEMAINE_MAX).optional(),
  genre: z.enum(['cours', 'revision']).default('cours'),
  modules: z.array(z.string()),
});

const lecture = z.object({ etapes: z.array(etape).min(1) });

/**
 * Le planning d'un cours tel que le client le lit : `undefined` s'il n'y en a pas, ou si ce client
 * ne le comprend pas (une étape sans `seance` ni `semaine`, ou avec les deux, des formes mêlées, une
 * date ou une semaine invalide, un genre inconnu). Ne lève jamais.
 */
export function lirePlanning(lu: unknown): Planning | undefined {
  const planning = lecture.safeParse(lu);
  if (!planning.success) return undefined;
  const { etapes } = planning.data;
  if (etapes.some((e) => (e.seance === undefined) === (e.semaine === undefined))) return undefined;
  // Stryker disable next-line EqualityOperator: compter les relatives au lieu des datées donne
  // `longueur - datees`, et « ni toutes ni aucune » est symétrique.
  const datees = etapes.filter((e) => e.seance !== undefined).length;
  if (datees !== 0 && datees !== etapes.length) return undefined;
  return {
    etapes: etapes.map(({ titre, seance, semaine, genre, modules }) => ({
      titre,
      ...(seance === undefined ? {} : { seance }),
      ...(semaine === undefined ? {} : { semaine }),
      genre,
      modules,
    })),
  };
}

/** Le planning du cours servi, ou `undefined` : sans planning, tout est ouvert. */
export function planningDuCours(cours: CoursServi): Planning | undefined {
  return lirePlanning(cours.planning);
}

/** Le jour du premier événement du journal, jamais après `aujourdhui` ; sinon `aujourdhui` (A1-D5). */
export function departDuPlanning(evenements: readonly Evenement[], aujourdhui: string): string {
  const premier = journalSansDoublon(evenements)[0];
  if (premier === undefined) return aujourdhui;
  const jour = jourDe(premier.repondu_a);
  // Stryker disable next-line EqualityOperator: à égalité, `jour` et `aujourdhui` sont la même chaîne.
  return jour < aujourdhui ? jour : aujourdhui;
}

/** Le jour où l'étape s'ouvre (A1-D4, A1-D5). */
export function ouvertureDe(etape: EtapeDePlanning, depart: string): string {
  if (etape.seance !== undefined) return etape.seance;
  return ajouterJours(depart, 7 * ((etape.semaine ?? 1) - 1));
}

/** Les modules cités par le planning qu'aucune étape ouverte ne cite (A1-D6). */
export function modulesFermes(
  planning: Planning,
  depart: string,
  aujourdhui: string,
): ReadonlySet<string> {
  const ouverts = new Set<string>();
  const cites = new Set<string>();
  for (const etape of planning.etapes) {
    const ouverte = ouvertureDe(etape, depart) <= aujourdhui;
    for (const module of etape.modules) {
      cites.add(module);
      if (ouverte) ouverts.add(module);
    }
  }
  return new Set([...cites].filter((module) => !ouverts.has(module)));
}

/** Les jours qui restent avant l'examen ; `undefined` sans examen ou après lui (A1-D8). */
export function joursAvantExamen(
  examen: string | undefined,
  aujourdhui: string,
): number | undefined {
  if (examen === undefined) return undefined;
  const jours = joursEntre(aujourdhui, examen);
  return jours >= 0 ? jours : undefined;
}
