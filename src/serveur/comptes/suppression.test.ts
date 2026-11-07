import path from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { appliquerMigrations, type Base, fermerBase, ouvrirBase } from '../base/base.js';
import { instantane, migrationsJusqua, tablesDe } from '../base/schema.fixture.js';
import { espionnerLesTransactions, fichierContient, retenirLeWal } from '../base/wal.fixture.js';
import { installerEnvironnement } from '../environnement.fixture.js';
import { creerDepotJournal } from '../journal/depot-journal.js';
import { reponseDeTest } from '../journal/evenements.fixture.js';
import type { Depot, PersonneEnregistree } from './depot.js';
import { DUREE_REGISTRE_MS, purger } from './purge.js';
import {
  estSupprimee,
  lireRegistre,
  POINT_DE_CONTROLE_INCOMPLET,
  rejouerRegistre,
  supprimerPersonne,
  viderLeWal,
} from './suppression.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../../domaine/acces.test.ts`
 * (Stryker ne retrouve pas un test placé dans une suite : un mutant de `suppression.ts` paraîtrait
 * toujours survivre). Chaque nom de test porte seul son contexte.
 */

const COURS = 'cm5r8t23';
const NOM = 'Témoin-Zoé-7f3a';
const T0 = new Date('2026-10-18T08:00:00.000Z');
const RECU_A = '2026-10-18T08:00:05.000Z';
const SUPPRIME_LE = new Date('2026-10-18T10:30:00.000Z');

let dossier: string;
let chemin: string;
let base: Base;
let depot: Depot;
let avertissements: string[];

installerEnvironnement(
  (environnement) => {
    ({ dossier, chemin, base, depot } = environnement);
  },
  { debut: T0, nomDeLaBase: 'ancrage.sqlite' },
);

beforeEach(() => {
  avertissements = [];
});

/**
 * Un compte complet, aux données factices : 2 passkeys, 2 sessions, un lien qu'elle a créé et un
 * lien du propriétaire pour elle, un droit direct, 3 événements, et l'appartenance à `groupe`.
 */
function creerCompte(
  nomAffiche: string,
  suffixe: string,
  proprietaire: PersonneEnregistree,
  groupe: string,
): PersonneEnregistree {
  const personne = depot.creerPersonne({ nomAffiche, langue: 'de' });
  for (const n of [1, 2]) {
    depot.ajouterPasskey({
      id: `passkey-${suffixe}-${n}`,
      personne: personne.id,
      clePublique: new Uint8Array([n, 2, 3]),
      compteur: 0,
      transports: ['internal'],
      appareil: 'Android',
    });
    depot.creerSession({
      personne: personne.id,
      empreinte: `empreinte-${suffixe}-${n}`,
      appareil: 'Android',
      expireLe: '2026-12-01T00:00:00.000Z',
    });
  }
  depot.creerLien({
    empreinte: `lien-cree-par-${suffixe}`,
    type: 'invitation',
    creePar: personne.id,
    expireLe: '2026-10-25T00:00:00.000Z',
  });
  depot.creerLien({
    empreinte: `lien-pour-${suffixe}`,
    type: 'connexion',
    personne: personne.id,
    creePar: proprietaire.id,
    expireLe: '2026-10-19T00:00:00.000Z',
  });
  depot.ajouterMembre(groupe, personne.id);
  depot.autoriser({ cours: COURS, sujet: { type: 'personne', id: personne.id } });
  creerDepotJournal(base).ajouter(
    personne.id,
    [1, 2, 3].map((n) => reponseDeTest(COURS, n)),
    RECU_A,
  );
  return personne;
}

/** Un propriétaire (qui se connecte) et un groupe, communs aux deux comptes d'un test. */
function installer() {
  const proprietaire = depot.creerPersonne({
    nomAffiche: 'Prüfer Test',
    langue: 'de',
    proprietaire: true,
  });
  depot.ajouterPasskey({
    id: 'passkey-proprietaire',
    personne: proprietaire.id,
    clePublique: new Uint8Array([9, 9, 9]),
    compteur: 0,
    transports: ['internal'],
    appareil: 'Android',
  });
  depot.creerSession({
    personne: proprietaire.id,
    empreinte: 'empreinte-proprietaire',
    appareil: 'Android',
    expireLe: '2026-12-01T00:00:00.000Z',
  });
  const groupe = depot.creerGroupe('Klasse Test').id;
  return { proprietaire, groupe };
}

