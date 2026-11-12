/*
 * Des journaux inventés et une base temporaire pour les tests des outils de mémoire : une base
 * migrée, une personne inventée par journal, des identifiants et des noms que le test reconnaît s'ils
 * fuient. Écrits à la main, aucune donnée réelle (invariant 7). Exclu de la construction, comme tout
 * `*.fixture.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FSRS6_DEFAULT_WEIGHTS, FSRS6Model } from 'ts-fsrs/models/fsrs-6';
import { afterEach, beforeEach } from 'vitest';
import { hasardDeterministe } from '../../domaine/hasard.js';
import { creerIdEvenement, type Evenement } from '../../domaine/journal/evenement.js';
import { horodatage } from '../../domaine/journal/temps.js';
import { appliquerMigrations, fermerBase, ouvrirBase } from '../../serveur/base/base.js';
import { creerDepotJournal } from '../../serveur/journal/depot-journal.js';

export const COURS_DE_TEST = 'm0000000';
export const APPAREIL_INVENTE = '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17';

const MS_PAR_JOUR = 86_400_000;
const MS_PAR_MINUTE = 60_000;
const DEBUT = Date.UTC(2026, 0, 1, 10, 0, 0);
const OCTETS_ALEATOIRES = 10;
const DEBUT_DU_RANG = 5;
const FIN_DU_RANG = 9;
const ECART_MAXIMAL = 20;
const UN_SUR_SEPT = 1 / 7;
const PART_DE_JUSTES_A_LA_PREMIERE = 0.7;

/** Une personne inventée, aux identifiant et nom reconnaissables. */
export interface PersonneInventee {
  id: string;
  nom: string;
}

/** Un événement de réponse à `instant`, d'identifiant propre à son `rang`. */
export function reponseInventee(
  instant: number,
  rang: number,
  unite: string,
  juste: boolean,
  cours = COURS_DE_TEST,
): Evenement {
  const aleatoire = new Uint8Array(OCTETS_ALEATOIRES);
  for (let i = DEBUT_DU_RANG; i < FIN_DU_RANG; i++) {
    aleatoire[i] = Math.floor(rang / 256 ** (FIN_DU_RANG - 1 - i)) % 256;
  }
  return {
    id: creerIdEvenement(instant, aleatoire),
    cours,
    unite,
    type: 'reponse',
    resultat: { juste },
    repondu_a: horodatage(instant, 0),
    appareil: APPAREIL_INVENTE,
    v: 1,
  };
}

export interface OptionsDeSimulation {
  unites: number;
  /** Le nombre de réponses de chaque unité. */
  passages: number;
  graine: number;
  /** Les 21 poids de la mémoire simulée ; par défaut, ceux de FSRS-6. */
  poids?: readonly number[];
}

/** Les poids que remplace une mémoire simulée : elle oublie bien plus vite que celle par défaut. */
const REMPLACEMENTS: Record<number, number> = {
  0: 0.15,
  1: 0.5,
  2: 1.2,
  3: 3,
  8: 1.2,
  9: 0.5,
  10: 0.9,
  11: 1,
  13: 0.3,
  14: 0.5,
  20: 0.4,
};

/** Des poids valides et loin des poids par défaut. */
export const POIDS_SIMULES: readonly number[] = FSRS6_DEFAULT_WEIGHTS.map(
  (poids, rang) => REMPLACEMENTS[rang] ?? poids,
);

/**
 * Des poids valides dont la stabilité initiale est si basse que l'optimiseur rend un poids sous la
 * borne du modèle (0,0008 pour une borne à 0,001).
 */
export const POIDS_EXTREMES: readonly number[] = POIDS_SIMULES.map((poids, rang) =>
  rang < 4 ? ([0.1, 0.4, 0.9, 2.5][rang] ?? poids) : poids,
);

/**
 * Un journal tiré d'une mémoire simulée par FSRS-6 : chaque unité est revue après un écart de 1 à
 * 20 jours (0 dans un cas sur sept, d'où des réponses du même jour), et sa réponse est juste avec la
 * probabilité de rappel que les `poids` donnent, d'un hasard à graine. Dans l'ordre du temps.
 */
export function journalSimule({
  unites,
  passages,
  graine,
  poids = FSRS6_DEFAULT_WEIGHTS,
}: OptionsDeSimulation): Evenement[] {
  const hasard = hasardDeterministe(graine);
  const modele = FSRS6Model.create({
    config: {
      weights: [...poids],
      enableShortTerm: false,
      numRelearningSteps: 0,
    },
  });
  const reponses: { instant: number; unite: string; juste: boolean }[] = [];
  for (let rang = 0; rang < unites; rang++) {
    const unite = `m${String(rang).padStart(7, '0')}`;
    let jour = Math.floor(hasard() * ECART_MAXIMAL);
    let minute = 0;
    let memoire: ReturnType<typeof modele.step> | undefined;
    for (let passage = 0; passage < passages; passage++) {
      const ecoules =
        passage === 0 ? 0 : hasard() < UN_SUR_SEPT ? 0 : 1 + Math.floor(hasard() * ECART_MAXIMAL);
      jour += ecoules;
      minute = ecoules === 0 ? minute + 1 : 0;
      const probabilite =
        memoire === undefined
          ? PART_DE_JUSTES_A_LA_PREMIERE
          : modele.forgettingCurve(memoire, ecoules);
      const juste = hasard() < probabilite;
      memoire = modele.step({
        memoryState: memoire ?? null,
        rating: juste ? 3 : 1,
        elapsedDays: ecoules,
      });
      reponses.push({ instant: DEBUT + jour * MS_PAR_JOUR + minute * MS_PAR_MINUTE, unite, juste });
    }
  }
  reponses.sort((a, b) => a.instant - b.instant || (a.unite < b.unite ? -1 : 1));
  return reponses.map(({ instant, unite, juste }, rang) =>
    reponseInventee(instant, rang, unite, juste),
  );
}

/**
 * Range des journaux inventés, une personne inventée par journal, dans une base neuve et migrée à
 * `chemin`, en mode de journal ordinaire (comme une copie par `VACUUM INTO` : un seul fichier). Rend
 * les personnes créées.
 */
export function ecrireJournal(
  chemin: string,
  journaux: readonly (readonly Evenement[])[],
): PersonneInventee[] {
  const base = ouvrirBase(chemin);
  try {
    appliquerMigrations(base);
    const depot = creerDepotJournal(base);
    const insertion = base.sqlite.prepare(
      "insert into personne (id, nom_affiche, langue, proprietaire, cree_le) values (?, ?, 'de', 0, '2026-01-01T00:00:00.000Z')",
    );
    const personnes = journaux.map((evenements, rang): PersonneInventee => {
      const personne = {
        id: `personne-inventee-${rang + 1}`,
        nom: `Nom Reconnaissable ${rang + 1}`,
      };
      insertion.run(personne.id, personne.nom);
      depot.ajouter(personne.id, evenements, '2026-01-02T00:00:00.000Z');
      return personne;
    });
    base.sqlite.pragma('journal_mode = DELETE');
    return personnes;
  } finally {
    fermerBase(base);
  }
}

/**
 * Pose, pour le fichier de test qui l'appelle, un dossier temporaire neuf avant chaque test et sa
 * suppression après, même si le test l'a rendu en lecture seule. Rend la fonction qui donne le
 * dossier du test en cours.
 */
export function installerDossierTemporaire(): () => string {
  let dossier = '';
  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-memoire-'));
  });
  afterEach(() => {
    fs.chmodSync(dossier, 0o755);
    fs.rmSync(dossier, { recursive: true, force: true });
  });
  return () => dossier;
}
