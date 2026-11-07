/*
 * Les appels à l'API du serveur. Le navigateur joint lui-même le cookie de session (`HttpOnly`,
 * que ce code ne lit jamais) et l'en-tête `Origin` que le serveur exige sur toute requête qui
 * modifie quelque chose.
 *
 * Un échec devient une `ErreurApi` dont le code est l'un de ceux que le serveur connaît : le corps
 * brut d'une erreur n'est jamais montré, un texte traduit le remplace (`erreurs.ts`).
 */
import type { Evenement } from '../domaine/journal/evenement.js';
import type { Langue } from './textes.js';

/** Les codes d'erreur que le serveur connaît : un autre code d'un corps de réponse devient `inconnue`. */
export const CODES_DU_SERVEUR = [
  'lien_invalide',
  'connexion_impossible',
  'requete',
  'trop_de_requetes',
  'derniere_passkey',
  'nom_deja_pris',
  'cours_a_verifier_sans_derogation',
  'introuvable',
  'non_connecte',
  // Une requête qui nomme une autre personne que celle de la session (R21, R32, R36).
  'autre_personne',
  // Le compte du propriétaire ne se supprime pas depuis l'application (1e-D4).
  'proprietaire',
  // Une panne du serveur, qui ne dit rien de plus (1e-D14).
  'interne',
  // Une requête qui modifie quelque chose et dont l'`Origin` n'est pas celui du serveur (403).
  'origine',
] as const;

export type CodeErreur =
  | (typeof CODES_DU_SERVEUR)[number]
  // Pas de réponse du serveur.
  | 'reseau'
  // Une réponse qui n'est pas dans le format du serveur (un mandataire, une page d'erreur…).
  | 'inconnue';

const CODES_CONNUS: ReadonlySet<string> = new Set<string>(CODES_DU_SERVEUR);

export class ErreurApi extends Error {
  readonly statut: number;
  readonly code: CodeErreur;
  /**
   * Vrai pour un 401 `{"erreur":"compte_supprime"}` : le compte de l'en-tête `x-ancrage-personne`
   * est supprimé (2d-D3). Le code reste `non_connecte`, pour que chaque contrôle existant
   * de ce code garde son sens.
   */
  readonly compteSupprime: boolean;

  constructor(statut: number, code: CodeErreur, compteSupprime = false) {
    super(`erreur de l'API : ${statut} ${code}`);
    this.name = 'ErreurApi';
    this.statut = statut;
    this.code = code;
    this.compteSupprime = compteSupprime;
  }
}

export type Methode = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * L'erreur d'une réponse en échec : le code d'un corps `{"erreur":"…"}`, ou celui que dit le
 * statut, ou `inconnue`. Un 401 `compte_supprime` est un `non_connecte` marqué (2d-D3).
 */
function erreurDeLaReponse(statut: number, corps: string): ErreurApi {
  try {
    const { erreur } = JSON.parse(corps) as { erreur?: unknown };
    if (statut === 401 && erreur === 'compte_supprime') {
      return new ErreurApi(statut, 'non_connecte', true);
    }
    if (typeof erreur === 'string' && CODES_CONNUS.has(erreur)) {
      return new ErreurApi(statut, erreur as CodeErreur);
    }
  } catch {
    // Pas du JSON : le statut seul parle.
  }
  if (statut === 401) {
    return new ErreurApi(statut, 'non_connecte');
  }
  return new ErreurApi(statut, statut === 429 ? 'trop_de_requetes' : 'inconnue');
}

/**
 * Appelle l'API. Le corps, s'il y en a un, part en JSON ; sans corps, la requête n'a pas d'en-tête
 * `content-type` : Fastify refuse un `content-type` JSON sans corps par une erreur à lui, d'un
 * autre format. `entetes` s'ajoutent aux en-têtes de la requête. Rend le JSON de la réponse, ou
 * `undefined` pour un 204.
 */
