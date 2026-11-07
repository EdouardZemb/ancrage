/*
 * Les liens du dépôt des comptes : invitations et liens de connexion. `creerDepot` en reprend les
 * méthodes telles quelles (1f-D14) ; `depot.ts` réexporte les types, pour que personne n'ait à
 * changer d'import. Seule l'empreinte du jeton est gardée (ADR-0007). Les dates viennent de
 * l'horloge du dépôt, que `creerDepot` passe en `maintenant` (ISO 8601 UTC).
 */
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Base } from '../base/base.js';
import * as schema from '../base/schema.js';

export type TypeLien = 'invitation' | 'connexion';

/** Ce qu'une invitation donne à la personne qui l'utilise, appliqué à la création du compte. */
export interface Octroi {
  groupes: string[];
  cours: string[];
}

export interface Lien {
  empreinte: string;
  type: TypeLien;
  /** Nul pour une invitation : le compte n'existe pas encore. */
  personne: string | null;
  /** Invitation du propriétaire. */
  proprietaire: boolean;
  octroi: Octroi;
  /** Nul pour l'amorçage. */
  creePar: string | null;
  creeLe: string;
  expireLe: string;
  utiliseLe: string | null;
}

/** Ce qu'il faut pour écrire un lien. Seule l'empreinte du jeton est gardée (ADR-0007). */
export interface NouveauLien {
  empreinte: string;
  type: TypeLien;
  personne?: string;
  proprietaire?: boolean;
  octroi?: Octroi;
  creePar?: string;
  expireLe: string;
}

function versLien(ligne: typeof schema.lien.$inferSelect): Lien {
  return {
    empreinte: ligne.empreinte,
    type: ligne.type,
    personne: ligne.personne,
    proprietaire: ligne.proprietaire,
    octroi: JSON.parse(ligne.octroi) as Octroi,
    creePar: ligne.cree_par,
    creeLe: ligne.cree_le,
    expireLe: ligne.expire_le,
    utiliseLe: ligne.utilise_le,
  };
}

/** Le lien de cette empreinte et de ce type, pas encore utilisé et pas expiré à `instant`. */
function conditionLienUtilisable(empreinte: string, type: TypeLien, instant: string) {
  return and(
    eq(schema.lien.empreinte, empreinte),
    eq(schema.lien.type, type),
    isNull(schema.lien.utilise_le),
    gt(schema.lien.expire_le, instant),
  );
}

const INSTANT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Vrai pour un instant tel que `Date.prototype.toISOString` l'écrit, le seul format qu'on compare. */
function estInstantIso(valeur: string): boolean {
  return INSTANT_ISO.test(valeur) && !Number.isNaN(new Date(valeur).getTime());
}