function avertir(message: string): void {
  avertissements.push(message);
}

/** Le schéma et les lignes de toutes les tables, sauf le registre. */
function instantaneSansRegistre() {
  return instantane(base.sqlite, {
    tables: tablesDe(base.sqlite).filter((table) => table !== 'suppression'),
    migrations: 0,
  });
}

/** Toutes les lignes de toutes les tables, sauf le registre. */
function lignesSansRegistre() {
  return instantaneSansRegistre().lignes;
}

function registre() {
  return base.sqlite.prepare('select personne, supprime_le from suppression order by rowid').all();
}

type Lignes = Record<string, unknown[]>;

/** Les lignes qui citent `texte` (JSON de chaque ligne), table par table. */
function lignesCitant(lignes: Lignes, texte: string): Lignes {
  return Object.fromEntries(
    Object.entries(lignes).map(([table, rows]) => [
      table,
      rows.filter((ligne) => JSON.stringify(ligne).includes(texte)),
    ]),
  );
}

function sansLignesCitant(lignes: Lignes, texte: string): Lignes {
  return Object.fromEntries(
    Object.entries(lignes).map(([table, rows]) => [
      table,
      rows.filter((ligne) => !JSON.stringify(ligne).includes(texte)),
    ]),
  );
}

it('suppression_ne_laisse_rien_de_la_personne', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const autre = creerCompte('Témoin-Max-2c9d', 'max', proprietaire, groupe);
  const avant = lignesSansRegistre();
  // Le compte à supprimer est bien dans chacune des tables qui peuvent le citer.
  const citees = Object.entries(lignesCitant(avant, zoe.id))
    .filter(([, rows]) => rows.length > 0)
    .map(([table]) => table);
  expect(citees).toEqual([
    'autorisation',
    'evenement',
    'lien',
    'membre',
    'passkey',
    'personne',
    'session',
  ]);

  expect(supprimerPersonne(base, zoe.id, SUPPRIME_LE, avertir)).toBe('supprimee');

  const apres = lignesSansRegistre();
  for (const [table, rows] of Object.entries(apres)) {
    for (const ligne of rows) {
      const texte = JSON.stringify(ligne);
      expect(texte, table).not.toContain(zoe.id);
      expect(texte, table).not.toContain(NOM);
    }
  }
  // Tout le reste est intact : les lignes de la seconde personne, du propriétaire et du groupe.
  expect(apres).toStrictEqual(sansLignesCitant(avant, zoe.id));
  expect(lignesCitant(apres, autre.id)).toStrictEqual(lignesCitant(avant, autre.id));
  expect(registre()).toStrictEqual([{ personne: zoe.id, supprime_le: SUPPRIME_LE.toISOString() }]);
});

// Les droits d'un groupe ne sont pas ceux d'une personne : supprimer un compte n'y touche pas.
it('les_groupes_et_leurs_droits_restent', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const autre = creerCompte('Témoin-Max-2c9d', 'max', proprietaire, groupe);
  // Un second groupe, dont Zoé est la seule membre : il reste, sans membre.
  const seule = depot.creerGroupe('Klasse Allein').id;
  depot.ajouterMembre(seule, zoe.id);
  for (const id of [groupe, seule]) {
    depot.autoriser({ cours: COURS, sujet: { type: 'groupe', id } });
  }
  const droitsDeGroupe = () =>
    depot.autorisationsAvecIdentifiant().filter(({ sujet }) => sujet.type === 'groupe');
  const membresDe = (id: string) =>
    (
      base.sqlite
        .prepare('select personne from membre where groupe = ? order by personne')
        .all(id) as { personne: string }[]
    ).map(({ personne }) => personne);
  const groupes = depot.groupes();
  const droits = droitsDeGroupe();
  expect(groupes).toHaveLength(2);
  expect(droits).toHaveLength(2);
  expect(membresDe(groupe)).toEqual([zoe.id, autre.id].sort());
  expect(membresDe(seule)).toEqual([zoe.id]);

  expect(supprimerPersonne(base, zoe.id, SUPPRIME_LE, avertir)).toBe('supprimee');

  // Les groupes et leurs droits sont inchangés (même identifiant, même date)...
  expect(depot.groupes()).toStrictEqual(groupes);
  expect(droitsDeGroupe()).toStrictEqual(droits);
  // ... l'autre membre y est encore, la ligne de Zoé a disparu, et le groupe d'elle seule reste vide.
  expect(membresDe(groupe)).toEqual([autre.id]);
  expect(membresDe(seule)).toEqual([]);
  expect(depot.groupesDe(zoe.id)).toEqual([]);
  expect(depot.groupesDe(autre.id)).toEqual([groupe]);
  // Seuls ses droits à elle sont partis : celui de l'autre personne reste.
  expect(
    depot
      .autorisationsAvecIdentifiant()
      .filter(({ sujet }) => sujet.type === 'personne')
      .map(({ sujet }) => sujet.id),
  ).toEqual([autre.id]);
});

