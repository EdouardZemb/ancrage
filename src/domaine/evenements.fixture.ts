/*
 * Ce que les événements factices du client et du serveur ont en commun (1f-D4 : une seule copie) :
 * l'appareil, l'identifiant d'un événement, et un examen remis. Écrits à la main (invariant 7).
 * Exclu de la construction, comme tout `*.fixture.ts`.
 */
import type { Evenement } from './journal/evenement.js';

export const APPAREIL_DE_TEST = '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17';

/** Un UUIDv7 valide mais factice : les `id` croissent avec `n`. */
export function idDeTest(n: number): string {
  return `01929f3a-5b3c-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

/**
 * Un examen remis à `reponduA` : son unité est l'identifiant du module `examen`, et `n` fait
 * l'identifiant de l'événement.
 */
export function examenRemisDeTest(cours: string, n: number, reponduA: string): Evenement {
  return {
    id: idDeTest(n),
    cours,
    unite: 'exam0001',
    type: 'examen',
    resultat: { points: 18, questions: 24, note: 4.5, minutes: 12, chapitres: 3 },
    repondu_a: reponduA,
    appareil: APPAREIL_DE_TEST,
    v: 1,
  };
}

/** Une réponse à l'unité, donnée à l'instant `reponduA` ; `n` fait l'identifiant de l'événement. */
export function reponseDeTest(
  n: number,
  unite: string,
  juste: boolean,
  reponduA: string,
): Evenement {
  return {
    id: idDeTest(n),
    cours: 'cm5r8t23',
    unite,
    type: 'reponse',
    resultat: { juste },
    repondu_a: reponduA,
    appareil: APPAREIL_DE_TEST,
    v: 1,
  };
}