export function creerDepotLiens(base: Base, maintenant: () => string) {
  const { db } = base;

  /**
   * Les combinaisons que le schéma n'interdit pas (il n'a pas de CHECK) et que le code ne produit
   * jamais : un lien sans empreinte, une expiration illisible, une connexion sans personne, une
   * invitation qui en vise une.
   */
  function controlerLien(donnees: NouveauLien): void {
    if (donnees.empreinte === '') {
      throw new Error('lien avec une empreinte vide');
    }
    if (!estInstantIso(donnees.expireLe)) {
      throw new Error("lien avec une expiration qui n'est pas une date ISO");
    }
    if (donnees.type === 'connexion' && donnees.personne == null) {
      throw new Error('lien de connexion sans personne');
    }
    if (donnees.type === 'invitation' && donnees.personne != null) {
      throw new Error('invitation avec une personne');
    }
  }

  function insererLien(donnees: NouveauLien): Lien {
    controlerLien(donnees);
    const ligne = db
      .insert(schema.lien)
      .values({
        empreinte: donnees.empreinte,
        type: donnees.type,
        personne: donnees.personne ?? null,
        proprietaire: donnees.proprietaire ?? false,
        octroi: JSON.stringify(donnees.octroi ?? { groupes: [], cours: [] }),
        cree_par: donnees.creePar ?? null,
        cree_le: maintenant(),
        expire_le: donnees.expireLe,
      })
      .returning()
      .get();
    return versLien(ligne);
  }

  function supprimerLiensDeConnexionInutilises(personne: string): number {
    const { changes } = db
      .delete(schema.lien)
      .where(
        and(
          eq(schema.lien.type, 'connexion'),
          eq(schema.lien.personne, personne),
          isNull(schema.lien.utilise_le),
        ),
      )
      .run();
    return changes;
  }

  return {
    /**
     * Écrit le lien tel quel. Pour un lien de connexion, les routes et la ligne de commande passent
     * par `remplacerLienDeConnexion`, qui garde un seul lien actif par personne (1e-D7).
     */
    creerLien(donnees: NouveauLien): Lien {
      return insererLien(donnees);
    },

    /**
     * Supprime les liens de connexion inutilisés de la personne, puis crée celui-ci : une seule
     * transaction, prise d'emblée en écriture. Il n'y a ainsi qu'un lien de connexion actif par
     * personne, quel que soit son auteur, même sur deux connexions à la base ; si la création
     * échoue, les liens annulés reviennent. Les liens utilisés et les invitations ne changent pas
     * (1e-D7).
     */
    remplacerLienDeConnexion(donnees: {
      empreinte: string;
      personne: string;
      creePar?: string;
      expireLe: string;
    }): Lien {
      const remplacer = base.sqlite.transaction(() => {
        supprimerLiensDeConnexionInutilises(donnees.personne);
        return insererLien({ ...donnees, type: 'connexion' });
      });
      return remplacer.immediate();
    },

    /** Supprime les liens de connexion inutilisés de la personne. Rend leur nombre. */
    annulerLiensDeConnexion(personne: string): number {
      return supprimerLiensDeConnexionInutilises(personne);
    },

    /**
     * Le lien de connexion utilisable de la personne (pas encore utilisé, pas expiré), s'il y en a
     * un : la date d'expiration seule, jamais l'empreinte. Le plus tardif, si d'anciens liens créés
     * avant la règle d'un seul lien sont encore là.
     */
    lienDeConnexionActif(personne: string): { expireLe: string } | undefined {
      return db
        .select({ expireLe: schema.lien.expire_le })
        .from(schema.lien)
        .where(
          and(
            eq(schema.lien.type, 'connexion'),
            eq(schema.lien.personne, personne),
            isNull(schema.lien.utilise_le),
            gt(schema.lien.expire_le, maintenant()),
          ),
        )
        .orderBy(desc(schema.lien.expire_le))
        .limit(1)
        .get();
    },

    /**
     * Le lien, s'il pourrait être consommé maintenant (mêmes conditions que `consommerLien`), sans
     * le consommer : pour les options d'une cérémonie, avant la consommation.
     */
    lienUtilisable(empreinte: string, type: TypeLien): Lien | undefined {
      const ligne = db
        .select()
        .from(schema.lien)
        .where(conditionLienUtilisable(empreinte, type, maintenant()))
        .get();
      return ligne === undefined ? undefined : versLien(ligne);
    },

    /**
     * Marque le lien utilisé et le rend, si et seulement si cette consommation-ci l'a marqué :
     * lien du bon type, pas encore utilisé, pas expiré. Une seule instruction `UPDATE`, donc
     * atomique : deux usages simultanés, même sur deux connexions, n'en font réussir qu'un.
     */
    consommerLien(empreinte: string, type: TypeLien): Lien | undefined {
      const instant = maintenant();
      const ligne = db
        .update(schema.lien)
        .set({ utilise_le: instant })
        .where(conditionLienUtilisable(empreinte, type, instant))
        .returning()
        .get();
      return ligne === undefined ? undefined : versLien(ligne);
    },

    /** Supprime les invitations du propriétaire encore inutilisées. Rend leur nombre. */
    annulerInvitationsProprietaireNonUtilisees(): number {
      const { changes } = db
        .delete(schema.lien)
        .where(
          and(
            eq(schema.lien.type, 'invitation'),
            eq(schema.lien.proprietaire, true),
            isNull(schema.lien.utilise_le),
          ),
        )
        .run();
      return changes;
    },
  };
}
