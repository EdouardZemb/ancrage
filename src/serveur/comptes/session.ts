/*
 * Les sessions : le cookie `ancrage_session` porte un jeton secret, et la base n'en garde que
 * l'empreinte (ADR-0007). Sur une route d'API, un crochet retrouve la session et pose
 * `requete.personne`. Ici aussi, la protection contre les requêtes intersites (décision 10) : le
 * cookie en `SameSite=Lax`, et le contrôle de l'en-tête `Origin`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { typeAppareil } from './appareil.js';
import { NOM_COOKIE_SESSION } from './cookie.js';
import type { Depot, Langue, SessionEnregistree } from './depot.js';
import { empreinte, memeEmpreinte, nouveauJeton } from './jetons.js';

const DUREE_SESSION_S = 180 * 24 * 60 * 60;
const DUREE_SESSION_MS = DUREE_SESSION_S * 1000;
// La prolongation n'est écrite qu'au plus une fois par heure.
const INTERVALLE_PROLONGATION_MS = 60 * 60 * 1000;
const ATTRIBUTS_COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;
const METHODES_NON_SURES: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ORIGINE_REFUSEE = { erreur: 'origine' };

export interface PersonneConnectee {
  id: string;
  nomAffiche: string;
  langue: Langue;
  proprietaire: boolean;
  /** Les identifiants de ses groupes, relus à chaque requête. */
  groupes: string[];
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** La personne de la session, sur une route d'API ; `undefined` sans session valide. */
    personne: PersonneConnectee | undefined;
  }
}

interface ContexteSessions {
  depot: Depot;
  horloge: () => Date;
}

const CONTEXTE = Symbol('ancrage.sessions');

function contexte(reponse: FastifyReply): ContexteSessions {
  return reponse.server.getDecorator<ContexteSessions>(CONTEXTE);
}

/**
 * Vrai sur une route d'API. On juge sur la route trouvée par le routeur, pas sur l'URL reçue : le
 * routeur décode le chemin, si bien que `/%61pi/…` mène aussi à une route `/api/…`.
 */
function surRouteApi(requete: FastifyRequest): boolean {
  const route = requete.routeOptions.url;
  return route !== undefined && (route === '/api' || route.startsWith('/api/'));
}

/**
 * Vrai si la session peut encore ouvrir une requête à `instant`. Écrit pour échouer fermé : une
 * date illisible donne `NaN`, la comparaison est fausse.
 */
export function sessionValide(
  session: Pick<SessionEnregistree, 'expireLe'>,
  instant: Date,
): boolean {
  return Date.parse(session.expireLe) > instant.getTime();
}

function expiration(instant: Date): string {
  return new Date(instant.getTime() + DUREE_SESSION_MS).toISOString();
}

function poserCookie(reponse: FastifyReply, jeton: string): void {
  reponse.setCookie(NOM_COOKIE_SESSION, jeton, { ...ATTRIBUTS_COOKIE, maxAge: DUREE_SESSION_S });
}

/**
 * Ajoute à `app` le contrôle de l'origine, puis le crochet de session. À appeler après
 * l'enregistrement de `@fastify/cookie` : les crochets passent dans l'ordre de leur ajout.
 */
export function enregistrerSessions(
  app: FastifyInstance,
  options: { depot: Depot; horloge: () => Date; urlPublique: string },
): void {
  const { depot, horloge } = options;
  const origine = new URL(options.urlPublique).origin;
  app.decorate(CONTEXTE, { depot, horloge } satisfies ContexteSessions);
  app.decorateRequest('personne', undefined);

  app.addHook('onRequest', async (requete, reponse) => {
    if (
      METHODES_NON_SURES.has(requete.method) &&
      surRouteApi(requete) &&
      requete.headers.origin !== origine
    ) {
      return reponse.code(403).send(ORIGINE_REFUSEE);
    }
  });

  // Seulement sur les routes d'API : une réponse en cache public (les fichiers du client) ne doit
  // jamais porter le cookie.
  app.addHook('onRequest', async (requete, reponse) => {
    const jeton = requete.cookies[NOM_COOKIE_SESSION];
    if (!surRouteApi(requete) || jeton === undefined || jeton === '') {
      return;
    }
    const attendue = empreinte(jeton);
    const session = depot.sessionParEmpreinte(attendue);
    if (session === undefined || !memeEmpreinte(session.empreinte, attendue)) {
      return;
    }
    const maintenant = horloge();
    if (!sessionValide(session, maintenant)) {
      return;
    }
    const personne = depot.personne(session.personne);
    if (personne === undefined) {
      return;
    }
    if (maintenant.getTime() - Date.parse(session.utiliseLe) >= INTERVALLE_PROLONGATION_MS) {
      depot.prolongerSession(session.id, expiration(maintenant));
      poserCookie(reponse, jeton);
    }
    requete.personne = {
      id: personne.id,
      nomAffiche: personne.nomAffiche,
      langue: personne.langue,
      proprietaire: personne.proprietaire,
      groupes: depot.groupesDe(personne.id),
      sessionId: session.id,
    };
  });
}

/**
 * Ouvre une session de 180 jours pour la personne (son identifiant) : l'écrit en base, pose le
 * cookie et rend l'identifiant de la session. Du User-Agent, seul le type d'appareil est gardé.
 */
export function ouvrirSession(
  reponse: FastifyReply,
  personne: string,
  userAgent: string | undefined,
): string {
  const { depot, horloge } = contexte(reponse);
  const jeton = nouveauJeton();
  const session = depot.creerSession({
    personne,
    empreinte: empreinte(jeton),
    appareil: typeAppareil(userAgent),
    expireLe: expiration(horloge()),
  });
  poserCookie(reponse, jeton);
  return session.id;
}

/** Supprime la session de la requête, s'il y en a une, et efface le cookie. */
export function fermerSession(requete: FastifyRequest, reponse: FastifyReply): void {
  const { depot } = contexte(reponse);
  if (requete.personne !== undefined) {
    depot.supprimerSession(requete.personne.sessionId, requete.personne.id);
    requete.personne = undefined;
  }
  reponse.setCookie(NOM_COOKIE_SESSION, '', { ...ATTRIBUTS_COOKIE, maxAge: 0 });
}
