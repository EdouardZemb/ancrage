import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { instance } from './schema.js';

export interface Base {
  sqlite: Database.Database;
  db: BetterSQLite3Database;
}

// Voisin du module : `src/serveur/base/migrations` en test, `dist/serveur/base/migrations` en
// production (copié par `scripts/copier-migrations.mjs`).
const DOSSIER_MIGRATIONS = fileURLToPath(new URL('./migrations/', import.meta.url));

/** Ouvre la base (dossier parent créé au besoin). Ne migre pas. */
export function ouvrirBase(chemin: string): Base {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const sqlite = new Database(chemin);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // Une suppression écrase de zéros le contenu libéré (1e-D4) : une personne supprimée ne laisse
  // pas de traces dans les pages libres du fichier. Le WAL, lui, se vide par un point de
  // contrôle `TRUNCATE`, après la suppression.
  sqlite.pragma('secure_delete = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite) };
}

/** Applique les migrations en attente, dans une transaction (ADR-0006 §5). */
export function appliquerMigrations(base: Base, dossier: string = DOSSIER_MIGRATIONS): void {
  migrate(base.db, { migrationsFolder: dossier });
}

export function tableExiste(sqlite: Database.Database, nom: string): boolean {
  return (
    sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(nom) !==
    undefined
  );
}

/** Comme `versionSchema`, sur une connexion brute (par exemple une copie en lecture seule). */
export function versionSchemaDe(sqlite: Database.Database): number {
  if (!tableExiste(sqlite, '__drizzle_migrations')) {
    return 0;
  }
  const ligne = sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as {
    n: number;
  };
  return ligne.n;
}

/** Nombre de migrations appliquées ; 0 si la base n'a jamais été migrée. */
export function versionSchema(base: Base): number {
  return versionSchemaDe(base.sqlite);
}

/** Identifiant de l'unique ligne de `instance` ; `undefined` si la table ou la ligne manque. */
export function identifiantInstanceDe(sqlite: Database.Database): string | undefined {
  if (!tableExiste(sqlite, 'instance')) {
    return undefined;
  }
  const ligne = sqlite.prepare('select id from instance limit 1').get() as
    | { id: string }
    | undefined;
  return ligne?.id;
}

/** Crée l'identité de l'instance au premier appel ; ensuite renvoie toujours le même identifiant. */
export function initialiserInstance(
  base: Base,
  genererId: () => string = randomUUID,
  maintenant: () => Date = () => new Date(),
): string {
  // `immediate` prend le verrou d'écriture d'emblée : deux démarrages simultanés ne créent
  // pas deux identités.
  const initialiser = base.sqlite.transaction(() => {
    const existante = base.db.select().from(instance).limit(1).get();
    if (existante !== undefined) {
      return existante.id;
    }
    const id = genererId();
    base.db.insert(instance).values({ id, cree_le: maintenant().toISOString() }).run();
    return id;
  });
  return initialiser.immediate();
}

export function fermerBase(base: Base): void {
  base.sqlite.close();
}
