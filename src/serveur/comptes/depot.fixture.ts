/*
 * L'installation des tests du dépôt (`depot.test.ts`, `depot-liens.test.ts`) : une base temporaire
 * migrée, son dépôt, et une horloge que les tests font avancer (1f-D4 : une seule copie). Données
 * factices écrites à la main (invariant 7). Exclu de la construction, comme tout `*.fixture.ts`.
 */
import path from 'node:path';
import { beforeEach } from 'vitest';
import { installerBasesDeTest } from '../base/base.fixture.js';
import { appliquerMigrations, type Base } from '../base/base.js';
import type { HorlogeDeTest } from '../environnement.fixture.js';
import { creerDepot, type Depot } from './depot.js';

export const MAINTENANT = '2026-10-16T08:00:00.000Z';
export const PLUS_TARD = '2026-10-17T08:00:00.000Z';

export interface InstallationDuDepot {
  /** Remise à `MAINTENANT` avant chaque test. */
  horloge: HorlogeDeTest;
  /** Une base temporaire migrée et son dépôt. */
  creerDepotDeTest: () => { base: Base; depot: Depot };
  /** Deux connexions sur un même fichier migré, chacune avec son dépôt. */
  creerDeuxConnexionsDeTest: () => { baseA: Base; depotA: Depot; baseB: Base; depotB: Depot };
}

/** Le nombre de lignes de `requete` (ce qui suit `select count(*) as n from`). */
export function nombre(base: Base, requete: string, ...parametres: string[]): number {
  const ligne = base.sqlite.prepare(`select count(*) as n from ${requete}`).get(...parametres) as {
    n: number;
  };
  return ligne.n;
}

/** À appeler une fois par fichier de test, au premier niveau. */
export function installerDepotDeTest(): InstallationDuDepot {
  let dossier = '';
  const ouvrir = installerBasesDeTest((nouveau) => {
    dossier = nouveau;
  });
  const horloge: HorlogeDeTest = { maintenant: new Date(MAINTENANT) };

  beforeEach(() => {
    horloge.maintenant = new Date(MAINTENANT);
  });

  const depotDe = (base: Base) => creerDepot(base, () => horloge.maintenant);

  return {
    horloge,
    creerDepotDeTest: () => {
      const base = ouvrir(path.join(dossier, 'x.sqlite'));
      appliquerMigrations(base);
      return { base, depot: depotDe(base) };
    },
    creerDeuxConnexionsDeTest: () => {
      const chemin = path.join(dossier, 'x.sqlite');
      const baseA = ouvrir(chemin);
      appliquerMigrations(baseA);
      const baseB = ouvrir(chemin);
      return { baseA, depotA: depotDe(baseA), baseB, depotB: depotDe(baseB) };
    },
  };
}
