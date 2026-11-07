/*
 * La suppression d'un compte et le registre des suppressions (ADR-0007 §2, 1e-D3, 1e-D4).
 *
 * Supprimer une personne, c'est supprimer sa ligne : la cascade de la base emporte ses passkeys, ses
 * sessions, ses liens (ceux pour elle et ceux qu'elle a créés), ses appartenances, ses droits
 * directs et son journal de progression. Les groupes et les droits des groupes restent.
 *
 * Le registre ne garde que l'identifiant de la personne et la date, sans clé étrangère : il sert à
 * effacer de nouveau une personne que la restauration d'une sauvegarde aurait ramenée (1e-D3).
 * L'entrée s'écrit dans la transaction de la suppression, jamais après.
 *
 * Les octets d'une personne supprimée ne doivent pas rester dans le fichier : `secure_delete`
 * (voir `ouvrirBase`) écrase de zéros ce que la suppression libère, et un point de contrôle
 * `TRUNCATE` vide le journal WAL, où dorment les versions précédentes des pages. Ce dernier peut
 * ne pas aboutir (voir `viderLeWal`) : l'appelant en est alors averti. La purge (`purge.ts`) refait
 * ce point de contrôle toutes les 6 heures : les octets qu'un point de contrôle bloqué a laissés
 * dans le WAL n'y restent pas au-delà.
 *
 * Rien n'est journalisé ici : l'appelant écrit « compte supprimé », sans identifiant (1e-D10), et
 * reçoit l'avertissement d'un point de contrôle incomplet, qui n'en cite pas non plus.
 */
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { type Base, tableExiste } from '../base/base.js';
import * as schema from '../base/schema.js';

export type ResultatSuppression = 'supprimee' | 'introuvable' | 'proprietaire';

export interface EntreeRegistre {
  personne: string;
  /** ISO 8601 UTC. */
  supprimeLe: string;
}

/** Reçoit un avertissement : un texte fixe, jamais un identifiant. */
export type Avertir = (message: string) => void;

export const POINT_DE_CONTROLE_INCOMPLET =
  "point de contrôle incomplet : les octets supprimés restent dans le journal WAL jusqu'au suivant";

/**
 * Vide le journal WAL dans le fichier de la base, puis le tronque. La suppression est faite quoi
 * qu'il arrive ; reste à dire si le journal est vide.
 *
 * Un lecteur actif (la sauvegarde de la nuit, `VACUUM INTO`) empêche le point de contrôle d'aboutir :
 * SQLite attend alors `busy_timeout`, puis rend `busy` sans lever d'erreur. Les anciennes versions
 * des pages, octets supprimés compris, restent dans le WAL jusqu'à un autre point de contrôle
 * `TRUNCATE` ou une fermeture propre de la base. Le point de contrôle automatique de SQLite, lui,
 * ne tronque pas : les anciennes trames y restent jusqu'à ce qu'une écriture les remplace. On
 * avertit donc `avertir` ; une erreur vaut un point de contrôle incomplet.
 */
export function viderLeWal(base: Base, avertir: Avertir): void {
  let complet = false;
  try {
    const [etat] = base.sqlite.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[];
    // Stryker disable next-line OptionalChaining: équivalent, `etat.busy` lèverait sur `undefined` et
    // le `catch` laisserait `complet` à faux, comme `undefined === 0`.
    complet = etat?.busy === 0;
  } catch {
    // Voir ci-dessus.
  }
  if (!complet) {
    avertir(POINT_DE_CONTROLE_INCOMPLET);
  }
}

// Pour un appelant qui n'a pas de journal (un script) : la sortie d'erreur.
const SORTIE_D_ERREUR: Avertir = (message) => console.warn(message);

/**
 * Supprime la personne et inscrit son identifiant au registre, dans une même transaction. Le compte
 * du propriétaire n'est jamais supprimé. `immediate` prend le verrou d'écriture d'emblée : la
 * lecture du rôle et la suppression ne s'écartent pas. Si le point de contrôle qui suit n'aboutit
 * pas, `avertir` en est prévenu ; la suppression, elle, est faite.
 */
export function supprimerPersonne(
  base: Base,
  personne: string,
  instant: Date,
  avertir: Avertir = SORTIE_D_ERREUR,
): ResultatSuppression {
  const supprimer = base.sqlite.transaction((): ResultatSuppression => {
    const ligne = base.db
      .select({ proprietaire: schema.personne.proprietaire })
      .from(schema.personne)
      .where(eq(schema.personne.id, personne))
      .get();
    if (ligne === undefined) {
      return 'introuvable';
    }
    if (ligne.proprietaire) {
      return 'proprietaire';
    }
    // Une entrée déjà là (base restaurée, registre rejoué) garde sa date : la suppression ne doit
    // jamais échouer sur elle.
    base.db
      .insert(schema.suppression)
      .values({ personne, supprime_le: instant.toISOString() })
      .onConflictDoNothing()
      .run();
    base.db.delete(schema.personne).where(eq(schema.personne.id, personne)).run();
    return 'supprimee';
  });
  const resultat = supprimer.immediate();
  if (resultat === 'supprimee') {
    viderLeWal(base, avertir);
  }
  return resultat;
}

/**
 * Vrai si `personne` est au registre : un compte supprimé depuis moins de 100 jours (la purge, 1e-D3).
 * Une lecture par la clé ; un identifiant inconnu, ou une valeur qui n'en est pas un, rend faux.
 */
export function estSupprimee(base: Base, personne: string): boolean {
  return (
    base.db
      .select({ personne: schema.suppression.personne })
      .from(schema.suppression)
      .where(eq(schema.suppression.personne, personne))
      .get() !== undefined
  );
}

/**
 * Les entrées du registre, de la plus ancienne à la plus récente ; `[]` si la table manque (base
 * d'avant la migration 0003).
 */
export function lireRegistre(sqlite: Database.Database): EntreeRegistre[] {
  if (!tableExiste(sqlite, 'suppression')) {
    return [];
  }
  const lignes = sqlite
    .prepare('select personne, supprime_le from suppression order by supprime_le, personne')
    .all() as { personne: string; supprime_le: string }[];
  return lignes.map(({ personne, supprime_le }) => ({ personne, supprimeLe: supprime_le }));
}

/**
 * Efface de la base les personnes du registre et inscrit chaque entrée, sans doublon : une entrée
 * déjà là garde sa date. Rend le nombre de personnes effacées. À appliquer à une base restaurée
 * (1e-D3). Comme pour `supprimerPersonne`, `avertir` est prévenu d'un point de contrôle incomplet.
 */
export function rejouerRegistre(
  base: Base,
  registre: readonly EntreeRegistre[],
  avertir: Avertir = SORTIE_D_ERREUR,
): number {
  const rejouer = base.sqlite.transaction(() => {
    let effacees = 0;
    for (const { personne, supprimeLe } of registre) {
      base.db
        .insert(schema.suppression)
        .values({ personne, supprime_le: supprimeLe })
        .onConflictDoNothing()
        .run();
      const { changes } = base.db
        .delete(schema.personne)
        .where(eq(schema.personne.id, personne))
        .run();
      effacees += changes;
    }
    return effacees;
  });
  const effacees = rejouer.immediate();
  if (effacees > 0) {
    viderLeWal(base, avertir);
  }
  return effacees;
}
