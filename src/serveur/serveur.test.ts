/*
 * Le démarrage du serveur (1f-D8) : la purge y est branchée, elle revient à chaque intervalle, elle
 * s'arrête avec le serveur. Une vraie base dans un dossier temporaire, un vrai port (0 : celui que
 * le système donne). Les sessions sont écrites et lues par une seconde connexion, la nôtre, car le
 * serveur ne rend pas sa base. Données factices écrites à la main (invariant 7).
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { valeursDeNoticeDExemple } from '../domaine/contenu/exemple.fixture.js';
import type { DependancesApp } from './app.js';
import { appliquerMigrations, type Base, fermerBase, ouvrirBase } from './base/base.js';
import { creerDepot } from './comptes/depot.js';
import { lireConfig } from './config.js';
import { type ContenusCharges, demarrerServeur, type Serveur } from './serveur.js';

// Chaque application créée compte ses fermetures, et peut échouer à se fermer : de quoi voir ce que
// `demarrerServeur` ferme quand le démarrage échoue.
const fermetures = vi.hoisted(() => ({ nombre: 0, echec: undefined as Error | undefined }));

vi.mock('./app.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./app.js')>();
  return {
    ...original,
    creerApp: (dependances: DependancesApp) => {
      const app = original.creerApp(dependances);
      app.addHook('onClose', async () => {
        fermetures.nombre += 1;
        if (fermetures.echec !== undefined) {
          throw fermetures.echec;
        }
      });
      return app;
    },
  };
});

// Dossier qui n'existe pas : le résultat ne dépend pas d'un `dist/client` laissé par un build.
const CLIENT_ABSENT = path.join(os.tmpdir(), 'ancrage-client-absent');
const EXPIREE = '2020-01-01T00:00:00.000Z';

let dossier: string;
let chemin: string;
let connexion: Base;
let serveur: Serveur | undefined;
// Le journal de l'application, capturé : rien ne part sur la sortie des tests.
let lignes: string[];
const journal = {
  write: (ligne: string) => {
    lignes.push(ligne);
  },
};

beforeEach(() => {
  lignes = [];
  fermetures.nombre = 0;
  fermetures.echec = undefined;
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-'));
  chemin = path.join(dossier, 'ancrage.sqlite');
  connexion = ouvrirBase(chemin);
  appliquerMigrations(connexion);
  serveur = undefined;
});

afterEach(async () => {
  vi.restoreAllMocks();
  // Windows verrouille les fichiers ouverts : on ferme le serveur et notre connexion avant de
  // supprimer le dossier.
  await serveur?.arreter();
  if (connexion.sqlite.open) {
    fermerBase(connexion);
  }
  fs.rmSync(dossier, { recursive: true, force: true });
});

function configDeTest({ port = 0, base = chemin } = {}) {
  return lireConfig({
    ANCRAGE_ENV: 'ci',
    ANCRAGE_BASE: base,
    PORT: String(port),
    ANCRAGE_CLIENT: CLIENT_ABSENT,
  });
}

/** Aucun cours, et la notice de l'exemple. */
function contenusDeTest(): ContenusCharges {
  return { cours: [], notice: valeursDeNoticeDExemple() };
}

async function demarrer(options?: { intervallePurge?: number }): Promise<Serveur> {
  serveur = await demarrerServeur(configDeTest(), contenusDeTest(), { journal, ...options });
  return serveur;
}

/** Les lignes du journal capturé, lues comme du JSON (une ligne par entrée de pino). */
function entrees(): { level: number; msg: string; err?: { code?: string } }[] {
  return lignes.map((ligne) => JSON.parse(ligne));
}

/** Un port que `liberer` rend, tenu par un autre serveur : le démarrage qui le demande échoue. */
async function occuperUnPort(): Promise<{ port: number; liberer: () => Promise<void> }> {
  const occupant = net.createServer();
  await new Promise<void>((resolu) => occupant.listen(0, '127.0.0.1', resolu));
  const { port } = occupant.address() as net.AddressInfo;
  return { port, liberer: () => new Promise((resolu) => occupant.close(() => resolu())) };
}

/** Une session déjà expirée, que la purge doit retirer. */
function ecrireSessionExpiree(empreinte: string): void {
  const depot = creerDepot(connexion, () => new Date());
  const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
  depot.creerSession({ personne: personne.id, empreinte, appareil: 'Android', expireLe: EXPIREE });
}

