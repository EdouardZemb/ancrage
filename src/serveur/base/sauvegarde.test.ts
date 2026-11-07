import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { creerDepot } from '../comptes/depot.js';
import { creerDepotJournal } from '../journal/depot-journal.js';
import { reponseDeTest } from '../journal/evenements.fixture.js';
import { installerBasesDeTest } from './base.fixture.js';
import { appliquerMigrations, type Base, initialiserInstance, versionSchema } from './base.js';
import { compterLignes, sauvegarder, verifier } from './sauvegarde.js';
import { comptesDUneBaseNeuve, NOMBRE_DE_MIGRATIONS } from './schema.fixture.js';

let dossier: string;
const ouvrir = installerBasesDeTest((nouveau) => {
  dossier = nouveau;
});

function creerSource(): { base: Base; identifiant: string } {
  const base = ouvrir(path.join(dossier, 'source.sqlite'));
  appliquerMigrations(base);
  const identifiant = initialiserInstance(base);
  return { base, identifiant };
}

// Écrase 4 096 octets au milieu du fichier.
function corrompre(fichier: string): void {
  const descripteur = fs.openSync(fichier, 'r+');
  try {
    const milieu = Math.floor(fs.fstatSync(descripteur).size / 2);
    fs.writeSync(descripteur, Buffer.alloc(4096, 0xff), 0, 4096, milieu);
  } finally {
    fs.closeSync(descripteur);
  }
}

describe('compterLignes', () => {
  it('compte_chaque_table_avec_des_cles_triees', () => {
    const { base } = creerSource();
    base.sqlite.exec(
      'create table "zèbre" (a); create table "a""b" (a); insert into "a""b" values (1), (2);',
    );

    const comptes = compterLignes(base);

    // Les tables de la base neuve, plus les deux ajoutées ici : les clés sortent triées.
    const attendus = { ...comptesDUneBaseNeuve(), 'a"b': 2, zèbre: 0 };
    expect(comptes).toEqual(attendus);
    expect(Object.keys(comptes)).toEqual(Object.keys(attendus).sort());
  });

  it('ignore_les_tables_internes_de_sqlite', () => {
    const { base } = creerSource();
    // Une table AUTOINCREMENT crée `sqlite_sequence`.
    base.sqlite.exec('create table suite (id integer primary key autoincrement)');

    const tables = Object.keys(compterLignes(base));

    expect(tables).toContain('suite');
    expect(tables).not.toContain('sqlite_sequence');
  });
});

describe('sauvegarder', () => {
  it('sauvegarde_produit_une_copie_integre', () => {
    const { base, identifiant } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');

    const rapport = sauvegarder(base, destination);

    expect(rapport).toEqual({
      fichier: destination,
      integrite: 'ok',
      comptes: compterLignes(base),
      instance: identifiant,
      schema: versionSchema(base),
    });
    expect(rapport.comptes).toEqual(comptesDUneBaseNeuve());
    expect(fs.existsSync(destination)).toBe(true);
  });

  it('sauvegarde_conserve_le_journal_et_ses_numeros', () => {
    const { base } = creerSource();
    const cours = 'cm5r8t23';
    const comptes = creerDepot(base, () => new Date('2026-10-17T08:00:00.000Z'));
    const personne = comptes.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' }).id;
    const autre = comptes.creerPersonne({ nomAffiche: 'Andere Test', langue: 'de' }).id;
    const journal = creerDepotJournal(base);
    const recuA = '2026-10-17T08:00:05.000Z';
    // Les événements d'une autre personne s'intercalent : numéros et rangs ne se confondent pas.
    journal.ajouter(personne, [reponseDeTest(cours, 1)], recuA);
    journal.ajouter(autre, [reponseDeTest(cours, 7), reponseDeTest(cours, 8)], recuA);
    journal.ajouter(personne, [reponseDeTest(cours, 2), reponseDeTest(cours, 3)], recuA);
    const destination = path.join(dossier, 'copie.sqlite');

    const rapport = sauvegarder(base, destination);

    expect(rapport.comptes).toMatchObject({ evenement: 5, personne: 2 });
    expect(verifier(destination, rapport.comptes)).toMatchObject({ conforme: true, ecarts: [] });
    // Restaurée, la copie rend le même journal, avec les mêmes curseurs, et la numérotation
    // reprend où elle s'était arrêtée : aucun curseur déjà remis à un téléphone ne désigne un
    // autre événement.
    const restauree = creerDepotJournal(ouvrir(destination));
    const avant = journal.lire(personne, cours, 0, 1000);
    expect(avant.curseur).toBe(3);
    expect(restauree.lire(personne, cours, 0, 1000)).toStrictEqual(avant);
    restauree.ajouter(personne, [reponseDeTest(cours, 4)], '2026-10-17T08:10:00.000Z');
    const suite = restauree.lire(personne, cours, avant.curseur, 1000);
    expect(suite.evenements).toStrictEqual([reponseDeTest(cours, 4)]);
    expect(suite.curseur).toBe(4);
  });

  it('copie_plus_ancienne_restauree_le_curseur_recule', () => {
    const { base } = creerSource();
    const cours = 'cm5r8t23';
    const personne = creerDepot(base, () => new Date('2026-10-17T08:00:00.000Z')).creerPersonne({
      nomAffiche: 'Lernende Test',
      langue: 'de',
    }).id;
    const journal = creerDepotJournal(base);
    const recuA = '2026-10-17T08:00:05.000Z';
    journal.ajouter(personne, [reponseDeTest(cours, 1), reponseDeTest(cours, 2)], recuA);
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);
    // Après la sauvegarde, le téléphone lit trois événements de plus.
    journal.ajouter(
      personne,
      [3, 4, 5].map((n) => reponseDeTest(cours, n)),
      recuA,
    );
    const curseurDuTelephone = journal.lire(personne, cours, 0, 1000).curseur;

    const restauree = creerDepotJournal(ouvrir(destination));
    const page = restauree.lire(personne, cours, curseurDuTelephone, 1000);

    // La copie n'a que deux événements : le curseur rendu est plus petit que celui du téléphone.
    expect(curseurDuTelephone).toBe(5);
    expect(page).toStrictEqual({ evenements: [], curseur: 2, suite: false });
  });

  it('sauvegarde_refuse_d_ecraser', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);
    const avant = fs.readFileSync(destination);

    expect(() => sauvegarder(base, destination)).toThrow(`destination existante : ${destination}`);

    expect(fs.readFileSync(destination).equals(avant)).toBe(true);
  });

  it('sauvegarde_cree_le_dossier_de_destination', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'a', 'b', 'copie.sqlite');

    sauvegarder(base, destination);

    expect(fs.existsSync(destination)).toBe(true);
  });

  it('sauvegarde_ne_laisse_aucun_fichier_annexe', () => {
    const { base } = creerSource();

    sauvegarder(base, path.join(dossier, 'copie.sqlite'));

    expect(fs.readdirSync(dossier).filter((nom) => nom.startsWith('copie'))).toEqual([
      'copie.sqlite',
    ]);
  });

  it('sauvegarde_supprime_la_copie_inutilisable', () => {
    // Une base migrée mais sans identité d'instance : la copie est intègre mais inutilisable.
    const base = ouvrir(path.join(dossier, 'source.sqlite'));
    appliquerMigrations(base);
    const destination = path.join(dossier, 'copie.sqlite');

    expect(() => sauvegarder(base, destination)).toThrow('instance absente');

    expect(fs.existsSync(destination)).toBe(false);
  });
});

