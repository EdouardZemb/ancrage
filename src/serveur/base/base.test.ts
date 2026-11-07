import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installerBasesDeTest } from './base.fixture.js';
import { appliquerMigrations, fermerBase, initialiserInstance, versionSchema } from './base.js';
import { NOMBRE_DE_MIGRATIONS } from './schema.fixture.js';
import { espionnerLesTransactions } from './wal.fixture.js';

const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let dossier: string;
const ouvrir = installerBasesDeTest((nouveau) => {
  dossier = nouveau;
});

describe('ouvrirBase', () => {
  it('ouvre_en_wal_et_cree_le_dossier', () => {
    const chemin = path.join(dossier, 'a', 'b', 'x.sqlite');

    const base = ouvrir(chemin);

    expect(fs.existsSync(path.join(dossier, 'a', 'b'))).toBe(true);
    expect(base.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('active_les_cles_etrangeres_et_le_delai_de_verrou', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));

    expect(base.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(base.sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('secure_delete_actif', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));

    // Une suppression écrase de zéros le contenu libéré (1e-D4).
    expect(base.sqlite.pragma('secure_delete', { simple: true })).toBe(1);
  });
});

describe('migrations', () => {
  it('schema_zero_sans_migration', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));

    expect(versionSchema(base)).toBe(0);
  });

  it('migrations_idempotentes', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));

    appliquerMigrations(base);
    appliquerMigrations(base);

    expect(versionSchema(base)).toBe(NOMBRE_DE_MIGRATIONS);
  });
});

describe('initialiserInstance', () => {
  it('initialiser_instance_ecrit_en_transaction_immediate', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));
    appliquerMigrations(base);
    const espion = espionnerLesTransactions(base.sqlite);

    initialiserInstance(base);

    expect(espion.manieres).toEqual(['immediate']);
  });

  it('instance_stable_entre_deux_ouvertures', () => {
    const chemin = path.join(dossier, 'x.sqlite');

    const premiere = ouvrir(chemin);
    appliquerMigrations(premiere);
    const identifiant = initialiserInstance(premiere);
    fermerBase(premiere);

    const seconde = ouvrir(chemin);
    appliquerMigrations(seconde);

    expect(identifiant).toMatch(FORMAT_UUID);
    expect(initialiserInstance(seconde)).toBe(identifiant);
  });

  it('instance_enregistre_la_date_de_creation_en_iso_utc', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));
    appliquerMigrations(base);

    initialiserInstance(
      base,
      () => 'i-1',
      () => new Date('2026-10-15T12:34:56.000Z'),
    );

    expect(base.sqlite.prepare('select id, cree_le from instance').all()).toEqual([
      { id: 'i-1', cree_le: '2026-10-15T12:34:56.000Z' },
    ]);
  });

  it('instance_deja_initialisee_ne_change_pas', () => {
    const base = ouvrir(path.join(dossier, 'x.sqlite'));
    appliquerMigrations(base);

    const premier = initialiserInstance(base, () => 'i-1');
    const second = initialiserInstance(base, () => 'i-2');

    expect(premier).toBe('i-1');
    expect(second).toBe('i-1');
  });
});
