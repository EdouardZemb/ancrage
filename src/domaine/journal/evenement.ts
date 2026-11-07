import { z } from 'zod';
import { FORMAT_IDENTIFIANT } from '../contenu/identifiants.js';
import { horodatage } from './temps.js';

/*
 * L'événement du journal de progression (ADR-0004, invariant 5) : une réponse, ou un examen remis.
 * Le journal ne fait que grandir, et tout état (boîtes, échéances, séries) en est dérivé par des
 * fonctions pures (`progression/etat.ts`).
 *
 * Champs remplis par le téléphone. Le serveur ajoute `personne`, tirée de la session et jamais du
 * message, et `recu_a` : `schemaEvenement` refuse tout champ en plus (invariant 6).
 *
 * Le texte saisi par la personne n'entre jamais dans un événement (ADR-0007).
 */

/** Le format des événements ; il n'évolue que par ajouts, sous un nouveau `v`. */
export const VERSION_EVENEMENT = 1;

export interface ResultatReponse {
  juste: boolean;
}

export interface ResultatExamen {
  /** Les bonnes réponses. */
  points: number;
  /** Les questions posées. */
  questions: number;
  /** La note suisse, de 1 à 6, par demi-points. */
  note: number;
  /** La durée, arrondie, d'au moins une minute. */
  minutes: number;
  /** Le nombre de chapitres de l'examen. */
  chapitres: number;
}

interface Commun {
  /** UUIDv7 en minuscules, créé sur l'appareil (`creerIdEvenement`). */
  id: string;
  cours: string;
  /**
   * L'unité qui reçoit la réponse : `<id>` ou `<id>:inverse` pour une carte, l'identifiant du
   * module pour un examen.
   */
  unite: string;
  /** L'heure locale de l'appareil, avec son décalage : `AAAA-MM-JJTHH:MM:SS.mmm±HH:MM`. */
  repondu_a: string;
  /** Un UUID tiré au hasard sur l'appareil. */
  appareil: string;
  v: 1;
}

export type Evenement =
  | (Commun & { type: 'reponse'; resultat: ResultatReponse })
  | (Commun & { type: 'examen'; resultat: ResultatExamen });

const SUFFIXE_INVERSE = ':inverse';

const FORMAT_ID_EVENEMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `AAAA-MM-JJTHH:MM:SS.mmm±HH:MM`, le décalage en trois groupes : signe, heures, minutes. */
const FORMAT_REPONDU_A = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-])(\d{2}):(\d{2})$/;

const MINUTES_PAR_HEURE = 60;

function estUnite(valeur: string): boolean {
  const identifiant = valeur.endsWith(SUFFIXE_INVERSE)
    ? valeur.slice(0, -SUFFIXE_INVERSE.length)
    : valeur;
  return FORMAT_IDENTIFIANT.test(identifiant);
}

/**
 * Le texte a le format de `repondu_a` et désigne un instant qui existe. Un 30 février, une 24e
 * heure ou un décalage de 60 minutes passent le format. Le moteur JavaScript les accepte parfois
 * (le 30 février devient le 2 mars) mais ne les rend jamais tels quels : on refait l'horodatage de
 * l'instant lu, et il doit être identique au texte reçu. Cela refuse aussi `-00:00`, que
 * l'appareil n'écrit jamais.
 */
function estHorodatage(texte: string): boolean {
  const lu = FORMAT_REPONDU_A.exec(texte);
  if (lu === null) return false;
  const instant = Date.parse(texte);
  if (Number.isNaN(instant)) return false;
  const [, signe, heures, minutes] = lu;
  const decalage =
    (signe === '-' ? -1 : 1) * (Number(heures) * MINUTES_PAR_HEURE + Number(minutes));
  return horodatage(instant, decalage) === texte;
}

const commun = {
  id: z.string().regex(FORMAT_ID_EVENEMENT),
  cours: z.string().regex(FORMAT_IDENTIFIANT),
  unite: z.string().refine(estUnite),
  repondu_a: z.string().refine(estHorodatage),
  appareil: z.string().regex(FORMAT_UUID),
  v: z.literal(VERSION_EVENEMENT),
};

const resultatReponse = z.strictObject({ juste: z.boolean() });

const resultatExamen = z
  .strictObject({
    points: z.int().min(0),
    questions: z.int().min(1),
    note: z
      .number()
      .min(1)
      .max(6)
      .refine((note) => Number.isInteger(note * 2)),
    minutes: z.int().min(1),
    chapitres: z.int().min(0),
  })
  .refine((resultat) => resultat.points <= resultat.questions);

