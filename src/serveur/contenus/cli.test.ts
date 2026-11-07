import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyserContenus } from '../../domaine/contenu/analyse.js';
import {
  exempleDeCours,
  modifier,
  valeursDeNoticeDExemple,
} from '../../domaine/contenu/exemple.fixture.js';
import { ALPHABET_IDENTIFIANT, FORMAT_IDENTIFIANT } from '../../domaine/contenu/identifiants.js';
import { noticeComposee } from '../../domaine/notice-gabarit.js';
import { type Environnement, executer } from './cli.js';
import {
  creerDepotTemporaire,
  dossierDuContenu,
  supprimerDepotsTemporaires,
} from './depot-temporaire.fixture.js';
import { DOSSIER_DE_CONTENU_PAR_DEFAUT } from './dossiers.js';
import { calculerReference } from './reference.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  supprimerDepotsTemporaires();
});

interface Resultat {
  code: number;
  out: string[];
  err: string[];
}

/** Lance depuis `racine` : les chemins relatifs donnés se lisent donc depuis la racine. */
async function lancer(racine: string, ...args: string[]): Promise<Resultat> {
  return lancerDepuis(racine, racine, ...args);
}

/** Lance avec `cwd` pour dossier courant, `racine` restant celle du dépôt. */
async function lancerDepuis(cwd: string, racine: string, ...args: string[]): Promise<Resultat> {
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  const out: string[] = [];
  const err: string[] = [];
  const code = await executer(args, { out: (l) => out.push(l), err: (l) => err.push(l) }, racine);
  return { code, out, err };
}

/** Le dossier des instantanés des essais : la CLI n'en a pas par défaut (S3-D4). */
const DOSSIER_DES_REFERENCES_DE_L_ESSAI = 'references';

/** Lance `reference` avec les instantanés sous `racine`, puis les options données. */
async function lancerReference(racine: string, ...args: string[]): Promise<Resultat> {
  return lancer(
    racine,
    'reference',
    '--references',
    path.join(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI),
    ...args,
  );
}

const RACINE_DU_CODE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function chemin(racine: string, ...parties: string[]): string {
  return path.join(racine, ...parties);
}

function ecrireFichiers(dossier: string, fichiers: ReadonlyMap<string, string>): void {
  for (const [fichier, texte] of fichiers) {
    const cible = chemin(dossier, ...fichier.split('/'));
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, texte);
  }
}

function lireVerrouDuDepot(racine: string): string {
  return fs.readFileSync(chemin(dossierDuContenu(racine), 'ids.lock'), 'utf8');
}

/** Retire une carte du texte d'un module de cartes (la carte entière : sa ligne `- id` et ses clés). */
function sansCarte(fichiers: Map<string, string>, module: string, id: string): void {
  const texte = fichiers.get(module) ?? '';
  const retire = texte.replace(new RegExp(`^ {2}- id: "${id}"\\n(?: {4}.*\\n)*`, 'm'), '');
  expect(retire).not.toBe(texte);
  fichiers.set(module, retire);
}

const GRUNDBEGRIFFE = 'essai/cartes/01-grundbegriffe.yaml';

function git(racine: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=essai', '-c', 'user.email=essai@exemple.invalid', ...args],
    {
      cwd: racine,
      stdio: 'ignore',
    },
  );
}

