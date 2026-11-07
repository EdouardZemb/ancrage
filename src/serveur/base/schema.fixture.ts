/*
 * Les aides de test du schéma de la base : le nombre de migrations, les tables d'une base neuve, et
 * de quoi éprouver qu'une migration n'a fait qu'ajouter (invariant 8, ADR-0006). Aucune liste de
 * tables n'est écrite à la main : les tables éprouvées sont celles de la base d'avant (1f-D7).
 * Données factices écrites à la main (invariant 7). Exclu de la construction, comme tout
 * `*.fixture.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { creerDepot } from '../comptes/depot.js';
import { creerDepotJournal } from '../journal/depot-journal.js';
import { reponseDeTest } from '../journal/evenements.fixture.js';
import {
  appliquerMigrations,
  type Base,
  fermerBase,
  initialiserInstance,
  ouvrirBase,
  tableExiste,
  versionSchema,
} from './base.js';

/** Le dossier des vraies migrations. */
export const DOSSIER_MIGRATIONS = fileURLToPath(new URL('./migrations/', import.meta.url));

const INSTANT = new Date('2026-10-17T08:00:00.000Z');

// Deux cours factices, pour qu'une base peuplée ait des droits et des événements dans plusieurs.
const COURS_DE_TEST = ['cm5r8t23', 'q3m8vx2k'];

// Les tables que `peuplerLesComptes` remplit (migration 0001) : elles existent toutes ou aucune.
const TABLES_DES_COMPTES = [
  'autorisation',
  'groupe',
  'lien',
  'membre',
  'passkey',
  'personne',
  'session',
];

/** Une entrée de `meta/_journal.json`, le journal des migrations de Drizzle. */
export interface EntreeDuJournal {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface JournalDesMigrations {
  version: string;
  dialect: string;
  entries: EntreeDuJournal[];
}

/** Le journal des migrations de `dossier` : le seul endroit qui le lit. */
export function lireJournal(dossier: string): JournalDesMigrations {
  return JSON.parse(
    fs.readFileSync(path.join(dossier, 'meta', '_journal.json'), 'utf8'),
  ) as JournalDesMigrations;
}

/** Écrit le journal des migrations de `dossier` : le seul endroit qui l'écrit. */
export function ecrireJournal(dossier: string, journal: JournalDesMigrations): void {
  fs.writeFileSync(path.join(dossier, 'meta', '_journal.json'), JSON.stringify(journal));
}

/** Le nombre de migrations de `migrations/`, lu dans son journal : rien à relever à la main. */
export const NOMBRE_DE_MIGRATIONS = lireJournal(DOSSIER_MIGRATIONS).entries.length;

/**
 * Les `n` premières migrations de `source` (le vrai dossier par défaut), copiées dans
 * `<dossier>/migrations-<n>` : de quoi monter la base telle qu'elle était avant la suivante.
 */
export function migrationsJusqua(
  dossier: string,
  n: number,
  source: string = DOSSIER_MIGRATIONS,
): string {
  const cible = path.join(dossier, `migrations-${n}`);
  fs.cpSync(source, cible, { recursive: true });
  const journal = lireJournal(cible);
  for (const entree of journal.entries.filter((e) => e.idx >= n)) {
    fs.rmSync(path.join(cible, `${entree.tag}.sql`));
  }
  journal.entries = journal.entries.filter((e) => e.idx < n);
  ecrireJournal(cible, journal);
  return cible;
}

function identifiant(nom: string): string {
  return `"${nom.replaceAll('"', '""')}"`;
}

/** Les tables de la base, triées, sans celles de SQLite ni le registre des migrations de Drizzle. */
export function tablesDe(sqlite: Base['sqlite']): string[] {
  return (
    sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite!_%' escape '!' and name <> '__drizzle_migrations' order by name",
      )
      .all() as { name: string }[]
  ).map(({ name }) => name);
}

/**
 * Le nombre de lignes de chaque table d'une base neuve, migrée et initialisée, comme le rend
 * `compterLignes` : `__drizzle_migrations` comprise, tout vide sauf l'instance. Les tables sont
 * celles de la base : une table ajoutée ne demande aucune retouche des tests qui s'en servent.
 */
