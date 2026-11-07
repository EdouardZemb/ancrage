/*
 * Les groupes, les membres et les autorisations du dépôt des comptes. `creerDepot` en reprend les
 * méthodes telles quelles (2b-D6) ; `depot.ts` réexporte les types, pour que personne n'ait à
 * changer d'import. Les dates viennent de l'horloge du dépôt, que `creerDepot` passe en
 * `maintenant` (ISO 8601 UTC).
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { Autorisation } from '../../domaine/acces.js';
import type { Base } from '../base/base.js';
import * as schema from '../base/schema.js';

export interface GroupeEnregistre {
  id: string;
  nom: string;
  creeLe: string;
}

/** Une `Autorisation` du domaine, avec ce qu'il faut pour la retirer. */
export interface AutorisationEnregistree extends Autorisation {
  id: string;
  creeLe: string;
}

function exiger<T>(valeur: T | undefined, message: string): T {
  if (valeur === undefined) {
    throw new Error(message);
  }
  return valeur;
}

function versGroupe(ligne: typeof schema.groupe.$inferSelect): GroupeEnregistre {
  return { id: ligne.id, nom: ligne.nom, creeLe: ligne.cree_le };
}

function versAutorisation(ligne: typeof schema.autorisation.$inferSelect): AutorisationEnregistree {
  // La contrainte `CHECK` de la base garantit exactement un sujet.
  const sujet: Autorisation['sujet'] =
    ligne.personne !== null
      ? { type: 'personne', id: ligne.personne }
      : { type: 'groupe', id: exiger(ligne.groupe ?? undefined, 'autorisation sans sujet') };
  return {
    id: ligne.id,
    cours: ligne.cours,
    permission: ligne.permission,
    sujet,
    creeLe: ligne.cree_le,
  };
}

export function creerDepotDroits(base: Base, maintenant: () => string) {
  const { db } = base;

  function lireAutorisations(): AutorisationEnregistree[] {
    return db
      .select()
      .from(schema.autorisation)
      .orderBy(asc(schema.autorisation.cree_le), asc(schema.autorisation.id))
      .all()
      .map(versAutorisation);
  }

  return {
    // --- Groupes ---

    /** Le nom est unique : un doublon lève l'erreur de contrainte de SQLite. */
    creerGroupe(nom: string): GroupeEnregistre {
      const ligne = db
        .insert(schema.groupe)
        .values({ id: randomUUID(), nom, cree_le: maintenant() })
        .returning()
        .get();
      return versGroupe(ligne);
    },

    groupes(): GroupeEnregistre[] {
      return db
        .select()
        .from(schema.groupe)
        .orderBy(asc(schema.groupe.nom), asc(schema.groupe.id))
        .all()
        .map(versGroupe);
    },

    /** Les identifiants des groupes dont la personne est membre. */
    groupesDe(personne: string): string[] {
      return db
        .select({ groupe: schema.membre.groupe })
        .from(schema.membre)
        .where(eq(schema.membre.personne, personne))
        .orderBy(asc(schema.membre.groupe))
        .all()
        .map((ligne) => ligne.groupe);
    },

    /** Sans effet si la personne est déjà membre. */
    ajouterMembre(groupe: string, personne: string): void {
      db.insert(schema.membre).values({ groupe, personne }).onConflictDoNothing().run();
    },

    retirerMembre(groupe: string, personne: string): boolean {
      const { changes } = db
        .delete(schema.membre)
        .where(and(eq(schema.membre.groupe, groupe), eq(schema.membre.personne, personne)))
        .run();
      return changes > 0;
    },

    // --- Autorisations ---

    /**
     * Idempotent : si ce droit existe déjà, rien n'est écrit et on rend l'existant. Les index
     * uniques partiels de la base arbitrent entre deux appels simultanés.
     */
    autoriser(donnees: { cours: string; sujet: Autorisation['sujet'] }): AutorisationEnregistree {
      const { cours, sujet } = donnees;
      const colonneSujet =
        sujet.type === 'personne' ? schema.autorisation.personne : schema.autorisation.groupe;
      const ecrire = base.sqlite.transaction(() => {
        db.insert(schema.autorisation)
          .values({
            id: randomUUID(),
            cours,
            permission: 'apprendre',
            personne: sujet.type === 'personne' ? sujet.id : null,
            groupe: sujet.type === 'groupe' ? sujet.id : null,
            cree_le: maintenant(),
          })
          .onConflictDoNothing()
          .run();
        return db
          .select()
          .from(schema.autorisation)
          .where(
            and(
              eq(schema.autorisation.cours, cours),
              eq(schema.autorisation.permission, 'apprendre'),
              eq(colonneSujet, sujet.id),
            ),
          )
          .get();
      });
      return versAutorisation(
        exiger(ecrire.immediate(), 'autorisation introuvable après écriture'),
      );
    },

    /** Rend `false` si l'autorisation n'existait pas. */
    retirerAutorisation(id: string): boolean {
      const { changes } = db
        .delete(schema.autorisation)
        .where(eq(schema.autorisation.id, id))
        .run();
      return changes > 0;
    },

    /** Au format de `src/domaine/acces.ts`, celui que les règles d'accès attendent. */
    autorisations(): Autorisation[] {
      return lireAutorisations().map(({ cours, permission, sujet }) => ({
        cours,
        permission,
        sujet,
      }));
    },

    /** Les mêmes, avec l'identifiant qui sert à les retirer (`retirerAutorisation`). */
    autorisationsAvecIdentifiant(): AutorisationEnregistree[] {
      return lireAutorisations();
    },
  };
}