/** Un dépôt git dont le seul commit contient les fichiers donnés. */
function depotGit(fichiers: Map<string, string>): string {
  const racine = creerDepotTemporaire(fichiers);
  git(racine, 'init', '-q');
  if (fichiers.size > 0) git(racine, 'add', DOSSIER_DE_CONTENU_PAR_DEFAUT);
  git(racine, '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'essai');
  return racine;
}

describe('executer verifier', () => {
  it('verifier_lit_l_exemple_par_defaut', async () => {
    // Depuis la racine du code, le défaut est `exemple-contenu`, que le dépôt porte (S3-D4).
    const { code, out, err } = await lancer(RACINE_DU_CODE, 'verifier');

    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(out.join(' ')).toContain('exemple-contenu');
  });

  it('verifier_base_lit_le_verrou_d_un_autre_depot', async () => {
    // Le contenu vit dans un dépôt git voisin du code (S3-D4) : `--base` lit son verrou par `git -C`.
    const voisin = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-voisin-'));
    try {
      const copie = path.join(voisin, 'copie');
      fs.cpSync(path.join(RACINE_DU_CODE, DOSSIER_DE_CONTENU_PAR_DEFAUT), copie, {
        recursive: true,
      });
      git(voisin, 'init', '-q');
      git(voisin, 'add', 'copie');
      git(voisin, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'essai');

      const { code, err } = await lancer(
        RACINE_DU_CODE,
        'verifier',
        '--contenu',
        copie,
        '--base',
        'HEAD',
      );

      expect(err).toEqual([]);
      expect(code).toBe(0);
    } finally {
      fs.rmSync(voisin, { recursive: true, force: true });
    }
  });

  it('verifier_code_0_sur_contenu_valide', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, out, err } = await lancer(racine, 'verifier');

    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    expect(code).toBe(0);
  });

  it('sonde_negative_verifier_code_1_si_identifiant_disparu', async () => {
    const fichiers = exempleDeCours();
    sansCarte(fichiers, GRUNDBEGRIFFE, '586my7a4');
    const racine = creerDepotTemporaire(fichiers);

    const { code, err } = await lancer(racine, 'verifier');

    expect(code).toBe(1);
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/^ids\.lock ligne \d+ : L'identifiant 586my7a4 a disparu/);
  });

  it('verifier_signale_un_dossier_de_contenus_absent', async () => {
    const racine = creerDepotTemporaire(new Map());

    const { code, err } = await lancer(racine, 'verifier');

    expect(code).toBe(1);
    expect(err).toHaveLength(1);
    expect(err[0]).toContain('. : dossier de contenus introuvable : ');
  });

  it('verifier_n_affiche_aucun_texte_de_cours', async () => {
    const fichiers = exempleDeCours();
    fichiers.set(
      'essai/cartes/02-vorsilben.yaml',
      (fichiers.get('essai/cartes/02-vorsilben.yaml') ?? '').replace('"gegen"', '"gegen\\n"'),
    );
    const racine = creerDepotTemporaire(fichiers);

    const { code, err } = await lancer(racine, 'verifier');

    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
    expect(err.join('\n')).not.toContain('gegen');
  });

  it('verifier_base_detecte_une_ligne_supprimee', async () => {
    const racine = depotGit(exempleDeCours());
    // Sans cette carte ni sa ligne du verrou, le contenu est cohérent : seule la comparaison avec
    // la base voit que le verrou a rétréci.
    const fichiers = exempleDeCours();
    sansCarte(fichiers, GRUNDBEGRIFFE, '586my7a4');
    fs.writeFileSync(
      chemin(dossierDuContenu(racine), ...GRUNDBEGRIFFE.split('/')),
      fichiers.get(GRUNDBEGRIFFE) ?? '',
    );
    fs.writeFileSync(
      chemin(dossierDuContenu(racine), 'ids.lock'),
      lireVerrouDuDepot(racine).replace('586my7a4\n', ''),
    );

    const sansBase = await lancer(racine, 'verifier');
    const { code, err } = await lancer(racine, 'verifier', '--base', 'HEAD');

    expect(sansBase.code).toBe(0);
    expect(code).toBe(1);
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/^ids\.lock ligne \d+ : La ligne de l'identifiant 586my7a4/);
  });

  it('verifier_base_accepte_un_verrou_qui_grandit', async () => {
    const racine = depotGit(exempleDeCours());

    const { code, err } = await lancer(racine, 'verifier', '--base', 'HEAD');

    expect(err).toEqual([]);
    expect(code).toBe(0);
  });

  it('verifier_base_sans_verrou_a_la_base_compte_comme_un_verrou_vide', async () => {
    const racine = depotGit(new Map());
    for (const [fichier, texte] of exempleDeCours()) {
      const cible = chemin(dossierDuContenu(racine), ...fichier.split('/'));
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.writeFileSync(cible, texte);
    }

    const { code, err } = await lancer(racine, 'verifier', '--base', 'HEAD');

    expect(err).toEqual([]);
    expect(code).toBe(0);
  });

  it('verifier_base_reference_inconnue_code_1', async () => {
    const racine = depotGit(exempleDeCours());

    const { code, err } = await lancer(racine, 'verifier', '--base', 'origin/nexiste-pas');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('origin/nexiste-pas');
  });

  it('verifier_base_hors_depot_git_code_1', async () => {
    // Sans `git init`. Le plafond empêche git de remonter jusqu'à un dépôt qui contiendrait /tmp.
    vi.stubEnv('GIT_CEILING_DIRECTORIES', os.tmpdir());
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, err } = await lancer(racine, 'verifier', '--base', 'HEAD');

    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });

  it('verifier_base_sans_git_code_1', async () => {
    const racine = depotGit(exempleDeCours());
    vi.stubEnv('PATH', '');

    const { code, err } = await lancer(racine, 'verifier', '--base', 'HEAD');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('git');
  });

  it('verifier_base_refuse_une_reference_qui_ressemble_a_une_option', async () => {
    const racine = depotGit(exempleDeCours());

    const { code } = await lancer(racine, 'verifier', '--base', '--help');

    expect(code).toBe(64);
  });

  it('verifier_base_sans_valeur_code_64', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    expect((await lancer(racine, 'verifier', '--base')).code).toBe(64);
    expect((await lancer(racine, 'verifier', 'HEAD')).code).toBe(64);
  });

  it('contenu_se_lit_dans_le_dossier_donne', async () => {
    const racine = creerDepotTemporaire(new Map());
    const autre = chemin(racine, 'autre');
    ecrireFichiers(autre, exempleDeCours());

    const sansOption = await lancer(racine, 'verifier');
    const { code, err } = await lancer(racine, 'verifier', '--contenu', autre);

    expect(sansOption.code).toBe(1);
    expect(err).toEqual([]);
    expect(code).toBe(0);
  });

  it('base_se_lit_relative_au_dossier', async () => {
    const racine = creerDepotTemporaire(new Map());
    const dossier = chemin(racine, 'a', 'b');
    ecrireFichiers(dossier, exempleDeCours());
    git(racine, 'init', '-q');
    git(racine, 'add', 'a');
    git(racine, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'essai');
    // Le verrou courant perd une ligne, la carte avec elle : seule la base voit la disparition.
    const fichiers = exempleDeCours();
    sansCarte(fichiers, GRUNDBEGRIFFE, '586my7a4');
    fs.writeFileSync(
      chemin(dossier, ...GRUNDBEGRIFFE.split('/')),
      fichiers.get(GRUNDBEGRIFFE) ?? '',
    );
    fs.writeFileSync(
      chemin(dossier, 'ids.lock'),
      fs.readFileSync(chemin(dossier, 'ids.lock'), 'utf8').replace('586my7a4\n', ''),
    );

    const { code, err } = await lancerDepuis(
      racine,
      racine,
      'verifier',
      '--contenu',
      'a/b',
      '--base',
      'HEAD',
    );

    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/^ids\.lock ligne \d+ : La ligne de l'identifiant 586my7a4/);
    expect(code).toBe(1);
  });

  it('chemin_relatif_se_lit_depuis_le_dossier_courant', async () => {
    const racine = creerDepotTemporaire(new Map());
    const courant = chemin(racine, 'ici');
    ecrireFichiers(chemin(courant, 'a', 'b'), exempleDeCours());

    const relatif = await lancerDepuis(courant, racine, 'verifier', '--contenu', 'a/b');
    const depuisLaRacine = await lancer(racine, 'verifier', '--contenu', 'a/b');

    expect(relatif.err).toEqual([]);
    expect(relatif.code).toBe(0);
    expect(depuisLaRacine.code).toBe(1);
  });

  it('chemin_par_defaut_se_lit_depuis_la_racine', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    const ailleurs = chemin(racine, 'ailleurs');
    fs.mkdirSync(ailleurs);

    const { code, err } = await lancerDepuis(ailleurs, racine, 'verifier');

    expect(err).toEqual([]);
    expect(code).toBe(0);
  });
});

