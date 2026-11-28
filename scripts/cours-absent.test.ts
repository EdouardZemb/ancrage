import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  arbreDe,
  blobsAPoser,
  cheminHote,
  entreesDeLsTree,
  envoisDeLaCommande,
  lireBatch,
} from './cours-absent.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(RACINE, 'scripts', 'cours-absent.ts');
// Un texte du cours d'exemple, jamais du vrai cours.
const TEXTE_DU_COURS = 'Gerät zum Schlagen von Rahm und Eiweiss';
const EN_TETE = '# textes tolérés\n';

let dossier: string;
let donnees: string;
let depot: string;

// Une identité fixe : la CI n'en a pas de globale, et `commit` comme `commit-tree` l'exigent.
const IDENTITE = ['-c', 'user.name=t', '-c', 'user.email=t@exemple.invalid'];

function git(...args: string[]): void {
  execFileSync('git', [...IDENTITE, '-C', depot, ...args], { stdio: 'ignore' });
}

function commiter(branche: string, fichier: string, contenu: string): void {
  git('checkout', '-q', '-B', branche);
  writeFileSync(join(depot, fichier), contenu);
  git('add', fichier);
  git('commit', '-q', '-m', `test ${branche}`);
}

function hook(commande: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, '--hook'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: commande }, cwd: depot }),
    encoding: 'utf8',
    env: { ...process.env, ANCRAGE_DONNEES: donnees, ...env },
  });
  return { code: r.status, erreur: r.stderr, sortie: r.stdout };
}

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'cours-absent-test-'));
  donnees = join(dossier, 'donnees');
  mkdirSync(donnees);
  cpSync(join(RACINE, 'exemple-contenu'), join(donnees, 'contenu'), { recursive: true });
  writeFileSync(join(donnees, 'textes-toleres.txt'), EN_TETE);
  depot = join(dossier, 'code');
  mkdirSync(depot);
  git('init', '-q');
  commiter('propre', 'README.md', 'rien du cours ici\n');
}, 30000);

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

it('refuse_un_push_dont_un_fichier_porte_un_texte_du_cours', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  const r = hook('git push origin fuite');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain('notes.txt');
}, 60000);

it('laisse_passer_un_push_sans_texte_du_cours', () => {
  const r = hook('git push origin propre');
  expect(r.code).toBe(0);
}, 60000);

it('ne_cherche_pas_pour_une_commande_qui_n_envoie_rien', () => {
  // Une ligne tolérée sans cible ferait échouer toute recherche : un 0 prouve qu'elle n'a pas eu lieu.
  writeFileSync(join(donnees, 'textes-toleres.txt'), `${EN_TETE}absent du cours\n`);
  const r = hook('git status');
  expect(r.code).toBe(0);
  expect(r.erreur).toBe('');
});

it('avertit_et_laisse_passer_sans_depot_de_donnees', () => {
  const absent = join(dossier, 'pas-de-donnees');
  const r = hook('git push origin propre', { ANCRAGE_DONNEES: absent });
  expect(r.code).toBe(0);
  expect(r.erreur).toContain(absent);
});

it('refuse_quand_la_recherche_ne_peut_pas_tourner', () => {
  writeFileSync(join(donnees, 'textes-toleres.txt'), `${EN_TETE}absent du cours\n`);
  const direct = spawnSync(process.execPath, [SCRIPT, '--donnees', donnees], {
    cwd: depot,
    encoding: 'utf8',
  });
  expect(direct.status).toBe(2);
  const r = hook('git push origin propre');
  expect(r.code).toBe(2);
}, 60000);

it('cherche_dans_la_branche_que_nomme_le_push', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  git('checkout', '-q', 'propre'); // HEAD est propre, la branche nommée porte le texte
  expect(hook('git push origin fuite').code).toBe(2);
  expect(hook('git push origin propre').code).toBe(0);
}, 120000);

it('cherche_dans_le_depot_que_nomme_git_c', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  const ailleurs = join(dossier, 'ailleurs');
  mkdirSync(ailleurs);
  const r = spawnSync(process.execPath, [SCRIPT, '--hook'], {
    input: JSON.stringify({
      tool_input: { command: 'git -C ../code push origin fuite' },
      cwd: join(dossier, 'ailleurs'),
    }),
    encoding: 'utf8',
    env: { ...process.env, ANCRAGE_DONNEES: donnees },
  });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('notes.txt');
}, 60000);

it('cherche_dans_chaque_branche_pour_push_all', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  git('checkout', '-q', 'propre');
  expect(hook('git push --all origin').code).toBe(2);
}, 120000);

