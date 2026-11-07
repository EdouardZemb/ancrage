import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { comparerVerrous, FICHIER_VERROU, lireVerrou } from '../domaine/contenu/verrou.js';
import {
  appliquerMigrations,
  type Base,
  fermerBase,
  ouvrirBase,
  tableExiste,
} from './base/base.js';
import {
  type Comptes,
  type RapportVerification,
  sauvegarder,
  verifier,
} from './base/sauvegarde.js';
import { creerDepot, type Depot } from './comptes/depot.js';
import { creerEmetteurDeLiens, type EmetteurDeLiens } from './comptes/liens.js';
import { type EntreeRegistre, lireRegistre, rejouerRegistre } from './comptes/suppression.js';
import { lireConfig } from './config.js';
import { chargerContenus, estUnDossier as dossierExiste } from './contenus/chargeur.js';
import { formaterErreur } from './contenus/erreurs.js';

// Codes de sortie lus par les scripts de sauvegarde et de restauration.
const SORTIE_OK = 0;
const SORTIE_ERREUR = 1;
const SORTIE_NON_CONFORME = 2;
const SORTIE_USAGE = 64;

// La forme de `/donnees` : un dossier, qui tient la base et ses comptes. Un argument qui finit par
// `.sqlite` reste un fichier (anciennes formes) ; le contrat générique des sauvegardes du modèle
// de projet parle de dossier.
const FICHIER_BASE = 'ancrage.sqlite';
const FICHIER_COMPTES = `${FICHIER_BASE}.comptes.json`;

const USAGE = [
  'usage : node dist/serveur/cli.js <commande>',
  '  sauvegarder <destination>                   copie la base (ANCRAGE_BASE) vers <destination>',
  '                                              (un dossier si elle ne finit pas par .sqlite :',
  '                                              ancrage.sqlite et ancrage.sqlite.comptes.json)',
  '  verifier <fichier> [--comptes <json>]       contrôle une copie ; 0 conforme, 2 sinon',
  '  verifier <dossier>                          contrôle un dossier de sauvegarde ; 0 ou 2',
  "  proprietaire                                écrit le lien d'invitation du propriétaire",
  '  secours-proprietaire                        écrit un lien de connexion de 24 h pour lui',
  '  verifier-contenu <dossier> [<en service>]   contrôle un dossier de contenu, et son ids.lock contre',
  '                                              celui du dossier en service ; 0 conforme, 2 sinon',
  '  rejouer-suppressions <cible> --depuis <source>  efface de <cible> les comptes du registre de <source>',
  '  rejouer-suppressions --dossiers <source> <cible>  de même, sur les ancrage.sqlite de deux dossiers',
  '                                              (le report du modèle : refuse une source sans compte ;',
  '                                              rapport {"entrees_registre":n,"comptes_effaces":m})',
];

interface ArgumentsVerifier {
  fichier: string;
  comptes: string | undefined;
}

function lireArgumentsVerifier(args: string[]): ArgumentsVerifier | undefined {
  let fichier: string | undefined;
  let comptes: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i] ?? '';
    if (argument === '--comptes') {
      i += 1;
      const valeur = args[i];
      if (valeur === undefined || comptes !== undefined) {
        return undefined;
      }
      comptes = valeur;
    } else if (argument.startsWith('--') || fichier !== undefined) {
      return undefined;
    } else {
      fichier = argument;
    }
  }
  // Les comptes attendus d'un dossier sont dans le dossier : `--comptes` n'y a pas de sens.
  if (fichier === undefined || (comptes !== undefined && estUnDossier(fichier))) {
    return undefined;
  }
  return { fichier, comptes };
}

// La même règle pour `sauvegarder` et `verifier` : ce qui ne finit pas par `.sqlite` est un dossier,
// qu'il existe ou non.
function estUnDossier(chemin: string): boolean {
  return !chemin.endsWith('.sqlite');
}

interface ArgumentsRejeu {
  cible: string;
  source: string;
  // Forme `--dossiers` : la source doit exister, et l'erreur dit laquelle des deux bases manque.
  parDossiers: boolean;
}

// `--dossiers <source> <cible>` : la base de chaque dossier est `ancrage.sqlite`. L'ordre est celui
// de l'usage, la source d'abord, à l'inverse de la forme `--depuis`.
function lireArgumentsRejeuDossiers(args: string[]): ArgumentsRejeu | undefined {
  const [, source, cible, ...reste] = args;
  if (source === undefined || cible === undefined || reste.length > 0) {
    return undefined;
  }
  if (source.startsWith('--') || cible.startsWith('--')) {
    return undefined;
  }
  return {
    source: path.join(source, FICHIER_BASE),
    cible: path.join(cible, FICHIER_BASE),
    parDossiers: true,
  };
}