/** Fait tirer d'abord `ids` à `crypto.getRandomValues`, dans cet ordre, puis du vrai hasard. */
function imposerLesPremiersTirages(ids: string[]): void {
  const reel = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  const imposes = ids.map((id) => Uint8Array.from(id, (c) => ALPHABET_IDENTIFIANT.indexOf(c)));
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((
    tableau: Uint8Array<ArrayBuffer>,
  ) => {
    const impose = imposes.shift();
    return impose ?? reel(tableau);
  }) as typeof globalThis.crypto.getRandomValues);
}

describe('executer id', () => {
  it('id_rend_des_identifiants_libres', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    const resultat = analyserContenus(exempleDeCours());

    const { code, out } = await lancer(racine, 'id', '5');

    expect(code).toBe(0);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
    for (const id of out) {
      expect(id).toMatch(FORMAT_IDENTIFIANT);
      expect(resultat.identifiants.has(id)).toBe(false);
      expect(lireVerrouDuDepot(racine)).not.toContain(id);
    }
  });

  it('id_rend_un_identifiant_par_defaut', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, out } = await lancer(racine, 'id');

    expect(code).toBe(0);
    expect(out).toHaveLength(1);
  });

  it('id_evite_les_identifiants_retires_et_ceux_du_contenu', async () => {
    const fichiers = exempleDeCours();
    // `bbbbbbbb` est dans le contenu mais pas dans le verrou ; `zdpn0x9s` est retiré du verrou.
    fichiers.set(
      GRUNDBEGRIFFE,
      `${fichiers.get(GRUNDBEGRIFFE)}  - id: "bbbbbbbb"\n    type: "b"\n    recto: "Zusatzkarte"\n    verso: "Noch ein Begriff"\n`,
    );
    const racine = creerDepotTemporaire(fichiers);
    imposerLesPremiersTirages(['zdpn0x9s', 'bbbbbbbb', 'cccccccc', 'cccccccc', 'dddddddd']);

    const { code, out } = await lancer(racine, 'id', '2');

    expect(code).toBe(0);
    expect(out).toEqual(['cccccccc', 'dddddddd']);
  });

  it('id_fonctionne_malgre_des_erreurs_de_contenu', async () => {
    const fichiers = exempleDeCours();
    fichiers.set('essai/cours.yaml', 'format: [');
    const racine = creerDepotTemporaire(fichiers);

    const { code, out } = await lancer(racine, 'id');

    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(FORMAT_IDENTIFIANT);
  });

  it('id_refuse_sans_verrou_lisible', async () => {
    const fichiers = exempleDeCours();
    fichiers.delete('ids.lock');
    const racine = creerDepotTemporaire(fichiers);

    const { code, out, err } = await lancer(racine, 'id');

    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('ids.lock');
  });

  it('id_refuse_un_nombre_invalide', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    for (const n of ['0', '-1', 'abc', '1.5', '100000']) {
      expect((await lancer(racine, 'id', n)).code).toBe(64);
    }
    expect((await lancer(racine, 'id', '1', '2')).code).toBe(64);
  });
});

