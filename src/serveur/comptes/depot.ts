/*
 * Le dépôt des comptes : personnes, passkeys, sessions, liens, groupes et autorisations. Il lit et
 * écrit la base, rien de plus : les règles (qui peut quoi) sont dans `src/domaine/acces.ts` et leur
 * contrôle dans `src/serveur/acces/` (ADR-0001). Les dates sont en ISO 8601 UTC, tirées de
 * l'horloge injectée ; les identifiants sont des UUID. Les liens ont leur fichier,
 * `depot-liens.ts` (1f-D14), les groupes et les autorisations aussi, `depot-droits.ts` (2b-D6).
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { Base } from '../base/base.js';
import * as schema from '../base/schema.js';
import type { TypeAppareil } from './appareil.js';
import { creerDepotDroits } from './depot-droits.js';
import { creerDepotLiens } from './depot-liens.js';
import { estSupprimee } from './suppression.js';

export type Langue = 'de' | 'fr';

// Propre au dépôt, pour ne pas le confondre avec la `Personne` de `src/domaine/acces.ts`.
export interface PersonneEnregistree {
  id: string;
  nomAffiche: string;
  langue: Langue;
  proprietaire: boolean;
  creeLe: string;
}

export interface PasskeyEnregistree {
  /** L'identifiant de la clé, en base64url. */
  id: string;
  personne: string;
  clePublique: Uint8Array;
  compteur: number;
  transports: string[];
  appareil: TypeAppareil;
  creeLe: string;
  /** Nul tant que la clé n'a servi à aucune connexion. */
  utiliseLe: string | null;
}

export interface SessionEnregistree {
  id: string;
  empreinte: string;
  personne: string;
  appareil: TypeAppareil;
  creeLe: string;
  utiliseLe: string;
  expireLe: string;
}

// Les types des groupes et des autorisations vivent avec leur dépôt (2b-D6) ; les consommateurs
// continuent de les importer d'ici.
export type { AutorisationEnregistree, GroupeEnregistre } from './depot-droits.js';
// Idem pour les liens (1f-D14).
export type { Lien, NouveauLien, Octroi, TypeLien } from './depot-liens.js';

/**
 * Vrai si l'erreur vient d'une contrainte d'unicité de la base (un nom de groupe pris, par
 * exemple). better-sqlite3 la lève avec le code de SQLite, `SQLITE_CONSTRAINT_UNIQUE` : on ne lit
 * pas son message.
 */