export async function appeler<T = void>(
  methode: Methode,
  chemin: string,
  corps?: unknown,
  recuperer: typeof fetch = fetch,
  entetes: Readonly<Record<string, string>> = {},
): Promise<T> {
  const init: RequestInit = { method: methode, credentials: 'same-origin' };
  const tous: Record<string, string> = { ...entetes };
  if (corps !== undefined) {
    tous['content-type'] = 'application/json';
    init.body = JSON.stringify(corps);
  }
  if (Object.keys(tous).length > 0) {
    init.headers = tous;
  }

  let reponse: Response;
  try {
    reponse = await recuperer(chemin, init);
  } catch {
    throw new ErreurApi(0, 'reseau');
  }

  if (!reponse.ok) {
    throw erreurDeLaReponse(reponse.status, await reponse.text());
  }
  if (reponse.status === 204) {
    return undefined as T;
  }
  try {
    return (await reponse.json()) as T;
  } catch {
    throw new ErreurApi(reponse.status, 'inconnue');
  }
}

/** La réponse des routes `…/options` : les options WebAuthn, et la clé de la cérémonie. */
export interface ReponseOptions<Options> {
  options: Options;
  ceremonie: string;
}

/** La personne connectée (`GET /api/moi`). */
export interface Moi {
  id: string;
  nomAffiche: string;
  langue: Langue;
  proprietaire: boolean;
}

/** Un cours de la liste : le titre vient de l'API, jamais du code du client. */
export interface CoursResume {
  id: string;
  titre: string;
  langue: string;
}

/**
 * La personne dont l'écran est ouvert : celle sous laquelle le téléphone rangera ce qu'il lit
 * (liste des cours, contenu, journal : R32, R36), dont il envoie la file (R21), dont il supprime le
 * compte (1e-R13), lit les appareils (1e-R15), change le profil ou crée et annule le lien pour un
 * autre appareil. Le serveur la compare à celle de la session, et refuse (409 `autre_personne`) si
 * c'en est une autre : rien d'une autre personne n'est rendu pour être rangé chez elle, la file
 * d'une personne ne part jamais sous la session d'une autre, et l'écran d'une personne n'agit
 * jamais sur le compte d'une autre. Voir `src/serveur/entete-personne.ts`.
 */
const ENTETE_PERSONNE = 'x-ancrage-personne';

/** L'en-tête qui nomme `personne` ; aucun sans personne connue : le serveur ne contrôle rien. */
function entetePersonne(personne: string | undefined): Record<string, string> {
  return personne === undefined ? {} : { [ENTETE_PERSONNE]: personne };
}

/**
 * Change le profil de la session (`PATCH /api/moi`, 1e-D6), au nom de `personne`, celle dont
 * l'écran est ouvert. Sur un téléphone partagé, une autre personne a pu se connecter entre-temps :
 * le serveur refuse (409 `autre_personne`) plutôt que de changer son profil. Un serveur d'avant le
 * lot 1e (un retour arrière) ignore l'en-tête et rend le profil de la session : s'il ne nomme pas
 * `personne`, c'est le même refus. L'écran ne prend jamais le profil d'une autre pour le sien, ni
 * ne le signale au téléphone.
 */
export async function modifierMoi(
  personne: string,
  changement: { nomAffiche?: string; langue?: Langue },
  recuperer: typeof fetch = fetch,
): Promise<Moi> {
  const modifie = await appeler<Moi | null>(
    'PATCH',
    '/api/moi',
    changement,
    recuperer,
    entetePersonne(personne),
  );
  if (modifie?.id !== personne) {
    throw new ErreurApi(200, 'autre_personne');
  }
  return modifie;
}

/**
 * Crée le lien de connexion pour un autre appareil (`POST /api/moi/lien`, 1e-D7), qui annule le
 * précédent, au nom de `personne` : sous la session d'une autre personne, le serveur refuse (409
 * `autre_personne`) plutôt que de montrer son lien et d'annuler le sien. Rend le lien.
 */
export async function creerLienDeConnexion(
  personne: string | undefined,
  recuperer: typeof fetch = fetch,
): Promise<string> {
  const { lien } = await appeler<{ lien: string }>(
    'POST',
    '/api/moi/lien',
    undefined,
    recuperer,
    entetePersonne(personne),
  );
  return lien;
}

/**
 * Annule le lien de connexion actif (`DELETE /api/moi/lien`, 1e-D7), au nom de `personne` : sous la
 * session d'une autre personne, le serveur refuse (409 `autre_personne`) plutôt que d'annuler le
 * sien.
 */
