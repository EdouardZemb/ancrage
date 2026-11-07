/*
 * La purge planifiée (1e-D9) : ce qui n'a plus d'usage s'efface de la base, au démarrage puis
 * toutes les 6 heures.
 *
 * - Les sessions expirées : elles n'ouvrent plus rien (`session.ts` les refuse) ; seul l'export
 *   (`export.ts`) les montre encore à la personne, jusqu'à leur purge. Elles ne font que garder un
 *   appareil, une empreinte et des dates.
 * - Les liens utilisés ou expirés : ils ne peuvent plus servir.
 * - Les entrées du registre des suppressions (`suppression.ts`) de plus de 100 jours, soit plus que
 *   les 90 jours de rétention des sauvegardes (1e-D3) : une sauvegarde qui contient la personne
 *   date d'avant sa suppression, donc elle a plus de 100 jours quand l'entrée part, et les
 *   sauvegardes ne se gardent que 90 jours. Passé le délai, l'entrée n'est plus qu'un identifiant
 *   de trop.
 *
 * Les dates sont des chaînes ISO 8601 UTC de même longueur : elles se comparent comme du texte.
 *
 * Chaque purge finit par un point de contrôle `TRUNCATE` (`viderLeWal`), qu'elle ait supprimé
 * quelque chose ou non : une suppression de compte dont le point de contrôle a été bloqué (la
 * sauvegarde de nuit lisait la base) laisse les octets de la personne dans le journal WAL, et
 * celui-ci ne se vide pas de lui-même. Ils n'y restent donc pas plus de 6 heures, sauf si la purge
 * est bloquée à son tour : elle en avertit alors, comme la suppression.
 *
 * Le journal ne reçoit que des nombres (1e-D10) : jamais un identifiant, une empreinte ni un nom.
 * L'avertissement d'un point de contrôle incomplet est un texte fixe.
 */
import { isNotNull, lte, or } from 'drizzle-orm';
import type { Base } from '../base/base.js';
import * as schema from '../base/schema.js';
import { type Avertir, viderLeWal } from './suppression.js';

/** Une entrée du registre se garde 100 jours, soit plus que les 90 jours des sauvegardes. */
export const DUREE_REGISTRE_MS = 100 * 24 * 60 * 60 * 1000;

/** Le temps entre deux purges. */
export const INTERVALLE_PURGE_MS = 6 * 60 * 60 * 1000;

/** Ce que la purge a supprimé, table par table. */
export interface BilanPurge {
  sessions: number;
  liens: number;
  suppressions: number;
}

/**
 * Supprime, dans une même transaction :
 * - les sessions dont `expire_le <= instant` ;
 * - les liens utilisés (`utilise_le` non nul) ou dont `expire_le <= instant` ;
 * - les entrées du registre dont `supprime_le <= instant - DUREE_REGISTRE_MS`.
 *
 * `immediate` prend le verrou d'écriture d'emblée, comme les autres écritures du serveur. Puis le
 * journal WAL est vidé ; si le point de contrôle n'aboutit pas, `avertir` en est prévenu.
 */
export function purger(base: Base, instant: Date, avertir: Avertir): BilanPurge {
  const maintenant = instant.toISOString();
  const limiteRegistre = new Date(instant.getTime() - DUREE_REGISTRE_MS).toISOString();
  const supprimer = base.sqlite.transaction((): BilanPurge => {
    const sessions = base.db
      .delete(schema.session)
      .where(lte(schema.session.expire_le, maintenant))
      .run().changes;
    const liens = base.db
      .delete(schema.lien)
      .where(or(isNotNull(schema.lien.utilise_le), lte(schema.lien.expire_le, maintenant)))
      .run().changes;
    const suppressions = base.db
      .delete(schema.suppression)
      .where(lte(schema.suppression.supprime_le, limiteRegistre))
      .run().changes;
    return { sessions, liens, suppressions };
  });
  const bilan = supprimer.immediate();
  viderLeWal(base, avertir);
  return bilan;
}

/** Le journal dont la purge a besoin : le journal de Fastify (`app.log`) convient. */
export interface JournalPurge {
  info: (objet: object, message: string) => void;
  warn: (message: string) => void;
  error: (objet: object, message: string) => void;
}

/**
 * Purge tout de suite, puis toutes les `intervalle` ms, et rend de quoi arrêter la minuterie. La
 * minuterie est `unref` : elle ne retient jamais le processus. Une purge qui échoue est
 * journalisée (`error`) et jamais levée : le serveur continue, la suivante réessaie. Un point de
 * contrôle incomplet est journalisé au niveau `warn`.
 */
export function planifierPurge(
  base: Base,
  horloge: () => Date,
  journal: JournalPurge,
  intervalle: number = INTERVALLE_PURGE_MS,
): () => void {
  function purgerEtJournaliser(): void {
    try {
      journal.info(
        purger(base, horloge(), (message) => journal.warn(message)),
        'purge',
      );
    } catch (erreur) {
      journal.error({ err: erreur }, 'purge en échec');
    }
  }

  purgerEtJournaliser();
  const minuterie = setInterval(purgerEtJournaliser, intervalle);
  minuterie.unref();
  return () => clearInterval(minuterie);
}