export function comptesDUneBaseNeuve(): Record<string, number> {
  const base = ouvrirBase(':memory:');
  try {
    appliquerMigrations(base);
    initialiserInstance(base);
    return {
      ...Object.fromEntries(tablesDe(base.sqlite).map((table) => [table, 0])),
      __drizzle_migrations: NOMBRE_DE_MIGRATIONS,
      instance: 1,
    };
  } finally {
    fermerBase(base);
  }
}

/**
 * Une personne avec un groupe, deux autorisations, une session, une passkey et un lien : une ligne
 * dans chaque table des comptes (migration 0001) et dans `instance`. Renvoie la personne.
 */
export function peuplerLesComptes(base: Base, cours: string): string {
  const comptes = creerDepot(base, () => INSTANT);
  const alice = comptes.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' }).id;
  const groupe = comptes.creerGroupe('Klasse Test').id;
  comptes.ajouterMembre(groupe, alice);
  comptes.autoriser({ cours, sujet: { type: 'personne', id: alice } });
  comptes.autoriser({ cours, sujet: { type: 'groupe', id: groupe } });
  comptes.creerSession({
    personne: alice,
    empreinte: 'empreinte-de-test',
    appareil: 'Android',
    expireLe: '2026-12-01T00:00:00.000Z',
  });
  comptes.ajouterPasskey({
    id: 'passkey-de-test',
    personne: alice,
    clePublique: new Uint8Array([1, 2, 3]),
    compteur: 0,
    transports: ['internal'],
    appareil: 'Android',
  });
  comptes.creerLien({
    empreinte: 'lien-de-test',
    type: 'connexion',
    personne: alice,
    expireLe: '2026-10-18T00:00:00.000Z',
  });
  return alice;
}

/**
 * Au moins une ligne dans chaque table qui existe, chaque étape seulement si ses tables existent
 * (la version 1 n'a que l'instance) : l'instance, les comptes, un événement par cours, une entrée
 * du registre des suppressions.
 *
 * Une table que rien ne remplit fait échouer `verifierAdditivite` (« table vide avant de
 * migrer ») : l'auteur d'une migration qui ajoute une table étend cette fonction, sans toucher
 * aux tests (1f-D7).
 */
export function peuplerLaBase(base: Base, cours: readonly string[]): void {
  const [premier] = cours;
  if (premier === undefined) {
    throw new Error('peuplerLaBase demande au moins un cours');
  }
  initialiserInstance(base);
  const alice = TABLES_DES_COMPTES.every((table) => tableExiste(base.sqlite, table))
    ? peuplerLesComptes(base, premier)
    : undefined;
  if (alice !== undefined && tableExiste(base.sqlite, 'evenement')) {
    creerDepotJournal(base).ajouter(
      alice,
      cours.map((c, i) => reponseDeTest(c, i + 1)),
      INSTANT.toISOString(),
    );
  }
  if (tableExiste(base.sqlite, 'suppression')) {
    base.sqlite
      .prepare('insert into suppression (personne, supprime_le) values (?, ?)')
      .run('personne-disparue', INSTANT.toISOString());
  }
}

function nombreDeLignes(sqlite: Base['sqlite'], table: string): number {
  return (sqlite.prepare(`select count(*) as n from ${identifiant(table)}`).get() as { n: number })
    .n;
}

/**
 * Le schéma et toutes les lignes de chaque table de `tables` (celles de la base par défaut), et
 * les `migrations` premières lignes du registre de Drizzle. Une liste vide donne un instantané
 * sans objets ni lignes.
 *
 * C'est une photo exacte, pour les tests qui prouvent qu'une opération ne touche à rien. Pour
 * éprouver une migration, qui peut ajouter une colonne ou un index, voir `verifierAdditivite`.
 */
export function instantane(
  sqlite: Base['sqlite'],
  { tables = tablesDe(sqlite), migrations }: { tables?: readonly string[]; migrations: number },
) {
  const marques = tables.map(() => '?').join(', ');
  const objets = sqlite
    .prepare(
      `select name, sql from sqlite_master where sql is not null and tbl_name in (${marques}) order by name`,
    )
    .all(...tables);
  const lignes = tables.map((table): [string, unknown[]] => [
    table,
    sqlite.prepare(`select * from ${identifiant(table)} order by rowid`).all(),
  ]);
  const registre = sqlite
    .prepare('select hash, created_at from __drizzle_migrations order by id limit ?')
    .all(migrations);
  return { objets, lignes: Object.fromEntries(lignes), migrations: registre };
}

