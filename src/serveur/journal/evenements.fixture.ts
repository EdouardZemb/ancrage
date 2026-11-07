/*
 * Des événements factices pour les tests du journal côté serveur, écrits à la main (invariant 7).
 * Exclu de la construction, comme tout `*.fixture.ts`.
 */

import { APPAREIL_DE_TEST, examenRemisDeTest, idDeTest } from '../../domaine/evenements.fixture.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import type { Base } from '../base/base.js';

export { APPAREIL_DE_TEST, idDeTest };
export const UNITE_DE_TEST = 'abcd1234';

/** Une réponse à une carte du cours ; `n` fait l'identifiant. */
export function reponseDeTest(cours: string, n: number, juste = true): Evenement {
  return {
    id: idDeTest(n),
    cours,
    unite: UNITE_DE_TEST,
    type: 'reponse',
    resultat: { juste },
    repondu_a: '2026-10-17T08:15:30.250+02:00',
    appareil: APPAREIL_DE_TEST,
    v: 1,
  };
}

/** Un examen remis ; `n` fait l'identifiant. */
export function examenDeTest(cours: string, n: number): Evenement {
  return examenRemisDeTest(cours, n, '2026-10-17T09:02:11.004+02:00');
}

/**
 * Un événement inséré en SQL brut, sans passer par le dépôt du journal : le test choisit lui-même
 * le `numero`, l'`id` et l'ordre d'écriture, ce que le dépôt ne laisse pas faire (il attribue les
 * numéros). Une réponse juste, d'une unité factice, par défaut.
 */
export function insererEvenementBrut(
  sqlite: Base['sqlite'],
  e: {
    id: string;
    personne: string;
    cours: string;
    numero?: number;
    unite?: string;
    appareil?: string;
    recuA?: string;
  },
): void {
  sqlite
    .prepare(
      `insert into evenement (id, personne, cours, numero, unite, type, resultat, repondu_a, appareil, v, recu_a)
       values (?, ?, ?, ?, ?, 'reponse', '{"juste":true}', '2026-10-17T08:15:30.250+02:00', ?, 1, ?)`,
    )
    .run(
      e.id,
      e.personne,
      e.cours,
      e.numero ?? 1,
      e.unite ?? UNITE_DE_TEST,
      e.appareil ?? 'x',
      e.recuA ?? 'x',
    );
}
