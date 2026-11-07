/*
 * Le contrôle des droits côté serveur (ADR-0001, invariants 1 à 3) : le seul endroit où un droit
 * est contrôlé, avec les règles pures de `src/domaine/acces.ts`.
 *
 * Chaque route d'API déclare son classement, `config: { acces }`. Un crochet `onRoute` refuse au
 * démarrage une route qui peut répondre sous `/api/` (une route d'API, ou une route générique comme
 * `/*`) et n'en a pas ; il tient l'inventaire des routes classées. Un crochet `preHandler` applique
 * le classement à chaque requête, avec les autorisations relues en base.
 *
 * Un refus ne dit rien du cours qu'il protège. Une personne connectée qui ne peut pas lire un
 * cours reçoit exactement la réponse d'un cours inexistant, `INTROUVABLE` ; les autorisations sont
 * lues avant même de chercher le cours, pour que ni le temps de réponse ni une panne de la base ne
 * les distinguent.
 *
 * Sur une route réservée au propriétaire, une personne connectée qui ne l'est pas reçoit le statut
 * et le corps d'une route inexistante. Elle peut pourtant savoir que la route existe : le contrôle
 * de l'origine des méthodes non sûres (403) et la prolongation de la session (le cookie renvoyé, au
 * plus une fois par heure) ne valent que sur une route trouvée (`session.ts`). Sans session, la
 * route répond 401, ce qui est voulu. Le contenu de l'administration, lui, ne sort pas.
 *
 * La règle d'ouverture d'un cours à un sujet (`ouvertureAutorisee`) passe aussi par ici
 * (`ouvertureAutoriseePour`), pour que les routes d'administration n'appellent aucune règle d'accès
 * elles-mêmes.
 *
 * Rien n'est journalisé ici : au journal, un refus est une requête qui a reçu un 404, comme une
 * autre.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  type Autorisation,
  type CoursAcces,
  coursVisibles,
  ouvertureAutorisee,
  type Personne,
  peut,
  type RefusOuverture,
} from '../../domaine/acces.js';
import { versCoursAcces } from '../../domaine/contenu/acces-cours.js';
import type { Cours } from '../../domaine/contenu/modele.js';
import type { Depot } from '../comptes/depot.js';
import type { PersonneConnectee } from '../comptes/session.js';

/**
 * - `public` : aucun contrôle. La santé, et les routes de connexion, qui authentifient elles-mêmes ;
 * - `connecte` : une session valide, sinon 401 ;
 * - `cours` : une session valide, sinon 401, puis le droit de lire le cours du paramètre `:id`,
 *   sinon la réponse d'un cours inexistant. La route le prend avec `coursAutorise` ;
 * - `proprietaire` : une session valide, sinon 401, puis celle du propriétaire, sinon la réponse
 *   d'une route inexistante : l'administration n'existe pas pour les autres.
 */
export type Classement = 'public' | 'connecte' | 'cours' | 'proprietaire';

const CLASSEMENTS: ReadonlySet<string> = new Set<Classement>([
  'public',
  'connecte',
  'cours',
  'proprietaire',
]);

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Obligatoire sur une route d'API : sans lui, l'application ne démarre pas. */
    acces?: Classement;
  }
}

/** La réponse d'une ressource inexistante, et celle de tout refus à une personne connectée. */
export const INTROUVABLE = Object.freeze({ erreur: 'introuvable' });
const NON_CONNECTE = Object.freeze({ erreur: 'non_connecte' });
/**
 * Le 401 d'un appareil dont l'en-tête nomme un compte supprimé (2d-D2). L'ancienne application le
 * lit comme `non_connecte` (invariant 8).
 */
const COMPTE_SUPPRIME = Object.freeze({ erreur: 'compte_supprime' });

/** L'en-tête de la personne dont l'écran est ouvert (voir `../entete-personne.ts`). */
export const ENTETE_PERSONNE = 'x-ancrage-personne';

export interface RouteClassee {
  methode: string;
  url: string;
  acces: Classement;
}

/** Un cours chargé, avec ce qu'en savent les règles d'accès. */
type CoursCatalogue = CoursAcces & { cours: Cours };

