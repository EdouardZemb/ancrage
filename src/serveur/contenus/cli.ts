import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyserContenus } from '../../domaine/contenu/analyse.js';
import type { ErreurContenu } from '../../domaine/contenu/erreurs.js';
import { nouvelIdentifiant } from '../../domaine/contenu/identifiants.js';
import type { Cours, ResultatContenus } from '../../domaine/contenu/modele.js';
import {
  ajouterAuVerrou,
  comparerVerrous,
  FICHIER_VERROU,
  lireVerrou,
} from '../../domaine/contenu/verrou.js';
import type { ValeursDeNotice } from '../../domaine/notice.js';
import { htmlAVerifier, listeAVerifier, nombreDElements } from './a-verifier.js';
import {
  chargerContenus,
  erreurDossierAbsent,
  estUnDossier,
  lireFichiersContenus,
} from './chargeur.js';
import { chercherTextesDansClient, textesDeLaNotice, textesDuCours } from './client.js';
import { DOSSIER_DE_CONTENU_PAR_DEFAUT } from './dossiers.js';
import { formaterErreur, surUneLigne } from './erreurs.js';
import { type GenerateurDePdf, pdfParChromium } from './pdf.js';
import { calculerReference, FICHIER_REFERENCE_NOTICE, referenceDeNotice } from './reference.js';

// Codes de sortie : 0 conforme, 1 contenu ou environnement en défaut, 64 mauvais usage.
const SORTIE_OK = 0;
const SORTIE_ERREUR = 1;
const SORTIE_USAGE = 64;

const USAGE = [
  'usage : pnpm contenus:<commande>   (ou tsx src/serveur/contenus/cli.ts <commande>)',
  `  toute commande accepte --contenu <dossier> (${DOSSIER_DE_CONTENU_PAR_DEFAUT} par défaut)`,
  '  un chemin donné se lit depuis le dossier courant ; un chemin par défaut, depuis la racine du dépôt',
  '  verifier [--base <réf>]   contrôle le contenu ; avec --base, compare ids.lock à celui de <réf>',
  '  id [n]                    tire n identifiants neufs (1 par défaut)',
  "  verrouiller               ajoute à ids.lock les identifiants du contenu qui n'y sont pas",
  `  reference --references <dossier> [--verifier]   écrit <cours>.reference.json pour chaque cours, et ${FICHIER_REFERENCE_NOTICE}, dans dossier (obligatoire, sans défaut) ; avec --verifier, compare sans écrire`,
  '  client [dossier] [--exclure <nom>]... [--toleres <fichier>]   cherche les textes des cours et les valeurs de la notice dans dossier (dist/client par défaut), hors des dossiers nommés à sa racine ; --toleres : un texte par ligne, égal à un texte du cours, non cherché',
  '  a-verifier [dossier]      écrit la liste imprimable des éléments à vérifier (dist/a-verifier par défaut)',
];

const NOMBRE_MAXIMAL_D_IDENTIFIANTS = 1000;
const CLIENT_PAR_DEFAUT = 'dist/client';
const A_VERIFIER_PAR_DEFAUT = 'dist/a-verifier';

/** Ce que la commande `a-verifier` emprunte à l'environnement ; les tests le remplacent. */
export interface Environnement {
  pdf: GenerateurDePdf;
  /** La date imprimée sur la liste, déjà mise en forme. */
  date: () => string;
}

