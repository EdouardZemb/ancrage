/*
 * L'en-tête commun des tests de la synchronisation (2b-D6) : la file de réponses, les identifiants et les
 * faux serveurs. Exclu de la construction, comme tout `*.fixture.*`.
 */

import { expect } from 'vitest';
import type { Evenement } from '../domaine/journal/evenement.js';
import type { BaseLocale } from './stockage/base-locale.js';
import { ALICE, COURS_DE_TEST, idDeTest, reponseDeTest } from './stockage/evenements.fixture.js';
import { ajouterEvenement, evenementsDuCours, fileDuCours } from './stockage/journal-local.js';
import { apiDe, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import { synchroniserCours } from './synchro.js';

/** Ajoute à la file de `personne` les réponses `de` à `a` (comprises) du cours. */
export async function repondre(
  base: BaseLocale,
  personne: string,
  cours: string,
  de: number,
  a: number,
) {
  const ajouts: Promise<void>[] = [];
  for (let n = de; n <= a; n += 1)
    ajouts.push(ajouterEvenement(base, personne, reponseDeTest(cours, n)));
  await Promise.all(ajouts);
}

export const ids = (evenements: readonly Evenement[]): string[] => evenements.map((e) => e.id);
export const idsDe = (de: number, a: number): string[] =>
  Array.from({ length: a - de + 1 }, (_, i) => idDeTest(de + i));

/**
 * Une panne d'envoi (hors ligne, session expirée) n'a rien perdu : les deux réponses de la file sont
 * encore sur l'appareil, et le serveur n'a pas été lu (on ne tente pas la lecture quand l'envoi
 * échoue). Quand la panne passe, la file part.
 */
export async function verifierQueLaFileAttendPuisPart(
  base: BaseLocale,
  serveur: ServeurFactice,
): Promise<void> {
  expect(ids(await fileDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 2));
  expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 2));
  expect(serveur.lectures).toEqual([]);
  serveur.panneEnvoi = undefined;
  expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
    etat: 'a_jour',
    enAttente: 0,
  });
  expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual(idsDe(1, 2));
}

/** Un faux serveur dont l'envoi attend qu'on le libère, pour garder une synchronisation en cours. */
export function serveurRetenu() {
  const serveur = new ServeurFactice();
  let liberer = () => {};
  const porte = new Promise<void>((resolve) => {
    liberer = resolve;
  });
  const api = apiDe(serveur, {
    envoyer: async (cours, evenements) => {
      await porte;
      await serveur.envoyer(cours, evenements);
    },
  });
  return { serveur, api, liberer: () => liberer() };
}

// IndexedDB simulée en mémoire : un millier d'événements prennent quelques secondes.
export const DELAI_LOURD = 30_000;
