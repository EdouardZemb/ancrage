import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installerBasesDeTest } from './base.fixture.js';
import { appliquerMigrations, fermerBase, ouvrirBase } from './base.js';
import {
  DOSSIER_MIGRATIONS,
  ecrireJournal,
  instantane,
  lireJournal,
  NOMBRE_DE_MIGRATIONS,
  verifierAdditivite,
} from './schema.fixture.js';

// Les instructions d'une migration se séparent par ce marqueur, comme dans celles de drizzle-kit.
const SEPARATEUR = '\n--> statement-breakpoint\n';
const MIGRATION_ESSAI = 'CREATE TABLE `essai` (`id` text PRIMARY KEY NOT NULL);';

// Les versions dont on éprouve le passage à la suivante : de la première à l'avant-dernière.
const versions = Array.from({ length: NOMBRE_DE_MIGRATIONS - 1 }, (_, i) => i + 1);

let dossier: string;

installerBasesDeTest((nouveau) => {
  dossier = nouveau;
});

/** Une migration faite de ces instructions, séparées comme celles de drizzle-kit. */
function migration(...instructions: string[]): string {
  return instructions.join(SEPARATEUR);
}

/**
 * Le registre des suppressions (sans clé étrangère, et que nulle table ne référence) recréé sous un
 * autre nom puis renommé : une migration que le dossier des vraies migrations s'interdit (DROP et
 * RENAME), éprouvée ici sur une copie seulement. `colonnes` et `valeurs` font varier la table
 * recréée, qui garde sa clé `personne`.
 */
function recreerLeRegistre(colonnes: string, valeurs: string): string {
  return migration(
    `CREATE TABLE \`suppression_neuve\` (\`personne\` text PRIMARY KEY NOT NULL, ${colonnes});`,
    `INSERT INTO \`suppression_neuve\` SELECT \`personne\`, ${valeurs} FROM \`suppression\`;`,
    'DROP TABLE `suppression`;',
    'ALTER TABLE `suppression_neuve` RENAME TO `suppression`;',
  );
}

/**
 * Une copie des migrations, dans `<dossier>/copie`, avec une migration de plus par élément de
 * `sqls`. Renvoie le dossier de la copie.
 */
function copierAvecDesMigrations(...sqls: string[]): string {
  const copie = path.join(dossier, 'copie');
  fs.cpSync(DOSSIER_MIGRATIONS, copie, { recursive: true });
  const journal = lireJournal(copie);
  for (const sql of sqls) {
    const derniere = journal.entries[journal.entries.length - 1];
    if (derniere === undefined) {
      throw new Error('le journal des migrations est vide');
    }
    const idx = journal.entries.length;
    const tag = `${String(idx).padStart(4, '0')}_essai`;
    fs.writeFileSync(path.join(copie, `${tag}.sql`), sql);
    // Drizzle n'applique que les entrées dont `when` suit celui de la dernière migration
    // appliquée : la copie en prend un de plus, comme le ferait `drizzle-kit generate`.
    journal.entries.push({
      idx,
      version: derniere.version,
      when: derniere.when + 1,
      tag,
      breakpoints: true,
    });
  }
  ecrireJournal(copie, journal);
  return copie;
}

/** Les migrations `sqls` ajoutées aux vraies : l'additivité, éprouvée à la version `n`, échoue. */
function verifierQuIlEchoue(sqls: string[], n: number, motif: RegExp): void {
  const copie = copierAvecDesMigrations(...sqls);

  expect(() => verifierAdditivite(dossier, n, copie)).toThrow(motif);
}