describe('executer verrouiller', () => {
  it('verrouiller_ajoute_les_identifiants_manquants', async () => {
    const fichiers = exempleDeCours();
    fichiers.set(
      GRUNDBEGRIFFE,
      `${fichiers.get(GRUNDBEGRIFFE)}  - id: "bbbbbbbb"\n    type: "b"\n    recto: "Zusatzkarte"\n    verso: "Noch ein Begriff"\n`,
    );
    const racine = creerDepotTemporaire(fichiers);
    const avant = lireVerrouDuDepot(racine);
    expect((await lancer(racine, 'verifier')).code).toBe(1);

    const { code, out } = await lancer(racine, 'verrouiller');

    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(lireVerrouDuDepot(racine)).toBe(`${avant}bbbbbbbb\n`);
    expect((await lancer(racine, 'verifier')).code).toBe(0);
  });

  it('verrouiller_ajoute_dans_l_ordre_du_contenu', async () => {
    const fichiers = exempleDeCours();
    fichiers.set(
      GRUNDBEGRIFFE,
      `${fichiers.get(GRUNDBEGRIFFE)}  - id: "cccccccc"\n    type: "b"\n    recto: "Zweite Zusatzkarte"\n    verso: "Und noch ein Begriff"\n  - id: "bbbbbbbb"\n    type: "b"\n    recto: "Erste Zusatzkarte"\n    verso: "Ein Begriff"\n`,
    );
    const racine = creerDepotTemporaire(fichiers);
    const avant = lireVerrouDuDepot(racine);

    const { code } = await lancer(racine, 'verrouiller');

    expect(code).toBe(0);
    expect(lireVerrouDuDepot(racine)).toBe(`${avant}cccccccc\nbbbbbbbb\n`);
  });

  it('verrouiller_ne_change_rien_quand_tout_est_deja_verrouille', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    const avant = lireVerrouDuDepot(racine);

    const { code, out, err } = await lancer(racine, 'verrouiller');

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    expect(lireVerrouDuDepot(racine)).toBe(avant);
  });

  it('verrouiller_refuse_s_il_reste_d_autres_erreurs', async () => {
    const fichiers = exempleDeCours();
    // Une carte neuve, dont le type est inconnu : le verrou ne suffit pas à rendre le contenu valide.
    fichiers.set(
      GRUNDBEGRIFFE,
      `${fichiers.get(GRUNDBEGRIFFE)}  - id: "bbbbbbbb"\n    type: "zz"\n    recto: "Zusatzkarte"\n    verso: "Noch ein Begriff"\n`,
    );
    const racine = creerDepotTemporaire(fichiers);
    const avant = lireVerrouDuDepot(racine);

    const { code, err } = await lancer(racine, 'verrouiller');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Type de carte inconnu');
    expect(lireVerrouDuDepot(racine)).toBe(avant);
  });

  it('verrouiller_refuse_un_contenu_illisible_meme_sans_rien_a_ajouter', async () => {
    const fichiers = exempleDeCours();
    fichiers.set('essai/cartes/02-vorsilben.yaml', 'type: [');
    const racine = creerDepotTemporaire(fichiers);
    const avant = lireVerrouDuDepot(racine);

    const { code, err } = await lancer(racine, 'verrouiller');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('YAML invalide');
    expect(lireVerrouDuDepot(racine)).toBe(avant);
  });

  it('verrouiller_refuse_de_recreer_un_verrou_absent', async () => {
    const fichiers = exempleDeCours();
    fichiers.delete('ids.lock');
    const racine = creerDepotTemporaire(fichiers);

    const { code, err } = await lancer(racine, 'verrouiller');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('ids.lock est absent');
    expect(fs.existsSync(chemin(dossierDuContenu(racine), 'ids.lock'))).toBe(false);
  });
});