function aujourdhui(): string {
  return new Date().toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const ENVIRONNEMENT: Environnement = { pdf: pdfParChromium, date: aujourdhui };

export interface Sortie {
  out: (ligne: string) => void;
  err: (ligne: string) => void;
}

function afficherErreurs(sortie: Sortie, erreurs: readonly ErreurContenu[]): number {
  for (const erreur of erreurs) sortie.err(formaterErreur(erreur));
  return SORTIE_ERREUR;
}

function afficherUsage(sortie: Sortie): number {
  for (const ligne of USAGE) sortie.err(ligne);
  return SORTIE_USAGE;
}

interface Options {
  positionnels: string[];
  contenu?: string;
  references?: string;
  base?: string;
  toleres?: string;
  verifier: boolean;
  exclure: string[];
}

/**
 * Lit `args` : des positionnels, et celles des options de `admises` qui s'y trouvent. Une option
 * inconnue, non admise, répétée (sauf `--exclure`) ou sans valeur rend `undefined` : c'est un usage
 * incorrect.
 */
function lireOptions(args: readonly string[], admises: readonly string[]): Options | undefined {
  const options: Options = { positionnels: [], verifier: false, exclure: [] };
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (!argument.startsWith('-')) {
      if (argument === '') return undefined;
      options.positionnels.push(argument);
      continue;
    }
    if (!admises.includes(argument)) return undefined;
    if (argument === '--verifier') {
      if (options.verifier) return undefined;
      options.verifier = true;
      continue;
    }
    const valeur = args[++i];
    if (!estUneValeur(valeur)) return undefined;
    if (argument === '--exclure') {
      options.exclure.push(valeur);
      continue;
    }
    const cle = argument.slice(2) as 'contenu' | 'references' | 'base' | 'toleres';
    if (options[cle] !== undefined) return undefined;
    options[cle] = valeur;
  }
  return options;
}

/** Un chemin donné se lit depuis le dossier courant ; le chemin par défaut, depuis `racine`. */
function dossierDe(donne: string | undefined, parDefaut: string, racine: string): string {
  return donne === undefined ? path.resolve(racine, parDefaut) : path.resolve(donne);
}

/** Le dossier tel qu'on le désigne depuis le dossier courant, avec `/`. */
function nomDuDossier(dossier: string): string {
  const relatif = path.relative(process.cwd(), dossier);
  return (relatif === '' ? '.' : relatif).split(path.sep).join('/');
}

function lireTexteDuVerrou(dossier: string): string | undefined {
  const chemin = path.join(dossier, FICHIER_VERROU);
  return fs.existsSync(chemin) ? fs.readFileSync(chemin, 'utf8') : undefined;
}

/**
 * Le texte d'`ids.lock` à la référence `ref`. Un fichier absent à cette référence donne un verrou
 * vide ; git ou la référence introuvables lèvent une erreur, jamais un succès silencieux.
 */
