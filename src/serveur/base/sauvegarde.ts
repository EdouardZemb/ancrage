import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { type Base, identifiantInstanceDe, versionSchemaDe } from './base.js';

/** Nombre de lignes de chaque table (`sqlite_%` exclues, `__drizzle_migrations` comprise). */
export type Comptes = Record<string, number>;

export interface RapportSauvegarde {
  fichier: string;
  integrite: 'ok';
  comptes: Comptes;
  instance: string;
  schema: number;
}

export interface RapportVerification {
  integrite: string;
  comptes: Comptes;
  instance: string;
  schema: number;
  conforme: boolean;
  ecarts: string[];
}

interface Inspection {
  integrite: string;
  comptes: Comptes;
  instance: string;
  schema: number;
}

function compter(sqlite: Database.Database): Comptes {
  const lignes = sqlite
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\'",
    )
    .all() as { name: string }[];
  const comptes: Comptes = {};
  for (const nom of lignes.map((ligne) => ligne.name).sort()) {
    const identifiant = `"${nom.replaceAll('"', '""')}"`;
    const { n } = sqlite.prepare(`select count(*) as n from ${identifiant}`).get() as { n: number };
    comptes[nom] = n;
  }
  return comptes;
}

export function compterLignes(base: Base): Comptes {
  return compter(base.sqlite);
}

function estCorruption(erreur: unknown): erreur is Error {
  const code = (erreur as { code?: unknown } | null)?.code;
  return (
    erreur instanceof Error &&
    typeof code === 'string' &&
    (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB')
  );
}

// Sur un fichier très abîmé, SQLite lève l'erreur au lieu de la lister : on la rapporte comme un
// défaut d'intégrité, pour que `verifier` réponde « non conforme » plutôt que « erreur ».
function lireIntegrite(sqlite: Database.Database): string {
  try {
    const lignes = sqlite.pragma('integrity_check') as { integrity_check: string }[];
    return lignes.map((ligne) => ligne.integrity_check).join(' ; ');
  } catch (erreur) {
    if (estCorruption(erreur)) {
      return erreur.message;
    }
    throw erreur;
  }
}

// Ouvre le fichier en lecture seule : une copie de sauvegarde n'est jamais modifiée, et cette
// ouverture ne crée aucun fichier `-wal` ou `-shm` à côté. Si l'intégrité échoue, le reste n'est
// pas lu : un fichier abîmé peut lever des erreurs à chaque requête.
function inspecter(fichier: string): Inspection {
  const sqlite = new Database(fichier, { readonly: true, fileMustExist: true });
  try {
    const integrite = lireIntegrite(sqlite);
    if (integrite !== 'ok') {
      return { integrite, comptes: {}, instance: '', schema: 0 };
    }
    const instance = identifiantInstanceDe(sqlite);
    if (instance === undefined) {
      throw new Error(`instance absente : ${fichier}`);
    }
    return { integrite, comptes: compter(sqlite), instance, schema: versionSchemaDe(sqlite) };
  } finally {
    sqlite.close();
  }
}

// Réserve la destination de façon atomique : un fichier qui existe déjà n'est jamais écrasé,
// même si un autre processus l'a créé entre-temps. `VACUUM INTO` accepte un fichier vide.
function reserver(destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    fs.closeSync(fs.openSync(destination, 'wx'));
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`destination existante : ${destination}`);
    }
    throw erreur;
  }
}

/**
 * Copie cohérente de la base en marche (`VACUUM INTO`), puis contrôle de la copie. Une copie qui
 * n'est pas intègre, ou qui n'est pas une base d'ancrage, est supprimée avant de lever l'erreur.
 */
export function sauvegarder(base: Base, destination: string): RapportSauvegarde {
  reserver(destination);
  try {
    base.sqlite.prepare('VACUUM INTO ?').run(destination);
    const { integrite, comptes, instance, schema } = inspecter(destination);
    if (integrite !== 'ok') {
      throw new Error(`copie non intègre : ${integrite}`);
    }
    return { fichier: destination, integrite, comptes, instance, schema };
  } catch (erreur) {
    fs.rmSync(destination, { force: true });
    throw erreur;
  }
}

/**
 * Contrôle un fichier de base ouvert en lecture seule. Il est conforme si son intégrité est `ok`
 * et si chaque table de `attendu` a exactement le même nombre de lignes ; les tables en plus sont
 * tolérées. Si l'intégrité échoue, `comptes` est vide et `ecarts` aussi : `integrite` dit pourquoi.
 */
export function verifier(fichier: string, attendu: Comptes = {}): RapportVerification {
  const { integrite, comptes, instance, schema } = inspecter(fichier);
  const ecarts: string[] = [];
  if (integrite === 'ok') {
    for (const table of Object.keys(attendu).sort()) {
      const voulu = attendu[table];
      const reel = comptes[table];
      if (reel !== voulu) {
        ecarts.push(`${table} : ${reel === undefined ? 'absente' : reel} au lieu de ${voulu}`);
      }
    }
  }
  return {
    integrite,
    comptes,
    instance,
    schema,
    conforme: integrite === 'ok' && ecarts.length === 0,
    ecarts,
  };
}
