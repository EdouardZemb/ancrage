/**
 * Un cours minimal et factice, sans module, pour les tests qui n'ont besoin que de son identifiant
 * et de son titre (droits, listes, export). Exclu de la construction, comme tout `*.fixture.ts`.
 */
import type { Cours } from './modele.js';

export function coursDeTest(id: string, titre = 'Kurs Test'): Cours {
  return {
    id,
    dossier: id,
    titre,
    langue: 'de',
    typesDeCarte: {},
    leitner: { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 },
    modules: [],
  };
}