export function annulerLienDeConnexion(
  personne: string | undefined,
  recuperer: typeof fetch = fetch,
): Promise<void> {
  return appeler('DELETE', '/api/moi/lien', undefined, recuperer, entetePersonne(personne));
}

/**
 * Supprime le compte de la session (`DELETE /api/moi`, 1e-D4), au nom de `personne`, celle dont
 * l'écran demande la suppression (1e-R13). Sur un téléphone partagé, une autre personne a pu se
 * connecter entre-temps : le serveur refuse (409 `autre_personne`) plutôt que de supprimer son
 * compte, et exige l'en-tête (400 sans lui). Refusé aussi (409 `proprietaire`) pour le compte du
 * propriétaire. La session part avec le compte.
 */
export function supprimerSonCompte(
  personne: string,
  recuperer: typeof fetch = fetch,
): Promise<void> {
  return appeler('DELETE', '/api/moi', undefined, recuperer, { [ENTETE_PERSONNE]: personne });
}

/** Une session ouverte de la personne (`GET /api/moi/appareils`). */
export interface SessionOuverte {
  id: string;
  appareil: string;
  creeLe: string;
  utiliseLe: string;
  courante: boolean;
}

/** Une passkey enregistrée de la personne : `id` est l'identifiant WebAuthn, en base64url. */
export interface PasskeyEnregistree {
  id: string;
  appareil: string;
  creeLe: string;
  utiliseLe: string | null;
}

/** Les appareils de la personne (`GET /api/moi/appareils`). */
export interface ReponseAppareils {
  sessions: SessionOuverte[];
  passkeys: PasskeyEnregistree[];
  /**
   * Le lien de connexion encore utilisable, `null` sans lien (1e-D7). Absent d'un serveur d'avant
   * le lot 1e (ADR-0008, §3) : après un retour arrière, l'application précachée lit sa réponse.
   */
  lien?: { expireLe: string } | null;
}

/**
 * Les appareils de la personne de la session (`GET /api/moi/appareils`), lus au nom de `personne`,
 * celle dont l'écran est ouvert (1e-R15). L'écran dit ensuite au téléphone quelles passkeys garder :
 * sur un téléphone partagé, la liste d'une autre personne, signalée sous l'identifiant de la
 * première, ferait retirer ses passkeys. Le serveur refuse donc (409 `autre_personne`) si la session
 * est celle d'une autre personne. Sans personne connue, la requête ne nomme personne : le serveur ne
 * contrôle rien, comme pour l'application d'une version précédente.
 */
export function lireAppareils(
  personne: string | undefined,
  recuperer: typeof fetch = fetch,
): Promise<ReponseAppareils> {
  return appeler<ReponseAppareils>(
    'GET',
    '/api/moi/appareils',
    undefined,
    recuperer,
    entetePersonne(personne),
  );
}

/** La personne connectée, ou `undefined` sans session valide. */
export async function lireMoi(recuperer: typeof fetch = fetch): Promise<Moi | undefined> {
  try {
    return await appeler<Moi>('GET', '/api/moi', undefined, recuperer);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && erreur.code === 'non_connecte') {
      return undefined;
    }
    throw erreur;
  }
}

/**
 * Le compte de `personne` est-il supprimé ? `GET /api/moi` sans session valide, avec son
 * identifiant en en-tête (2d-D4). Vrai seulement si le serveur le dit ; un 200, un autre 401 (un
 * ancien serveur), le réseau ou une panne rendent `false`. Ne lève jamais.
 */
export async function compteSupprime(
  personne: string,
  recuperer: typeof fetch = fetch,
): Promise<boolean> {
  try {
    await appeler<Moi>('GET', '/api/moi', undefined, recuperer, entetePersonne(personne));
    return false;
  } catch (erreur) {
    return erreur instanceof ErreurApi && erreur.compteSupprime;
  }
}

const estResume = (valeur: unknown): valeur is CoursResume => {
  const cours = valeur as Partial<CoursResume> | null;
  return (
    typeof cours === 'object' &&
    cours !== null &&
    typeof cours.id === 'string' &&
    typeof cours.titre === 'string' &&
    typeof cours.langue === 'string'
  );
};