/**
 * Un événement, tel que le téléphone l'envoie : des objets stricts, sans aucun champ en plus.
 *
 * Un `z.union` et non un `z.discriminatedUnion`, pour Stryker : sous `discriminatedUnion`, des
 * mutants (le discriminant `'type'` vidé, une branche vidée) font planter zod au chargement du
 * module ; aucun test ne se charge alors, et Stryker les compte vivants alors qu'ils seraient tués.
 * `type` étant un littéral dans chaque branche, la validation est la même ; seule l'erreur d'un
 * événement refusé est plus bavarde (`invalid_union`).
 */
export const schemaEvenement: z.ZodType<Evenement> = z.union([
  z.strictObject({ ...commun, type: z.literal('reponse'), resultat: resultatReponse }),
  z.strictObject({ ...commun, type: z.literal('examen'), resultat: resultatExamen }),
]);

const OCTETS_ALEATOIRES = 10;
const INSTANT_MAX = 2 ** 48;

const sur2 = (octet: number): string => octet.toString(16).padStart(2, '0');

/**
 * Un UUIDv7 (RFC 9562) : les 48 premiers bits sont l'instant en millisecondes, donc les `id`
 * croissent avec le temps, et les 74 bits suivants sont aléatoires. `aleatoire` porte 10 octets
 * tirés par l'appelant (le domaine n'a pas d'accès au hasard) : 4 bits de l'octet 0 et 6 bits de
 * l'octet 2 cèdent la place à la version (7) et à la variante (10).
 */
export function creerIdEvenement(instantMs: number, aleatoire: Uint8Array): string {
  if (!Number.isSafeInteger(instantMs) || instantMs < 0 || instantMs >= INSTANT_MAX) {
    throw new RangeError("L'instant d'un identifiant d'événement tient sur 48 bits, sans signe.");
  }
  if (aleatoire.length !== OCTETS_ALEATOIRES) {
    throw new RangeError(
      `Un identifiant d'événement demande ${OCTETS_ALEATOIRES} octets aléatoires.`,
    );
  }
  const instant = instantMs.toString(16).padStart(12, '0');
  const queue = [
    0x70 | (aleatoire[0] & 0x0f),
    aleatoire[1],
    0x80 | (aleatoire[2] & 0x3f),
    ...aleatoire.subarray(3),
  ]
    .map(sur2)
    .join('');
  return [
    instant.slice(0, 8),
    instant.slice(8),
    queue.slice(0, 4),
    queue.slice(4, 8),
    queue.slice(8),
  ].join('-');
}

/** Ce que compare l'ordre du journal : l'instant d'un événement (`Date.parse`), puis son `id`. */
export interface PositionDansLeJournal {
  instant: number;
  id: string;
}

/**
 * L'ordre du journal : l'instant, puis l'`id` ; 0 si les deux sont égaux (un doublon, hors
 * contrat : `fusionnerEvenements` dédoublonne). Exporté pour être testé seul, pour Stryker : à
 * travers le tri, on ne voit pas ce qu'il rend quand le premier est le plus grand (sur une petite
 * liste, le tri de V8 ne lit que le signe négatif), et les mutants de cette branche resteraient
 * vivants.
 */
export function comparerPositions(a: PositionDansLeJournal, b: PositionDansLeJournal): number {
  return a.instant - b.instant || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Les événements dans l'ordre du journal (`comparerPositions`) : par instant (`Date.parse`, qui
 * tient compte du décalage), puis par `id`. Deux appareils qui ont les mêmes événements les rangent
 * de la même façon. Rend une nouvelle liste.
 */
export function trierEvenements(evenements: readonly Evenement[]): Evenement[] {
  return evenements
    .map((evenement) => ({
      evenement,
      instant: Date.parse(evenement.repondu_a),
      id: evenement.id,
    }))
    .sort(comparerPositions)
    .map(({ evenement }) => evenement);
}

/**
 * L'union de deux journaux, sans doublon et dans l'ordre du journal. Un `id` déjà vu est ignoré :
 * à `id` égal, l'événement de `a` fait foi (le premier reçu, comme le serveur). Le renvoi d'un
 * même événement est donc sans effet.
 */
export function fusionnerEvenements(a: readonly Evenement[], b: readonly Evenement[]): Evenement[] {
  const parId = new Map<string, Evenement>();
  for (const evenement of [...a, ...b]) {
    if (!parId.has(evenement.id)) parId.set(evenement.id, evenement);
  }
  return trierEvenements([...parId.values()]);
}
