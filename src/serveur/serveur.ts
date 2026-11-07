/*
 * Le démarrage du serveur (1f-D8) : ce que `main.ts` faisait seul, rendu testable. `main.ts` ne
 * garde que la lecture de la configuration et des contenus, et les signaux.
 */
import type { FastifyInstance } from 'fastify';
import type { Cours } from '../domaine/contenu/modele.js';
import type { ValeursDeNotice } from '../domaine/notice.js';
import { creerApp, type DependancesApp } from './app.js';
import {
  appliquerMigrations,
  fermerBase,
  initialiserInstance,
  ouvrirBase,
  versionSchema,
} from './base/base.js';
import { planifierPurge } from './comptes/purge.js';
import type { Config } from './config.js';

/** Ce que le démarrage a chargé et validé : les cours, et les valeurs de la notice (S1-D8). */
export interface ContenusCharges {
  cours: Cours[];
  notice: ValeursDeNotice;
}

/** Un serveur à l'écoute : son application, et de quoi l'arrêter. */
export interface Serveur {
  app: FastifyInstance;
  /** Arrête la purge, ferme l'application puis la base. Appelé deux fois, il ne fait rien de plus. */
  arreter(): Promise<void>;
}

export interface OptionsServeur {
  /** Le temps entre deux purges, en ms ; par défaut 6 heures. */
  intervallePurge?: number;
  /** Où va le journal de l'application ; par défaut, la sortie standard. Les tests le capturent. */
  journal?: DependancesApp['journal'];
}

/**
 * Sur un abandon, une fermeture qui échoue ne doit pas masquer l'erreur d'origine, qui est celle
 * qu'on rejette.
 */
async function sansMasquer(fermer: () => unknown): Promise<void> {
  try {
    await fermer();
  } catch {
    // Volontairement muet : voir ci-dessus.
  }
}

/**
 * Ouvre la base, la migre, crée l'application, planifie la purge, puis écoute. `intervallePurge`
 * remplace les 6 heures de la purge : c'est ce qui permet de la voir revenir en test.
 *
 * Si le démarrage échoue, à n'importe quelle étape (une migration qui lève, une écoute en échec
 * parce que le port est pris…), ce qui est ouvert se referme : la purge s'arrête, l'application se
 * ferme, la base se ferme, et l'erreur d'origine est rejetée. Une fois l'application créée, l'échec
 * est aussi journalisé (`démarrage impossible`).
 */
export async function demarrerServeur(
  config: Config,
  contenus: ContenusCharges,
  options?: OptionsServeur,
): Promise<Serveur> {
  const base = ouvrirBase(config.cheminBase);
  let creee: FastifyInstance | undefined;
  let arreterPurge: () => void = () => undefined;
  try {
    appliquerMigrations(base);
    const instance = initialiserInstance(base);

    const app = creerApp({
      config,
      base,
      cours: contenus.cours,
      notice: contenus.notice,
      etatBase: () => ({ schema: versionSchema(base), instance }),
      journal: options?.journal,
    });
    creee = app;

    // Sessions et liens périmés, entrées anciennes du registre : tout de suite, puis toutes les
    // 6 heures (1e-D9). Une purge en échec est journalisée et le serveur continue.
    arreterPurge = planifierPurge(base, () => new Date(), app.log, options?.intervallePurge);

    await app.listen({ host: config.hote, port: config.port });

    let arret: Promise<void> | undefined;

    async function fermer(): Promise<void> {
      // Avant la fermeture de la base : la minuterie ne purge pas une base fermée.
      arreterPurge();
      try {
        await app.close();
      } finally {
        fermerBase(base);
      }
    }

    return {
      app,
      // Une seule fermeture, quel que soit le nombre d'appels : les suivants attendent la même.
      arreter: () => {
        arret ??= fermer();
        return arret;
      },
    };
  } catch (erreur) {
    creee?.log.error({ err: erreur }, 'démarrage impossible');
    arreterPurge();
    await sansMasquer(() => creee?.close());
    await sansMasquer(() => fermerBase(base));
    throw erreur;
  }
}