describe('migrations (1f-D7)', () => {
  it.each(versions)('migrations_apres_la_version_%i_additives', (n) => {
    verifierAdditivite(dossier, n);
  });

  it('une_migration_de_plus_ne_demande_aucune_retouche', () => {
    // Une migration ajoutée plus tard, ici une table : les tests des versions précédentes passent
    // sans retouche, et la sienne est éprouvée sans rien écrire.
    const copie = copierAvecDesMigrations(MIGRATION_ESSAI);

    for (let n = 1; n <= NOMBRE_DE_MIGRATIONS; n++) {
      verifierAdditivite(dossier, n, copie);
    }
  });

  it('colonnes_index_vues_et_declencheurs_ajoutes_sont_additifs', () => {
    // Ce que l'image précédente ne voit pas : une colonne facultative, une colonne avec un défaut,
    // un index non unique sur une table existante, une vue, une table nouvelle et son déclencheur,
    // un index UNIQUE sur une colonne nouvelle et facultative. Les lignes d'avant sont comparées
    // sur leurs colonnes d'avant.
    const copie = copierAvecDesMigrations(
      migration(
        'ALTER TABLE `personne` ADD COLUMN `essai` text;',
        "ALTER TABLE `personne` ADD COLUMN `essai_defaut` text NOT NULL DEFAULT 'x';",
        'CREATE INDEX `essai_autorisation_cours` ON `autorisation` (`cours`);',
        'CREATE VIEW `essai_vue` AS SELECT `id` FROM `personne`;',
        MIGRATION_ESSAI,
        'CREATE TRIGGER `essai_declencheur` AFTER INSERT ON `essai` BEGIN SELECT 1; END;',
        'ALTER TABLE `personne` ADD COLUMN `essai_unique` text;',
        'CREATE UNIQUE INDEX `essai_personne_unique` ON `personne` (`essai_unique`);',
      ),
    );

    for (let n = 1; n <= NOMBRE_DE_MIGRATIONS; n++) {
      verifierAdditivite(dossier, n, copie);
    }
  });

  it('une_table_que_rien_ne_remplit_fait_echouer', () => {
    // À la version suivante, `essai` existe déjà avant de migrer, et `peuplerLaBase` ne la remplit
    // pas : l'auteur d'une migration qui ajoute une table étend `peuplerLaBase`.
    verifierQuIlEchoue(
      [MIGRATION_ESSAI],
      NOMBRE_DE_MIGRATIONS + 1,
      /table vide avant de migrer : essai/,
    );
  });

  it('une_table_apparue_non_vide_fait_echouer', () => {
    verifierQuIlEchoue(
      [migration(MIGRATION_ESSAI, "INSERT INTO `essai` (`id`) VALUES ('x');")],
      NOMBRE_DE_MIGRATIONS,
      /table apparue non vide : essai/,
    );
  });

  it('une_colonne_modifiee_fait_echouer', () => {
    verifierQuIlEchoue(
      [recreerLeRegistre('`supprime_le` integer NOT NULL', '`supprime_le`')],
      NOMBRE_DE_MIGRATIONS,
      /colonne retirée ou modifiée : suppression\.supprime_le/,
    );
  });

  it('une_colonne_retiree_fait_echouer', () => {
    verifierQuIlEchoue(
      [recreerLeRegistre('`autre` text NOT NULL', "'x'")],
      NOMBRE_DE_MIGRATIONS,
      /colonne retirée ou modifiée : suppression\.supprime_le/,
    );
  });

  it('une_colonne_nouvelle_obligatoire_fait_echouer', () => {
    // Les colonnes d'avant sont intactes, mais l'image précédente ne sait pas écrire `raison`.
    verifierQuIlEchoue(
      [
        recreerLeRegistre(
          '`supprime_le` text NOT NULL, `raison` text NOT NULL',
          "`supprime_le`, 'x'",
        ),
      ],
      NOMBRE_DE_MIGRATIONS,
      /colonne nouvelle ni facultative ni avec un défaut : suppression\.raison/,
    );
  });

  it('un_index_retire_fait_echouer', () => {
    verifierQuIlEchoue(
      ['DROP INDEX `groupe_nom_unique`;'],
      NOMBRE_DE_MIGRATIONS,
      /index retiré ou modifié : groupe\.groupe_nom_unique/,
    );
  });

  it('un_index_modifie_fait_echouer', () => {
    verifierQuIlEchoue(
      [
        migration(
          'DROP INDEX `groupe_nom_unique`;',
          'CREATE INDEX `groupe_nom_unique` ON `groupe` (`nom`);',
        ),
      ],
      NOMBRE_DE_MIGRATIONS,
      /index retiré ou modifié : groupe\.groupe_nom_unique/,
    );
  });

  it('une_vue_modifiee_fait_echouer', () => {
    // La vue est créée par une première migration, puis redéfinie par la seconde.
    verifierQuIlEchoue(
      [
        'CREATE VIEW `essai_vue` AS SELECT `id` FROM `personne`;',
        migration(
          'DROP VIEW `essai_vue`;',
          'CREATE VIEW `essai_vue` AS SELECT `id`, `nom_affiche` FROM `personne`;',
        ),
      ],
      NOMBRE_DE_MIGRATIONS + 1,
      /vue ou déclencheur retiré ou modifié : essai_vue/,
    );
  });

  it('un_declencheur_retire_fait_echouer', () => {
    verifierQuIlEchoue(
      [
        'CREATE TRIGGER `essai_declencheur` AFTER INSERT ON `suppression` BEGIN SELECT 1; END;',
        'DROP TRIGGER `essai_declencheur`;',
      ],
      NOMBRE_DE_MIGRATIONS + 1,
      /vue ou déclencheur retiré ou modifié : essai_declencheur/,
    );
  });

  it('un_index_unique_sur_une_colonne_d_avant_fait_echouer', () => {
    // L'image précédente peut écrire deux noms affichés égaux : l'index refuserait son écriture.
    verifierQuIlEchoue(
      ['CREATE UNIQUE INDEX `essai_nom_unique` ON `personne` (`nom_affiche`);'],
      NOMBRE_DE_MIGRATIONS,
      /index unique nouveau sur une colonne d'avant : personne\.essai_nom_unique/,
    );
  });

  it('un_index_unique_sur_une_expression_fait_echouer', () => {
    // Une expression peut porter sur une colonne d'avant : par prudence, elle compte comme telle.
    verifierQuIlEchoue(
      ['CREATE UNIQUE INDEX `essai_expression_unique` ON `personne` (lower(`nom_affiche`));'],
      NOMBRE_DE_MIGRATIONS,
      /index unique nouveau sur une colonne d'avant : personne\.essai_expression_unique/,
    );
  });

  it('un_declencheur_sur_une_table_d_avant_fait_echouer', () => {
    // Le déclencheur peut refuser une écriture de l'image précédente.
    verifierQuIlEchoue(
      [
        "CREATE TRIGGER `essai_refus` BEFORE INSERT ON `evenement` BEGIN SELECT RAISE(ABORT, 'non'); END;",
      ],
      NOMBRE_DE_MIGRATIONS,
      /déclencheur nouveau sur une table d'avant : evenement\.essai_refus/,
    );
  });

  it('des_lignes_retirees_font_echouer', () => {
    verifierQuIlEchoue(
      ['DELETE FROM `suppression`;'],
      NOMBRE_DE_MIGRATIONS,
      /lignes modifiées : suppression/,
    );
  });

  it('des_lignes_modifiees_font_echouer', () => {
    verifierQuIlEchoue(
      ["UPDATE `suppression` SET `supprime_le` = '2026-01-01T00:00:00.000Z';"],
      NOMBRE_DE_MIGRATIONS,
      /lignes modifiées : suppression/,
    );
  });

  it('instantane_d_une_liste_vide', () => {
    const base = ouvrirBase(path.join(dossier, 'x.sqlite'));
    try {
      appliquerMigrations(base);

      const vide = instantane(base.sqlite, { tables: [], migrations: 2 });

      expect(vide.objets).toStrictEqual([]);
      expect(vide.lignes).toStrictEqual({});
      expect(vide.migrations).toHaveLength(2);
    } finally {
      fermerBase(base);
    }
  });

  it('aucune_migration_ne_supprime_ni_ne_renomme', () => {
    const fichiers = fs.readdirSync(DOSSIER_MIGRATIONS).filter((nom) => nom.endsWith('.sql'));

    // Le garde ne joue pas dans le vide : il voit toutes les migrations.
    expect(fichiers).toHaveLength(NOMBRE_DE_MIGRATIONS);
    for (const fichier of fichiers) {
      const sql = fs.readFileSync(path.join(DOSSIER_MIGRATIONS, fichier), 'utf8');
      expect(sql, fichier).not.toMatch(/\bDROP\b/i);
      expect(sql, fichier).not.toMatch(/\bRENAME\b/i);
    }
  });
});
