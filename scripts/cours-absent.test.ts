import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cheminHote, envoisDeLaCommande } from './cours-absent.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(RACINE, 'scripts', 'cours-absent.ts');
// Un texte du cours d'exemple, jamais du vrai cours.
const TEXTE_DU_COURS = 'Gerät zum Schlagen von Rahm und Eiweiss';
const EN_TETE = '# textes tolérés\n';

let dossier: string;
let donnees: string;
let depot: string;

function git(...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@exemple.invalid', '-C', depot, ...args],
    { stdio: 'ignore' },
  );
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