interface Colonne {
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface Index {
  unique: number;
  origin: string;
  partial: number;
  colonnes: (string | null)[];
  /** `null` pour un index que SQLite crée seul (clé primaire, contrainte unique). */
  sql: string | null;
}

/** Ce que l'image précédente voit d'une table : ses colonnes et ses index. */
interface Structure {
  colonnes: Record<string, Colonne>;
  index: Record<string, Index>;
}

/** Une table de la base d'avant : sa structure, et ses lignes projetées sur ses colonnes. */
interface TableDAvant {
  structure: Structure;
  lignes: unknown[];
}

/** Les vues et les déclencheurs (nom, définition) : ils ne sont à aucune table de la liste. */
type ObjetsDeCode = Record<string, string>;

function structureDe(sqlite: Base['sqlite'], table: string): Structure {
  const colonnes = (
    sqlite.pragma(`table_info(${identifiant(table)})`) as ({ name: string } & Colonne)[]
  ).map(({ name, type, notnull, dflt_value, pk }): [string, Colonne] => [
    name,
    { type, notnull, dflt_value, pk },
  ]);
  const index = (
    sqlite.pragma(`index_list(${identifiant(table)})`) as {
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }[]
  ).map(({ name, unique, origin, partial }): [string, Index] => [
    name,
    {
      unique,
      origin,
      partial,
      colonnes: (
        sqlite.pragma(`index_info(${identifiant(name)})`) as { name: string | null }[]
      ).map((colonne) => colonne.name),
      sql:
        (
          sqlite
            .prepare("select sql from sqlite_master where type = 'index' and name = ?")
            .get(name) as { sql: string | null } | undefined
        )?.sql ?? null,
    },
  ]);
  return { colonnes: Object.fromEntries(colonnes), index: Object.fromEntries(index) };
}

/** Les lignes de `table`, dans l'ordre d'insertion, réduites aux `colonnes` données. */
function lignesDe(sqlite: Base['sqlite'], table: string, colonnes: readonly string[]): unknown[] {
  const liste = colonnes.map(identifiant).join(', ');
  return sqlite.prepare(`select ${liste} from ${identifiant(table)} order by rowid`).all();
}

function objetsDeCode(sqlite: Base['sqlite']): ObjetsDeCode {
  const lignes = sqlite
    .prepare("select name, sql from sqlite_master where type in ('view', 'trigger')")
    .all() as { name: string; sql: string }[];
  return Object.fromEntries(lignes.map(({ name, sql }) => [name, sql]));
}

/**
 * Éprouve que les migrations de `source` (le vrai dossier par défaut), appliquées à une base qui
 * en a déjà `n`, n'ont fait qu'ajouter : l'image précédente fonctionne encore (invariant 8,
 * ADR-0006). Les tables éprouvées sont celles de la base d'avant, jamais une liste écrite à la
 * main (1f-D7).
 *
 * Est permis tout ce qui ne peut pas refuser une écriture de l'image précédente : une table, un
 * index non unique, une vue ou un déclencheur sur une table nouvelle de plus, un index unique sur
 * des colonnes nouvelles seulement (SQLite tient les NULL pour distincts, et l'image précédente ne
 * les écrit pas), une colonne de plus à une table (facultative ou avec un défaut, hors clé
 * primaire). Le reste est refusé : une table, une colonne ou un index retiré ou modifié, une vue
 * ou un déclencheur retiré ou modifié, un index unique nouveau qui porte une colonne d'avant (ou
 * une expression, par prudence), un déclencheur nouveau sur une table d'avant, une ligne changée,
 * une table apparue qui n'est pas vide.
 *
 * 1. Monter une base avec les `n` premières migrations de `source`, et vérifier sa version.
 * 2. La peupler (`peuplerLaBase`), et vérifier qu'elle a des tables et que chacune a une ligne.
 * 3. Relever l'état d'avant : par table, ses colonnes, ses index et ses lignes ; les vues et les
 *    déclencheurs ; les `n` premières lignes du registre des migrations.
 * 4. Appliquer toutes les migrations de `source`, et vérifier la version.
 * 5. Pour chaque table d'avant : elle existe encore ; chacune de ses colonnes d'avant a la même
 *    définition ; chaque colonne nouvelle est facultative ou a un défaut, sans être de la clé
 *    primaire ; chacun de ses index d'avant est identique ; aucun index unique nouveau ne porte
 *    une colonne d'avant ; ses lignes, réduites à ses colonnes d'avant, sont les mêmes.
 * 6. Chaque vue et chaque déclencheur d'avant est identique, aucun déclencheur nouveau n'est posé
 *    sur une table d'avant, et le registre d'avant est intact.
 * 7. Toute table apparue est vide.
 */
export function verifierAdditivite(
  dossier: string,
  n: number,
  source: string = DOSSIER_MIGRATIONS,
): void {
  const ancienne = ouvrirBase(path.join(dossier, `ancienne-${n}.sqlite`));
  try {
    const { sqlite } = ancienne;
    appliquerMigrations(ancienne, migrationsJusqua(dossier, n, source));
    expect(versionSchema(ancienne)).toBe(n);
    peuplerLaBase(ancienne, COURS_DE_TEST);
    const tablesAvant = tablesDe(sqlite);
    expect(tablesAvant.length, 'aucune table avant de migrer').toBeGreaterThan(0);
    for (const table of tablesAvant) {
      expect(
        nombreDeLignes(sqlite, table),
        `table vide avant de migrer : ${table}`,
      ).toBeGreaterThan(0);
    }
    const avant = new Map<string, TableDAvant>(
      tablesAvant.map((table) => {
        const structure = structureDe(sqlite, table);
        return [
          table,
          { structure, lignes: lignesDe(sqlite, table, Object.keys(structure.colonnes)) },
        ];
      }),
    );
    const codeAvant = objetsDeCode(sqlite);
    const registreAvant = instantane(sqlite, { tables: [], migrations: n }).migrations;

    appliquerMigrations(ancienne, source);

    expect(versionSchema(ancienne)).toBe(lireJournal(source).entries.length);
    const tablesApres = tablesDe(sqlite);
    for (const [table, { structure, lignes }] of avant) {
      expect(tablesApres, `table retirée : ${table}`).toContain(table);
      const apres = structureDe(sqlite, table);
      for (const [nom, colonne] of Object.entries(structure.colonnes)) {
        expect(apres.colonnes[nom], `colonne retirée ou modifiée : ${table}.${nom}`).toStrictEqual(
          colonne,
        );
      }
      for (const [nom, colonne] of Object.entries(apres.colonnes)) {
        if (!(nom in structure.colonnes)) {
          expect(
            colonne.pk === 0 && (colonne.notnull === 0 || colonne.dflt_value !== null),
            `colonne nouvelle ni facultative ni avec un défaut : ${table}.${nom}`,
          ).toBe(true);
        }
      }
      for (const [nom, index] of Object.entries(structure.index)) {
        expect(apres.index[nom], `index retiré ou modifié : ${table}.${nom}`).toStrictEqual(index);
      }
      for (const [nom, index] of Object.entries(apres.index)) {
        if (nom in structure.index || index.unique === 0) {
          continue;
        }
        // Une expression (nom `null`) peut porter sur une colonne d'avant : par prudence, elle
        // compte comme telle.
        expect(
          index.colonnes.some((colonne) => colonne === null || colonne in structure.colonnes),
          `index unique nouveau sur une colonne d'avant : ${table}.${nom}`,
        ).toBe(false);
      }
      expect(
        lignesDe(sqlite, table, Object.keys(structure.colonnes)),
        `lignes modifiées : ${table}`,
      ).toStrictEqual(lignes);
    }
    const codeApres = objetsDeCode(sqlite);
    for (const [nom, sql] of Object.entries(codeAvant)) {
      expect(codeApres[nom], `vue ou déclencheur retiré ou modifié : ${nom}`).toBe(sql);
    }
    const declencheurs = sqlite
      .prepare("select name, tbl_name from sqlite_master where type = 'trigger'")
      .all() as { name: string; tbl_name: string }[];
    for (const { name, tbl_name } of declencheurs) {
      expect(
        name in codeAvant || !avant.has(tbl_name),
        `déclencheur nouveau sur une table d'avant : ${tbl_name}.${name}`,
      ).toBe(true);
    }
    expect(instantane(sqlite, { tables: [], migrations: n }).migrations).toStrictEqual(
      registreAvant,
    );
    for (const table of tablesApres.filter((nom) => !avant.has(nom))) {
      expect(nombreDeLignes(sqlite, table), `table apparue non vide : ${table}`).toBe(0);
    }
  } finally {
    fermerBase(ancienne);
  }
}