it('suppression_efface_les_octets_du_fichier', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  creerCompte('Témoin-Max-2c9d', 'max', proprietaire, groupe);
  const octets = Buffer.from(NOM);
  const wal = `${chemin}-wal`;
  // Avant : le nom est dans le journal WAL, la base n'a pas encore été vidée dans le fichier.
  expect(fichierContient(wal, octets)).toBe(true);

  supprimerPersonne(base, zoe.id, SUPPRIME_LE, avertir);

  // La base est encore ouverte : ce que la suppression n'a pas écrasé ni tronqué y est encore.
  expect(fichierContient(chemin, octets)).toBe(false);
  expect(fichierContient(wal, octets)).toBe(false);
  expect(avertissements).toEqual([]);
});

it('supprimer_personne_ecrit_en_transaction_immediate', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const espion = espionnerLesTransactions(base.sqlite);

  supprimerPersonne(base, zoe.id, SUPPRIME_LE, avertir);

  expect(espion.manieres).toEqual(['immediate']);
});

it('rejouer_registre_ecrit_en_transaction_immediate', () => {
  const espion = espionnerLesTransactions(base.sqlite);

  rejouerRegistre(
    base,
    [{ personne: 'inconnue', supprimeLe: '2026-10-10T09:00:00.000Z' }],
    avertir,
  );

  expect(espion.manieres).toEqual(['immediate']);
});

it('suppression_avertit_si_le_point_de_controle_est_incomplet', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const octets = Buffer.from(NOM);
  const wal = `${chemin}-wal`;
  // Un lecteur (la sauvegarde de nuit) retient le WAL : le point de contrôle ne peut le vider.
  const liberer = retenirLeWal(base);
  try {
    expect(supprimerPersonne(base, zoe.id, SUPPRIME_LE, avertir)).toBe('supprimee');

    // La suppression est faite et le registre écrit ; seul le WAL garde encore les octets.
    expect(depot.personne(zoe.id)).toBeUndefined();
    expect(registre()).toStrictEqual([
      { personne: zoe.id, supprime_le: SUPPRIME_LE.toISOString() },
    ]);
    expect(fichierContient(wal, octets)).toBe(true);
    // Un seul avertissement, qui ne cite ni l'identifiant ni le nom (1e-D10).
    expect(avertissements).toEqual([POINT_DE_CONTROLE_INCOMPLET]);
    expect(avertissements[0]).not.toContain(zoe.id);
    expect(avertissements[0]).not.toContain(NOM);
  } finally {
    liberer();
  }
  // Le point de contrôle suivant, lecteur parti, vide le WAL.
  base.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  expect(fichierContient(wal, octets)).toBe(false);
  expect(fichierContient(chemin, octets)).toBe(false);
});

it('suppression_refuse_le_proprietaire', () => {
  const { proprietaire, groupe } = installer();
  creerCompte(NOM, 'zoe', proprietaire, groupe);
  const avant = instantaneSansRegistre();

  expect(supprimerPersonne(base, proprietaire.id, SUPPRIME_LE, avertir)).toBe('proprietaire');

  expect(instantaneSansRegistre()).toStrictEqual(avant);
  expect(registre()).toStrictEqual([]);
});

