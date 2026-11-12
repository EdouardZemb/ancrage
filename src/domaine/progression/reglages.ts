import { checkFSRS6Parameters } from 'ts-fsrs/models/fsrs-6';
import * as z from 'zod';
import type { ReglagesMemoire } from '../contenu/modele.js';

/*
 * Les règles de la clé `memoire` du manifeste qui ne regardent que sa valeur : les poids de FSRS-6
 * et la date de l'examen. L'analyse du contenu (`contenu/schemas.ts`) les applique en strict, et le
 * client les applique en tolérant (`lireReglagesDeMemoire`) : un seul texte de règle pour les deux.
 */

/** Une date qui existe, `AAAA-MM-JJ`. */
export function estDateIso(texte: string): boolean {
  const morceaux = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!morceaux) return false;
  const [annee, mois, jour] = morceaux.slice(1).map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  );
}

/**
 * Vrai pour 21 nombres que FSRS-6 admet. `checkFSRS6Parameters` lève sur un nombre ou des bornes
 * faux : l'exception est un « non », jamais une panne. Un élément qui n'est pas un nombre fini est
 * refusé avant, pour que la bibliothèque ne reçoive que des nombres.
 */
export function poidsFsrsValides(poids: unknown): poids is number[] {
  if (!Array.isArray(poids)) return false;
  if (!poids.every((poids) => typeof poids === 'number' && Number.isFinite(poids))) return false;
  try {
    checkFSRS6Parameters(poids);
    return true;
  } catch {
    return false;
  }
}

/*
 * Ce que le client lit, sans rigueur : une clé inconnue est retirée, et tout ce qu'il ne comprend pas
 * (une version suivante peut servir une autre valeur) rend `undefined`, c'est-à-dire Leitner.
 */
const lecture = z.object({
  algorithme: z.enum(['leitner', 'fsrs', 'par-chapitre']),
  retention: z.number().min(0.8).max(0.95),
  parametres: z.custom<number[]>(poidsFsrsValides).optional(),
  examen: z.string().refine(estDateIso).optional(),
  chapitres: z.array(z.string()).optional(),
});

/**
 * Les réglages de mémoire d'un cours tels que le client les lit : `undefined` si le cours n'en a
 * pas, ou si ce client ne les comprend pas (valeur d'`algorithme` inconnue, rétention hors bornes,
 * poids ou date invalides, `par-chapitre` sans chapitres). Ne lève jamais.
 */
export function lireReglagesDeMemoire(lu: unknown): ReglagesMemoire | undefined {
  const reglages = lecture.safeParse(lu);
  if (!reglages.success) return undefined;
  const { algorithme, retention, parametres, examen, chapitres } = reglages.data;
  if (algorithme === 'par-chapitre' && (chapitres === undefined || chapitres.length === 0)) {
    return undefined;
  }
  return {
    algorithme,
    retention,
    ...(parametres === undefined ? {} : { parametres }),
    ...(examen === undefined ? {} : { examen }),
    ...(chapitres === undefined ? {} : { chapitres }),
  };
}