/**
 * La liste des cours que `personne` peut lire (`GET /api/cours`). Le serveur refuse (409) si la
 * session est celle d'une autre personne. Une réponse qui n'a pas la forme du serveur est une
 * erreur : la liste sert à confirmer qu'un cours n'est plus accessible, et une liste mal formée ne
 * doit pas passer pour la liste des cours d'une personne.
 */
export async function listerCours(
  personne: string,
  recuperer: typeof fetch = fetch,
): Promise<CoursResume[]> {
  const liste = await appeler<unknown>('GET', '/api/cours', undefined, recuperer, {
    [ENTETE_PERSONNE]: personne,
  });
  if (!Array.isArray(liste) || !liste.every(estResume)) {
    throw new ErreurApi(200, 'inconnue');
  }
  return liste;
}

/**
 * Le contenu d'un cours (`GET /api/cours/:id`), qui ne sort que par ici (invariant 3), pour le
 * ranger chez `personne` : le serveur refuse (409) si la session est celle d'une autre personne.
 * Il est rendu tel que le serveur l'a servi : un serveur d'une autre version (un retour arrière)
 * peut le servir sous une autre forme. À contrôler (`coursServiUtilisable`) avant de le ranger ou
 * de l'afficher.
 */
export function lireCours(
  id: string,
  personne: string,
  recuperer: typeof fetch = fetch,
): Promise<unknown> {
  return appeler<unknown>('GET', `/api/cours/${encodeURIComponent(id)}`, undefined, recuperer, {
    [ENTETE_PERSONNE]: personne,
  });
}

/** Une page du journal de la personne dans un cours (`GET /api/cours/:id/journal`). */
export interface PageJournal {
  evenements: Evenement[];
  /** Le dernier numéro rendu : c'est le `depuis` de la lecture suivante. */
  curseur: number;
  /** Vrai s'il reste des événements après cette page. */
  suite: boolean;
}

const estEntierNaturel = (valeur: unknown): valeur is number =>
  Number.isSafeInteger(valeur) && (valeur as number) >= 0;

/**
 * Envoie un lot d'événements (`POST /api/cours/:id/journal`, de 1 à 500) de la file de
 * `personne`. Le serveur refuse le lot (409 `autre_personne`) si la session n'est pas la sienne.
 * Rend le nombre des nouveaux, `0` si le serveur les connaissait tous. Un succès qui n'a pas la
 * forme du serveur est une erreur : l'appelant ne doit jamais vider sa file sur une réponse qu'il
 * ne comprend pas.
 */
export async function envoyerJournal(
  cours: string,
  evenements: readonly Evenement[],
  personne: string,
  recuperer: typeof fetch = fetch,
): Promise<{ acceptes: number }> {
  const reponse = await appeler<{ acceptes?: unknown } | null>(
    'POST',
    `/api/cours/${encodeURIComponent(cours)}/journal`,
    { evenements },
    recuperer,
    { [ENTETE_PERSONNE]: personne },
  );
  if (!estEntierNaturel(reponse?.acceptes)) {
    throw new ErreurApi(200, 'inconnue');
  }
  return { acceptes: reponse.acceptes };
}

/**
 * Les événements de `personne` dans ce cours après le numéro `depuis`, au plus 1000. Le serveur
 * refuse (409 `autre_personne`) si la session n'est pas la sienne : rien d'une autre personne
 * n'est rendu pour être rangé chez elle.
 */
export async function lireJournal(
  cours: string,
  depuis: number,
  personne: string,
  recuperer: typeof fetch = fetch,
): Promise<PageJournal> {
  const page = await appeler<Partial<PageJournal> | null>(
    'GET',
    `/api/cours/${encodeURIComponent(cours)}/journal?depuis=${depuis}`,
    undefined,
    recuperer,
    { [ENTETE_PERSONNE]: personne },
  );
  if (
    !Array.isArray(page?.evenements) ||
    !estEntierNaturel(page.curseur) ||
    typeof page.suite !== 'boolean'
  ) {
    throw new ErreurApi(200, 'inconnue');
  }
  return { evenements: page.evenements, curseur: page.curseur, suite: page.suite };
}
