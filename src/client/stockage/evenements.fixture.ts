/*
 * Des événements factices pour les tests du stockage local et de la synchronisation, écrits à la
 * main (invariant 7). Exclu de la construction, comme tout `*.fixture.ts`.
 */

import { APPAREIL_DE_TEST, examenRemisDeTest, idDeTest } from '../../domaine/evenements.fixture.js';
import type { Evenement } from '../../domaine/journal/evenement.js';

export { APPAREIL_DE_TEST, idDeTest };
export const AUTRE_APPAREIL_DE_TEST = '9e2d7c41-3a58-4f06-b1d9-0c6a8e5f2b34';
export const COURS_DE_TEST = 'cs000001';
export const AUTRE_COURS_DE_TEST = 'cs000002';
export const ALICE = 'p-alice';
export const BERTHE = 'p-berthe';

const sur2 = (n: number): string => String(n).padStart(2, '0');

/** Une réponse à une carte ; `n` (de 0 à 3599) fait l'identifiant et la seconde de la réponse. */
export function reponseDeTest(
  cours: string,
  n: number,
  { juste = true, appareil = APPAREIL_DE_TEST } = {},
): Evenement {
  return {
    id: idDeTest(n),
    cours,
    unite: 'abcd1234',
    type: 'reponse',
    resultat: { juste },
    repondu_a: `2026-10-17T08:${sur2(Math.floor(n / 60))}:${sur2(n % 60)}.000+02:00`,
    appareil,
    v: 1,
  };
}

/** Un examen remis : son unité est l'identifiant du module `examen`. */
export function examenDeTest(cours: string, n: number): Evenement {
  return examenRemisDeTest(
    cours,
    n,
    `2026-10-17T08:${sur2(Math.floor(n / 60))}:${sur2(n % 60)}.000+02:00`,
  );
}
