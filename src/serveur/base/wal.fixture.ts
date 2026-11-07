/*
 * De quoi éprouver qu'un point de contrôle `TRUNCATE` n'aboutit pas : un lecteur qui retient le
 * journal WAL, comme la sauvegarde de nuit (`VACUUM INTO`) ; et de quoi chercher des octets dans
 * la base ou dans son WAL. Exclu de la construction, comme tout `*.fixture.ts`.
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Base } from './base.js';

/** Vrai si `fichier` existe et contient `octets` : un nom resté dans la base ou son journal WAL. */
export function fichierContient(fichier: string, octets: Buffer): boolean {
  return fs.existsSync(fichier) && fs.readFileSync(fichier).includes(octets);
}

/**
 * Ouvre une seconde connexion sur le fichier de `base` et y garde une lecture en cours : tant
 * qu'elle dure, le point de contrôle `TRUNCATE` ne peut pas vider le WAL. À appeler après les
 * écritures que le lecteur doit voir, et avant celles qu'il doit retenir. `base` n'attend plus que
 * 50 ms (au lieu des 5 s de `ouvrirBase`), pour que le test reste court. Rend de quoi libérer le
 * lecteur : à appeler dans un `finally`, car Windows verrouille les fichiers ouverts.
 */
export function retenirLeWal(base: Base): () => void {
  base.sqlite.pragma('busy_timeout = 50');
  const lecteur = new Database(base.sqlite.name);
  lecteur.exec('BEGIN');
  lecteur.prepare('select count(*) from sqlite_master').get();
  return () => {
    lecteur.exec('COMMIT');
    lecteur.close();
  };
}

/** La manière dont better-sqlite3 ouvre une transaction (`BEGIN`, `BEGIN IMMEDIATE`, `BEGIN EXCLUSIVE`). */
export type ManiereDeTransaction = 'deferred' | 'immediate' | 'exclusive';

const MANIERES: readonly ManiereDeTransaction[] = ['deferred', 'immediate', 'exclusive'];

/**
 * Note, dans l'ordre, la manière de chaque transaction lancée par la connexion `sqlite` : appelée
 * telle quelle ou par `.deferred()`, elle compte pour `deferred`. C'est ce qui fige les `.immediate()`
 * du serveur sans minutage, que les verrous de fichiers de Windows rendraient fragile. `sqlite` peut
 * être `Database.prototype`, pour les connexions que le code ouvre lui-même (la ligne de commande) :
 * `rendre` remet alors les choses en l'état, à appeler dans un `finally`.
 */
export function espionnerLesTransactions(sqlite: Database.Database): {
  manieres: ManiereDeTransaction[];
  rendre: () => void;
} {
  const manieres: ManiereDeTransaction[] = [];
  const possedait = Object.hasOwn(sqlite, 'transaction');
  const originale = sqlite.transaction;
  const espion = function (this: Database.Database, ...arguments_: unknown[]) {
    const transaction = (
      originale as (...a: unknown[]) => Database.Transaction<() => unknown>
    ).apply(this, arguments_);
    const noter =
      (maniere: ManiereDeTransaction) =>
      (...appel: unknown[]) => {
        manieres.push(maniere);
        return (transaction[maniere] as (...a: unknown[]) => unknown)(...appel);
      };
    const enveloppe = noter('deferred');
    for (const maniere of MANIERES) {
      Object.defineProperty(enveloppe, maniere, { value: noter(maniere) });
    }
    return enveloppe;
  };
  Object.defineProperty(sqlite, 'transaction', {
    value: espion,
    configurable: true,
    writable: true,
  });
  return {
    manieres,
    rendre: () => {
      if (possedait) {
        Object.defineProperty(sqlite, 'transaction', {
          value: originale,
          configurable: true,
          writable: true,
        });
      } else {
        delete (sqlite as { transaction?: unknown }).transaction;
      }
    },
  };
}
