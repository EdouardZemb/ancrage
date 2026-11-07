import type { Environnement } from '../domaine/sante.js';

export interface Config {
  environnement: Environnement;
  version: string;
  revision: string;
  cheminBase: string;
  hote: string;
  port: number;
  dossierClient: string;
  /**
   * Le contenu monté (`ANCRAGE_CONTENUS`), sans défaut. Absent ou vide, le démarrage sert
   * `dossierExemple`, sauf en prod, qui refuse (S1-D3). La lecture ne touche pas au disque : les
   * commandes de la CLI tournent sans contenu.
   */
  dossierContenus?: string;
  /** Le cours d'exemple (`ANCRAGE_EXEMPLE_CONTENU`), servi hors de la prod sans contenu monté. */
  dossierExemple: string;
  /**
   * L'origine publique, `https://hôte[:port]` sans barre finale : celle des liens, de WebAuthn et
   * du contrôle de l'en-tête `Origin`.
   */
  urlPublique: string;
}

const ENVIRONNEMENTS: readonly Environnement[] = ['dev', 'ci', 'staging', 'prod'];
const PORT_MAXIMAL = 65535;
// En `dev` et en `ci` seulement : en `staging` et en `prod`, l'URL publique est obligatoire.
const URL_PUBLIQUE_LOCALE = 'http://localhost:3000';

function estEnvironnement(valeur: string): valeur is Environnement {
  return (ENVIRONNEMENTS as readonly string[]).includes(valeur);
}

function lireEnvironnement(valeur: string): Environnement {
  if (!estEnvironnement(valeur)) {
    throw new Error(`ANCRAGE_ENV invalide : ${valeur}`);
  }
  return valeur;
}

function lirePort(valeur: string): number {
  const port = Number(valeur);
  if (!/^\d+$/.test(valeur) || port > PORT_MAXIMAL) {
    throw new Error(`PORT invalide : ${valeur}`);
  }
  return port;
}

/** L'origine de l'URL, qui ne doit avoir ni chemin, ni requête, ni fragment, ni identifiants. */
function lireUrlPublique(valeur: string | undefined, environnement: Environnement): string {
  if (valeur === undefined) {
    if (environnement === 'dev' || environnement === 'ci') {
      return URL_PUBLIQUE_LOCALE;
    }
    throw new Error('ANCRAGE_URL_PUBLIQUE manquante');
  }
  // Le message ne reprend pas la valeur : elle peut contenir des identifiants.
  const invalide = new Error(
    'ANCRAGE_URL_PUBLIQUE invalide : attendu http(s)://hôte[:port], sans chemin, requête, ' +
      'fragment ni identifiants',
  );
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    throw invalide;
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw invalide;
  }
  return url.origin;
}

type Env = Record<string, string | undefined>;

// Une variable vide vaut une variable absente : « PORT= » dans un fichier d'environnement
// ne casse rien.
function lireFacultative(env: Env, nom: string): string | undefined {
  const valeur = env[nom];
  return valeur === '' ? undefined : valeur;
}

function lire(env: Env, nom: string, defaut: string): string {
  return lireFacultative(env, nom) ?? defaut;
}

export function lireConfig(env: Env): Config {
  const environnement = lireEnvironnement(lire(env, 'ANCRAGE_ENV', 'dev'));
  return {
    environnement,
    version: lire(env, 'ANCRAGE_VERSION', 'dev'),
    revision: lire(env, 'ANCRAGE_REVISION', 'local'),
    cheminBase: lire(env, 'ANCRAGE_BASE', 'donnees/ancrage.sqlite'),
    hote: lire(env, 'HOST', '127.0.0.1'),
    port: lirePort(lire(env, 'PORT', '3000')),
    dossierClient: lire(env, 'ANCRAGE_CLIENT', 'dist/client'),
    dossierContenus: lireFacultative(env, 'ANCRAGE_CONTENUS'),
    dossierExemple: lire(env, 'ANCRAGE_EXEMPLE_CONTENU', 'exemple-contenu'),
    urlPublique: lireUrlPublique(lireFacultative(env, 'ANCRAGE_URL_PUBLIQUE'), environnement),
  };
}