function lireArgumentsRejeu(args: string[]): ArgumentsRejeu | undefined {
  if (args[0] === '--dossiers') {
    return lireArgumentsRejeuDossiers(args);
  }
  let cible: string | undefined;
  let source: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i] ?? '';
    if (argument === '--depuis') {
      i += 1;
      const valeur = args[i];
      if (valeur === undefined || source !== undefined) {
        return undefined;
      }
      source = valeur;
    } else if (argument.startsWith('--') || cible !== undefined) {
      return undefined;
    } else {
      cible = argument;
    }
  }
  return cible === undefined || source === undefined
    ? undefined
    : { cible, source, parDossiers: false };
}

// Le fichier est le `RapportSauvegarde` écrit par `sauvegarder` : seuls ses `comptes` servent.
function lireComptesAttendus(chemin: string): Comptes {
  const illisibles = new Error(`comptes illisibles : ${chemin}`);
  let contenu: unknown;
  try {
    contenu = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  } catch {
    throw illisibles;
  }
  const comptes = (contenu as { comptes?: unknown } | null)?.comptes;
  if (
    typeof comptes !== 'object' ||
    comptes === null ||
    Array.isArray(comptes) ||
    !Object.values(comptes as Record<string, unknown>).every((n) => Number.isInteger(n))
  ) {
    throw illisibles;
  }
  return comptes as Comptes;
}

function commandeSauvegarder(argument: string, ecrire: (ligne: string) => void): number {
  const { cheminBase } = lireConfig(process.env);
  // `ouvrirBase` créerait une base vide : une faute de chemin donnerait une « sauvegarde » vide.
  if (!fs.existsSync(cheminBase)) {
    throw new Error(`base introuvable : ${cheminBase}`);
  }
  const enDossier = estUnDossier(argument);
  const destination = enDossier ? path.join(argument, FICHIER_BASE) : argument;
  const dossierACreer = enDossier && !fs.existsSync(argument);
  if (dossierACreer) {
    // Le dossier tient le journal des personnes : lui seul y entre. `chmod` après coup, car le
    // masque (umask) ne doit rien en retirer ; un dossier qui existe déjà garde son mode.
    fs.mkdirSync(path.dirname(argument), { recursive: true });
    fs.mkdirSync(argument, { mode: 0o700 });
    fs.chmodSync(argument, 0o700);
  }
  const base = ouvrirBase(cheminBase);
  let baseEcrite = false;
  try {
    const ligne = JSON.stringify(sauvegarder(base, destination));
    baseEcrite = true;
    fs.writeFileSync(`${destination}.comptes.json`, `${ligne}\n`);
    ecrire(ligne);
  } catch (erreur) {
    // Rien ne reste d'une sauvegarde à moitié écrite, et rien de ce que cet appel n'a pas écrit
    // n'est touché : le dossier qu'il a créé, ou la base et les comptes qu'il a écrits dans un
    // dossier existant (sinon une seconde tentative échouerait sur « destination existante »).
    if (dossierACreer) {
      fs.rmSync(argument, { recursive: true, force: true });
    } else if (enDossier && baseEcrite) {
      fs.rmSync(destination, { force: true });
      fs.rmSync(`${destination}.comptes.json`, { force: true });
    }
    throw erreur;
  } finally {
    fermerBase(base);
  }
  return SORTIE_OK;
}

/**
 * Contrôle un dossier de sauvegarde : sa base, et ses comptes s'ils y sont. Un dossier sans base ou
 * sans comptes n'a pas la forme de `/donnees` : il est non conforme (2), pas en erreur (1).
 */
function verifierUnDossier(dossier: string, ecrire: (ligne: string) => void): number {
  const base = path.join(dossier, FICHIER_BASE);
  const comptes = path.join(dossier, FICHIER_COMPTES);
  let rapport: RapportVerification;
  if (fs.existsSync(base)) {
    const comptesPresents = fs.existsSync(comptes);
    rapport = verifier(base, comptesPresents ? lireComptesAttendus(comptes) : undefined);
    if (!comptesPresents) {
      const ecarts = [...rapport.ecarts, `${FICHIER_COMPTES} absent`];
      rapport = { ...rapport, conforme: false, ecarts };
    }
  } else {
    rapport = {
      integrite: 'absente',
      comptes: {},
      instance: '',
      schema: 0,
      conforme: false,
      ecarts: [`${FICHIER_BASE} absent`],
    };
  }
  ecrire(JSON.stringify(rapport));
  return rapport.conforme ? SORTIE_OK : SORTIE_NON_CONFORME;
}

function commandeVerifier(args: ArgumentsVerifier, ecrire: (ligne: string) => void): number {
  if (estUnDossier(args.fichier)) {
    return verifierUnDossier(args.fichier, ecrire);
  }
  const attendu = args.comptes === undefined ? undefined : lireComptesAttendus(args.comptes);
  const rapport = verifier(args.fichier, attendu);
  ecrire(JSON.stringify(rapport));
  return rapport.conforme ? SORTIE_OK : SORTIE_NON_CONFORME;
}