// Un point de contrôle qui lève (base fermée) vaut un point de contrôle incomplet : l'appelant est
// prévenu, la suppression n'échoue pas pour autant.
it('vider_le_wal_avertit_si_le_point_de_controle_leve_une_erreur', () => {
  fermerBase(base);

  expect(() => viderLeWal(base, avertir)).not.toThrow();

  expect(avertissements).toEqual([POINT_DE_CONTROLE_INCOMPLET]);
});

// Sans journal à qui parler (un script), l'avertissement va à la sortie d'erreur.
it('suppression_sans_avertisseur_avertit_sur_la_sortie_d_erreur', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const sortie = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const liberer = retenirLeWal(base);
  try {
    expect(supprimerPersonne(base, zoe.id, SUPPRIME_LE)).toBe('supprimee');
  } finally {
    liberer();
  }

  expect(sortie.mock.calls).toEqual([[POINT_DE_CONTROLE_INCOMPLET]]);
  sortie.mockRestore();
});

it('suppression_sans_effet_n_avertit_pas', () => {
  const { proprietaire, groupe } = installer();
  creerCompte(NOM, 'zoe', proprietaire, groupe);
  const liberer = retenirLeWal(base);
  try {
    // Rien n'est supprimé, donc aucun point de contrôle n'est tenté.
    expect(supprimerPersonne(base, proprietaire.id, SUPPRIME_LE, avertir)).toBe('proprietaire');
    expect(supprimerPersonne(base, 'personne-inconnue', SUPPRIME_LE, avertir)).toBe('introuvable');
  } finally {
    liberer();
  }
  expect(avertissements).toEqual([]);
});

it('suppression_inconnue', () => {
  const { proprietaire, groupe } = installer();
  creerCompte(NOM, 'zoe', proprietaire, groupe);
  const avant = lignesSansRegistre();

  expect(supprimerPersonne(base, 'personne-inconnue', SUPPRIME_LE, avertir)).toBe('introuvable');

  expect(lignesSansRegistre()).toStrictEqual(avant);
  expect(registre()).toStrictEqual([]);
  expect(lireRegistre(base.sqlite)).toStrictEqual([]);
});

it('suppression_deja_inscrite_garde_la_premiere_date', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  // Le registre cite déjà cet identifiant (une base restaurée dont le registre a été rejoué).
  base.sqlite
    .prepare('insert into suppression (personne, supprime_le) values (?, ?)')
    .run(zoe.id, RECU_A);

  expect(supprimerPersonne(base, zoe.id, SUPPRIME_LE, avertir)).toBe('supprimee');

  expect(depot.personne(zoe.id)).toBeUndefined();
  expect(registre()).toStrictEqual([{ personne: zoe.id, supprime_le: RECU_A }]);
});

it('lire_registre_sans_table', () => {
  const ancienne = ouvrirBase(path.join(dossier, 'ancienne.sqlite'));
  try {
    appliquerMigrations(ancienne, migrationsJusqua(dossier, 3));

    // Une base d'avant la migration 0003 n'a pas de table `suppression`.
    expect(lireRegistre(ancienne.sqlite)).toStrictEqual([]);
  } finally {
    fermerBase(ancienne);
  }
});

it('lire_registre_rend_les_entrees_de_la_plus_ancienne_a_la_plus_recente', () => {
  const insertion = base.sqlite.prepare(
    'insert into suppression (personne, supprime_le) values (?, ?)',
  );
  insertion.run('personne-b', '2026-10-18T10:00:00.000Z');
  insertion.run('personne-c', '2026-10-17T10:00:00.000Z');
  insertion.run('personne-a', '2026-10-18T10:00:00.000Z');

  expect(lireRegistre(base.sqlite)).toStrictEqual([
    { personne: 'personne-c', supprimeLe: '2026-10-17T10:00:00.000Z' },
    { personne: 'personne-a', supprimeLe: '2026-10-18T10:00:00.000Z' },
    { personne: 'personne-b', supprimeLe: '2026-10-18T10:00:00.000Z' },
  ]);
});