describe('executer reference', () => {
  it('reference_sans_references_est_un_usage_invalide', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, err } = await lancer(racine, 'reference');

    expect(code).toBe(64);
    expect(err).toEqual(['reference : --references <dossier> est obligatoire']);
    expect(fs.existsSync(chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI))).toBe(false);
  });

  it('reference_ecrit_un_fichier_par_cours', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    const resultat = analyserContenus(exempleDeCours());

    const { code, out } = await lancerReference(racine);

    expect(code).toBe(0);
    expect(out).toHaveLength(2);
    const texte = fs.readFileSync(
      chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI, 'essai.reference.json'),
      'utf8',
    );
    expect(texte).toBe(`${JSON.stringify(calculerReference(resultat.cours[0]), null, 2)}\n`);
  });

  it('reference_ecrit_la_notice_composee', async () => {
    // L'instantané de la notice : le gabarit rempli des valeurs, en français puis en allemand
    // (S1-D10).
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, out } = await lancerReference(racine);

    expect(code).toBe(0);
    expect(out.some((ligne) => ligne.endsWith('notice.json'))).toBe(true);
    const texte = fs.readFileSync(
      chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI, 'notice.json'),
      'utf8',
    );
    const valeurs = valeursDeNoticeDExemple();
    const attendue = { fr: noticeComposee('fr', valeurs), de: noticeComposee('de', valeurs) };
    expect(texte).toBe(`${JSON.stringify(attendue, null, 2)}\n`);
    expect(Object.keys(JSON.parse(texte))).toEqual(['fr', 'de']);
  });

  it('reference_verifier_accepte_l_egal', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    await lancerReference(racine);

    const { code, err, out } = await lancerReference(racine, '--verifier');

    // `notice.json` n'est pas une référence orpheline.
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(out).toEqual(['références conformes : 1 cours, et la notice.']);
  });

  it('reference_verifier_signale_une_notice_en_ecart_ou_absente', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    await lancerReference(racine);
    const fichier = chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI, 'notice.json');
    // Un mot de la notice change dans les valeurs : l'instantané ne la suit plus.
    const notice = chemin(dossierDuContenu(racine), 'notice.yaml');
    const texte = fs.readFileSync(notice, 'utf8');
    fs.writeFileSync(notice, texte.replace('"15 jours"', '"16 jours"'));

    const ecart = await lancerReference(racine, '--verifier');
    fs.rmSync(fichier);
    const absente = await lancerReference(racine, '--verifier');

    expect(ecart.code).toBe(1);
    expect(ecart.err).toEqual(['notice.json : référence en écart avec le contenu']);
    expect(absente.code).toBe(1);
    expect(absente.err).toEqual(['notice.json : référence absente']);
  });

  /**
   * Écrit l'instantané de `fichiers`, qui doit être conforme, puis remplace `avant` par `apres`
   * dans le fichier `relatif` du contenu. Rend le `reference --verifier` d'après.
   */
  async function verifierApresRetouche(
    fichiers: Map<string, string>,
    relatif: string,
    avant: string,
    apres: string,
  ): Promise<Resultat> {
    const racine = creerDepotTemporaire(fichiers);
    await lancerReference(racine);
    expect((await lancerReference(racine, '--verifier')).code).toBe(0);
    const fichier = chemin(dossierDuContenu(racine), ...relatif.split('/'));
    const texte = fs.readFileSync(fichier, 'utf8');
    expect(texte).toContain(avant);
    fs.writeFileSync(fichier, texte.replace(avant, apres));
    return lancerReference(racine, '--verifier');
  }

  const ECART_DE_L_ESSAI = ['essai.reference.json : référence en écart avec le contenu'];

  it('reference_verifier_voit_une_derogation_retiree', async () => {
    // La section `diffusion` est le seul contrôle qui montre la perte d'une dérogation (invariant 9).
    const derogation =
      'derogation_diffusion:\n  motif: "Ouvert avant sa relecture"\n  date: "2026-11-04"\n';
    const fichiers = exempleDeCours();
    fichiers.set('essai/cours.yaml', `${fichiers.get('essai/cours.yaml')}${derogation}`);

    const { code, err } = await verifierApresRetouche(fichiers, 'essai/cours.yaml', derogation, '');

    expect(code).toBe(1);
    expect(err).toEqual(ECART_DE_L_ESSAI);
  });

  it('reference_verifier_voit_un_element_a_verifier_passe_a_source', async () => {
    // ADR-0003 : un élément « à vérifier » ne devient `source` que par erreur. Le cours reste « à
    // vérifier » par ses autres éléments : seuls les comptes de `diffusion.statuts` le voient.
    const { code, err } = await verifierApresRetouche(
      exempleDeCours(),
      'essai/morphologie.yaml',
      '    statut: "à vérifier"',
      '    statut: "source"',
    );

    expect(code).toBe(1);
    expect(err).toEqual(ECART_DE_L_ESSAI);
  });

  it('reference_verifier_signale_une_difference', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    await lancerReference(racine);
    const fichier = chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI, 'essai.reference.json');
    const ecart = '{}\n';
    fs.writeFileSync(fichier, ecart);

    const { code, err } = await lancerReference(racine, '--verifier');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('essai.reference.json');
    expect(fs.readFileSync(fichier, 'utf8')).toBe(ecart);
  });

  it('reference_verifier_signale_une_reference_absente_ou_orpheline', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    const dossier = chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI);
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(chemin(dossier, 'fantome.reference.json'), '{}\n');

    const { code, err } = await lancerReference(racine, '--verifier');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('essai.reference.json');
    expect(err.join('\n')).toContain('fantome.reference.json');
    expect(fs.existsSync(chemin(dossier, 'essai.reference.json'))).toBe(false);
  });

  it('reference_lit_et_ecrit_dans_les_dossiers_donnes', async () => {
    const racine = creerDepotTemporaire(new Map());
    const contenu = chemin(racine, 'ailleurs');
    const references = chemin(racine, 'refs');
    ecrireFichiers(contenu, exempleDeCours());
    const options = ['--contenu', contenu, '--references', references];

    const ecrit = await lancer(racine, 'reference', ...options);
    const verifie = await lancer(racine, 'reference', '--verifier', ...options);

    expect(ecrit.code).toBe(0);
    expect(fs.existsSync(chemin(references, 'essai.reference.json'))).toBe(true);
    expect(verifie.code).toBe(0);
  });

  it('reference_refuse_un_contenu_en_erreur', async () => {
    const fichiers = exempleDeCours();
    sansCarte(fichiers, GRUNDBEGRIFFE, '586my7a4');
    const racine = creerDepotTemporaire(fichiers);

    const { code, err } = await lancerReference(racine);

    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
    expect(fs.existsSync(chemin(racine, DOSSIER_DES_REFERENCES_DE_L_ESSAI))).toBe(false);
  });
});

