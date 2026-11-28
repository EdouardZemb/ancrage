/*
 * La recherche du cours avant un envoi au dépôt public (S3-D6). Le cours vit dans le dépôt de
 * données ; le dépôt de code ne doit en porter aucun texte. Le script cherche les textes de
 * `<données>/contenu` dans les fichiers suivis des commits qu'un envoi publie, en une seule
 * recherche (`git archive` pour la tête, `git cat-file` pour les blobs nouveaux), sauf ceux de
 * `<données>/textes-toleres.txt`.
 *
 *   node scripts/cours-absent.ts [--donnees <dossier>] [--commit <réf>]
 *   node scripts/cours-absent.ts --hook            (entrée JSON de `PreToolUse` sur stdin)
 *
 * Les données sont `--donnees`, sinon `ANCRAGE_DONNEES`, sinon `ancrage-donnees` à côté du
 * clone principal (le parent du dossier git commun, `git rev-parse --git-common-dir`). Le dépôt cherché est le dossier courant (en mode hook, le `cwd` de l'entrée).
 *
 * Codes : 0 aucun texte du cours ; 1 la recherche n'a pas pu tourner ; 2 un texte du cours, ou
 * (avec `--hook`) tout code autre que 0, pour que Claude Code bloque la commande ; 64 usage.
 *
 * Lancé par `node` (Node 24 retire les types) : il n'importe que des modules `node:`. La recherche
 * lance la CLI de contenu (`--import tsx`), sans l'importer.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIGNE_RECHERCHE_FAITE = 'aucun texte de cours dans';
const RACINE = fileURLToPath(new URL('..', import.meta.url));

class Usage extends Error {}

// Un envoi que dit une commande : le dépôt (null : celui du hook), le distant nommé (le premier mot
// qui suit `push`, `origin` s'il manque ; absent pour une recherche directe, qui ne lit que la
// référence donnée) et les références envoyées (`'tout'` : chaque branche locale, pour `--all` et
// `--mirror`).
export type Envoi = { depot: string | null; distant?: string; refs: string[] | 'tout' };

// Sous Windows, Git Bash écrit `/c/src/x` pour le lecteur C : `/<lettre>` seul, ou suivi d'une
// barre, se lit comme un lecteur. Un chemin `C:/…`, `C:\…` ou relatif reste tel quel, comme sur un
// autre système.
export function cheminHote(chemin: string, plateforme: string = process.platform): string {
  if (plateforme !== 'win32') return chemin;
  const m = /^\/([A-Za-z])(?:\/(.*))?$/.exec(chemin);
  return m ? `${(m[1] as string).toUpperCase()}:/${m[2] ?? ''}` : chemin;
}

// Une redirection (`>`, `2>`, `>>`, `<`…) ferme la commande d'envoi : ce qui la suit n'est pas une
// référence. Le `&` de `2>&1` et de `&>` coupe déjà la commande avant ses mots (`lesEnvois`).
const REDIRECTION = /^\d*[<>]/;

// Les options globales de git qui prennent une valeur dans le mot suivant.
const OPTIONS_A_VALEUR = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
]);

// Les envois que fait une commande : chaque `git [options] push …`, options globales comprises
// (`-C`, `-c`, `--git-dir=…`, `--no-pager`…). Vide pour une commande qui n'envoie rien. La source
// d'un refspec est ce qui est envoyé ; sans source lisible, `HEAD` : un envoi n'est jamais laissé
// passer sans recherche, et une référence illisible fait échouer la recherche, donc refuse.
// Les étiquettes (`--tags`, `--follow-tags`, `refs/tags/…`) ne sont pas traitées à part : le garde
// du modèle refuse déjà leur envoi par une session.
export function envoisDeLaCommande(commande: string, cwd: string): Envoi[] {
  const envois = lesEnvois(commande, cwd);
  // Le filet : `git` (ou `git.exe`, ou un chemin qui finit par l'un des deux) et le mot `push`
  // paraissent, et l'analyse n'en tire aucun envoi (`bash -c "…"`, une forme que l'on n'a pas
  // prévue) : on cherche `HEAD` du dépôt courant, jamais rien.
  if (
    envois.length === 0 &&
    NOMME_GIT.test(commande) &&
    /(?:^|[^\w-])push(?![\w-])/.test(commande)
  ) {
    return [{ depot: null, refs: ['HEAD'] }];
  }
  return envois;
}

const NOMME_GIT = /(?:^|[^\w.-])(?:[^\s;&|"'`]*[\\/])?git(?:\.exe)?(?![\w.-])/i;

// Les mots d'une commande, les guillemets simples et doubles groupant ce qu'ils entourent. Un
// guillemet jamais fermé tient jusqu'à la fin.
export function motsDe(texte: string): string[] {
  const mots: string[] = [];
  let mot = '';
  let present = false;
  let guillemet: string | null = null;
  for (const c of texte) {
    if (guillemet !== null) {
      if (c === guillemet) guillemet = null;
      else mot += c;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      present = true;
    } else if (/\s/.test(c)) {
      if (present) mots.push(mot);
      mot = '';
      present = false;
    } else {
      mot += c;
      present = true;
    }
  }
  if (present) mots.push(mot);
  return mots;
}

function lesEnvois(commande: string, cwd: string): Envoi[] {
  const envois: Envoi[] = [];
  for (const m of commande.matchAll(
    /(?:^|[\s;&|("'`])(?:[^\s;&|"'`]*[\\/])?git(?:\.exe)?\s+([^;&|\n`]*)/gi,
  )) {
    const mots = motsDe(m[1] ?? '');
    let depot = cwd;
    let changeDeDepot = false;
    let i = 0;
    for (; i < mots.length && mots[i] !== 'push'; i++) {
      const mot = mots[i] as string;
      if (!mot.startsWith('-')) break;
      if (OPTIONS_A_VALEUR.has(mot)) {
        i++;
        if (mot === '-C') {
          depot = resolve(depot, cheminHote(mots[i] ?? ''));
          changeDeDepot = true;
        }
      }
    }
    if (mots[i] !== 'push') continue;
    const finDeCommande = mots.findIndex((mot, rang) => rang > i && REDIRECTION.test(mot));
    const apres = mots.slice(i + 1, finDeCommande === -1 ? undefined : finDeCommande);
    const tout = apres.some((mot) => mot === '--all' || mot === '--mirror');
    const positionnels = apres.filter((mot) => !mot.startsWith('-'));
    const refspecs = positionnels.slice(1);
    const sources = refspecs
      .map((refspec) => refspec.replace(/^\+/, '').split(':')[0] ?? '')
      .filter((source) => source !== '');
    envois.push({
      depot: changeDeDepot ? depot : null,
      distant: positionnels[0] ?? 'origin',
      refs: tout ? 'tout' : sources.length > 0 ? sources : ['HEAD'],
    });
  }
  return envois;
}

function codeDeLaRecherche(statut: number | null, sortie: string): number {
  if (statut === 0) return sortie.includes(LIGNE_RECHERCHE_FAITE) ? 0 : 1;
  if (statut === 1) return 2;
  if (statut === 64) return 64;
  return 1;
}

// Un fichier d'un arbre : son blob (le contenu) et son chemin. Un sous-module (type `commit`) n'en
// est pas un, et `arbreDe` ne le rend pas.
export type Entree = { blob: string; chemin: string };

// Les fichiers d'un commit (`git ls-tree -r -z` : `<mode> <type> <blob>\t<chemin>`, séparés par un
// octet nul). Une erreur de git (référence illisible) remonte : la recherche échoue.
export function arbreDe(depot: string, commit: string): Entree[] {
  const sortie = execFileSync('git', ['-C', depot, 'ls-tree', '-r', '-z', commit], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const entrees: Entree[] = [];
  for (const ligne of sortie.split('\0')) {
    const m = /^\d+ (\w+) ([0-9a-f]+)\t(.*)$/s.exec(ligne);
    if (m !== null && m[1] === 'blob') {
      entrees.push({ blob: m[2] as string, chemin: m[3] as string });
    }
  }
  return entrees;
}

// Ce qu'il faut poser pour chaque commit, la tête d'abord. La tête (le premier arbre) est posée en
// entier, par `git archive`. Chaque commit suivant ne reçoit que les fichiers dont le blob n'a été
// posé ni pour la tête ni pour un commit d'avant, et un seul chemin par blob : un fichier inchangé,
// renommé sans changement ou retiré ne fait rien chercher de plus.
export function blobsAPoser(arbres: Entree[][]): Entree[][] {
  const vus = new Set<string>();
  return arbres.map((arbre, rang) => {
    const aPoser: Entree[] = [];
    for (const entree of arbre) {
      const dejaVu = vus.has(entree.blob);
      vus.add(entree.blob);
      if (rang === 0 || !dejaVu) aPoser.push(entree);
    }
    return aPoser;
  });
}

// Le SHA complet du commit que nomme une référence ; une référence illisible fait échouer.
function shaDe(depot: string, reference: string): string {
  return execFileSync(
    'git',
    ['-C', depot, 'rev-parse', '--verify', '--end-of-options', `${reference}^{commit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

// Les contenus des blobs, en un seul processus `git cat-file --batch`, dans l'ordre demandé.
function contenusDe(depot: string, blobs: string[]): Buffer[] {
  if (blobs.length === 0) return [];
  const r = spawnSync('git', ['-C', depot, 'cat-file', '--batch'], {
    input: `${blobs.join('\n')}\n`,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git cat-file a échoué : ${String(r.stderr).trim()}`);
  const sortie = r.stdout;
  const contenus: Buffer[] = [];
  let pos = 0;
  for (const blob of blobs) {
    const fin = sortie.indexOf(0x0a, pos);
    const entete = fin === -1 ? '' : sortie.toString('utf8', pos, fin);
    const m = /^[0-9a-f]+ blob (\d+)$/.exec(entete);
    if (m === null) throw new Error(`blob illisible : ${blob} (${entete})`);
    const taille = Number(m[1]);
    contenus.push(sortie.subarray(fin + 1, fin + 1 + taille));
    pos = fin + 1 + taille + 1;
  }
  return contenus;
}

// Les commits d'un dépôt qu'un envoi publie, la tête d'abord.
type Lot = { depot: string; commits: string[] };

// Une seule recherche pour tout l'envoi. Sous un dossier temporaire, un dossier par commit, nommé
// par son SHA complet (sous `d1`, `d2`… si plusieurs dépôts sont nommés). La tête de chaque dépôt y
// est posée en entier, chaque autre commit avec ses seuls blobs nouveaux. La CLI de contenu ne se
// lance qu'une fois, sur le dossier : le dossier de chaque fichier qu'elle nomme est le commit qui
// le porte.
function chercher(lots: Lot[], donnees: string): number {
  const dossier = mkdtempSync(join(tmpdir(), 'cours-absent-'));
  try {
    const arbre = join(dossier, 'arbre');
    mkdirSync(arbre);
    lots.forEach((lot, rang) => {
      if (lots.length > 1) console.error(`cours-absent : d${rang + 1} est le dépôt ${lot.depot}`);
      poser(lot, dossier, lots.length > 1 ? `arbre/d${rang + 1}` : 'arbre', rang);
    });
    const args = [
      '--import',
      'tsx',
      join(RACINE, 'src/serveur/contenus/cli.ts'),
      'client',
      arbre,
      '--contenu',
      join(donnees, 'contenu'),
    ];
    const toleres = join(donnees, 'textes-toleres.txt');
    if (existsSync(toleres)) args.push('--toleres', toleres);
    const r = spawnSync(process.execPath, args, {
      cwd: RACINE,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) throw new Usage(`recherche du cours impossible : ${r.error.message}`);
    process.stderr.write(`${r.stdout}${r.stderr}`);
    return codeDeLaRecherche(r.status, r.stdout);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

// Pose les commits d'un lot sous `<dossier>/<racine>/<sha>`.
function poser(lot: Lot, dossier: string, racine: string, rang: number): void {
  const { depot } = lot;
  const shas = lot.commits.map((reference) => shaDe(depot, reference));
  const uniques = shas.filter((sha, i) => shas.indexOf(sha) === i);
  const [tete] = uniques;
  if (tete === undefined) return;
  const aPoser = blobsAPoser(uniques.map((sha) => arbreDe(depot, sha)));
  // La tête, entière, par `git archive`.
  const archive = `archive-${rang}.tar`;
  execFileSync(
    'git',
    ['-C', depot, 'archive', '--format=tar', '-o', join(dossier, archive), tete],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  // `tar` ignore un chemin `C:\…` : relatif au dossier temporaire, comme avant.
  const dossierDeTete = join(racine, tete);
  mkdirSync(join(dossier, dossierDeTete), { recursive: true });
  execFileSync(
    'tar',
    ['-xf', archive, '-C', dossierDeTete.replaceAll(String.fromCharCode(92), '/')],
    {
      cwd: dossier,
      stdio: 'ignore',
    },
  );
  // Les autres commits : leurs blobs nouveaux, lus en un seul processus.
  const demandes = uniques
    .slice(1)
    .flatMap((sha, i) => (aPoser[i + 1] ?? []).map((entree) => ({ sha, entree })));
  const contenus = contenusDe(
    depot,
    demandes.map((d) => d.entree.blob),
  );
  demandes.forEach(({ sha, entree }, i) => {
    const chemin = join(dossier, racine, sha, entree.chemin);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, contenus[i] as Buffer);
  });
}

function lireOptions(args: string[]) {
  const o = {
    hook: false,
    donnees: undefined as string | undefined,
    commit: undefined as string | undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--hook') o.hook = true;
    else if (a === '--donnees' || a === '--commit') {
      const v = args[++i];
      if (v === undefined) throw new Usage(`${a} demande une valeur`);
      if (a === '--donnees') o.donnees = v;
      else o.commit = v;
    } else throw new Usage(`option inconnue : ${a}`);
  }
  return o;
}

function lireStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function principal(args: string[]): number {
  const o = lireOptions(args);
  let depotDuHook = process.cwd();
  let envois: Envoi[] = [{ depot: null, refs: [o.commit ?? 'HEAD'] }];
  if (o.hook) {
    let entree: { cwd?: unknown; tool_input?: { command?: unknown } };
    try {
      entree = JSON.parse(lireStdin());
    } catch {
      return 0; // pas une entrée de hook : rien à garder ici
    }
    const commande = entree.tool_input?.command;
    if (typeof commande !== 'string') return 0;
    if (typeof entree.cwd === 'string' && entree.cwd !== '') depotDuHook = entree.cwd;
    envois = envoisDeLaCommande(commande, depotDuHook);
    if (envois.length === 0) return 0;
    if (o.commit !== undefined) envois = [{ depot: null, refs: [o.commit] }];
  }
  const donnees = resolve(o.donnees ?? process.env.ANCRAGE_DONNEES ?? donneesVoisines(depotDuHook));
  if (!existsSync(donnees)) {
    if (o.hook) {
      console.error(
        `cours-absent : pas de dépôt de données à ${donnees} ; le cours n'a pas été cherché.`,
      );
      return 0;
    }
    throw new Usage(`dépôt de données absent : ${donnees}`);
  }
  // Tous les commits de tous les envois, par dépôt, sans doublon, la tête d'abord : une seule
  // recherche.
  const lots = new Map<string, Lot>();
  for (const envoi of envois) {
    const depot = envoi.depot ?? depotDuHook;
    const lot = lots.get(depot) ?? { depot, commits: [] };
    lots.set(depot, lot);
    for (const reference of commitsDe(envoi, depot)) {
      if (!lot.commits.includes(reference)) lot.commits.push(reference);
    }
  }
  const code = chercherSansEchouer([...lots.values()], donnees);
  if (code === 0) return 0;
  if (!o.hook) return code;
  console.error(
    code === 2
      ? "cours-absent : push refusé, un texte du cours est dans ce que l'envoi publie. Le dossier de chaque fichier nommé ci-dessus est le commit qui le porte. Retirer le texte de ce commit, ou tolérer la ligne dans textes-toleres.txt du dépôt de données."
      : `cours-absent : push refusé, la recherche du cours n'a pas pu tourner (code ${code}). Corriger la cause ci-dessus (dépendances, données, git) puis relancer le push.`,
  );
  return 2;
}

// Sans `ANCRAGE_DONNEES`, le dépôt de données est à côté du clone principal : dans un worktree
// (`<nom>.worktrees/<sujet>`), le parent du dossier `.git` commun, et non celui de la racine.
function donneesVoisines(depot: string): string {
  let principal = RACINE;
  try {
    const commun = execFileSync(
      'git',
      ['-C', depot, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    principal = resolve(commun, '..');
  } catch {
    // pas un dépôt git : la racine du script
  }
  return join(principal, '..', 'ancrage-donnees');
}

// Les commits qu'un envoi publie : ceux de chaque référence que les branches distantes du distant
// n'ont pas (`git rev-list <réf> --not --remotes=<distant>`), la tête d'abord. Une branche neuve les
// donne tous ; une branche déjà envoyée, ceux d'après. Sans commit à publier, ou si git ne sait pas
// les lister, la référence elle-même : un envoi n'est jamais laissé passer sans recherche, et une
// référence illisible fait échouer la recherche, donc refuse. Une recherche directe (sans distant)
// ne lit que la référence.
function commitsDe(envoi: Envoi, depot: string): string[] {
  const commits: string[] = [];
  for (const reference of referencesDe(envoi, depot)) {
    let liste: string[] = [];
    if (envoi.distant !== undefined) {
      try {
        liste = execFileSync(
          'git',
          ['-C', depot, 'rev-list', reference, '--not', `--remotes=${envoi.distant}`],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
        )
          .split('\n')
          .filter((sha) => sha !== '');
      } catch {
        liste = [];
      }
    }
    commits.push(...(liste.length > 0 ? liste : [reference]));
  }
  return commits;
}

function referencesDe(envoi: Envoi, depot: string): string[] {
  if (envoi.refs !== 'tout') return envoi.refs;
  try {
    const noms = execFileSync(
      'git',
      ['-C', depot, 'for-each-ref', '--format=%(refname)', 'refs/heads'],
      {
        encoding: 'utf8',
      },
    )
      .split('\n')
      .filter((nom) => nom !== '');
    return noms.length > 0 ? noms : ['HEAD'];
  } catch {
    return ['HEAD']; // la recherche dira pourquoi elle échoue
  }
}

function chercherSansEchouer(lots: Lot[], donnees: string): number {
  try {
    return chercher(lots, donnees);
  } catch (erreur) {
    if (erreur instanceof Usage) throw erreur;
    console.error(`cours-absent : la recherche n'a pas pu tourner : ${(erreur as Error).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = principal(process.argv.slice(2));
  } catch (erreur) {
    if (!(erreur instanceof Usage)) throw erreur;
    console.error(`cours-absent : ${erreur.message}`);
    process.exitCode = process.argv.includes('--hook') ? 2 : 64;
  }
}
