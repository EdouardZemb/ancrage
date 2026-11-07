/*
 * L'export des données d'une personne (ADR-0007, 1e-D5) : ce que l'instance garde d'elle, en un
 * objet que la route rend en pièce jointe JSON. C'est le droit d'accès du RGPD et de la nLPD, avec
 * des exceptions voulues : les événements d'un cours que la personne ne voit plus restent en base mais
 * ne sont pas exportés (invariant 1), et ce que dit « Ne sortent jamais », plus bas. La notice le dit,
 * et renvoie au responsable pour le reste.
 *
 * Il y a le profil, les passkeys (clé publique comprise, en base64url), les sessions et les noms des
 * groupes ; puis, pour chaque cours **que la personne voit**, son titre et tous ses événements.
 *
 * Invariants 1 et 2 : ce module ne décide d'aucun droit. L'appelant lui donne les cours visibles
 * (`coursVisiblesPour`, dans `acces/`), et rien d'un autre cours n'est lu ni écrit : ni son
 * identifiant, ni son titre, ni ses unités, même si des événements en restent en base.
 *
 * Ne sortent jamais : l'empreinte d'une session, les liens, le `rang` du journal (une clé interne,
 * commune à toute la table) et tout ce qui touche une autre personne. Les événements sont lus par
 * une requête directe, sans la pagination du journal (`depot-journal`) : l'export est complet.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Base } from '../base/base.js';
import * as schema from '../base/schema.js';
import type { Depot, Langue } from './depot.js';

export interface EvenementExporte {
  id: string;
  numero: number;
  unite: string;
  type: 'reponse' | 'examen';
  /** Le JSON de l'événement, relu tel qu'il a été reçu. */
  resultat: unknown;
  /** L'heure locale de l'appareil, avec son décalage. */
  reponduA: string;
  appareil: string;
  v: number;
  /** ISO 8601 UTC, l'heure du serveur. */
  recuA: string;
}

export interface ExportPersonne {
  format: 'ancrage-export';
  version: 1;
  /** ISO 8601 UTC. */
  exporteLe: string;
  personne: {
    id: string;
    nomAffiche: string;
    langue: Langue;
    proprietaire: boolean;
    creeLe: string;
  };
  passkeys: {
    id: string;
    appareil: string;
    transports: string[];
    /** La clé publique, en base64url. */
    clePublique: string;
    compteur: number;
    creeLe: string;
    utiliseLe: string | null;
  }[];
  /** Toutes celles que la base garde, expirées comprises tant que la purge ne les a pas ôtées. */
  sessions: {
    id: string;
    appareil: string;
    creeLe: string;
    utiliseLe: string;
    expireLe: string;
  }[];
  /** Les noms des groupes dont la personne est membre. */
  groupes: string[];
  cours: { id: string; titre: string; evenements: EvenementExporte[] }[];
}

function versEvenement(ligne: typeof schema.evenement.$inferSelect): EvenementExporte {
  return {
    id: ligne.id,
    numero: ligne.numero,
    unite: ligne.unite,
    type: ligne.type,
    resultat: JSON.parse(ligne.resultat),
    reponduA: ligne.repondu_a,
    appareil: ligne.appareil,
    v: ligne.v,
    recuA: ligne.recu_a,
  };
}

/**
 * Les données de la personne, ou `undefined` si elle n'existe plus. `coursVisibles` est la liste
 * des cours qu'elle peut lire, dans l'ordre où l'on veut les rendre : il n'y a rien d'autre dans
 * l'export, et aucun autre cours n'est lu.
 */
export function exporterPersonne(
  base: Base,
  depot: Depot,
  personne: string,
  coursVisibles: readonly { id: string; titre: string }[],
  instant: Date,
): ExportPersonne | undefined {
  const profil = depot.personne(personne);
  if (profil === undefined) {
    return undefined;
  }

  const idsDesGroupes = new Set(depot.groupesDe(personne));

  // Aucun cours visible : rien à lire (et `inArray` d'une liste vide n'a pas de sens en SQL).
  const lignes =
    coursVisibles.length === 0
      ? []
      : base.db
          .select()
          .from(schema.evenement)
          .where(
            and(
              eq(schema.evenement.personne, personne),
              inArray(
                schema.evenement.cours,
                coursVisibles.map((cours) => cours.id),
              ),
            ),
          )
          .orderBy(asc(schema.evenement.cours), asc(schema.evenement.numero))
          .all();
  const parCours = new Map<string, EvenementExporte[]>();
  for (const ligne of lignes) {
    const evenements = parCours.get(ligne.cours) ?? [];
    evenements.push(versEvenement(ligne));
    parCours.set(ligne.cours, evenements);
  }

  return {
    format: 'ancrage-export',
    version: 1,
    exporteLe: instant.toISOString(),
    personne: {
      id: profil.id,
      nomAffiche: profil.nomAffiche,
      langue: profil.langue,
      proprietaire: profil.proprietaire,
      creeLe: profil.creeLe,
    },
    passkeys: depot.passkeysDe(personne).map((passkey) => ({
      id: passkey.id,
      appareil: passkey.appareil,
      transports: passkey.transports,
      clePublique: Buffer.from(passkey.clePublique).toString('base64url'),
      compteur: passkey.compteur,
      creeLe: passkey.creeLe,
      utiliseLe: passkey.utiliseLe,
    })),
    // Sans `empreinte` : elle ne sert qu'à retrouver la session depuis son cookie.
    sessions: depot.sessionsDe(personne).map((session) => ({
      id: session.id,
      appareil: session.appareil,
      creeLe: session.creeLe,
      utiliseLe: session.utiliseLe,
      expireLe: session.expireLe,
    })),
    // `groupes()` est trié par nom.
    groupes: depot
      .groupes()
      .filter((groupe) => idsDesGroupes.has(groupe.id))
      .map((groupe) => groupe.nom),
    cours: coursVisibles.map(({ id, titre }) => ({
      id,
      titre,
      evenements: parCours.get(id) ?? [],
    })),
  };
}