function lireVerrouDeLaBase(dossier: string, ref: string): string {
  // Relatif au dossier du contenu, où qu'il soit dans le dépôt.
  const chemin = `./${FICHIER_VERROU}`;
  const git = (...args: string[]): string => {
    try {
      return execFileSync('git', ['-C', dossier, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (erreur) {
      const { code, stderr } = erreur as { code?: string; stderr?: string };
      if (code === 'ENOENT') throw new Error('git est introuvable : impossible de lire la base.');
      const detail = typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : 'échec';
      throw new Error(`git a échoué pour la base « ${ref} » : ${detail}`);
    }
  };
  // `ls-tree` échoue pour une référence inconnue et rend une liste vide pour un chemin absent :
  // c'est ce qui distingue « pas de verrou à la base » de « base illisible ».
  const present = git('ls-tree', '--name-only', ref, '--', chemin);
  return present.trim() === '' ? '' : git('show', `${ref}:${chemin}`);
}

function commandeVerifier(base: string | undefined, dossier: string, sortie: Sortie): number {
  const resultat = chargerContenus(dossier);
  const erreurs = [...resultat.erreurs];
  if (base !== undefined) {
    const deLaBase = lireVerrouDeLaBase(dossier, base);
    const courant = lireTexteDuVerrou(dossier);
    // Sans verrou courant, l'analyse l'a déjà signalé ; les erreurs de la base ne sont pas les nôtres.
    if (courant !== undefined) {
      erreurs.push(...comparerVerrous(lireVerrou(deLaBase).entrees, lireVerrou(courant).entrees));
    }
  }
  if (erreurs.length > 0) return afficherErreurs(sortie, erreurs);
  sortie.out(
    `contenus valides (${nomDuDossier(dossier)}) : ${resultat.cours.length} cours, ${resultat.identifiants.size} identifiants.`,
  );
  return SORTIE_OK;
}

function commandeId(n: number, dossier: string, sortie: Sortie): number {
  const resultat = chargerContenus(dossier);
  const texte = lireTexteDuVerrou(dossier);
  if (texte === undefined) {
    return afficherErreurs(sortie, [
      {
        fichier: FICHIER_VERROU,
        lieu: '',
        message:
          'fichier introuvable : impossible de tirer un identifiant libre sans connaître les retirés.',
      },
    ]);
  }
  const verrou = lireVerrou(texte);
  if (verrou.erreurs.length > 0) return afficherErreurs(sortie, verrou.erreurs);

  // Les retirés comptent : un identifiant n'est jamais réutilisé. Le contenu aussi, même s'il n'est
  // pas encore verrouillé ni valide.
  const dejaPris = new Set([
    ...resultat.identifiants.keys(),
    ...verrou.entrees.map((entree) => entree.id),
  ]);
  for (let i = 0; i < n; i++) {
    const id = nouvelIdentifiant(dejaPris);
    dejaPris.add(id);
    sortie.out(id);
  }
  return SORTIE_OK;
}

/**
 * L'analyse ne confronte le verrou qu'à un contenu entièrement lisible : on ne déduit donc pas les
 * identifiants à ajouter de ses messages. On les calcule, on ajoute, puis on ré-analyse avec le
 * verrou obtenu : `ids.lock` n'est écrit que si plus rien ne cloche.
 */
function commandeVerrouiller(dossier: string, sortie: Sortie): number {
  const absent = erreurDossierAbsent(dossier);
  if (absent) return afficherErreurs(sortie, [absent]);

  const fichiers = lireFichiersContenus(dossier);
  const resultat = analyserContenus(fichiers);
  const texte = fichiers.get(FICHIER_VERROU);
  // Un verrou absent n'est pas recréé : il porte l'histoire des identifiants, dont les retirés.
  if (texte === undefined) return afficherErreurs(sortie, resultat.erreurs);

  const verrouilles = new Set(lireVerrou(texte).entrees.map((entree) => entree.id));
  const manquants = [...resultat.identifiants.keys()].filter((id) => !verrouilles.has(id));
  const nouveau = manquants.length === 0 ? texte : ajouterAuVerrou(texte, manquants);

  const apres = analyserContenus(new Map(fichiers).set(FICHIER_VERROU, nouveau));
  if (apres.erreurs.length > 0) return afficherErreurs(sortie, apres.erreurs);

  if (manquants.length === 0) {
    sortie.out('ids.lock est à jour : rien à ajouter.');
    return SORTIE_OK;
  }
  fs.writeFileSync(path.join(dossier, FICHIER_VERROU), nouveau);
  sortie.out(`ids.lock : ${manquants.length} identifiant(s) ajouté(s).`);
  return SORTIE_OK;
}

const SUFFIXE_DE_REFERENCE = '.reference.json';

function enJson(valeur: unknown): string {
  return `${JSON.stringify(valeur, null, 2)}\n`;
}

/**
 * Les instantanés attendus, par nom de fichier : un par cours, puis celui de la notice, composée
 * du gabarit et des valeurs (S1-D10).
 */
function referencesAttendues(
  cours: readonly Cours[],
  notice: ValeursDeNotice,
): Map<string, string> {
  const attendues = new Map<string, string>();
  for (const unCours of cours) {
    attendues.set(`${unCours.dossier}${SUFFIXE_DE_REFERENCE}`, enJson(calculerReference(unCours)));
  }
  attendues.set(FICHIER_REFERENCE_NOTICE, enJson(referenceDeNotice(notice)));
  return attendues;
}

/** La notice d'un contenu sans erreur : son absence en serait une, que l'analyse signale. */
function noticeDe(resultat: ResultatContenus): ValeursDeNotice {
  if (resultat.notice === undefined) throw new Error('notice.yaml : valeurs introuvables.');
  return resultat.notice;
}

/**
 * Compare chaque instantané au contenu, sans rien écrire : un écart, une référence absente et une
 * référence orpheline (sans cours) sont chacun une erreur. Les fins de ligne n'y comptent pas.
 */
function verifierLesReferences(
  cours: readonly Cours[],
  attendues: ReadonlyMap<string, string>,
  dossier: string,
  sortie: Sortie,
): number {
  const erreurs: ErreurContenu[] = [];
  for (const [nom, texte] of attendues) {
    const fichier = path.join(dossier, nom);
    if (!fs.existsSync(fichier)) {
      erreurs.push({ fichier: nom, lieu: '', message: 'référence absente' });
    } else if (fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n') !== texte) {
      erreurs.push({ fichier: nom, lieu: '', message: 'référence en écart avec le contenu' });
    }
  }
  const presents = estUnDossier(dossier) ? fs.readdirSync(dossier).sort() : [];
  for (const nom of presents) {
    if (nom.endsWith(SUFFIXE_DE_REFERENCE) && !attendues.has(nom)) {
      erreurs.push({ fichier: nom, lieu: '', message: 'référence orpheline : aucun cours' });
    }
  }
  if (erreurs.length > 0) return afficherErreurs(sortie, erreurs);
  sortie.out(`références conformes : ${cours.length} cours, et la notice.`);
  return SORTIE_OK;
}

function commandeReference(
  contenu: string,
  references: string,
  verifier: boolean,
  sortie: Sortie,
): number {
  const resultat = chargerContenus(contenu);
  if (resultat.erreurs.length > 0) return afficherErreurs(sortie, resultat.erreurs);
  const attendues = referencesAttendues(resultat.cours, noticeDe(resultat));
  if (verifier) return verifierLesReferences(resultat.cours, attendues, references, sortie);

  fs.mkdirSync(references, { recursive: true });
  for (const [nom, texte] of attendues) {
    fs.writeFileSync(path.join(references, nom), texte);
    sortie.out(`référence écrite : ${path.join(references, nom)}`);
  }
  return SORTIE_OK;
}

/** Les lignes de la liste des textes tolérés : ni vides, ni commentaires, sans espaces de bord. */
function lireToleres(fichier: string): string[] | undefined {
  let texte: string;
  try {
    texte = fs.readFileSync(fichier, 'utf8');
  } catch {
    return undefined;
  }
  return texte
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith('#'));
}

function commandeClient(
  dossier: string | undefined,
  contenu: string,
  exclure: readonly string[],
  toleres: string | undefined,
  racine: string,
  sortie: Sortie,
): number {
  const lignesTolerees = toleres === undefined ? [] : lireToleres(path.resolve(toleres));
  if (lignesTolerees === undefined) {
    sortie.err('liste des textes tolérés illisible');
    return SORTIE_USAGE;
  }
  const resultat = chargerContenus(contenu);
  if (resultat.erreurs.length > 0) return afficherErreurs(sortie, resultat.erreurs);

  const cible = dossier ?? CLIENT_PAR_DEFAUT;
  const textes = [
    ...resultat.cours.flatMap(textesDuCours),
    ...textesDeLaNotice(noticeDe(resultat)),
  ];
  // Une ligne qui ne vise aucun texte est une erreur : la liste ne vieillit pas en silence.
  const absents = lignesTolerees.filter((ligne) => !textes.includes(ligne));
  for (const ligne of absents) sortie.err(`texte toléré absent du cours : ${ligne}`);
  const aTolerer = new Set(lignesTolerees);
  const erreurs = chercherTextesDansClient(
    dossierDe(dossier, CLIENT_PAR_DEFAUT, racine),
    textes.filter((texte) => !aTolerer.has(texte)),
    exclure,
  );
  for (const erreur of erreurs) sortie.err(formaterErreur(erreur));
  if (absents.length > 0 || erreurs.length > 0) return SORTIE_ERREUR;
  sortie.out(`aucun texte de cours dans ${cible}.`);
  return SORTIE_OK;
}

async function commandeAVerifier(
  dossier: string | undefined,
  contenu: string,
  racine: string,
  sortie: Sortie,
  environnement: Environnement,
): Promise<number> {
  const resultat = chargerContenus(contenu);
  if (resultat.erreurs.length > 0) return afficherErreurs(sortie, resultat.erreurs);

  const cible = dossierDe(dossier, A_VERIFIER_PAR_DEFAUT, racine);
  const date = environnement.date();
  let ecrits = 0;
  for (const cours of resultat.cours) {
    const liste = listeAVerifier(cours);
    if (liste.length === 0) continue;
    fs.mkdirSync(cible, { recursive: true });
    const html = htmlAVerifier(liste, date);
    const nom = `${cours.dossier}-a-verifier`;
    const fichierHtml = path.join(cible, `${nom}.html`);
    const fichierPdf = path.join(cible, `${nom}.pdf`);
    fs.writeFileSync(fichierHtml, html);
    await environnement.pdf(html, fichierPdf);
    sortie.out(`${fichierHtml} (${nombreDElements(liste)} éléments à vérifier)`);
    sortie.out(fichierPdf);
    ecrits++;
  }
  if (ecrits === 0) sortie.out('aucun élément à vérifier dans les cours.');
  return SORTIE_OK;
}

function lireNombre(args: readonly string[]): number | undefined {
  if (args.length === 0) return 1;
  const [texte] = args;
  if (args.length > 1 || !/^[1-9]\d*$/.test(texte)) return undefined;
  const n = Number(texte);
  return n <= NOMBRE_MAXIMAL_D_IDENTIFIANTS ? n : undefined;
}

/** Une valeur qui ressemble à une option n'en est pas une : git la prendrait pour la sienne. */
function estUneValeur(argument: string | undefined): argument is string {
  return argument !== undefined && argument !== '' && !argument.startsWith('-');
}

/** Les options que chaque commande admet. */
const OPTIONS_ADMISES: Record<string, readonly string[]> = {
  verifier: ['--contenu', '--base'],
  id: ['--contenu'],
  verrouiller: ['--contenu'],
  reference: ['--contenu', '--references', '--verifier'],
  client: ['--contenu', '--exclure', '--toleres'],
  'a-verifier': ['--contenu'],
};

/** Exécute une commande ; renvoie le code de sortie. N'appelle jamais `process.exit`. */
export async function executer(
  args: string[],
  sortie: Sortie,
  racine: string,
  environnement: Environnement = ENVIRONNEMENT,
): Promise<number> {
  const [commande, ...reste] = args;
  try {
    const options = lireOptions(reste, OPTIONS_ADMISES[commande ?? ''] ?? []);
    if (options === undefined) return afficherUsage(sortie);
    const { positionnels } = options;
    const contenu = dossierDe(options.contenu, DOSSIER_DE_CONTENU_PAR_DEFAUT, racine);
    switch (commande) {
      case 'verifier':
        return positionnels.length === 0
          ? commandeVerifier(options.base, contenu, sortie)
          : afficherUsage(sortie);
      case 'id': {
        const n = lireNombre(positionnels);
        return n === undefined ? afficherUsage(sortie) : commandeId(n, contenu, sortie);
      }
      case 'verrouiller':
        return positionnels.length === 0
          ? commandeVerrouiller(contenu, sortie)
          : afficherUsage(sortie);
      case 'reference': {
        if (options.references === undefined) {
          sortie.err('reference : --references <dossier> est obligatoire');
          return SORTIE_USAGE;
        }
        return positionnels.length === 0
          ? commandeReference(contenu, path.resolve(options.references), options.verifier, sortie)
          : afficherUsage(sortie);
      }
      case 'client':
        return positionnels.length <= 1
          ? commandeClient(
              positionnels[0],
              contenu,
              options.exclure,
              options.toleres,
              racine,
              sortie,
            )
          : afficherUsage(sortie);
      case 'a-verifier':
        return positionnels.length <= 1
          ? await commandeAVerifier(positionnels[0], contenu, racine, sortie, environnement)
          : afficherUsage(sortie);
      default:
        return afficherUsage(sortie);
    }
  } catch (erreur) {
    sortie.err(surUneLigne(erreur instanceof Error ? erreur.message : String(erreur)));
    return SORTIE_ERREUR;
  }
}

// Lancé directement (`pnpm contenus:…`) : on fixe le code de sortie sans appeler `process.exit`,
// pour que la sortie standard soit vidée avant la fin du processus. La racine du dépôt est à trois
// niveaux au-dessus de ce fichier, qu'il soit dans `src/serveur/contenus` ou dans
// `dist/serveur/contenus`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  process.exitCode = await executer(
    process.argv.slice(2),
    {
      out: (ligne) => process.stdout.write(`${ligne}\n`),
      err: (ligne) => process.stderr.write(`${ligne}\n`),
    },
    racine,
  );
}