export function estViolationUnicite(erreur: unknown): boolean {
  return (
    erreur instanceof Error &&
    (erreur as Error & { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function versPersonne(ligne: typeof schema.personne.$inferSelect): PersonneEnregistree {
  return {
    id: ligne.id,
    nomAffiche: ligne.nom_affiche,
    langue: ligne.langue,
    proprietaire: ligne.proprietaire,
    creeLe: ligne.cree_le,
  };
}

// Ici comme dans `versSession`, la colonne `appareil` est du texte : seul ce dépôt l'écrit, et
// toujours depuis un `TypeAppareil`.
function versPasskey(ligne: typeof schema.passkey.$inferSelect): PasskeyEnregistree {
  return {
    id: ligne.id,
    personne: ligne.personne,
    clePublique: new Uint8Array(ligne.cle_publique),
    compteur: ligne.compteur,
    transports: JSON.parse(ligne.transports) as string[],
    appareil: ligne.appareil as TypeAppareil,
    creeLe: ligne.cree_le,
    utiliseLe: ligne.utilise_le,
  };
}

function versSession(ligne: typeof schema.session.$inferSelect): SessionEnregistree {
  return {
    id: ligne.id,
    empreinte: ligne.empreinte,
    personne: ligne.personne,
    appareil: ligne.appareil as TypeAppareil,
    creeLe: ligne.cree_le,
    utiliseLe: ligne.utilise_le,
    expireLe: ligne.expire_le,
  };
}

export function creerDepot(base: Base, horloge: () => Date) {
  const { db } = base;
  const maintenant = () => horloge().toISOString();

  function lirePersonne(id: string): PersonneEnregistree | undefined {
    const ligne = db.select().from(schema.personne).where(eq(schema.personne.id, id)).get();
    return ligne === undefined ? undefined : versPersonne(ligne);
  }

  return {
    // --- Personnes ---

    /**
     * `id` : un UUID tiré d'avance, quand l'identifiant doit être connu avant la création (celui
     * que garde la passkey) ; sinon, il est tiré ici.
     */
    creerPersonne(donnees: {
      id?: string;
      nomAffiche: string;
      langue: Langue;
      proprietaire?: boolean;
    }): PersonneEnregistree {
      const ligne = db
        .insert(schema.personne)
        .values({
          id: donnees.id ?? randomUUID(),
          nom_affiche: donnees.nomAffiche,
          langue: donnees.langue,
          proprietaire: donnees.proprietaire ?? false,
          cree_le: maintenant(),
        })
        .returning()
        .get();
      return versPersonne(ligne);
    },

    personne: lirePersonne,

    /** De la plus ancienne à la plus récente. */
    personnes(): PersonneEnregistree[] {
      return db
        .select()
        .from(schema.personne)
        .orderBy(
          asc(schema.personne.cree_le),
          asc(schema.personne.nom_affiche),
          asc(schema.personne.id),
        )
        .all()
        .map(versPersonne);
    },

    /** Rend la personne modifiée, ou `undefined` si elle n'existe pas. */
    modifierPersonne(
      id: string,
      modifications: { nomAffiche?: string; langue?: Langue },
    ): PersonneEnregistree | undefined {
      const valeurs: Partial<typeof schema.personne.$inferInsert> = {};
      if (modifications.nomAffiche !== undefined) {
        valeurs.nom_affiche = modifications.nomAffiche;
      }
      if (modifications.langue !== undefined) {
        valeurs.langue = modifications.langue;
      }
      if (Object.keys(valeurs).length === 0) {
        return lirePersonne(id);
      }
      const ligne = db
        .update(schema.personne)
        .set(valeurs)
        .where(eq(schema.personne.id, id))
        .returning()
        .get();
      return ligne === undefined ? undefined : versPersonne(ligne);
    },

    existeProprietaire(): boolean {
      const ligne = db
        .select({ id: schema.personne.id })
        .from(schema.personne)
        .where(eq(schema.personne.proprietaire, true))
        .limit(1)
        .get();
      return ligne !== undefined;
    },

    // --- Passkeys ---

    ajouterPasskey(donnees: {
      id: string;
      personne: string;
      clePublique: Uint8Array;
      compteur: number;
      transports: string[];
      appareil: TypeAppareil;
    }): PasskeyEnregistree {
      const ligne = db
        .insert(schema.passkey)
        .values({
          id: donnees.id,
          personne: donnees.personne,
          cle_publique: Buffer.from(donnees.clePublique),
          compteur: donnees.compteur,
          transports: JSON.stringify(donnees.transports),
          appareil: donnees.appareil,
          cree_le: maintenant(),
        })
        .returning()
        .get();
      return versPasskey(ligne);
    },

    passkey(idCle: string): PasskeyEnregistree | undefined {
      const ligne = db.select().from(schema.passkey).where(eq(schema.passkey.id, idCle)).get();
      return ligne === undefined ? undefined : versPasskey(ligne);
    },

    passkeysDe(personne: string): PasskeyEnregistree[] {
      return db
        .select()
        .from(schema.passkey)
        .where(eq(schema.passkey.personne, personne))
        .orderBy(asc(schema.passkey.cree_le), asc(schema.passkey.id))
        .all()
        .map(versPasskey);
    },

    /** Enregistre le compteur reçu et la date d'usage : à appeler après chaque connexion. */
    majCompteurPasskey(idCle: string, compteur: number): void {
      db.update(schema.passkey)
        .set({ compteur, utilise_le: maintenant() })
        .where(eq(schema.passkey.id, idCle))
        .run();
    },

    /** Ne supprime que la clé de cette personne. Rend `false` si rien n'a été supprimé. */
    supprimerPasskey(idCle: string, personne: string): boolean {
      const { changes } = db
        .delete(schema.passkey)
        .where(and(eq(schema.passkey.id, idCle), eq(schema.passkey.personne, personne)))
        .run();
      return changes > 0;
    },

    // --- Sessions ---

    creerSession(donnees: {
      personne: string;
      empreinte: string;
      appareil: TypeAppareil;
      expireLe: string;
    }): SessionEnregistree {
      const instant = maintenant();
      const ligne = db
        .insert(schema.session)
        .values({
          id: randomUUID(),
          empreinte: donnees.empreinte,
          personne: donnees.personne,
          appareil: donnees.appareil,
          cree_le: instant,
          utilise_le: instant,
          expire_le: donnees.expireLe,
        })
        .returning()
        .get();
      return versSession(ligne);
    },

    sessionParEmpreinte(empreinte: string): SessionEnregistree | undefined {
      const ligne = db
        .select()
        .from(schema.session)
        .where(eq(schema.session.empreinte, empreinte))
        .get();
      return ligne === undefined ? undefined : versSession(ligne);
    },

    /** Marque la session utilisée maintenant et repousse son expiration. */
    prolongerSession(id: string, expireLe: string): void {
      db.update(schema.session)
        .set({ utilise_le: maintenant(), expire_le: expireLe })
        .where(eq(schema.session.id, id))
        .run();
    },

    sessionsDe(personne: string): SessionEnregistree[] {
      return db
        .select()
        .from(schema.session)
        .where(eq(schema.session.personne, personne))
        .orderBy(asc(schema.session.cree_le), asc(schema.session.id))
        .all()
        .map(versSession);
    },

    /**
     * Avec `personne`, ne supprime que la session de cette personne. Rend `false` si rien n'a été
     * supprimé.
     */
    supprimerSession(id: string, personne?: string): boolean {
      const { changes } = db
        .delete(schema.session)
        .where(
          personne === undefined
            ? eq(schema.session.id, id)
            : and(eq(schema.session.id, id), eq(schema.session.personne, personne)),
        )
        .run();
      return changes > 0;
    },

    supprimerSessionsDe(personne: string): void {
      db.delete(schema.session).where(eq(schema.session.personne, personne)).run();
    },

    // --- Registre des suppressions ---

    /** Vrai si le compte est au registre des suppressions (2d-D2). */
    compteSupprime(personne: string): boolean {
      return estSupprimee(base, personne);
    },

    // --- Liens (`depot-liens.ts`, 1f-D14) ---

    ...creerDepotLiens(base, maintenant),

    // --- Groupes, membres et autorisations (`depot-droits.ts`, 2b-D6) ---

    ...creerDepotDroits(base, maintenant),
  };
}

export type Depot = ReturnType<typeof creerDepot>;