interface ContexteAcces {
  depot: Depot;
  /** Dans l'ordre des cours chargés. */
  catalogue: readonly CoursCatalogue[];
  parId: ReadonlyMap<string, CoursCatalogue>;
  inventaire: RouteClassee[];
}

const CONTEXTE = Symbol('ancrage.acces');

/** Le cours d'une route `cours`, posé par le crochet une fois le droit de le lire vérifié. */
const coursControles = new WeakMap<FastifyRequest, Cours>();

function contexte(instance: FastifyInstance): ContexteAcces {
  return instance.getDecorator<ContexteAcces>(CONTEXTE);
}

/**
 * Vrai si la route déclarée par `url` peut répondre à un chemin `/api/…`. C'est le cas de `/api` et
 * de ce qui est dessous, le critère des sessions (`session.ts`). C'est aussi celui d'une route
 * générique dont le premier segment commence, sur un préfixe de `api`, par un joker ou un
 * paramètre : `*`, `/*`, `/a*`, `/api*`, `/:page`, `/ap:suite`. Une telle route ne reçoit pas de
 * session (`session.ts`) : classée autrement que `public`, elle refuse tout le monde.
 */
function peutRepondreSousApi(url: string): boolean {
  if (url === '/api' || url.startsWith('/api/')) {
    return true;
  }
  const [premierSegment = ''] = (url.startsWith('/') ? url.slice(1) : url).split('/');
  const special = premierSegment.search(/[*:]/);
  return special !== -1 && 'api'.startsWith(premierSegment.slice(0, special));
}

/** Ce que les règles savent de la personne de la session. */
function personneDe(requete: FastifyRequest): Personne | undefined {
  const { personne } = requete;
  return personne === undefined
    ? undefined
    : { id: personne.id, proprietaire: personne.proprietaire, groupes: personne.groupes };
}

/**
 * Vrai si l'en-tête de la requête nomme un compte du registre des suppressions. Absent, vide ou
 * répété (Node le joint en « a, b »), il ne nomme personne. N'est lu que sans session (2d-D2).
 */
function compteSupprimeNomme(requete: FastifyRequest, depot: Depot): boolean {
  const nomme = requete.headers[ENTETE_PERSONNE];
  return typeof nomme === 'string' && depot.compteSupprime(nomme);
}

/**
 * Ajoute à `app` le contrôle des droits. À appeler avant d'enregistrer la moindre route : le
 * crochet `onRoute` ne voit que les routes ajoutées après lui.
 *
 * La garde ne voit que les routes déclarées : tout ce qui répond sous `/api` doit en être une, avec
 * son classement. Elle ne verrait ni un `setNotFoundHandler` préfixé par `/api`, ni un crochet
 * (`onRequest`, `preHandler`) qui répond lui-même à la place d'une route. Il n'y en a pas : le seul
 * `setNotFoundHandler` est celui de `app.ts`, et les seuls crochets qui répondent sont des refus
 * (l'origine, la limite de débit, ce contrôle). Un crochet qui servirait autre chose qu'un refus
 * serait une route, et passerait par ici (2b-D2).
 */