it('rejouer_registre_efface_les_personnes_revenues', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const autre = creerCompte('Témoin-Max-2c9d', 'max', proprietaire, groupe);
  const avant = lignesSansRegistre();
  // Zoé est revenue avec une sauvegarde ; l'autre personne citée n'y était pas.
  const entrees = [
    { personne: zoe.id, supprimeLe: '2026-10-10T09:00:00.000Z' },
    { personne: 'personne-absente-de-la-sauvegarde', supprimeLe: '2026-10-11T09:00:00.000Z' },
  ];

  expect(rejouerRegistre(base, entrees, avertir)).toBe(1);

  expect(depot.personne(zoe.id)).toBeUndefined();
  expect(lignesSansRegistre()).toStrictEqual(sansLignesCitant(avant, zoe.id));
  expect(lignesCitant(lignesSansRegistre(), autre.id)).toStrictEqual(lignesCitant(avant, autre.id));
  // Chaque entrée est inscrite, y compris celle d'une personne que la base n'a plus.
  expect(lireRegistre(base.sqlite)).toStrictEqual(entrees);
  // Rejouer encore n'efface plus personne, ne double aucune entrée et n'échoue pas.
  expect(rejouerRegistre(base, entrees, avertir)).toBe(0);
  expect(lireRegistre(base.sqlite)).toStrictEqual(entrees);
  expect(avertissements).toEqual([]);
});

it('rejouer_registre_efface_les_octets_du_fichier', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const octets = Buffer.from(NOM);
  const wal = `${chemin}-wal`;
  expect(fichierContient(wal, octets)).toBe(true);

  rejouerRegistre(base, [{ personne: zoe.id, supprimeLe: '2026-10-10T09:00:00.000Z' }], avertir);

  expect(fichierContient(chemin, octets)).toBe(false);
  expect(fichierContient(wal, octets)).toBe(false);
  expect(avertissements).toEqual([]);
});

it('rejouer_registre_avertit_si_le_point_de_controle_est_incomplet', () => {
  const { proprietaire, groupe } = installer();
  const zoe = creerCompte(NOM, 'zoe', proprietaire, groupe);
  const entrees = [{ personne: zoe.id, supprimeLe: '2026-10-10T09:00:00.000Z' }];
  const liberer = retenirLeWal(base);
  try {
    expect(rejouerRegistre(base, entrees, avertir)).toBe(1);
    // Personne à effacer : pas de point de contrôle, donc pas de second avertissement.
    expect(rejouerRegistre(base, entrees, avertir)).toBe(0);
  } finally {
    liberer();
  }

  expect(depot.personne(zoe.id)).toBeUndefined();
  expect(avertissements).toEqual([POINT_DE_CONTROLE_INCOMPLET]);
  expect(avertissements[0]).not.toContain(zoe.id);
});

it('rejouer_un_registre_vide_ne_change_rien', () => {
  const { proprietaire, groupe } = installer();
  creerCompte(NOM, 'zoe', proprietaire, groupe);
  const avant = lignesSansRegistre();

  expect(rejouerRegistre(base, [], avertir)).toBe(0);

  expect(lignesSansRegistre()).toStrictEqual(avant);
  expect(lireRegistre(base.sqlite)).toStrictEqual([]);
});

it('compte_supprime_lu_dans_le_registre', () => {
  const vivante = depot.creerPersonne({
    nomAffiche: 'Lernende Test',
    langue: 'de',
    proprietaire: false,
  });
  const partie = depot.creerPersonne({
    nomAffiche: 'Partie Test',
    langue: 'de',
    proprietaire: false,
  });
  supprimerPersonne(base, partie.id, T0);

  expect(estSupprimee(base, partie.id)).toBe(true);
  expect(estSupprimee(base, vivante.id)).toBe(false);
  expect(estSupprimee(base, 'inconnue')).toBe(false);
  expect(estSupprimee(base, `${partie.id}, ${partie.id}`)).toBe(false);
});

it('compte_supprime_oublie_apres_la_purge', () => {
  const partie = depot.creerPersonne({
    nomAffiche: 'Partie Test',
    langue: 'de',
    proprietaire: false,
  });
  supprimerPersonne(base, partie.id, T0);
  expect(estSupprimee(base, partie.id)).toBe(true);

  purger(base, new Date(T0.getTime() + DUREE_REGISTRE_MS - 1), vi.fn());
  expect(estSupprimee(base, partie.id)).toBe(true);

  purger(base, new Date(T0.getTime() + DUREE_REGISTRE_MS), vi.fn());
  expect(estSupprimee(base, partie.id)).toBe(false);
});