describe('executer client', () => {
  function ecrireClient(racine: string, dossier: string, fichier: string, texte: string): void {
    const cible = chemin(racine, dossier, fichier);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, texte);
  }

  it('client_code_0_sur_un_dossier_propre_par_defaut_dist_client', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'index.html', '<title>Ancrage</title>');

    const { code, err } = await lancer(racine, 'client');

    expect(err).toEqual([]);
    expect(code).toBe(0);
  });

  it('client_code_1_si_un_texte_de_cours_est_servi', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'a.js', 'x = "Erfundenes Organ für Übungszwecke"');

    const { code, err } = await lancer(racine, 'client');

    expect(code).toBe(1);
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/^a\.js : /);
  });

  it('client_code_1_si_une_valeur_de_la_notice_est_servie', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'a.js', 'x = "mailto:contact@exemple.test"');

    const { code, err } = await lancer(racine, 'client');

    // La cible, et l'adresse qu'elle porte.
    expect(code).toBe(1);
    expect(err).toHaveLength(2);
    expect(err[0]).toMatch(/^a\.js : .*« mailto:contact@exemple\.test »$/);
    expect(err[1]).toMatch(/^a\.js : .*« contact@exemple\.test »$/);
  });

  it('client_lit_le_dossier_donne', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'index.html', '<title>Ancrage</title>');
    ecrireClient(racine, 'autre', 'a.js', 'x = "Erfundenes Organ für Übungszwecke"');

    expect((await lancer(racine, 'client', 'autre')).code).toBe(1);
    expect((await lancer(racine, 'client', 'dist/client')).code).toBe(0);
  });

  it('client_saute_les_dossiers_exclus', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'app', 'index.html', '<title>Ancrage</title>');
    ecrireClient(racine, 'app/node_modules/x', 'a.js', 'x = "Erfundenes Organ für Übungszwecke"');

    const sans = await lancer(racine, 'client', 'app');
    const avec = await lancer(racine, 'client', 'app', '--exclure', 'node_modules');

    expect(sans.code).toBe(1);
    expect(avec.err).toEqual([]);
    expect(avec.code).toBe(0);
  });

  it('client_code_1_si_le_dossier_est_absent', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, err } = await lancer(racine, 'client');

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('dossier du client introuvable');
  });

  it('client_code_1_si_le_contenu_est_en_erreur', async () => {
    const fichiers = exempleDeCours();
    sansCarte(fichiers, GRUNDBEGRIFFE, '586my7a4');
    const racine = creerDepotTemporaire(fichiers);
    ecrireClient(racine, 'dist/client', 'index.html', '<title>Ancrage</title>');

    const { code } = await lancer(racine, 'client');

    expect(code).toBe(1);
  });

  const TEXTE_TOLERE = 'Erfundenes Organ für Übungszwecke';

  function ecrireToleres(racine: string, texte: string): string {
    const fichier = chemin(racine, 'toleres.txt');
    fs.writeFileSync(fichier, texte);
    return fichier;
  }

  it('client_toleres_retire_un_texte_egal_de_la_recherche', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'a.js', `x = "${TEXTE_TOLERE}"`);
    const toleres = ecrireToleres(racine, `# la liste\n\n  ${TEXTE_TOLERE}  \n`);

    const { code, err } = await lancer(racine, 'client', '--toleres', toleres);

    expect(err).toEqual([]);
    expect(code).toBe(0);
  });

  it('client_toleres_code_1_si_une_ligne_ne_vise_aucun_texte_du_cours', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'index.html', '<title>Ancrage</title>');
    const toleres = ecrireToleres(racine, 'Un texte que le cours ne porte pas\n');

    const { code, err } = await lancer(racine, 'client', '--toleres', toleres);

    expect(code).toBe(1);
    expect(err).toEqual(['texte toléré absent du cours : Un texte que le cours ne porte pas']);
  });

  it('client_toleres_ne_cache_pas_les_autres_textes', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'a.js', `x = "${TEXTE_TOLERE}"`);
    ecrireClient(racine, 'dist/client', 'b.js', 'x = "mailto:contact@exemple.test"');
    const toleres = ecrireToleres(racine, `${TEXTE_TOLERE}\n`);

    const { code, err } = await lancer(racine, 'client', '--toleres', toleres);

    expect(code).toBe(1);
    expect(err.some((ligne) => ligne.startsWith('b.js : '))).toBe(true);
    expect(err.some((ligne) => ligne.startsWith('a.js : '))).toBe(false);
  });

  it('client_toleres_ne_retire_que_le_texte_egal_pas_un_plus_long', async () => {
    // Une question du cours devient plus longue que le texte toléré, qui reste un texte du cours.
    const plusLong = `Seit wann bestehen die Beschwerden? ${TEXTE_TOLERE}`;
    const fichiers = modifier(
      exempleDeCours(),
      'essai/textes.yaml',
      'Seit wann bestehen die Beschwerden?',
      plusLong,
    );
    const racine = creerDepotTemporaire(fichiers);
    ecrireClient(racine, 'dist/client', 'a.js', `x = "${plusLong}"`);
    const toleres = ecrireToleres(
      racine,
      `${TEXTE_TOLERE}
`,
    );

    const { code, err } = await lancer(racine, 'client', '--toleres', toleres);

    expect(code).toBe(1);
    expect(err.some((ligne) => ligne.startsWith('a.js : '))).toBe(true);
  });

  it('client_toleres_code_64_si_le_fichier_est_illisible', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    ecrireClient(racine, 'dist/client', 'index.html', '<title>Ancrage</title>');

    const { code, err } = await lancer(racine, 'client', '--toleres', chemin(racine, 'absent.txt'));

    expect(code).toBe(64);
    expect(err.join('\n')).toContain('liste des textes tolérés illisible');
  });

  it('toleres_est_refusee_hors_de_client', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    expect((await lancer(racine, 'verifier', '--toleres', 'x.txt')).code).toBe(64);
  });
});