describe('verifier', () => {
  it('verifier_rapporte_la_copie_conforme', () => {
    const { base, identifiant } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    const sauvegarde = sauvegarder(base, destination);

    const rapport = verifier(destination, sauvegarde.comptes);

    expect(rapport).toEqual({
      integrite: 'ok',
      comptes: sauvegarde.comptes,
      instance: identifiant,
      schema: NOMBRE_DE_MIGRATIONS,
      conforme: true,
      ecarts: [],
    });
  });

  it('verifier_sans_attendu_se_limite_a_l_integrite', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);

    expect(verifier(destination).conforme).toBe(true);
  });

  it('verifier_tolere_les_tables_en_plus', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);

    const rapport = verifier(destination, { instance: 1 });

    expect(rapport.conforme).toBe(true);
    expect(rapport.ecarts).toEqual([]);
  });

  it('verifier_detecte_un_ecart_de_comptes', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);

    const rapport = verifier(destination, { instance: 2 });

    expect(rapport.conforme).toBe(false);
    expect(rapport.ecarts).toEqual(['instance : 1 au lieu de 2']);
  });

  it('verifier_detecte_une_table_absente', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);

    const rapport = verifier(destination, { instance: 1, progression: 4 });

    expect(rapport.conforme).toBe(false);
    expect(rapport.ecarts).toEqual(['progression : absente au lieu de 4']);
  });

  it('verifier_detecte_un_fichier_corrompu', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    const sauvegarde = sauvegarder(base, destination);
    corrompre(destination);

    // Les deux issues sont acceptées : un rapport non conforme, ou une erreur d'ouverture.
    let conforme: boolean;
    try {
      conforme = verifier(destination, sauvegarde.comptes).conforme;
    } catch {
      conforme = false;
    }

    expect(conforme).toBe(false);
  });

  it('verifier_rapporte_une_corruption_sans_lever', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);
    corrompre(destination);

    const rapport = verifier(destination, { instance: 1 });

    expect(rapport.conforme).toBe(false);
    expect(rapport.integrite).not.toBe('ok');
  });

  it('verifier_rapporte_un_fichier_qui_n_est_pas_une_base', () => {
    const fichier = path.join(dossier, 'pas-une-base.sqlite');
    fs.writeFileSync(fichier, Buffer.alloc(8192, 0x41));

    const rapport = verifier(fichier);

    expect(rapport).toMatchObject({ conforme: false, comptes: {}, ecarts: [] });
    expect(rapport.integrite).toMatch(/not a database/);
  });

  it('verifier_ne_cree_aucun_fichier_annexe', () => {
    const { base } = creerSource();
    const destination = path.join(dossier, 'copie.sqlite');
    sauvegarder(base, destination);

    verifier(destination);

    expect(fs.readdirSync(dossier).filter((nom) => nom.startsWith('copie'))).toEqual([
      'copie.sqlite',
    ]);
  });

  it('verifier_refuse_un_fichier_absent', () => {
    expect(() => verifier(path.join(dossier, 'absent.sqlite'))).toThrow();
    expect(fs.existsSync(path.join(dossier, 'absent.sqlite'))).toBe(false);
  });
});