/** Ouvre la base à ce chemin, la migre (elle peut être d'avant), et la ferme quoi qu'il arrive. */
function surBaseMigreeA(chemin: string, action: (base: Base) => void): void {
  const base = ouvrirBase(chemin);
  try {
    appliquerMigrations(base);
    action(base);
  } finally {
    fermerBase(base);
  }
}

/**
 * Les commandes d'amorçage agissent sur la base de l'application : on la migre d'abord (elle peut
 * être neuve), et on la ferme quoi qu'il arrive.
 */
function surBaseMigree(
  action: (contexte: { base: Base; depot: Depot; liens: EmetteurDeLiens }) => void,
): void {
  const { cheminBase, urlPublique } = lireConfig(process.env);
  surBaseMigreeA(cheminBase, (base) => {
    const depot = creerDepot(base, () => new Date());
    action({ base, depot, liens: creerEmetteurDeLiens(depot, urlPublique, () => new Date()) });
  });
}

// Le lien est un secret : il ne va qu'à `ecrire`, la sortie standard. Ni journal, ni fichier.
function commandeProprietaire(ecrire: (ligne: string) => void): number {
  surBaseMigree(({ base, depot, liens }) => {
    // Un seul verrou d'écriture : pas de propriétaire créé entre la vérification et l'invitation,
    // et l'ancienne invitation n'est annulée que si la nouvelle est écrite.
    const lien = base.sqlite
      .transaction(() => {
        if (depot.existeProprietaire()) {
          throw new Error('un propriétaire existe déjà ; utiliser secours-proprietaire');
        }
        depot.annulerInvitationsProprietaireNonUtilisees();
        return liens.invitationProprietaire();
      })
      .immediate();
    ecrire(lien);
  });
  return SORTIE_OK;
}

function commandeSecoursProprietaire(ecrire: (ligne: string) => void): number {
  surBaseMigree(({ depot, liens }) => {
    const proprietaire = depot.personnes().find((personne) => personne.proprietaire);
    if (proprietaire === undefined) {
      throw new Error('aucun propriétaire ; utiliser proprietaire');
    }
    ecrire(liens.connexionDeSecours(proprietaire.id));
  });
  return SORTIE_OK;
}

// Le refus d'une base en service sans compte : une base neuve (serveur perdu, puis redéployé) n'a
// pas de registre, et rejouer « rien » ferait croire qu'aucun compte n'a été supprimé. Aucune donnée
// personnelle : la raison et la conduite à tenir seulement.
const SOURCE_SANS_COMPTE =
  "la base en service n'a aucun compte (serveur perdu, ou base neuve) : son registre des " +
  "suppressions ne dit rien, et rien n'a été rejoué. Relancer la restauration avec " +
  '--sans-report, puis rejouer le registre à la main (docs/exploitation.md, « Rejouer le ' +
  'registre à la main »)';

/** Le nombre de comptes d'une base ; 0 si elle n'a pas même la table des personnes. */
function nombreDeComptes(sqlite: Database.Database): number {
  if (!tableExiste(sqlite, 'personne')) {
    return 0;
  }
  return (sqlite.prepare('select count(*) as n from personne').get() as { n: number }).n;
}

/**
 * Rejoue le registre des suppressions de `source` (la base courante) sur `cible` (l'instantané
 * restauré), avant qu'il ne prenne sa place (1e-D3) : la sortie ne dit que des nombres (1e-D10).
 * La source n'est que lue ; la cible est migrée, car l'instantané peut dater d'avant la table du
 * registre. Ni l'une ni l'autre n'est créée si elle manque : `ouvrirBase` créerait une base vide.
 *
 * La forme `--dossiers` est la commande REPORTER du modèle (`<REPORTER…> /actuel /donnees`). Elle
 * reprend ce que l'ancien `restaurer.sh` d'ancrage faisait autour du rejeu, et que le crochet
 * générique ne fait pas : elle refuse une base en service sans compte, et, après le rejeu, une cible
 * qui garde un journal `-wal` (des pages qui ne suivraient pas le fichier mis en place) ; son rapport,
 * `{"entrees_registre":n,"comptes_effaces":m}`, ne sort qu'avec deux entiers. Les formes sur fichier
 * ne changent pas : ni ces contrôles, ni leur rapport `{"registre":n,"effaces":m}`.
 */