export function enregistrerAcces(
  app: FastifyInstance,
  options: { depot: Depot; cours: readonly Cours[] },
): void {
  const catalogue = options.cours.map((cours) => ({ ...versCoursAcces(cours), cours }));
  const contexteAcces: ContexteAcces = {
    depot: options.depot,
    catalogue,
    parId: new Map(catalogue.map((entree) => [entree.id, entree])),
    inventaire: [],
  };
  app.decorate(CONTEXTE, contexteAcces);

  // Synchrone, à l'enregistrement de chaque route, y compris dans les plugins enregistrés après :
  // l'erreur fait échouer le démarrage.
  app.addHook('onRoute', (route) => {
    if (!peutRepondreSousApi(route.url)) {
      return;
    }
    const methodes = [route.method].flat();
    const acces = route.config?.acces;
    if (acces === undefined || !CLASSEMENTS.has(acces)) {
      throw new Error(
        `route qui répond sous /api sans classement d'accès (config.acces) : ${methodes.join(',')} ${route.url}`,
      );
    }
    for (const methode of methodes) {
      contexteAcces.inventaire.push({ methode, url: route.url, acces });
    }
  });

  app.addHook('preHandler', async (requete, reponse) => {
    const { acces } = requete.routeOptions.config;
    // Sans classement : une route hors de l'API (le crochet `onRoute` y veille).
    if (acces === undefined || acces === 'public') {
      return;
    }
    const personne = personneDe(requete);
    if (personne === undefined) {
      return reponse
        .code(401)
        .send(compteSupprimeNomme(requete, contexteAcces.depot) ? COMPTE_SUPPRIME : NON_CONNECTE);
    }
    switch (acces) {
      case 'connecte':
        return;
      case 'proprietaire':
        if (!personne.proprietaire) {
          return reponse.code(404).send(INTROUVABLE);
        }
        return;
      case 'cours': {
        // Lues avant de chercher le cours, quel qu'il soit : ni le temps de réponse ni une panne de
        // la base ne distinguent un cours existant d'un cours inexistant.
        const autorisations = autorisationsCourantes(requete);
        const { id } = requete.params as { id?: unknown };
        const cours = typeof id === 'string' ? contexteAcces.parId.get(id) : undefined;
        // Un cours inexistant et un cours sans droit passent par le même refus.
        if (cours === undefined || !peut(personne, 'lire', cours, autorisations)) {
          return reponse.code(404).send(INTROUVABLE);
        }
        coursControles.set(requete, cours.cours);
        return;
      }
      default: {
        // Un nouveau classement doit dire ici ce qu'il contrôle : `pnpm types` échoue sinon.
        const _exhaustif: never = acces;
        return reponse.code(404).send(INTROUVABLE);
      }
    }
  });
}

/** Les routes d'API de `app` et leur classement, dans l'ordre de leur enregistrement. */
export function inventaireDesRoutes(app: FastifyInstance): readonly RouteClassee[] {
  return [...contexte(app).inventaire];
}

/** Les autorisations, lues en base à chaque appel : la donnée est petite, et toujours à jour. */
export function autorisationsCourantes(requete: FastifyRequest): Autorisation[] {
  return contexte(requete.server).depot.autorisations();
}

/** Les cours que la personne de la requête peut lister, dans l'ordre des cours chargés. */
export function coursVisiblesPour(requete: FastifyRequest): Cours[] {
  const { catalogue } = contexte(requete.server);
  return coursVisibles(personneDe(requete), catalogue, autorisationsCourantes(requete)).map(
    (entree) => entree.cours,
  );
}

/**
 * Le cours d'une route classée `cours`, dont le droit de lecture a été vérifié avant elle. Ailleurs,
 * c'est une erreur de programmation.
 */
export function coursAutorise(requete: FastifyRequest): Cours {
  const cours = coursControles.get(requete);
  if (cours === undefined) {
    throw new Error("coursAutorise : la route n'est pas classée « cours »");
  }
  return cours;
}

/**
 * La personne de la session, si la requête en a une. Le classement `connecte` (ou plus) garantit
 * qu'elle existe : le crochet a répondu 401 avant la route sinon. Sur une route `public`, la
 * session est lue elle aussi, mais rien ne la garantit ; sans personne, c'est une erreur de
 * programmation.
 */
export function personneConnectee(requete: FastifyRequest): PersonneConnectee {
  const { personne } = requete;
  if (personne === undefined) {
    throw new Error(
      'personneConnectee : aucune personne sur la requête : route sans session valide',
    );
  }
  return personne;
}

/**
 * Si ce cours peut être ouvert à ce sujet, à l'instant où l'on crée le droit : la raison du refus,
 * ou `undefined` (invariant 9). La lecture, elle, relit la règle à chaque requête.
 */
export function ouvertureAutoriseePour(
  cours: Cours,
  sujet: Autorisation['sujet'],
): RefusOuverture | undefined {
  return ouvertureAutorisee(sujet, versCoursAcces(cours));
}