it('reconnait_les_options_globales_de_git_sans_c_majuscule', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  git('checkout', '-q', 'propre');
  expect(hook('git -c core.quotepath=false --no-pager push origin fuite').code).toBe(2);
}, 60000);

function fuite(): void {
  commiter(
    'fuite',
    'notes.txt',
    `${TEXTE_DU_COURS}
`,
  );
  git('checkout', '-q', 'propre');
}

it('cherche_quand_git_push_passe_par_un_interprete', () => {
  fuite();
  expect(hook('bash -c "git push origin fuite"').code).toBe(2);
  expect(hook("sh -c 'git push origin fuite'").code).toBe(2);
}, 120000);

it('cherche_quand_git_est_nomme_par_son_chemin', () => {
  fuite();
  git('checkout', '-q', 'fuite');
  expect(hook('C:/x/git.exe push origin fuite').code).toBe(2);
  expect(hook('/usr/bin/git push').code).toBe(2);
  expect(hook('powershell -Command "& C:\\x\\git.exe push"').code).toBe(2);
}, 180000);

it('reconnait_un_dossier_entre_guillemets_apres_git_c', () => {
  fuite();
  const avecEspace = join(dossier, 'mon dossier');
  renameSync(depot, avecEspace);
  depot = avecEspace;
  const r = spawnSync(process.execPath, [SCRIPT, '--hook'], {
    input: JSON.stringify({
      tool_input: { command: `git -C "${avecEspace}" push origin fuite` },
      cwd: dossier,
    }),
    encoding: 'utf8',
    env: { ...process.env, ANCRAGE_DONNEES: donnees },
  });
  expect(r.status).toBe(2);
}, 60000);

it('trouve_le_depot_de_donnees_depuis_un_worktree', () => {
  fuite();
  const principal = join(dossier, 'principal');
  renameSync(depot, principal);
  depot = principal;
  renameSync(donnees, join(dossier, 'ancrage-donnees'));
  const worktree = join(dossier, 'principal.worktrees', 'sujet');
  git('worktree', 'add', '-q', worktree, 'fuite');
  const env = { ...process.env };
  delete env.ANCRAGE_DONNEES;
  const r = spawnSync(process.execPath, [SCRIPT, '--hook'], {
    input: JSON.stringify({
      tool_input: { command: 'git push origin fuite' },
      cwd: worktree,
    }),
    encoding: 'utf8',
    env,
  });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('notes.txt');
}, 60000);

