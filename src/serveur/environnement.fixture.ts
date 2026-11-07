/*
 * Ce que les tests d'une application branchée sur une base temporaire se partagent (1f-D4 : une
 * seule copie) : la base migrée et son dépôt, installés avant chaque test ; l'horloge et le journal
 * du serveur, que les tests lisent et font avancer ; l'application Fastify qui s'y branche ; une
 * session valide pour une personne. Données factices écrites à la main (invariant 7). Exclu de la
 * construction, comme tout `*.fixture.ts`.
 */
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach } from 'vitest';
import { valeursDeNoticeDExemple } from '../domaine/contenu/exemple.fixture.js';
import type { Cours } from '../domaine/contenu/modele.js';
import { creerApp } from './app.js';
import { installerBasesDeTest } from './base/base.fixture.js';
import { appliquerMigrations, type Base } from './base/base.js';
import type { TypeAppareil } from './comptes/appareil.js';
import {
  creerDepot,
  type Depot,
  type PersonneEnregistree,
  type SessionEnregistree,
} from './comptes/depot.js';
import { empreinte, nouveauJeton } from './comptes/jetons.js';
import { lireConfig } from './config.js';

/** L'heure au début de chaque test, sauf mention contraire. */
export const T0 = new Date('2026-10-16T08:00:00.000Z');

// Dossier qui n'existe pas : le résultat ne dépend pas d'un `dist/client` laissé par un build.
const CLIENT_ABSENT = path.join(os.tmpdir(), 'ancrage-client-absent');

/** Ce que reçoit le fichier de test, neuf, avant chacun de ses tests. */
export interface Environnement {
  dossier: string;
  /** Le fichier de la base, dans `dossier`. */
  chemin: string;
  base: Base;
  depot: Depot;
}

/** L'heure de l'application et du dépôt : un test l'avance en réaffectant `maintenant`. */
export interface HorlogeDeTest {
  maintenant: Date;
}

export interface OptionsDInstallation {
  /** L'heure au début de chaque test ; `T0` par défaut. */
  debut?: Date;
  /** Le nom du fichier de la base, dans le dossier du test. */
  nomDeLaBase?: string;
  /** Les cours que l'application charge ; aucun par défaut. */
  cours?: Cours[];
}

export interface Installation {
  horloge: HorlogeDeTest;
  /** Les lignes que le serveur a journalisées pendant le test (un tableau neuf avant chaque test). */
  journalServeur: { lignes: string[] };
  /**
   * L'application complète sur la base du test, avec une configuration de CI. Hors d'un test, elle
   * échoue.
   */
  creerApp: () => FastifyInstance;
}

/**
 * Pose, pour le fichier de test qui l'appelle, une base temporaire migrée et son dépôt avant chaque
 * test. `recevoir` reçoit l'environnement neuf, que le fichier garde dans ses variables ; la base
 * est fermée et le dossier supprimé après chaque test. À appeler une fois par fichier, au premier
 * niveau.
 */
export function installerEnvironnement(
  recevoir: (environnement: Environnement) => void,
  { debut = T0, nomDeLaBase = 'x.sqlite', cours = [] }: OptionsDInstallation = {},
): Installation {
  let dossier = '';
  const ouvrir = installerBasesDeTest((nouveau) => {
    dossier = nouveau;
  });
  const horloge: HorlogeDeTest = { maintenant: new Date(debut) };
  const journalServeur = { lignes: [] as string[] };
  let courante: Base | undefined;

  beforeEach(() => {
    horloge.maintenant = new Date(debut);
    journalServeur.lignes = [];
    const chemin = path.join(dossier, nomDeLaBase);
    const base = ouvrir(chemin);
    courante = base;
    appliquerMigrations(base);
    recevoir({ dossier, chemin, base, depot: creerDepot(base, () => horloge.maintenant) });
  });

  // Après le test, la base est fermée : `creerApp` hors d'un test échoue au lieu de viser cette base.
  afterEach(() => {
    courante = undefined;
  });

  return {
    horloge,
    journalServeur,
    creerApp: () => {
      if (courante === undefined) {
        throw new Error("l'application ne se crée que pendant un test");
      }
      return creerApp({
        config: lireConfig({ ANCRAGE_ENV: 'ci', ANCRAGE_CLIENT: CLIENT_ABSENT }),
        base: courante,
        cours,
        notice: valeursDeNoticeDExemple(),
        etatBase: () => ({ schema: 0, instance: 'i-1' }),
        horloge: () => horloge.maintenant,
        journal: {
          write: (ligne: string) => {
            journalServeur.lignes.push(ligne);
          },
        },
      });
    },
  };
}

/** Une session valide pour la personne : son jeton (celui du cookie) et son enregistrement. */
export function ouvrirSessionDeTest(
  depot: Depot,
  personne: string,
  expireLe: Date,
  appareil: TypeAppareil = 'Android',
): { jeton: string; session: SessionEnregistree } {
  const jeton = nouveauJeton();
  const session = depot.creerSession({
    personne,
    empreinte: empreinte(jeton),
    appareil,
    expireLe: expireLe.toISOString(),
  });
  return { jeton, session };
}

const UN_JOUR = 24 * 60 * 60 * 1000;

/**
 * `creerPersonne` et `connecter`, liés au dépôt du test en cours (`depot` est lu à chaque appel) :
 * une personne qui parle allemand, et sa session, valable un jour à partir de `debut` sauf mention
 * contraire.
 */
export function profilsDeTest(depot: () => Depot, debut: Date) {
  return {
    creerPersonne: (nomAffiche: string, proprietaire = false): PersonneEnregistree =>
      depot().creerPersonne({ nomAffiche, langue: 'de', proprietaire }),
    connecter: (
      personne: PersonneEnregistree,
      appareil: TypeAppareil = 'Android',
      expireLe: Date = new Date(debut.getTime() + UN_JOUR),
    ) => ouvrirSessionDeTest(depot(), personne.id, expireLe, appareil),
  };
}