function commandeRejouerSuppressions(
  args: ArgumentsRejeu,
  ecrire: (ligne: string) => void,
): number {
  if (!fs.existsSync(args.cible)) {
    throw new Error(`base introuvable : ${args.cible}`);
  }
  if (args.parDossiers && !fs.existsSync(args.source)) {
    throw new Error(`base introuvable : ${args.source}`);
  }
  const lecture = new Database(args.source, { readonly: true, fileMustExist: true });
  let entrees: EntreeRegistre[];
  let sansCompte = false;
  try {
    entrees = lireRegistre(lecture);
    sansCompte = args.parDossiers && nombreDeComptes(lecture) === 0;
  } finally {
    lecture.close();
  }
  if (sansCompte) {
    throw new Error(SOURCE_SANS_COMPTE);
  }
  let effaces = 0;
  surBaseMigreeA(args.cible, (base) => {
    effaces = rejouerRegistre(base, entrees);
  });
  if (!args.parDossiers) {
    ecrire(JSON.stringify({ registre: entrees.length, effaces }));
    return SORTIE_OK;
  }
  // La base est fermée : SQLite a reporté son journal dans le fichier et l'a retiré, sauf si une
  // autre connexion la tient encore.
  const journal = `${args.cible}-wal`;
  if (fs.existsSync(journal)) {
    throw new Error(
      `journal ${journal} restant après le rejeu : la base n'a pas été fermée proprement, les comptes effacés ne suivraient pas tous le fichier`,
    );
  }
  if (!Number.isInteger(entrees.length) || !Number.isInteger(effaces)) {
    throw new Error('rapport du rejeu illisible : les deux nombres ne sont pas des entiers');
  }
  ecrire(JSON.stringify({ entrees_registre: entrees.length, comptes_effaces: effaces }));
  return SORTIE_OK;
}

function lireVerrouSiPresent(dossier: string): ReturnType<typeof lireVerrou> | undefined {
  const chemin = path.join(dossier, FICHIER_VERROU);
  return dossierExiste(dossier) && fs.existsSync(chemin)
    ? lireVerrou(fs.readFileSync(chemin, 'utf8'))
    : undefined;
}

/**
 * Contrôle un dossier de contenu comme le démarrage (format, schémas, `ids.lock`, notice). Ne lit ni
 * l'environnement ni la base, et n'écrit rien : elle tourne dans le conteneur jetable du modèle.
 */
function commandeVerifierContenu(
  dossier: string,
  enService: string | undefined,
  ecrire: (ligne: string) => void,
): number {
  const resultat = chargerContenus(dossier);
  const erreurs = [...resultat.erreurs];
  const ancien = enService === undefined ? undefined : lireVerrouSiPresent(enService);
  const nouveau = lireVerrouSiPresent(dossier);
  if (ancien !== undefined && nouveau !== undefined) {
    erreurs.push(...ancien.erreurs, ...comparerVerrous(ancien.entrees, nouveau.entrees));
  }
  for (const erreur of erreurs) {
    ecrire(formaterErreur(erreur));
  }
  if (erreurs.length > 0) return SORTIE_NON_CONFORME;
  ecrire(`contenu conforme : ${resultat.cours.length} cours`);
  return SORTIE_OK;
}

function afficherUsage(ecrire: (ligne: string) => void): number {
  for (const ligne of USAGE) {
    ecrire(ligne);
  }
  return SORTIE_USAGE;
}

/** Exécute une commande ; renvoie le code de sortie. N'appelle jamais `process.exit`. */
export async function executer(argv: string[], ecrire: (ligne: string) => void): Promise<number> {
  const [commande, ...args] = argv;
  try {
    if (commande === 'sauvegarder' && args.length === 1) {
      return commandeSauvegarder(args[0] ?? '', ecrire);
    }
    if (commande === 'proprietaire' && args.length === 0) {
      return commandeProprietaire(ecrire);
    }
    if (commande === 'secours-proprietaire' && args.length === 0) {
      return commandeSecoursProprietaire(ecrire);
    }
    if (commande === 'verifier') {
      const parametres = lireArgumentsVerifier(args);
      return parametres === undefined
        ? afficherUsage(ecrire)
        : commandeVerifier(parametres, ecrire);
    }
    if (commande === 'verifier-contenu') {
      return args.length === 1 || args.length === 2
        ? commandeVerifierContenu(args[0] ?? '', args[1], ecrire)
        : afficherUsage(ecrire);
    }
    if (commande === 'rejouer-suppressions') {
      const parametres = lireArgumentsRejeu(args);
      return parametres === undefined
        ? afficherUsage(ecrire)
        : commandeRejouerSuppressions(parametres, ecrire);
    }
    return afficherUsage(ecrire);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    ecrire(message.replace(/\s*\r?\n\s*/g, ' '));
    return SORTIE_ERREUR;
  }
}

// Lancé directement (`node dist/serveur/cli.js …`) : on fixe le code de sortie sans appeler
// `process.exit`, pour que la sortie standard soit vidée avant la fin du processus.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await executer(process.argv.slice(2), (ligne) =>
    process.stdout.write(`${ligne}\n`),
  );
}
