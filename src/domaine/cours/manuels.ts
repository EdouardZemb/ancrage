import * as z from 'zod';
import type { UniteDeCarte } from '../cartes/unites.js';
import type { Manuel } from '../contenu/modele.js';
import type { Chapitre, CoursPrepare, ModuleServiDe } from './prepare.js';

/*
 * Les manuels d'un cours tels que le client les lit (A2-D12). Le serveur a déjà contrôlé les clés
 * en strict (`contenu/schemas.ts`, `analyse-manuels.ts`) : ici, ce que ce client ne comprend pas
 * vaut « pas de manuel », et rien ne lève. `prepare.ts` n'est importé qu'en types.
 */

const lecture = z
  .array(z.object({ id: z.string(), titre: z.string() }))
  .min(1)
  .refine((manuels) => new Set(manuels.map((manuel) => manuel.id)).size === manuels.length);

/** Les manuels du cours servi, dans l'ordre ; `[]` si ce client ne les lit pas (A2-D12). */
export function lireManuels(lu: unknown): Manuel[] {
  const manuels = lecture.safeParse(lu);
  return manuels.success ? manuels.data : [];
}

function estNumero(valeur: unknown): valeur is number {
  return typeof valeur === 'number' && valeur > 0 && valeur % 1 === 0;
}

/** Le manuel et le chapitre d'un module de cartes, s'ils sont lisibles, et sa Unit (A2-D12). */
export function rangementDuChapitre(
  module: { manuel?: unknown; chapitre?: unknown; unit?: unknown },
  manuels: readonly Manuel[],
): Pick<Chapitre, 'manuel' | 'chapitre' | 'unit'> {
  const { manuel, chapitre, unit } = module;
  const lu = manuels.find((m) => m.id === manuel);
  return {
    ...(lu !== undefined && estNumero(chapitre) ? { manuel: lu.id, chapitre } : {}),
    ...(estNumero(unit) ? { unit } : {}),
  };
}

export interface Division {
  /** Absent : « Übungen », toujours la dernière. */
  manuel?: Manuel;
  chapitres: Chapitre[];
  schemas: ModuleServiDe<'schema'>[];
}

/** Le numéro que montre un chapitre (A2-D7). */
export function numeroAffiche(chapitre: Pick<Chapitre, 'numero' | 'chapitre'>): number {
  return chapitre.chapitre ?? chapitre.numero;
}

/** Le numéro du chapitre d'une unité ; son `numero` si son module n'est pas un chapitre lu. */
export function numeroDeLUnite(
  cours: Pick<CoursPrepare, 'chapitres'>,
  unite: Pick<UniteDeCarte, 'module' | 'numero'>,
): number {
  const chapitre = cours.chapitres.find((c) => c.id === unite.module);
  return chapitre === undefined ? unite.numero : numeroAffiche(chapitre);
}

/** Les divisions du cours (A2-D5) ; `undefined` en mode plat (A2-D6). */
export function divisionsDuCours(
  cours: Pick<CoursPrepare, 'manuels' | 'chapitres' | 'schemas'>,
): Division[] | undefined {
  // `undefined` (un module sans manuel) n'y figure jamais : `dans` n'a pas à le tester.
  const connus = new Set<string | undefined>(cours.manuels.map((manuel) => manuel.id));
  const dans = (manuel: string | undefined) => connus.has(manuel);
  // `sort` est stable : à égalité de chapitre, l'ordre du cours reste.
  const parManuel = cours.manuels
    .map((manuel) => ({
      manuel,
      chapitres: cours.chapitres
        .filter((chapitre) => chapitre.manuel === manuel.id)
        .sort((a, b) => numeroAffiche(a) - numeroAffiche(b)),
      schemas: cours.schemas.filter((schema) => schema.manuel === manuel.id),
    }))
    .filter((division) => division.chapitres.length + division.schemas.length > 0);
  if (parManuel.length === 0) return undefined;
  return [
    ...parManuel,
    {
      chapitres: cours.chapitres.filter((chapitre) => !dans(chapitre.manuel)),
      schemas: cours.schemas.filter((schema) => !dans(schema.manuel)),
    },
  ];
}
