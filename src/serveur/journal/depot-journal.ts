/*
 * Le dépôt du journal de progression (ADR-0004, invariant 5) : on y ajoute des événements, on les
 * relit, rien d'autre. Aucune fonction ne modifie ni ne supprime un événement ; seule la
 * suppression d'une personne emporte le sien (cascade de la base).
 *
 * Il lit et écrit la base, rien de plus : qui peut écrire ou lire un journal est décidé avant lui
 * par `acces/` (classement `cours`), et la forme d'un événement par `schemaEvenement`. La personne
 * et l'heure de réception sont celles que l'appelant donne, jamais celles du message.
 *
 * Le curseur d'un journal est un numéro propre à (personne, cours) : 1 pour le premier événement
 * de la personne dans le cours, puis +1, sans trou. Il ne compte donc que ses propres événements
 * (invariant 1). Le `rang` de la table, commun à tous, ne sort jamais d'ici.
 */
import { and, asc, eq, gt, max } from 'drizzle-orm';
import type { Evenement } from '../../domaine/journal/evenement.js';
import type { Base } from '../base/base.js';
import * as schema from '../base/schema.js';

/** Le plus grand lot d'événements d'un envoi. */
export const LOT_MAX = 500;
/** La plus grande page d'une lecture. Un lot et une page tiennent sous le corps de 1 Mio. */
export const PAGE_MAX = 1000;

export interface PageJournal {
  evenements: Evenement[];
  /**
   * Le dernier numéro rendu. Si la page est vide, c'est `depuis`, ramené au dernier numéro de la
   * personne dans ce cours (0 s'il n'y en a aucun) quand `depuis` le dépasse : une base restaurée
   * d'une sauvegarde plus ancienne a perdu des événements, et le curseur qui recule le dit au
   * client.
   */
  curseur: number;
  /** Vrai s'il reste des événements après cette page. */
  suite: boolean;
}

export interface DepotJournal {
  /** Rend le nombre d'événements nouveaux ; ceux déjà reçus de cette personne sont ignorés. */
  ajouter(personne: string, evenements: readonly Evenement[], recuA: string): number;
  /** Les événements de la personne dans ce cours, après le numéro `depuis`, par numéro. */
  lire(personne: string, cours: string, depuis: number, limite: number): PageJournal;
}

// Les colonnes ne sont écrites que par `ajouter`, depuis un événement que `schemaEvenement` a
// validé : la ligne relue est cet événement, avec `resultat` sorti de son JSON. Ni `rang`, ni
// `numero`, ni `personne`, ni `recu_a` n'en font partie.
function versEvenement(ligne: typeof schema.evenement.$inferSelect): Evenement {
  return {
    id: ligne.id,
    cours: ligne.cours,
    unite: ligne.unite,
    type: ligne.type,
    resultat: JSON.parse(ligne.resultat),
    repondu_a: ligne.repondu_a,
    appareil: ligne.appareil,
    v: ligne.v,
  } as Evenement;
}

export function creerDepotJournal(base: Base): DepotJournal {
  const { db, sqlite } = base;

  /** Le dernier numéro de la personne dans ce cours ; 0 si elle n'y a aucun événement. */
  function dernierNumero(personne: string, cours: string): number {
    const ligne = db
      .select({ dernier: max(schema.evenement.numero) })
      .from(schema.evenement)
      .where(and(eq(schema.evenement.personne, personne), eq(schema.evenement.cours, cours)))
      .get();
    return ligne?.dernier ?? 0;
  }

  // Une seule transaction : un lot s'écrit en entier ou pas du tout. `immediate` prend le verrou
  // d'écriture d'emblée : personne d'autre n'écrit entre la lecture du dernier numéro et les
  // insertions, si bien que les numéros se suivent sans trou ni doublon.
  const ajouterLot = sqlite.transaction(
    (personne: string, evenements: readonly Evenement[], recuA: string) => {
      // Le prochain numéro de chaque cours du lot, lu en base une seule fois. Un lot n'a en
      // principe qu'un cours (la route le veut), mais le dépôt ne s'y fie pas.
      const suivants = new Map<string, number>();
      let nouveaux = 0;
      for (const message of evenements) {
        const numero = suivants.get(message.cours) ?? dernierNumero(personne, message.cours) + 1;
        const { changes } = db
          .insert(schema.evenement)
          .values({
            id: message.id,
            personne,
            cours: message.cours,
            numero,
            unite: message.unite,
            type: message.type,
            resultat: JSON.stringify(message.resultat),
            repondu_a: message.repondu_a,
            appareil: message.appareil,
            v: message.v,
            recu_a: recuA,
          })
          // Un `id` déjà reçu de cette personne : ignoré, le premier fait foi. Il ne consomme pas
          // de numéro (`changes` vaut alors 0).
          .onConflictDoNothing({ target: [schema.evenement.personne, schema.evenement.id] })
          .run();
        suivants.set(message.cours, numero + changes);
        nouveaux += changes;
      }
      return nouveaux;
    },
  );

  return {
    ajouter(personne, evenements, recuA) {
      return ajouterLot.immediate(personne, evenements, recuA);
    },

    lire(personne, cours, depuis, limite) {
      // Une ligne de plus que la page : c'est ce qui dit s'il y a une suite.
      const lignes = db
        .select()
        .from(schema.evenement)
        .where(
          and(
            eq(schema.evenement.personne, personne),
            eq(schema.evenement.cours, cours),
            gt(schema.evenement.numero, depuis),
          ),
        )
        .orderBy(asc(schema.evenement.numero))
        .limit(limite + 1)
        .all();
      const page = lignes.slice(0, limite);
      return {
        evenements: page.map(versEvenement),
        curseur: page.at(-1)?.numero ?? Math.min(depuis, dernierNumero(personne, cours)),
        suite: lignes.length > limite,
      };
    },
  };
}