describe('executer a-verifier', () => {
  function environnement(): Environnement & { pdfs: { html: string; chemin: string }[] } {
    const pdfs: { html: string; chemin: string }[] = [];
    return {
      pdfs,
      date: () => '01.11.2026',
      pdf: async (html, chemin) => {
        pdfs.push({ html, chemin });
        fs.writeFileSync(chemin, '%PDF-factice');
      },
    };
  }

  async function lancerAVerifier(racine: string, env: Environnement, ...args: string[]) {
    vi.spyOn(process, 'cwd').mockReturnValue(racine);
    const out: string[] = [];
    const err: string[] = [];
    const code = await executer(
      ['a-verifier', ...args],
      { out: (l) => out.push(l), err: (l) => err.push(l) },
      racine,
      env,
    );
    return { code, out, err };
  }

  it('a_verifier_ecrit_le_html_et_le_pdf_dans_le_dossier_donne', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());
    const env = environnement();

    const { code, out, err } = await lancerAVerifier(racine, env, 'sortie');

    const dossier = chemin(racine, 'sortie');
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(fs.readdirSync(dossier).sort()).toEqual([
      'essai-a-verifier.html',
      'essai-a-verifier.pdf',
    ]);
    const html = fs.readFileSync(chemin(dossier, 'essai-a-verifier.html'), 'utf8');
    expect(html).toContain('<h1>Zu prüfen</h1>');
    expect(html).toContain('01.11.2026');
    expect(env.pdfs).toEqual([{ html, chemin: chemin(dossier, 'essai-a-verifier.pdf') }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain(chemin(dossier, 'essai-a-verifier.html'));
    expect(out[0]).toMatch(/\(\d+ éléments à vérifier\)/);
    expect(out[1]).toBe(chemin(dossier, 'essai-a-verifier.pdf'));
  });

  it('a_verifier_ecrit_dans_dist_a_verifier_par_defaut', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code } = await lancerAVerifier(racine, environnement());

    expect(code).toBe(0);
    expect(fs.existsSync(chemin(racine, 'dist', 'a-verifier', 'essai-a-verifier.pdf'))).toBe(true);
  });

  it('a_verifier_ne_dit_rien_a_ecrire_sans_element_a_verifier', async () => {
    const fichiers = new Map(
      [...exempleDeCours()].map(([k, v]) => [
        k,
        v.replaceAll('statut: "à vérifier"', 'statut: "source"'),
      ]),
    );
    const racine = creerDepotTemporaire(fichiers);
    const env = environnement();

    const { code, out } = await lancerAVerifier(racine, env);

    expect(code).toBe(0);
    expect(out).toEqual(['aucun élément à vérifier dans les cours.']);
    expect(env.pdfs).toEqual([]);
    expect(fs.existsSync(chemin(racine, 'dist'))).toBe(false);
  });

  it('a_verifier_code_1_si_le_contenu_est_en_erreur', async () => {
    const fichiers = exempleDeCours();
    sansCarte(fichiers, GRUNDBEGRIFFE, '586my7a4');
    const racine = creerDepotTemporaire(fichiers);
    const env = environnement();

    const { code, err } = await lancerAVerifier(racine, env);

    expect(code).toBe(1);
    expect(err.length).toBeGreaterThan(0);
    expect(env.pdfs).toEqual([]);
  });

  it('a_verifier_refuse_deux_dossiers', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    expect((await lancerAVerifier(racine, environnement(), 'a', 'b')).code).toBe(64);
  });
});

describe('executer', () => {
  it('commande_inconnue_code_64', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const { code, err } = await lancer(racine, 'inconnue');

    expect(code).toBe(64);
    expect(err.join('\n')).toContain('usage');
  });

  it('sans_commande_code_64', async () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    expect((await lancer(racine)).code).toBe(64);
  });
});