// Le hook lit chaque commit que l'envoi publie, pas seulement la tête (LE-31).
it('refuse_un_commit_intermediaire_qui_porte_un_texte_du_cours_la_tete_etant_propre', () => {
  commiter('longue', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  commiter('longue', 'suite.txt', 'rien du cours\n');
  git('rm', '-q', 'notes.txt');
  git('commit', '-q', '-m', 'retrait du texte');
  const r = hook('git push origin longue');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain('notes.txt');
}, 180000);

it('ne_relit_pas_ce_que_le_distant_a_deja', () => {
  commiter('longue', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  const distant = join(dossier, 'distant.git');
  execFileSync('git', ['init', '-q', '--bare', distant], { stdio: 'ignore' });
  git('remote', 'add', 'origin', distant);
  git('push', '-q', 'origin', 'longue');
  git('fetch', '-q', 'origin');
  git('rm', '-q', 'notes.txt');
  git('commit', '-q', '-m', 'retrait du texte');
  expect(hook('git push origin longue').code).toBe(0);
}, 120000);

// Une redirection ou un tube après la branche n'est pas une référence.
it('coupe_la_commande_d_envoi_a_la_premiere_redirection_ou_au_premier_enchainement', () => {
  const cwd = process.cwd();
  const attendu = [{ depot: null, distant: 'origin', refs: ['fix/x'] }];
  for (const suffixe of [
    '2>&1',
    '2>&1 | tail -5',
    '> /dev/null',
    '>/dev/null',
    '2>/dev/null',
    '&> sortie.txt',
    '< entree.txt',
    '| tail -5',
    '; echo fini',
    '&& echo fini',
    '|| true',
  ]) {
    expect(envoisDeLaCommande(`git push origin fix/x ${suffixe}`, cwd), suffixe).toEqual(attendu);
  }
});

it('laisse_passer_un_envoi_propre_suivi_d_une_redirection_et_refuse_un_envoi_qui_fuit', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  expect(hook('git push origin propre 2>&1 | tail -5').code).toBe(0);
  expect(hook('git push origin fuite 2>&1 | tail -5').code).toBe(2);
}, 180000);

// Sous Windows, Git Bash écrit `/c/…` pour `C:\…`.
it('lit_un_chemin_git_bash_comme_un_chemin_windows', () => {
  expect(cheminHote('/c/src/x', 'win32')).toBe('C:/src/x');
  expect(cheminHote('/D/src', 'win32')).toBe('D:/src');
  expect(cheminHote('/c', 'win32')).toBe('C:/');
  expect(cheminHote('/c/', 'win32')).toBe('C:/');
  expect(cheminHote('C:/src/x', 'win32')).toBe('C:/src/x');
  expect(cheminHote('C:\\src\\x', 'win32')).toBe('C:\\src\\x');
  expect(cheminHote('/cours/x', 'win32')).toBe('/cours/x');
  expect(cheminHote('rel/x', 'win32')).toBe('rel/x');
  expect(cheminHote('/c/src/x', 'linux')).toBe('/c/src/x');
});

it.runIf(process.platform === 'win32')(
  'cherche_dans_le_depot_que_git_c_nomme_en_chemin_git_bash',
  () => {
    commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
    const droit = depot.replaceAll('\\', '/');
    const bash = droit.replace(/^([A-Za-z]):/, (_m, l: string) => `/${l.toLowerCase()}`);
    expect(bash.startsWith('/')).toBe(true);
    const ailleurs = join(dossier, 'ailleurs');
    mkdirSync(ailleurs);
    for (const chemin of [bash, depot, droit]) {
      const r = spawnSync(process.execPath, [SCRIPT, '--hook'], {
        input: JSON.stringify({
          tool_input: { command: `git -C ${chemin} push origin fuite` },
          cwd: ailleurs,
        }),
        encoding: 'utf8',
        env: { ...process.env, ANCRAGE_DONNEES: donnees },
      });
      expect(r.status, chemin).toBe(2);
      expect(r.stderr, chemin).toContain('notes.txt');
    }
  },
  180000,
);

// Une explication est un texte du cours (M10) : la copie de l'exemple que porte le dépôt de données
// voisin la contient, et le hook la cherche. Garde : sans les explications dans `textesDeTache`,
// le hook rend 0 ici.
it('refuse_un_push_dont_un_fichier_porte_une_explication_du_cours', () => {
  const explication =
    'Durch die Löcher des Siebs läuft das Kochwasser ab, die Teigwaren bleiben drin.';
  commiter('fuite', 'notes.txt', `${explication}\n`);
  const r = hook('git push origin fuite');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain('notes.txt');
  expect(hook('git push origin propre').code).toBe(0);
}, 120000);

// Une seule recherche par envoi (ancrage#93) : chaque commit publié est cherché, sans que la
// recherche se relance ni relise un contenu déjà posé.
function sha(reference = 'HEAD'): string {
  return execFileSync('git', ['-C', depot, 'rev-parse', reference], { encoding: 'utf8' }).trim();
}

// Cinq commits sur une branche neuve ; le deuxième porte `contenu`, le troisième le retire.
function cinqCommitsDontLeDeuxiemeFuit(contenu: string): string {
  commiter('cinq', 'un.txt', 'rien du cours\n');
  commiter('cinq', 'notes.txt', `${contenu}\n`);
  const fautif = sha();
  git('rm', '-q', 'notes.txt');
  writeFileSync(join(depot, 'trois.txt'), 'rien du cours non plus\n');
  git('add', 'trois.txt');
  git('commit', '-q', '-m', 'retrait du texte');
  commiter('cinq', 'quatre.txt', 'toujours rien\n');
  commiter('cinq', 'cinq.txt', 'encore rien\n');
  return fautif;
}

it('refuse_un_envoi_dont_le_deuxieme_commit_fuit_et_nomme_ce_commit_par_son_sha', () => {
  const fautif = cinqCommitsDontLeDeuxiemeFuit(TEXTE_DU_COURS);
  const r = hook('git push origin cinq');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain(`${fautif}/notes.txt`);
  expect(r.erreur).toContain('est le commit qui le porte');
}, 120000);

it('ne_lance_qu_une_recherche_pour_cinq_commits_propres', () => {
  cinqCommitsDontLeDeuxiemeFuit('rien du cours en deuxieme');
  const r = hook('git push origin cinq');
  expect(r.code).toBe(0);
  expect(r.erreur.split('aucun texte de cours dans').length - 1).toBe(1);
}, 120000);

// Les chemins à poser, commit par commit (la tête d'abord), d'après les vrais arbres de git.
function aPoserPour(commits: string[]): string[][] {
  return blobsAPoser(commits.map((c) => arbreDe(depot, c))).map((poses) =>
    poses.map((entree) => entree.chemin),
  );
}

it('ne_pose_un_fichier_identique_des_cinq_commits_qu_une_fois', () => {
  const shas: string[] = [];
  commiter('cinq', 'meme.txt', 'identique partout\n');
  for (const i of [1, 2, 3, 4, 5]) {
    if (i > 1) git('rm', '-q', `f${i - 1}.txt`);
    writeFileSync(join(depot, `f${i}.txt`), `contenu ${i}\n`);
    git('add', `f${i}.txt`);
    git('commit', '-q', '-m', `commit ${i}`);
    shas.unshift(sha());
  }
  const poses = aPoserPour(shas);
  // la tête en entier, puis le seul fichier propre à chaque commit
  expect(poses[0]).toContain('meme.txt');
  expect(poses.slice(1)).toEqual([['f4.txt'], ['f3.txt'], ['f2.txt'], ['f1.txt']]);
  expect(poses.flat().filter((chemin) => chemin === 'meme.txt')).toHaveLength(1);
}, 60000);

it('ne_pose_rien_de_plus_pour_un_renommage_sans_changement_ni_pour_un_retrait', () => {
  commiter('cinq', 'a.txt', 'contenu de a\n');
  const a = sha();
  git('mv', 'a.txt', 'b.txt');
  git('commit', '-q', '-m', 'renommage');
  const b = sha();
  git('rm', '-q', 'b.txt');
  git('commit', '-q', '-m', 'retrait');
  const c = sha();
  commiter('cinq', 'd.txt', 'contenu de d\n');
  const d = sha();
  const poses = aPoserPour([d, c, b, a]);
  expect(poses[1]).toEqual([]); // le retrait
  expect(poses[2]).toEqual(['b.txt']); // le renommage : le contenu n'a plus d'autre porteur
  expect(poses[3]).toEqual([]); // avant le renommage : même contenu que b.txt
}, 60000);

it('cherche_une_seule_reference_avec_commit', () => {
  commiter('fuite', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  git('checkout', '-q', 'propre');
  const direct = (reference: string) =>
    spawnSync(process.execPath, [SCRIPT, '--donnees', donnees, '--commit', reference], {
      cwd: depot,
      encoding: 'utf8',
    });
  expect(direct('fuite').status).toBe(2);
  expect(direct('propre').status).toBe(0);
  expect(direct('inconnue').status).not.toBe(0);
}, 120000);

// Ce que la relecture a demandé (ancrage#93) : on cherche les octets des blobs que l'envoi publie,
// sans attribut ni filtre de git, et un chemin que le disque ne sait pas écrire fait refuser.
function commiterDans(branche: string, fichier: string, contenu: string): void {
  mkdirSync(dirname(join(depot, fichier)), { recursive: true });
  commiter(branche, fichier, contenu);
}

function sortieGit(entree: string, ...args: string[]): string {
  return execFileSync('git', [...IDENTITE, '-C', depot, ...args], {
    encoding: 'utf8',
    input: entree,
  }).trim();
}

it('refuse_un_texte_qu_un_commit_ancien_porte_quand_la_tete_met_son_dossier_en_export_ignore', () => {
  commiterDans('piege', 'tests/fixture.ts', `const f = "${TEXTE_DU_COURS}";\n`);
  commiter('piege', '.gitattributes', 'tests/ export-ignore\n');
  const r = hook('git push origin piege');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain(`${sha()}/tests/fixture.ts`); // la tête garde le fichier
}, 120000);

it('cherche_aussi_avec_commit_un_fichier_que_le_commit_met_en_export_ignore', () => {
  commiterDans('piege', 'tests/fixture.ts', `const f = "${TEXTE_DU_COURS}";\n`);
  commiter('piege', '.gitattributes', 'tests/ export-ignore\n');
  const direct = spawnSync(process.execPath, [SCRIPT, '--donnees', donnees, '--commit', 'piege'], {
    cwd: depot,
    encoding: 'utf8',
  });
  expect(direct.status).toBe(2);
  expect(direct.stderr).toContain('tests/fixture.ts');
}, 120000);

// Une branche `piege` de deux commits, sans toucher à la copie de travail (git ne sait pas écrire
// tous ces chemins) : le premier a pour arbre `arbre`, la tête a celui de `propre`.
function branchePiege(arbre: string): string {
  const fautif = sortieGit('piege\n', 'commit-tree', '-p', sha('propre'), '-m', 'piege', arbre);
  const tete = sortieGit('propre\n', 'commit-tree', '-p', fautif, '-m', 'tete', 'propre^{tree}');
  git('update-ref', 'refs/heads/piege', tete);
  return fautif;
}

// Une branche dont le premier commit porte les fichiers `[nom, contenu]`.
function brancheAvecNoms(fichiers: [string, string][]): string {
  const lignes = fichiers.map(([nom, contenu]) => {
    const blob = sortieGit(contenu, 'hash-object', '-w', '--stdin');
    return `100644 blob ${blob}\t${nom}\n`;
  });
  return branchePiege(sortieGit(lignes.join(''), 'mktree'));
}

// Une branche dont le premier commit porte un fichier au chemin `segments` (un arbre par segment).
function brancheAvecChemin(segments: string[], contenu: string): string {
  const blob = sortieGit(contenu, 'hash-object', '-w', '--stdin');
  let objet = blob;
  let type = 'blob';
  for (const segment of [...segments].reverse()) {
    const mode = type === 'blob' ? '100644' : '040000';
    objet = sortieGit(`${mode} ${type} ${objet}\t${segment}\n`, 'mktree');
    type = 'tree';
  }
  return branchePiege(objet);
}

it('refuse_un_commit_dont_un_chemin_remonte_par_deux_points', () => {
  for (const segments of [
    ['sub', '..'],
    ['sub', '..', 'x.txt'],
    ['sub', '..', '..', 'x.txt'],
  ]) {
    const fautif = brancheAvecChemin(segments, `${TEXTE_DU_COURS}\n`);
    const r = hook('git push origin piege');
    expect(r.code, segments.join('/')).toBe(2);
    expect(r.erreur).toContain(fautif);
    expect(r.erreur).toContain("n'a pas pu tourner");
    expect(r.erreur).not.toContain(TEXTE_DU_COURS);
  }
}, 180000);

it.runIf(process.platform === 'win32')(
  'refuse_un_chemin_que_windows_ne_peut_pas_ecrire',
  () => {
    for (const nom of ['notes:txt', '..\\x', 'fin.', 'a|b']) {
      brancheAvecNoms([[nom, `${TEXTE_DU_COURS}\n`]]);
      const r = hook('git push origin piege');
      expect(r.code, nom).toBe(2);
      expect(r.erreur, nom).toContain("n'a pas pu tourner");
    }
  },
  180000,
);

it('refuse_deux_noms_qui_ne_different_que_par_la_casse', () => {
  // Le premier nom porte le texte, le second un contenu propre : sans refus, il l'écraserait.
  const fautif = brancheAvecNoms([
    ['Notes.txt', `${TEXTE_DU_COURS}\n`],
    ['notes.txt', 'rien du cours\n'],
  ]);
  const r = hook('git push origin piege');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain(fautif);
  if (process.platform === 'win32') expect(r.erreur).toContain("n'a pas pu tourner");
}, 120000);

it('refuse_quand_l_arbre_de_la_tete_est_vide', () => {
  const vide = sortieGit('', 'hash-object', '-w', '-t', 'tree', '--stdin');
  const tete = sortieGit('x\n', 'commit-tree', '-p', sha('propre'), '-m', 'tout retire', vide);
  git('checkout', '-q', '-B', 'piege', tete);
  const r = hook('git push origin piege');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain("n'a pas pu tourner");
}, 60000);

it('lit_ls_tree_et_cat_file_sans_rien_laisser_passer_d_illisible', () => {
  const sha1 = 'a'.repeat(40);
  const sha2 = 'b'.repeat(40);
  const nul = String.fromCharCode(0);
  expect(entreesDeLsTree('')).toEqual([]);
  expect(
    entreesDeLsTree(`100644 blob ${sha1}\tun.txt${nul}160000 commit ${sha2}\tsous${nul}`),
  ).toEqual([{ blob: sha1, chemin: 'un.txt' }]);
  expect(() => entreesDeLsTree(`100644 blob ${sha1}\tun.txt`)).toThrow();
  expect(() => entreesDeLsTree(`n importe quoi${nul}`)).toThrow();
  const lot = (sha: string, taille: number, contenu: string, fin = '\n') =>
    Buffer.from(`${sha} blob ${taille}\n${contenu}${fin}`, 'latin1');
  expect(lireBatch(lot(sha1, 3, 'abc'), [sha1]).map(String)).toEqual(['abc']);
  expect(() => lireBatch(lot(sha1, 99, 'abc'), [sha1])).toThrow(); // longueur hors du tampon
  expect(() => lireBatch(lot(sha1, 3, 'abc', ''), [sha1])).toThrow(); // LF final absent
  expect(() => lireBatch(lot(sha1, 3, 'abcd'), [sha1])).toThrow(); // LF attendu à la place de d
  expect(() => lireBatch(lot(sha2, 3, 'abc'), [sha1])).toThrow(); // SHA qui diffère
  expect(() => lireBatch(Buffer.concat([lot(sha1, 3, 'abc'), Buffer.from('x')]), [sha1])).toThrow();
});

it('refuse_un_texte_que_seul_le_premier_commit_de_la_branche_porte_avec_un_distant', () => {
  const distant = join(dossier, 'distant.git');
  execFileSync('git', ['init', '-q', '--bare', distant], { stdio: 'ignore' });
  git('remote', 'add', 'origin', distant);
  git('push', '-q', 'origin', 'propre');
  git('fetch', '-q', 'origin');
  commiter('longue', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  const fautif = sha();
  git('rm', '-q', 'notes.txt');
  git('commit', '-q', '-m', 'retrait du texte');
  commiter('longue', 'autre.txt', 'rien du cours\n');
  const r = hook('git push origin longue');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain(`${fautif}/notes.txt`);
}, 120000);

it('lit_plusieurs_blobs_dont_un_binaire_et_un_chemin_accentue', () => {
  git('checkout', '-q', '-B', 'longue');
  writeFileSync(join(depot, 'a.bin'), Buffer.from([0, 10, 255, 128, 10, 0, 13, 10]));
  mkdirSync(join(depot, 'dossier à'));
  writeFileSync(join(depot, 'dossier à', 'b é.txt'), `${TEXTE_DU_COURS}\n`);
  writeFileSync(join(depot, 'z.txt'), 'rien du cours\n');
  git('add', 'a.bin', 'dossier à/b é.txt', 'z.txt');
  git('commit', '-q', '-m', 'trois fichiers');
  const fautif = sha();
  git('rm', '-q', 'a.bin', 'dossier à/b é.txt', 'z.txt');
  git('commit', '-q', '-m', 'retrait');
  const r = hook('git push origin longue');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain(`${fautif}/dossier à/b é.txt`);
}, 120000);

it('nomme_le_premier_commit_de_l_envoi_qui_porte_un_contenu_porte_par_deux_commits', () => {
  commiter('longue', 'notes.txt', `${TEXTE_DU_COURS}\n`);
  const ancien = sha();
  commiter('longue', 'copie.txt', 'rien du cours\n');
  const recent = sha();
  git('rm', '-q', 'notes.txt');
  git('commit', '-q', '-m', 'retrait');
  const r = hook('git push origin longue');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain(`${recent}/notes.txt`);
  expect(r.erreur).not.toContain(ancien);
  expect(r.erreur).toContain("Retirer le texte de chaque commit de l'envoi qui le porte");
}, 120000);

it('ne_dit_pas_un_texte_du_cours_quand_le_contenu_est_en_defaut', () => {
  rmSync(join(donnees, 'contenu'), { recursive: true, force: true });
  const r = hook('git push origin propre');
  expect(r.code).toBe(2);
  expect(r.erreur).toContain("n'a pas pu tourner");
  expect(r.erreur).not.toContain('un texte du cours est dans');
}, 60000);

it('retire_les_dossiers_de_recherche_de_plus_d_une_heure_du_dossier_temporaire', () => {
  const temp = join(dossier, 'temp');
  mkdirSync(temp);
  const vieux = join(temp, 'cours-absent-vieux');
  const recent = join(temp, 'cours-absent-recent');
  const autre = join(temp, 'autre-vieux');
  for (const d of [vieux, recent, autre]) mkdirSync(d);
  const ancien = new Date(Date.now() - 2 * 3600 * 1000);
  utimesSync(vieux, ancien, ancien);
  utimesSync(autre, ancien, ancien);
  const r = hook('git push origin propre', { TEMP: temp, TMP: temp, TMPDIR: temp });
  expect(r.code).toBe(0);
  expect(existsSync(vieux)).toBe(false);
  expect(existsSync(recent)).toBe(true);
  expect(existsSync(autre)).toBe(true);
}, 60000);