function compterSessions(): number {
  const ligne = connexion.sqlite.prepare('select count(*) as n from session').get() as {
    n: number;
  };
  return ligne.n;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolu) => setTimeout(resolu, ms));
}

/** Attend, par pas de 10 ms et au plus `delaiMs`, que `condition` soit vraie ; rend son état final. */
async function attendreQue(condition: () => boolean, delaiMs: number): Promise<boolean> {
  const limite = Date.now() + delaiMs;
  while (!condition() && Date.now() < limite) {
    await pause(10);
  }
  return condition();
}

describe('demarrerServeur', () => {
  it('la_purge_part_au_demarrage', async () => {
    ecrireSessionExpiree('expiree-avant-le-demarrage');
    expect(compterSessions()).toBe(1);

    await demarrer();

    expect(compterSessions()).toBe(0);
  });

  it('la_purge_revient_a_chaque_intervalle', async () => {
    await demarrer({ intervallePurge: 20 });
    ecrireSessionExpiree('expiree-apres-le-demarrage');
    expect(compterSessions()).toBe(1);

    // L'intervalle par défaut est de 6 heures : seule la valeur passée peut vider la table ici.
    expect(await attendreQue(() => compterSessions() === 0, 1000)).toBe(true);
  });

  it('arreter_arrete_la_purge', async () => {
    const { app, arreter } = await demarrer({ intervallePurge: 20 });
    const fermeture = vi.spyOn(app, 'close');

    await arreter();
    // Une minuterie oubliée trouverait la base fermée : la session resterait là, mais la purge
    // journaliserait son échec. Le journal est donc ce qui prouve l'arrêt.
    const avant = lignes.length;
    ecrireSessionExpiree('expiree-apres-larret');
    await pause(200);

    expect(compterSessions()).toBe(1);
    expect(lignes.slice(avant)).toEqual([]);
    // Idempotent : le second appel se résout sans refermer l'application.
    await expect(arreter()).resolves.toBeUndefined();
    expect(fermeture).toHaveBeenCalledTimes(1);
  });

  it('un_port_occupe_rejette', async () => {
    const { port, liberer } = await occuperUnPort();
    const arretsDeMinuterie = vi.spyOn(globalThis, 'clearInterval');
    // Notre connexion fermée, la base du serveur est la seule ouverte : si elle l'est encore après
    // le rejet, SQLite garde son journal WAL, qu'une dernière fermeture supprime.
    fermerBase(connexion);
    try {
      await expect(
        demarrerServeur(configDeTest({ port }), contenusDeTest(), { journal }),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await liberer();
    }

    expect(entrees()).toContainEqual(
      expect.objectContaining({
        level: 50,
        msg: 'démarrage impossible',
        err: expect.objectContaining({ code: 'EADDRINUSE' }),
      }),
    );
    expect(arretsDeMinuterie).toHaveBeenCalledTimes(1);
    expect(fermetures.nombre).toBe(1);
    expect(fs.existsSync(`${chemin}-wal`)).toBe(false);
  });

  it('une_fermeture_en_echec_ne_masque_pas_l_erreur_d_origine', async () => {
    const { port, liberer } = await occuperUnPort();
    fermerBase(connexion);
    fermetures.echec = new Error('fermeture en échec');
    try {
      // C'est l'écoute en échec qui est rejetée, pas la fermeture qui a échoué ensuite.
      await expect(
        demarrerServeur(configDeTest({ port }), contenusDeTest(), { journal }),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await liberer();
    }

    expect(fermetures.nombre).toBe(1);
    // Et la base a été fermée malgré tout.
    expect(fs.existsSync(`${chemin}-wal`)).toBe(false);
  });

  it('une_migration_en_echec_ferme_la_base_et_rejette', async () => {
    // Une base qui a déjà la table `instance`, sans registre de migrations : la première migration
    // lève, après l'ouverture de la base et avant la création de l'application.
    const conflit = path.join(dossier, 'conflit.sqlite');
    const preexistante = ouvrirBase(conflit);
    preexistante.sqlite.exec('create table instance (id text)');
    fermerBase(preexistante);

    await expect(
      demarrerServeur(configDeTest({ base: conflit }), contenusDeTest(), { journal }),
    ).rejects.toThrow(/CREATE TABLE `instance`/);

    // Seule la base du serveur était ouverte : fermée, elle ne laisse pas de journal WAL.
    expect(fs.existsSync(`${conflit}-wal`)).toBe(false);
    // L'application n'a pas été créée : il n'y a rien à fermer.
    expect(fermetures.nombre).toBe(0);
  });
});
