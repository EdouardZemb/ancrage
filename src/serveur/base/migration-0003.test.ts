import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installerBasesDeTest } from './base.fixture.js';
import { appliquerMigrations, fermerBase, ouvrirBase } from './base.js';

const RECU_A = '2026-10-17T08:00:05.000Z';

let dossier: string;

installerBasesDeTest((nouveau) => {
  dossier = nouveau;
});

describe('migration 0003', () => {
  it('suppression_sans_cle_etrangere', () => {
    const base = ouvrirBase(path.join(dossier, 'x.sqlite'));
    try {
      appliquerMigrations(base);

      // Le registre garde l'identifiant d'une personne qui n'existe plus (1e-D3).
      expect(base.sqlite.pragma("foreign_key_list('suppression')")).toStrictEqual([]);
      expect(base.sqlite.pragma("table_info('suppression')")).toMatchObject([
        { name: 'personne', type: 'TEXT', notnull: 1, pk: 1 },
        { name: 'supprime_le', type: 'TEXT', notnull: 1, pk: 0 },
      ]);
      base.sqlite
        .prepare('insert into suppression (personne, supprime_le) values (?, ?)')
        .run('personne-disparue', RECU_A);
      expect(base.sqlite.prepare('select personne from suppression').all()).toStrictEqual([
        { personne: 'personne-disparue' },
      ]);
    } finally {
      fermerBase(base);
    }
  });
});
