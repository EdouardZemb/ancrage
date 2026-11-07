import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exempleDeCours, modifier } from '../domaine/contenu/exemple.fixture.js';
import {
  appliquerMigrations,
  type Base,
  fermerBase,
  initialiserInstance,
  ouvrirBase,
  tableExiste,
} from './base/base.js';
import type { RapportSauvegarde, RapportVerification } from './base/sauvegarde.js';
import {
  comptesDUneBaseNeuve,
  migrationsJusqua,
  NOMBRE_DE_MIGRATIONS,
} from './base/schema.fixture.js';
import { espionnerLesTransactions } from './base/wal.fixture.js';
import { executer } from './cli.js';
import { creerDepot, type Depot } from './comptes/depot.js';
import { empreinte } from './comptes/jetons.js';
import { jetonDuLien } from './comptes/liens.fixture.js';
import { rejouerRegistre, supprimerPersonne } from './comptes/suppression.js';
import {
  creerDepotTemporaire,
  dossierDuContenu,
  supprimerDepotsTemporaires,
} from './contenus/depot-temporaire.fixture.js';

// `rejouerRegistre` garde son vrai comportement ; un test lui fait rendre, une fois, un nombre qui
// n'est pas un entier, pour prouver que le rapport du rejeu par dossiers n'en sort pas.
vi.mock('./comptes/suppression.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./comptes/suppression.js')>();
  return { ...original, rejouerRegistre: vi.fn(original.rejouerRegistre) };
});

const URL_PUBLIQUE = 'https://ancrage.example';
// La forme des liens d'amorçage que la commande écrit : l'adresse publique, l'écran et un jeton de
// 43 caractères. `jetonDuLien` la contrôle en lisant le jeton.
const INVITATION_ATTENDUE = { ecran: 'invitation', origine: URL_PUBLIQUE } as const;
const CONNEXION_ATTENDUE = { ecran: 'lien', origine: URL_PUBLIQUE } as const;
const UN_JOUR_MS = 24 * 60 * 60 * 1000;
const INSTANT = new Date('2026-10-16T08:00:00.000Z');

let dossier: string;
let source: string;

async function lancer(...argv: string[]): Promise<{ code: number; lignes: string[] }> {
  const lignes: string[] = [];
  const code = await executer(argv, (ligne) => lignes.push(ligne));
  return { code, lignes };
}

/** Ouvre la base de test le temps de `action`, pour y préparer un état ou le relire. */
function avecDepot<T>(action: (depot: Depot, base: Base) => T, chemin: string = source): T {
  const base = ouvrirBase(chemin);
  try {
    return action(
      creerDepot(base, () => new Date()),
      base,
    );
  } finally {
    fermerBase(base);
  }
}

function nombreDeLiens(): number {
  return avecDepot((_, base) => {
    const ligne = base.sqlite.prepare('select count(*) as n from lien').get() as { n: number };
    return ligne.n;
  });
}

/** Aucun fichier du dossier de test (base, journal WAL…) ne contient le jeton en clair. */
function exigerJetonAbsentDesFichiers(jeton: string): void {
  for (const nom of fs.readdirSync(dossier, { recursive: true, withFileTypes: true })) {
    if (nom.isFile()) {
      const contenu = fs.readFileSync(path.join(nom.parentPath, nom.name));
      expect(contenu.includes(jeton)).toBe(false);
    }
  }
}

beforeEach(() => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-'));
  source = path.join(dossier, 'source.sqlite');
  const base = ouvrirBase(source);
  try {
    appliquerMigrations(base);
    initialiserInstance(base);
  } finally {
    fermerBase(base);
  }
  vi.stubEnv('ANCRAGE_BASE', source);
  vi.stubEnv('ANCRAGE_URL_PUBLIQUE', URL_PUBLIQUE);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  fs.rmSync(dossier, { recursive: true, force: true });
});

