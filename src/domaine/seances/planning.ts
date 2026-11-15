import * as z from 'zod';
import type { Planning } from '../contenu/modele.js';
import type { CoursServi } from '../cours/servi.js';
import { estDateIso } from '../progression/reglages.js';

/*
 * Le planning d'un cours tel que le client le lit (A1-D9). Le serveur a déjà contrôlé la clé en
 * strict (`contenu/schemas.ts`, `analyse.ts`) : ici, un planning que ce client ne comprend pas vaut
 * « pas de planning », et tout est ouvert. L'ordre des étapes, la semaine 1 en tête et les modules
 * ne sont pas revérifiés.
 */

const SEMAINE_MAX = 520;

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
