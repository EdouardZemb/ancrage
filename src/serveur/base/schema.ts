import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Les dates sont en ISO 8601 UTC, au format `text`. Les identifiants sont des UUID en `text`.

// Une seule ligne : l'identité de cette instance (ADR-0007). `cree_le` est en ISO 8601 UTC.
export const instance = sqliteTable('instance', {
  id: text('id').primaryKey(),
  cree_le: text('cree_le').notNull(),
});

// Une personne, identifiée par un identifiant opaque (ADR-0002, ADR-0007). Ni e-mail ni autre
// donnée personnelle : seulement le nom affiché et la langue.
export const personne = sqliteTable('personne', {
  id: text('id').primaryKey(),
  nom_affiche: text('nom_affiche').notNull(),
  langue: text('langue', { enum: ['de', 'fr'] }).notNull(),
  proprietaire: integer('proprietaire', { mode: 'boolean' }).notNull().default(sql`0`),
  cree_le: text('cree_le').notNull(),
});

// `id` est l'identifiant de la clé, en base64url.
export const passkey = sqliteTable('passkey', {
  id: text('id').primaryKey(),
  personne: text('personne')
    .notNull()
    .references(() => personne.id, { onDelete: 'cascade' }),
  cle_publique: blob('cle_publique', { mode: 'buffer' }).notNull(),
  compteur: integer('compteur').notNull(),
  // Tableau JSON des transports de l'authentificateur.
  transports: text('transports').notNull(),
  appareil: text('appareil').notNull(),
  cree_le: text('cree_le').notNull(),
  // Nul tant que la clé n'a servi à aucune connexion.
  utilise_le: text('utilise_le'),
});

// Seule l'empreinte SHA-256 du jeton est stockée, jamais le jeton.
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  empreinte: text('empreinte').notNull().unique(),
  personne: text('personne')
    .notNull()
    .references(() => personne.id, { onDelete: 'cascade' }),
  appareil: text('appareil').notNull(),
  cree_le: text('cree_le').notNull(),
  utilise_le: text('utilise_le').notNull(),
  expire_le: text('expire_le').notNull(),
});

// Un lien à usage unique, identifié par l'empreinte de son jeton. Une invitation n'a pas de
// personne : le compte n'existe pas encore. `cree_par` est nul pour l'amorçage du propriétaire.
export const lien = sqliteTable('lien', {
  empreinte: text('empreinte').primaryKey(),
  type: text('type', { enum: ['invitation', 'connexion'] }).notNull(),
  personne: text('personne').references(() => personne.id, { onDelete: 'cascade' }),
  proprietaire: integer('proprietaire', { mode: 'boolean' }).notNull().default(sql`0`),
  // JSON `{ groupes: string[]; cours: string[] }`, appliqué à la création du compte.
  octroi: text('octroi').notNull(),
  cree_par: text('cree_par').references(() => personne.id, { onDelete: 'cascade' }),
  cree_le: text('cree_le').notNull(),
  expire_le: text('expire_le').notNull(),
  utilise_le: text('utilise_le'),
});

export const groupe = sqliteTable('groupe', {
  id: text('id').primaryKey(),
  nom: text('nom').notNull().unique(),
  cree_le: text('cree_le').notNull(),
});

export const membre = sqliteTable(
  'membre',
  {
    groupe: text('groupe')
      .notNull()
      .references(() => groupe.id, { onDelete: 'cascade' }),
    personne: text('personne')
      .notNull()
      .references(() => personne.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.groupe, t.personne] })],
);

// Le droit d'une personne ou d'un groupe sur un cours (ADR-0001). `cours` est l'identifiant du
// cours dans `cours.yaml` : ce n'est pas une clé étrangère, les cours ne sont pas en base.
export const autorisation = sqliteTable(
  'autorisation',
  {
    id: text('id').primaryKey(),
    cours: text('cours').notNull(),
    permission: text('permission', { enum: ['apprendre'] }).notNull(),
    personne: text('personne').references(() => personne.id, { onDelete: 'cascade' }),
    groupe: text('groupe').references(() => groupe.id, { onDelete: 'cascade' }),
    cree_le: text('cree_le').notNull(),
  },
  (t) => [
    // Exactement un sujet : une personne ou un groupe.
    check('autorisation_un_seul_sujet', sql`(${t.personne} IS NULL) <> (${t.groupe} IS NULL)`),
    // SQLite traite les NULL comme distincts dans un index unique : un seul index sur les quatre
    // colonnes laisserait passer les doublons. Un index partiel par sorte de sujet les attrape.
    uniqueIndex('autorisation_cours_permission_personne')
      .on(t.cours, t.permission, t.personne)
      .where(sql`${t.personne} IS NOT NULL`),
    uniqueIndex('autorisation_cours_permission_groupe')
      .on(t.cours, t.permission, t.groupe)
      .where(sql`${t.groupe} IS NOT NULL`),
  ],
);

// Le journal de progression (ADR-0004, invariant 5) : on y ajoute des événements, on n'en modifie
// ni n'en supprime aucun (sauf la cascade de la suppression d'une personne). `personne` vient de la
// session et `recu_a` de l'horloge du serveur, jamais du message. `cours` est l'identifiant du
// cours dans `cours.yaml` : ce n'est pas une clé étrangère, les cours ne sont pas en base.
//
// `numero` est le curseur de lecture : 1 pour le premier événement d'une personne dans un cours,
// puis +1. Il est propre à (personne, cours), pour que l'écart entre deux curseurs ne compte que
// les événements de cette personne dans ce cours, jamais ceux des autres (invariant 1). `rang`,
// commun à toute la table, n'est qu'une clé interne : il ne sort jamais du serveur.
export const evenement = sqliteTable(
  'evenement',
  {
    rang: integer('rang').primaryKey({ autoIncrement: true }),
    // L'UUIDv7 créé sur l'appareil.
    id: text('id').notNull(),
    personne: text('personne')
      .notNull()
      .references(() => personne.id, { onDelete: 'cascade' }),
    cours: text('cours').notNull(),
    numero: integer('numero').notNull(),
    unite: text('unite').notNull(),
    type: text('type', { enum: ['reponse', 'examen'] }).notNull(),
    // Objet JSON, relu tel quel : `{ juste }` ou `{ points, questions, note, minutes, chapitres }`.
    resultat: text('resultat').notNull(),
    // L'heure locale de l'appareil, avec son décalage.
    repondu_a: text('repondu_a').notNull(),
    appareil: text('appareil').notNull(),
    v: integer('v').notNull(),
    // ISO 8601 UTC.
    recu_a: text('recu_a').notNull(),
  },
  (t) => [
    // Un `id` déjà reçu de cette personne est ignoré : le premier fait foi.
    uniqueIndex('evenement_personne_id').on(t.personne, t.id),
    // La lecture d'un journal : les événements d'une personne pour un cours, depuis un numéro. Un
    // numéro n'est attribué qu'une fois.
    uniqueIndex('evenement_personne_cours_numero').on(t.personne, t.cours, t.numero),
  ],
);

// Le registre des suppressions (ADR-0007 §2, 1e-D3) : rien d'autre que l'identifiant et la date.
// Pas de clé étrangère : la personne n'existe plus.
export const suppression = sqliteTable('suppression', {
  personne: text('personne').primaryKey(),
  supprime_le: text('supprime_le').notNull(),
});