describe('executer', () => {
  it('cli_usage_inconnu_64', async () => {
    const { code, lignes } = await lancer('restaurer', 'x');

    expect(code).toBe(64);
    expect(lignes.join('\n')).toContain('usage');
  });

  it('cli_sans_argument_64', async () => {
    expect((await lancer()).code).toBe(64);
  });

  it('cli_arguments_mal_formes_64', async () => {
    expect((await lancer('sauvegarder')).code).toBe(64);
    expect((await lancer('sauvegarder', 'a', 'b')).code).toBe(64);
    expect((await lancer('verifier')).code).toBe(64);
    expect((await lancer('verifier', 'a', '--inconnue')).code).toBe(64);
    expect((await lancer('verifier', 'a', '--comptes')).code).toBe(64);
    expect((await lancer('proprietaire', 'a')).code).toBe(64);
    expect((await lancer('secours-proprietaire', 'a')).code).toBe(64);
  });

  it('cli_usage_decrit_le_rejeu_du_registre', async () => {
    const { lignes } = await lancer();

    expect(lignes.join('\n')).toMatch(/^ {2}rejouer-suppressions <cible> --depuis <source> /m);
  });

  it('cli_usage_decrit_le_rejeu_par_dossiers_et_son_rapport', async () => {
    const usage = (await lancer()).lignes.join('\n');

    expect(usage).toMatch(/^ {2}rejouer-suppressions --dossiers <source> <cible> /m);
    expect(usage).toContain('{"entrees_registre":n,"comptes_effaces":m}');
    expect(usage).toContain('sans compte');
  });

  it('cli_usage_decrit_les_commandes_d_amorcage', async () => {
    const { lignes } = await lancer();

    expect(lignes.join('\n')).toContain('secours-proprietaire');
    expect(lignes.join('\n')).toMatch(/^ {2}proprietaire /m);
  });

  it('cli_sauvegarder_puis_verifier_0', async () => {
    const copie = path.join(dossier, 'copie.sqlite');

    const sauvegarde = await lancer('sauvegarder', copie);

    expect(sauvegarde.code).toBe(0);
    expect(sauvegarde.lignes).toHaveLength(1);
    const rapport = JSON.parse(sauvegarde.lignes[0] ?? '') as RapportSauvegarde;
    expect(rapport).toMatchObject({
      fichier: copie,
      integrite: 'ok',
      comptes: comptesDUneBaseNeuve(),
      schema: NOMBRE_DE_MIGRATIONS,
    });
    const comptes = `${copie}.comptes.json`;
    expect(fs.existsSync(comptes)).toBe(true);
    expect(JSON.parse(fs.readFileSync(comptes, 'utf8'))).toEqual(rapport);

    const verification = await lancer('verifier', copie, '--comptes', comptes);

    expect(verification.code).toBe(0);
    expect(verification.lignes).toHaveLength(1);
    expect(JSON.parse(verification.lignes[0] ?? '')).toEqual({
      integrite: 'ok',
      comptes: rapport.comptes,
      instance: rapport.instance,
      schema: NOMBRE_DE_MIGRATIONS,
      conforme: true,
      ecarts: [],
    });
  });

  it('cli_verifier_sans_comptes_0', async () => {
    const copie = path.join(dossier, 'copie.sqlite');
    await lancer('sauvegarder', copie);

    expect((await lancer('verifier', copie)).code).toBe(0);
  });

  it('cli_verifier_non_conforme_2', async () => {
    const copie = path.join(dossier, 'copie.sqlite');
    await lancer('sauvegarder', copie);
    const comptes = path.join(dossier, 'attendu.json');
    fs.writeFileSync(comptes, JSON.stringify({ comptes: { instance: 2 } }));

    const { code, lignes } = await lancer('verifier', copie, '--comptes', comptes);

    expect(code).toBe(2);
    expect(lignes).toHaveLength(1);
    const rapport = JSON.parse(lignes[0] ?? '') as RapportVerification;
    expect(rapport.conforme).toBe(false);
    expect(rapport.ecarts).toEqual(['instance : 1 au lieu de 2']);
  });

  it('cli_sauvegarder_refuse_d_ecraser_1', async () => {
    const copie = path.join(dossier, 'copie.sqlite');
    await lancer('sauvegarder', copie);

    const { code, lignes } = await lancer('sauvegarder', copie);

    expect(code).toBe(1);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain(`destination existante : ${copie}`);
  });

  it('cli_sauvegarder_base_absente_1_sans_la_creer', async () => {
    vi.stubEnv('ANCRAGE_BASE', path.join(dossier, 'absente.sqlite'));

    const { code, lignes } = await lancer('sauvegarder', path.join(dossier, 'copie.sqlite'));

    expect(code).toBe(1);
    expect(lignes).toHaveLength(1);
    expect(fs.existsSync(path.join(dossier, 'absente.sqlite'))).toBe(false);
    expect(fs.existsSync(path.join(dossier, 'copie.sqlite'))).toBe(false);
  });

  it('cli_verifier_fichier_absent_1', async () => {
    const { code, lignes } = await lancer('verifier', path.join(dossier, 'absent.sqlite'));

    expect(code).toBe(1);
    expect(lignes).toHaveLength(1);
  });

  it('cli_verifier_comptes_illisibles_1', async () => {
    const copie = path.join(dossier, 'copie.sqlite');
    await lancer('sauvegarder', copie);
    const comptes = path.join(dossier, 'attendu.json');
    fs.writeFileSync(comptes, '{"instance": 1}');

    const { code, lignes } = await lancer('verifier', copie, '--comptes', comptes);

    expect(code).toBe(1);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain(comptes);
  });

  describe('sauvegarde sur un dossier (forme de /donnees)', () => {
    let sortie: string;

    beforeEach(() => {
      sortie = path.join(dossier, 'sortie', 'donnees');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const base = (): string => path.join(sortie, 'ancrage.sqlite');
    const comptes = (): string => `${base()}.comptes.json`;

    it('sauvegarde dans un dossier', async () => {
      const { code, lignes } = await lancer('sauvegarder', sortie);

      expect(code).toBe(0);
      expect(lignes).toHaveLength(1);
      const rapport = JSON.parse(lignes[0] ?? '') as RapportSauvegarde;
      expect(rapport).toMatchObject({
        fichier: base(),
        integrite: 'ok',
        comptes: comptesDUneBaseNeuve(),
        schema: NOMBRE_DE_MIGRATIONS,
      });
      // Le dossier est créé, et il n'a que la forme de /donnees : la base et ses comptes.
      expect(fs.readdirSync(sortie).sort()).toEqual([
        'ancrage.sqlite',
        'ancrage.sqlite.comptes.json',
      ]);
      expect(JSON.parse(fs.readFileSync(comptes(), 'utf8'))).toEqual(rapport);
    });

    it('sauvegarde dans un dossier existant et vide', async () => {
      fs.mkdirSync(sortie, { recursive: true });

      expect((await lancer('sauvegarder', sortie)).code).toBe(0);
      expect(fs.existsSync(base())).toBe(true);
    });

    it('sauvegarde dans un dossier refuse d écraser, et ne crée rien si la base manque', async () => {
      await lancer('sauvegarder', sortie);
      const avant = fs.readFileSync(base());

      const { code, lignes } = await lancer('sauvegarder', sortie);

      expect(code).toBe(1);
      expect(lignes).toEqual([`destination existante : ${base()}`]);
      expect(fs.readFileSync(base()).equals(avant)).toBe(true);

      vi.stubEnv('ANCRAGE_BASE', path.join(dossier, 'absente.sqlite'));
      const neuf = path.join(dossier, 'neuf');
      expect((await lancer('sauvegarder', neuf)).code).toBe(1);
      expect(fs.existsSync(neuf)).toBe(false);
    });

    /** Fait échouer l'écriture des comptes seule : la base, elle, est déjà écrite et réservée. */
    function faireEchouerLesComptes(): void {
      const ecrire = fs.writeFileSync.bind(fs);
      vi.spyOn(fs, 'writeFileSync').mockImplementation((fichier, ...reste) => {
        if (String(fichier).endsWith('.comptes.json')) {
          throw new Error('disque plein');
        }
        return ecrire(fichier, ...reste);
      });
    }

    it('un dossier créé est en 0700, un dossier existant garde son mode', async () => {
      const mkdir = vi.spyOn(fs, 'mkdirSync');

      expect((await lancer('sauvegarder', sortie)).code).toBe(0);

      expect(mkdir).toHaveBeenCalledWith(sortie, { mode: 0o700 });
      // Les droits POSIX n'existent pas sous Windows ; le masque (umask) ne doit rien en retirer.
      if (process.platform !== 'win32') {
        expect(fs.statSync(sortie).mode & 0o777).toBe(0o700);
      }
      const existant = path.join(dossier, 'existant');
      fs.mkdirSync(existant);
      fs.chmodSync(existant, 0o755);
      await lancer('sauvegarder', existant);
      if (process.platform !== 'win32') {
        expect(fs.statSync(existant).mode & 0o777).toBe(0o755);
      }
    });

    it('un échec après la réservation retire le dossier que cet appel a créé', async () => {
      faireEchouerLesComptes();

      const { code, lignes } = await lancer('sauvegarder', sortie);

      expect(code).toBe(1);
      expect(lignes).toEqual(['disque plein']);
      expect(fs.existsSync(sortie)).toBe(false);
    });

    it('un échec dans un dossier existant retire ce que cet appel a écrit, et rien d autre', async () => {
      fs.mkdirSync(sortie, { recursive: true });
      const autre = path.join(sortie, 'autre.txt');
      fs.writeFileSync(autre, 'à moi');
      faireEchouerLesComptes();

      expect((await lancer('sauvegarder', sortie)).code).toBe(1);

      expect(fs.readdirSync(sortie)).toEqual(['autre.txt']);
      expect(fs.readFileSync(autre, 'utf8')).toBe('à moi');
      // Rien ne reste : on peut recommencer dans le même dossier.
      vi.restoreAllMocks();
      expect((await lancer('sauvegarder', sortie)).code).toBe(0);
    });

    it('vérification d un dossier absent rend 2, et 64 avec --comptes', async () => {
      const absent = path.join(dossier, 'absent');

      const { code, lignes } = await lancer('verifier', absent);

      expect(code).toBe(2);
      expect((JSON.parse(lignes[0] ?? '') as RapportVerification).ecarts).toEqual([
        'ancrage.sqlite absent',
      ]);
      expect((await lancer('verifier', absent, '--comptes', comptes())).code).toBe(64);
    });

    it('vérification d un dossier conforme rend 0', async () => {
      await lancer('sauvegarder', sortie);

      const { code, lignes } = await lancer('verifier', sortie);

      expect(code).toBe(0);
      expect(lignes).toHaveLength(1);
      expect(JSON.parse(lignes[0] ?? '')).toMatchObject({
        integrite: 'ok',
        comptes: comptesDUneBaseNeuve(),
        conforme: true,
        ecarts: [],
      });
    });

    it('vérification d un dossier non conforme rend 2', async () => {
      await lancer('sauvegarder', sortie);
      fs.writeFileSync(comptes(), JSON.stringify({ comptes: { instance: 2 } }));

      const { code, lignes } = await lancer('verifier', sortie);

      expect(code).toBe(2);
      expect((JSON.parse(lignes[0] ?? '') as RapportVerification).ecarts).toEqual([
        'instance : 1 au lieu de 2',
      ]);
    });

    it('vérification d un dossier sans base ou sans comptes rend 2', async () => {
      fs.mkdirSync(sortie, { recursive: true });
      const sansBase = await lancer('verifier', sortie);
      expect(sansBase.code).toBe(2);
      expect(sansBase.lignes).toHaveLength(1);
      expect(JSON.parse(sansBase.lignes[0] ?? '')).toMatchObject({ conforme: false });

      await lancer('sauvegarder', path.join(sortie, 'sous-dossier'));
      fs.copyFileSync(path.join(sortie, 'sous-dossier', 'ancrage.sqlite'), base());
      const sansComptes = await lancer('verifier', sortie);
      expect(sansComptes.code).toBe(2);
      expect((JSON.parse(sansComptes.lignes[0] ?? '') as RapportVerification).ecarts).toEqual([
        'ancrage.sqlite.comptes.json absent',
      ]);
    });

    it('usage invalide rend 64', async () => {
      await lancer('sauvegarder', sortie);

      // Les comptes d'un dossier sont dans le dossier : `--comptes` n'a pas de sens.
      expect((await lancer('verifier', sortie, '--comptes', comptes())).code).toBe(64);
      expect((await lancer('verifier', sortie, sortie)).code).toBe(64);
      expect((await lancer('sauvegarder', sortie, 'autre')).code).toBe(64);
    });

    it('les anciennes formes inchangées', async () => {
      const copie = path.join(dossier, 'copie.sqlite');

      // Un chemin en `.sqlite` reste un fichier, avec ses comptes à côté.
      expect((await lancer('sauvegarder', copie)).code).toBe(0);
      expect(fs.statSync(copie).isFile()).toBe(true);
      expect(fs.statSync(`${copie}.comptes.json`).isFile()).toBe(true);
      expect((await lancer('verifier', copie, '--comptes', `${copie}.comptes.json`)).code).toBe(0);
      expect((await lancer('verifier', copie)).code).toBe(0);
      expect((await lancer('verifier', path.join(dossier, 'absent.sqlite'))).code).toBe(1);
    });
  });

  describe('rejeu du registre des suppressions', () => {
    let cible: string;

    beforeEach(() => {
      cible = path.join(dossier, 'cible.sqlite');
    });

    function identifiants(chemin: string): string[] {
      return avecDepot((depot) => depot.personnes().map((personne) => personne.id), chemin).sort();
    }

    function registre(chemin: string): { personne: string; supprime_le: string }[] {
      return avecDepot(
        (_, base) =>
          base.sqlite
            .prepare('select personne, supprime_le from suppression order by personne')
            .all() as { personne: string; supprime_le: string }[],
        chemin,
      );
    }

    /**
     * Trois personnes, un instantané qui les a toutes, puis deux suppressions dans la base source.
     * `migrationsDeLInstantane` : le dossier de migrations d'un instantané plus ancien que la base
     * source (voir `migrationsJusqua`) ; sans lui, l'instantané est une copie de la source.
     */
    function preparerUneRestauration(migrationsDeLInstantane?: string): {
      supprimees: string[];
      restante: string;
    } {
      const noms = ['Testa Test', 'Berta Test', 'Clara Test'];
      const [a, b, c] = noms.map(() => randomUUID()) as [string, string, string];
      const peupler = (base: Base): void => {
        const depot = creerDepot(base, () => new Date());
        for (const [i, nomAffiche] of noms.entries()) {
          depot.creerPersonne({ id: [a, b, c][i], nomAffiche, langue: 'de' });
        }
      };
      avecDepot((_, base) => peupler(base));
      if (migrationsDeLInstantane === undefined) {
        fs.copyFileSync(source, cible);
      } else {
        const ancienne = ouvrirBase(cible);
        try {
          appliquerMigrations(ancienne, migrationsDeLInstantane);
          peupler(ancienne);
        } finally {
          fermerBase(ancienne);
        }
      }
      avecDepot((_, base) => {
        supprimerPersonne(base, a, INSTANT);
        supprimerPersonne(base, b, new Date(INSTANT.getTime() + UN_JOUR_MS));
      });
      return { supprimees: [a, b], restante: c };
    }

    it('rejouer_suppressions_efface_et_inscrit', async () => {
      const { supprimees, restante } = preparerUneRestauration();
      expect(identifiants(cible)).toHaveLength(3);

      const { code, lignes } = await lancer('rejouer-suppressions', cible, '--depuis', source);

      expect(code).toBe(0);
      expect(lignes).toEqual(['{"registre":2,"effaces":2}']);
      // Aucun identifiant dans la sortie (1e-D10) : des nombres seulement.
      for (const personne of supprimees) {
        expect(lignes[0]).not.toContain(personne);
      }
      expect(identifiants(cible)).toEqual([restante]);
      expect(registre(cible)).toEqual(
        registre(source).map(({ personne, supprime_le }) => ({ personne, supprime_le })),
      );
      expect(registre(cible).map((entree) => entree.personne)).toEqual([...supprimees].sort());
      // La source n'est que lue.
      expect(identifiants(source)).toEqual([restante]);
    });

    it('rejouer_suppressions_est_sans_effet_au_second_passage', async () => {
      preparerUneRestauration();
      await lancer('rejouer-suppressions', cible, '--depuis', source);

      const { code, lignes } = await lancer('rejouer-suppressions', cible, '--depuis', source);

      expect(code).toBe(0);
      expect(lignes).toEqual(['{"registre":2,"effaces":0}']);
      expect(registre(cible)).toHaveLength(2);
    });

    it('rejouer_suppressions_source_sans_table', async () => {
      // Une base d'avant la migration 0003 : pas de table `suppression`.
      const ancienne = path.join(dossier, 'ancienne.sqlite');
      const vieille = new Database(ancienne);
      vieille.exec('create table personne (id text primary key)');
      vieille.close();
      fs.copyFileSync(source, cible);
      avecDepot((depot) => depot.creerPersonne({ nomAffiche: 'Testa Test', langue: 'de' }), cible);

      const { code, lignes } = await lancer('rejouer-suppressions', cible, '--depuis', ancienne);

      expect(code).toBe(0);
      expect(lignes).toEqual(['{"registre":0,"effaces":0}']);
      expect(identifiants(cible)).toHaveLength(1);
    });

    it('rejouer_suppressions_migre_la_cible', async () => {
      // Un instantané d'avant la migration 0003 (celle de la table `suppression`) la reçoit, puis le
      // registre. Les migrations d'après 0003 ne changent rien à ce test : l'instantané est monté
      // avec les trois premières seulement.
      const { supprimees } = preparerUneRestauration(migrationsJusqua(dossier, 3));
      expect(avecDepot((_, base) => tableExiste(base.sqlite, 'suppression'), cible)).toBe(false);

      const { code, lignes } = await lancer('rejouer-suppressions', cible, '--depuis', source);

      expect({ code, lignes }).toEqual({ code: 0, lignes: ['{"registre":2,"effaces":2}'] });
      expect(registre(cible).map((entree) => entree.personne)).toEqual([...supprimees].sort());
      expect(
        avecDepot(
          (_, base) => base.sqlite.prepare('select count(*) as n from personne').get(),
          cible,
        ),
      ).toEqual({ n: 1 });
    });

    it('rejouer_suppressions_usage', async () => {
      expect((await lancer('rejouer-suppressions')).code).toBe(64);
      expect((await lancer('rejouer-suppressions', cible)).code).toBe(64);
      expect((await lancer('rejouer-suppressions', '--depuis', source)).code).toBe(64);
      expect((await lancer('rejouer-suppressions', cible, '--depuis')).code).toBe(64);
      expect((await lancer('rejouer-suppressions', cible, '--depuis', source, 'x')).code).toBe(64);
      expect((await lancer('rejouer-suppressions', cible, source)).code).toBe(64);
      expect(
        (await lancer('rejouer-suppressions', cible, '--depuis', source, '--depuis', source)).code,
      ).toBe(64);
      expect((await lancer('rejouer-suppressions', cible, '--autre', source)).code).toBe(64);
    });

    it('rejouer_suppressions_source_absente_1_sans_la_creer', async () => {
      fs.copyFileSync(source, cible);
      const absente = path.join(dossier, 'absente.sqlite');

      const { code, lignes } = await lancer('rejouer-suppressions', cible, '--depuis', absente);

      expect(code).toBe(1);
      expect(lignes).toHaveLength(1);
      expect(fs.existsSync(absente)).toBe(false);
    });

    it('rejouer_suppressions_cible_absente_1_sans_la_creer', async () => {
      const { code, lignes } = await lancer('rejouer-suppressions', cible, '--depuis', source);

      expect(code).toBe(1);
      expect(lignes).toEqual([`base introuvable : ${cible}`]);
      expect(fs.existsSync(cible)).toBe(false);
    });
  });

  describe('rejeu du registre, de dossier à dossier (--dossiers)', () => {
    let dossierSource: string;
    let dossierCible: string;

    beforeEach(() => {
      dossierSource = path.join(dossier, 'avant');
      dossierCible = path.join(dossier, 'apres');
      fs.mkdirSync(dossierSource);
      fs.mkdirSync(dossierCible);
    });

    const baseDe = (d: string): string => path.join(d, 'ancrage.sqlite');

    function personnes(chemin: string): number {
      return avecDepot((depot) => depot.personnes().length, chemin);
    }

    /** L'empreinte des octets d'un fichier : elle change si une connexion l'a écrit. */
    function empreinteDuFichier(chemin: string): string {
      return createHash('sha256').update(fs.readFileSync(chemin)).digest('hex');
    }

    /** Trois personnes dans les deux bases du dossier ; la source, elle, en supprime deux. */
    function preparer(): void {
      const noms = ['Testa Test', 'Berta Test', 'Clara Test'];
      const ids = noms.map(() => randomUUID());
      const peupler = (base: Base): void => {
        const depot = creerDepot(base, () => new Date());
        for (const [i, nomAffiche] of noms.entries()) {
          depot.creerPersonne({ id: ids[i], nomAffiche, langue: 'de' });
        }
      };
      avecDepot((_, base) => peupler(base));
      fs.copyFileSync(source, baseDe(dossierCible));
      avecDepot((_, base) => {
        supprimerPersonne(base, ids[0] ?? '', INSTANT);
        supprimerPersonne(base, ids[1] ?? '', INSTANT);
      });
      fs.copyFileSync(source, baseDe(dossierSource));
    }

    const rejouerParDossiers = (): Promise<{ code: number; lignes: string[] }> =>
      lancer('rejouer-suppressions', '--dossiers', dossierSource, dossierCible);

    /** Une ligne du rapport (un objet JSON) dans la sortie. */
    const unRapport = (lignes: string[]): boolean => lignes.some((ligne) => ligne.startsWith('{'));

    it('rejouer_suppressions_dossiers_efface_et_inscrit', async () => {
      preparer();

      const { code, lignes } = await rejouerParDossiers();

      // Le rapport du crochet REPORTER du modèle : ces deux clés, des nombres seulement (1e-D10).
      expect({ code, lignes }).toEqual({
        code: 0,
        lignes: ['{"entrees_registre":2,"comptes_effaces":2}'],
      });
      expect(personnes(baseDe(dossierCible))).toBe(1);
      expect(personnes(baseDe(dossierSource))).toBe(1);
      // La cible est fermée proprement : aucun journal ne reste à côté d'elle.
      expect(fs.existsSync(`${baseDe(dossierCible)}-wal`)).toBe(false);
    });

    it('rejouer_suppressions_dossiers_refuse_un_journal_restant_a_cote_de_la_cible', async () => {
      preparer();
      // Une autre connexion tient la cible ouverte : à la fermeture de la CLI, SQLite ne peut ni
      // reporter ni retirer le `-wal`, et les comptes effacés n'y seraient pas tous dans le fichier.
      const autre = new Database(baseDe(dossierCible));
      try {
        autre.prepare('select count(*) from personne').get();

        const { code, lignes } = await rejouerParDossiers();

        expect(code).not.toBe(0);
        expect(unRapport(lignes)).toBe(false);
        expect(lignes.join('\n')).toContain(`${baseDe(dossierCible)}-wal`);
      } finally {
        autre.close();
      }
    });

    it.each([1.5, Number.NaN])(
      'rejouer_suppressions_dossiers_rapport_seulement_avec_deux_entiers (%s)',
      async (effaces) => {
        preparer();
        vi.mocked(rejouerRegistre).mockReturnValueOnce(effaces);

        const { code, lignes } = await rejouerParDossiers();

        expect(code).not.toBe(0);
        expect(unRapport(lignes)).toBe(false);
        expect(lignes).toHaveLength(1);
      },
    );

    it('rejouer_suppressions_dossiers_refuse_une_base_en_service_sans_compte', async () => {
      // La base en service, neuve (serveur perdu, puis redéployé), n'a aucun compte : son registre
      // ne dit rien des suppressions, il ne se devine pas. Le refus vient avant toute ouverture de
      // la cible : un instantané d'avant la migration 0003, que `surBaseMigreeA` migrerait, garde
      // ses octets, ne reçoit pas la table du registre, et aucun journal n'apparaît à côté de lui.
      const cible = baseDe(dossierCible);
      const ancienne = ouvrirBase(cible);
      try {
        appliquerMigrations(ancienne, migrationsJusqua(dossier, 3));
        creerDepot(ancienne, () => new Date()).creerPersonne({
          nomAffiche: 'Testa Test',
          langue: 'de',
        });
      } finally {
        fermerBase(ancienne);
      }
      const avant = empreinteDuFichier(cible);
      const sansCompte = path.join(dossier, 'neuve');
      fs.mkdirSync(sansCompte);
      avecDepot((_, base) => appliquerMigrations(base), baseDe(sansCompte));
      // Une base sans même la table des personnes n'a pas de compte non plus.
      const sansTable = path.join(dossier, 'sans-table');
      fs.mkdirSync(sansTable);
      const vide = new Database(baseDe(sansTable));
      vide.exec('create table autre (id text primary key)');
      vide.close();

      for (const enService of [sansCompte, sansTable]) {
        const { code, lignes } = await lancer(
          'rejouer-suppressions',
          '--dossiers',
          enService,
          dossierCible,
        );

        expect(code).not.toBe(0);
        expect(code).not.toBe(64);
        expect(lignes).toHaveLength(1);
        expect(lignes[0]).toContain('aucun compte');
        expect(lignes[0]).toContain('--sans-report');
        // La cible n'a été ni ouverte ni migrée.
        expect(empreinteDuFichier(cible)).toBe(avant);
        expect(fs.existsSync(`${cible}-wal`)).toBe(false);
        expect(fs.existsSync(`${cible}-shm`)).toBe(false);
      }
      const lecture = new Database(cible, { readonly: true, fileMustExist: true });
      try {
        expect(tableExiste(lecture, 'suppression')).toBe(false);
      } finally {
        lecture.close();
      }
    });

    it('rejouer_suppressions_dossiers_les_formes_fichier_gardent_leur_rapport', async () => {
      preparer();
      const cibleFichier = path.join(dossier, 'cible.sqlite');
      fs.copyFileSync(baseDe(dossierCible), cibleFichier);

      const { code, lignes } = await lancer(
        'rejouer-suppressions',
        cibleFichier,
        '--depuis',
        baseDe(dossierSource),
      );

      expect({ code, lignes }).toEqual({ code: 0, lignes: ['{"registre":2,"effaces":2}'] });
    });

    it('rejouer_suppressions_dossiers_usage', async () => {
      const [s, c] = [dossierSource, dossierCible];
      expect((await lancer('rejouer-suppressions', '--dossiers')).code).toBe(64);
      expect((await lancer('rejouer-suppressions', '--dossiers', s)).code).toBe(64);
      expect((await lancer('rejouer-suppressions', '--dossiers', s, c, 'x')).code).toBe(64);
      expect((await lancer('rejouer-suppressions', s, '--dossiers', c)).code).toBe(64);
      expect((await lancer('rejouer-suppressions', '--dossiers', s, c, '--depuis', s)).code).toBe(
        64,
      );
    });

    it('rejouer_suppressions_dossiers_source_sans_base_1_sans_rien_creer', async () => {
      fs.copyFileSync(source, baseDe(dossierCible));

      const { code, lignes } = await lancer(
        'rejouer-suppressions',
        '--dossiers',
        dossierSource,
        dossierCible,
      );

      expect({ code, lignes }).toEqual({
        code: 1,
        lignes: [`base introuvable : ${baseDe(dossierSource)}`],
      });
      expect(fs.readdirSync(dossierSource)).toEqual([]);
    });

    it('rejouer_suppressions_dossiers_cible_absente_1_sans_la_creer', async () => {
      fs.copyFileSync(source, baseDe(dossierSource));

      const { code, lignes } = await lancer(
        'rejouer-suppressions',
        '--dossiers',
        dossierSource,
        dossierCible,
      );

      expect({ code, lignes }).toEqual({
        code: 1,
        lignes: [`base introuvable : ${baseDe(dossierCible)}`],
      });
      expect(fs.readdirSync(dossierCible)).toEqual([]);
      // Un dossier cible qui n'existe pas non plus n'est pas créé.
      const absent = path.join(dossier, 'absent');
      expect((await lancer('rejouer-suppressions', '--dossiers', dossierSource, absent)).code).toBe(
        1,
      );
      expect(fs.existsSync(absent)).toBe(false);
    });

    it('rejouer_suppressions_dossiers_lit_le_wal_de_la_source', async () => {
      // Une base tuée plutôt que fermée : ses dernières écritures ne sont que dans le `-wal`, et
      // le fichier de la base seul ne les a pas. On copie les deux avant que la fermeture ne
      // rapporte le journal dans la base.
      const [a, b] = [randomUUID(), randomUUID()];
      avecDepot((depot) => {
        depot.creerPersonne({ id: a, nomAffiche: 'Testa Test', langue: 'de' });
        depot.creerPersonne({ id: b, nomAffiche: 'Berta Test', langue: 'de' });
      });
      fs.copyFileSync(source, baseDe(dossierCible));
      const vivante = ouvrirBase(source);
      try {
        // Écriture directe : `supprimerPersonne` viderait le WAL par un point de contrôle.
        vivante.sqlite
          .prepare('insert into suppression (personne, supprime_le) values (?, ?)')
          .run(a, INSTANT.toISOString());
        const wal = `${source}-wal`;
        expect(fs.statSync(wal).size).toBeGreaterThan(0);
        fs.copyFileSync(source, baseDe(dossierSource));
        fs.copyFileSync(wal, `${baseDe(dossierSource)}-wal`);
      } finally {
        fermerBase(vivante);
      }

      const { code, lignes } = await lancer(
        'rejouer-suppressions',
        '--dossiers',
        dossierSource,
        dossierCible,
      );

      expect({ code, lignes }).toEqual({
        code: 0,
        lignes: ['{"entrees_registre":1,"comptes_effaces":1}'],
      });
      expect(personnes(baseDe(dossierCible))).toBe(1);
    });
  });

  describe('amorçage du propriétaire', () => {
    beforeEach(() => {
      // Seule la date est figée : la base est synchrone, les minuteries n'ont pas à l'être.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(INSTANT);
    });

    function creerProprietaire(): string {
      return avecDepot(
        (depot) =>
          depot.creerPersonne({ nomAffiche: 'Prüfer Test', langue: 'de', proprietaire: true }).id,
      );
    }

    it('proprietaire_ecrit_en_transaction_immediate', async () => {
      // La commande ouvre elle-même sa connexion : l'espion se pose sur le prototype de better-sqlite3.
      const espion = espionnerLesTransactions(Database.prototype);
      try {
        expect((await lancer('proprietaire')).code).toBe(0);
      } finally {
        espion.rendre();
      }

      expect(espion.manieres).toEqual(['immediate']);
    });

    it('proprietaire_ecrit_un_lien_d_invitation', async () => {
      const { code, lignes } = await lancer('proprietaire');

      expect(code).toBe(0);
      expect(lignes).toHaveLength(1);
      const jeton = jetonDuLien(lignes[0] ?? '', INVITATION_ATTENDUE);
      const lien = avecDepot((depot) => depot.lienUtilisable(empreinte(jeton), 'invitation'));
      expect(lien).toEqual({
        empreinte: empreinte(jeton),
        type: 'invitation',
        personne: null,
        proprietaire: true,
        octroi: { groupes: [], cours: [] },
        creePar: null,
        creeLe: INSTANT.toISOString(),
        expireLe: new Date(INSTANT.getTime() + 7 * UN_JOUR_MS).toISOString(),
        utiliseLe: null,
      });
      exigerJetonAbsentDesFichiers(jeton);
    });

    it('proprietaire_migre_une_base_neuve', async () => {
      const neuve = path.join(dossier, 'neuve', 'ancrage.sqlite');
      vi.stubEnv('ANCRAGE_BASE', neuve);

      const { code, lignes } = await lancer('proprietaire');

      expect(code).toBe(0);
      expect(lignes).toHaveLength(1);
      const jeton = jetonDuLien(lignes[0] ?? '', INVITATION_ATTENDUE);
      const lien = avecDepot(
        (depot) => depot.lienUtilisable(empreinte(jeton), 'invitation'),
        neuve,
      );
      expect(lien?.proprietaire).toBe(true);
    });

    it('proprietaire_refuse_si_proprietaire_existe', async () => {
      creerProprietaire();

      const { code, lignes } = await lancer('proprietaire');

      expect(code).toBe(1);
      expect(lignes).toEqual(['un propriétaire existe déjà ; utiliser secours-proprietaire']);
      expect(nombreDeLiens()).toBe(0);
    });

    it('proprietaire_annule_l_invitation_precedente', async () => {
      const premiere = await lancer('proprietaire');
      const jetonPrecedent = jetonDuLien(premiere.lignes[0] ?? '', INVITATION_ATTENDUE);

      const seconde = await lancer('proprietaire');

      expect(seconde.code).toBe(0);
      const jeton = jetonDuLien(seconde.lignes[0] ?? '', INVITATION_ATTENDUE);
      expect(jeton).not.toBe(jetonPrecedent);
      avecDepot((depot) => {
        expect(depot.lienUtilisable(empreinte(jetonPrecedent), 'invitation')).toBeUndefined();
        expect(depot.consommerLien(empreinte(jetonPrecedent), 'invitation')).toBeUndefined();
        expect(depot.lienUtilisable(empreinte(jeton), 'invitation')).toBeDefined();
      });
      expect(nombreDeLiens()).toBe(1);
    });

    it('proprietaire_sans_url_publique_en_prod_1_sans_lien', async () => {
      vi.stubEnv('ANCRAGE_ENV', 'prod');
      vi.stubEnv('ANCRAGE_URL_PUBLIQUE', '');

      const { code, lignes } = await lancer('proprietaire');

      expect(code).toBe(1);
      expect(lignes).toEqual(['ANCRAGE_URL_PUBLIQUE manquante']);
      expect(nombreDeLiens()).toBe(0);
    });

    it('secours_proprietaire_ecrit_un_lien', async () => {
      const proprietaire = creerProprietaire();
      avecDepot((depot) => depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' }));

      const { code, lignes } = await lancer('secours-proprietaire');

      expect(code).toBe(0);
      expect(lignes).toHaveLength(1);
      const jeton = jetonDuLien(lignes[0] ?? '', CONNEXION_ATTENDUE);
      const lien = avecDepot((depot) => depot.lienUtilisable(empreinte(jeton), 'connexion'));
      expect(lien).toEqual({
        empreinte: empreinte(jeton),
        type: 'connexion',
        personne: proprietaire,
        proprietaire: false,
        octroi: { groupes: [], cours: [] },
        creePar: null,
        creeLe: INSTANT.toISOString(),
        expireLe: new Date(INSTANT.getTime() + UN_JOUR_MS).toISOString(),
        utiliseLe: null,
      });
      exigerJetonAbsentDesFichiers(jeton);
    });

    it('secours_proprietaire_remplace_le_lien_precedent', async () => {
      creerProprietaire();
      const premiere = await lancer('secours-proprietaire');
      const jetonPrecedent = jetonDuLien(premiere.lignes[0] ?? '', CONNEXION_ATTENDUE);

      const seconde = await lancer('secours-proprietaire');

      // Un seul lien de connexion actif par personne, même pour la commande (1e-D7).
      expect(seconde.code).toBe(0);
      const jeton = jetonDuLien(seconde.lignes[0] ?? '', CONNEXION_ATTENDUE);
      avecDepot((depot) => {
        expect(depot.lienUtilisable(empreinte(jetonPrecedent), 'connexion')).toBeUndefined();
        expect(depot.lienUtilisable(empreinte(jeton), 'connexion')).toBeDefined();
      });
      expect(nombreDeLiens()).toBe(1);
    });

    it('secours_sans_proprietaire_refuse', async () => {
      avecDepot((depot) => depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' }));

      const { code, lignes } = await lancer('secours-proprietaire');

      expect(code).toBe(1);
      expect(lignes).toEqual(['aucun propriétaire ; utiliser proprietaire']);
      expect(nombreDeLiens()).toBe(0);
    });
  });
});

describe('verifier-contenu', () => {
  function dossierDeContenu(fichiers: ReadonlyMap<string, string>): string {
    return dossierDuContenu(creerDepotTemporaire(fichiers));
  }

  afterEach(() => supprimerDepotsTemporaires());

  it('verifier_contenu_accepte_l_exemple', async () => {
    const { code, lignes } = await lancer('verifier-contenu', dossierDeContenu(exempleDeCours()));

    expect(code).toBe(0);
    expect(lignes).toEqual(['contenu conforme : 1 cours']);
  });

  it('verifier_contenu_rend_2_pour_un_contenu_invalide', async () => {
    const fichiers = modifier(exempleDeCours(), 'essai/cours.yaml', 'titre: "Übungskurs"\n', '');

    const { code, lignes } = await lancer('verifier-contenu', dossierDeContenu(fichiers));

    expect(code).toBe(2);
    // Une ligne par erreur, `fichier lieu : message`, comme au démarrage.
    expect(lignes).toEqual([
      expect.stringMatching(/^essai\/cours\.yaml titre : Champ obligatoire absent/),
    ]);
  });

  it('verifier_contenu_refuse_une_notice_absente_ou_un_lien_non_admis', async () => {
    // Le contenu se charge comme au démarrage : notice comprise (S1-D4, S1-D7).
    const sansNotice = exempleDeCours();
    sansNotice.delete('notice.yaml');
    const lienNonAdmis = modifier(
      exempleDeCours(),
      'notice.yaml',
      'cible: "https://protection.exemple.test"',
      'cible: "javascript:alert(1)"',
    );

    const absente = await lancer('verifier-contenu', dossierDeContenu(sansNotice));
    const lien = await lancer('verifier-contenu', dossierDeContenu(lienNonAdmis));

    expect(absente.code).toBe(2);
    expect(absente.lignes).toEqual([
      expect.stringMatching(/^notice\.yaml : notice\.yaml est absent/),
    ]);
    expect(lien.code).toBe(2);
    expect(lien.lignes).toEqual([expect.stringMatching(/^notice\.yaml liens\[1\]\.cible : Cible/)]);
  });

  it('verifier_contenu_refuse_un_identifiant_defait', async () => {
    const nouveau = dossierDeContenu(exempleDeCours());
    const enService = exempleDeCours();
    enService.set('ids.lock', `${enService.get('ids.lock') ?? ''}\nzzzzzzzz\n`);
    const ancien = dossierDeContenu(enService);

    const { code, lignes } = await lancer('verifier-contenu', nouveau, ancien);

    expect(code).toBe(2);
    expect(lignes.join('\n')).toContain('zzzzzzzz');
  });

  it('verifier_contenu_sans_verrou_en_service_ne_compare_rien', async () => {
    const nouveau = dossierDeContenu(exempleDeCours());
    const vide = fs.mkdtempSync(path.join(dossier, 'en-service-'));

    const { code } = await lancer('verifier-contenu', nouveau, vide);

    expect(code).toBe(0);
  });

  it('verifier_contenu_rend_1_pour_un_verrou_en_service_illisible', async () => {
    const nouveau = dossierDeContenu(exempleDeCours());
    const enService = fs.mkdtempSync(path.join(dossier, 'en-service-'));
    // Un `ids.lock` en service qui est un dossier : il existe, mais ne se lit pas.
    fs.mkdirSync(path.join(enService, 'ids.lock'));

    const { code, lignes } = await lancer('verifier-contenu', nouveau, enService);

    // Une erreur de lecture, et non un contenu non conforme (2) : rien n'a pu être comparé.
    expect(code).toBe(1);
    expect(lignes).toEqual([expect.stringMatching(/^EISDIR: /)]);
  });

  it('verifier_contenu_sans_dossier_rend_64', async () => {
    expect((await lancer('verifier-contenu')).code).toBe(64);
    expect((await lancer('verifier-contenu', 'a', 'b', 'c')).code).toBe(64);
  });

  it('verifier_contenu_ne_lit_pas_l_environnement', async () => {
    const interdit = path.join(dossier, 'inexistant', 'base.sqlite');
    vi.stubEnv('ANCRAGE_ENV', 'prod');
    vi.stubEnv('ANCRAGE_BASE', interdit);
    const cible = dossierDeContenu(exempleDeCours());

    const { code } = await lancer('verifier-contenu', cible);

    expect(code).toBe(0);
    expect(fs.existsSync(path.dirname(interdit))).toBe(false);
    expect(fs.existsSync(interdit)).toBe(false);
  });
});
