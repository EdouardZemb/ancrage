import fs from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Cours } from '../domaine/contenu/modele.js';
import type { ValeursDeNotice } from '../domaine/notice.js';
import type { ReponseSante } from '../domaine/sante.js';
import { enregistrerAcces, INTROUVABLE } from './acces/index.js';
import type { Base } from './base/base.js';
import { OPTIONS_DEBIT } from './comptes/debit.js';
import { creerDepot } from './comptes/depot.js';
import { routesAuth } from './comptes/routes-auth.js';
import { enregistrerSessions } from './comptes/session.js';
import type { Config } from './config.js';
import { creerDepotJournal } from './journal/depot-journal.js';
import { routesAdmin } from './routes-admin.js';
import { routesCompte } from './routes-compte.js';
import { routesCours } from './routes-cours.js';
import { routesJournal } from './routes-journal.js';

export interface EtatBase {
  schema: number;
  instance: string;
}

export interface DependancesApp {
  config: Config;
  base: Base;
  /** Les cours chargés et validés au démarrage. */
  cours: Cours[];
  /** Les valeurs de la notice de confidentialité, chargées et validées avec les cours (S1-D8). */
  notice: ValeursDeNotice;
  etatBase: () => EtatBase;
  /** L'heure des sessions et du dépôt ; par défaut, l'heure réelle. */
  horloge?: () => Date;
  journal?: { write: (ligne: string) => void };
}

// Les fichiers de `assets/` portent un hachage dans leur nom (Vite) : on peut les garder un an.
const SOUS_DOSSIER_HACHE = 'assets';
const CACHE_FICHIER_HACHE = 'public, max-age=31536000, immutable';
// `no-cache` : le navigateur revalide à chaque fois, un nouveau déploiement est vu aussitôt.
const CACHE_REVALIDE = 'no-cache';

/**
 * La politique de sécurité du contenu (R37), posée sur toute réponse. Le navigateur ne charge que
 * ce que sert l'application elle-même : aucun script en ligne ni venu d'ailleurs (un dessin de
 * schéma, inséré tel quel, ne peut rien exécuter : voir aussi `defautsDuDessin`), aucun objet
 * embarqué, aucune balise `<base>`, aucun formulaire envoyé ailleurs, et la page ne s'affiche dans
 * le cadre d'aucun site. Les styles en ligne restent permis : les écrans en posent (attribut
 * `style`). Les images peuvent être en `data:`.
 */
const POLITIQUE_DE_CONTENU = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

// Un identifiant de passkey, qui sert de paramètre d'URL (`DELETE /api/moi/passkeys/:id`), fait
// jusqu'à 1364 caractères en base64url ; Fastify en accepte 100 par défaut, et répondrait 414.
const LONGUEUR_MAX_PARAMETRE = 1400;

function estRouteApi(url: string): boolean {
  const chemin = url.split('?')[0] ?? url;
  return chemin === '/api' || chemin.startsWith('/api/');
}

/** Ce que le journal lit d'une requête : son chemin, et le modèle de la route qui l'a servie. */
interface RequeteAJournaliser {
  url: string;
  routeOptions?: { url?: string };
}

/**
 * Un premier segment qui ressemble à un nom d'écran ou de dossier : des minuscules, des chiffres et
 * des tirets, 24 caractères au plus. Rien de plus long ni de plus varié ne va au journal : un jeton
 * (43 caractères en base64url), un identifiant ou un paramètre accolé au segment (`;`, `%3B`) n'y
 * passent pas.
 */
const SEGMENT_JOURNALISABLE = /^[a-z][a-z0-9-]{0,23}$/;

/**
 * Le chemin tel qu'il va au journal (1e-D10, ADR-0009) : jamais un identifiant, une requête ni un
 * jeton.
 *
 * - Une route a servi la requête : son modèle, `/api/moi/passkeys/:id`, donc sans la valeur du
 *   paramètre ni la requête (`?depuis=`). Les fichiers du client sont des routes aussi : leur
 *   modèle est leur chemin.
 * - Sinon (le gestionnaire « introuvable » rend `index.html` aux écrans du client, ou un 404) :
 *   le premier segment suivi de `/…`, comme `/cours/…`, `/invitation/…` ou `/api/…`, s'il est
 *   `SEGMENT_JOURNALISABLE` ; sinon `/…` ; et `/` pour la racine.
 *
 * Le premier segment est lu décodé (une fois) et sans barres répétées en tête, pour qu'une autre
 * écriture du même écran (`/%69nvitation/…`, `//lien/…`, `/invitation%2F…`) ne fasse pas passer le
 * jeton.
 */
function urlJournalisee(requete: RequeteAJournaliser): string {
  const modele = requete.routeOptions?.url;
  if (modele !== undefined && modele !== '') {
    return modele;
  }
  const decodee = requete.url.replace(/%[0-9a-f]{2}/gi, (code) =>
    String.fromCharCode(Number.parseInt(code.slice(1), 16)),
  );
  // Après les barres de tête, jusqu'à la barre, la requête ou le fragment suivants : décodé, un
  // `%3F` ou un `%2F` ne prolonge pas le segment.
  const segment = /^\/*([^/?#]*)/.exec(decodee)?.[1] ?? '';
  if (segment === '') {
    return '/';
  }
  return SEGMENT_JOURNALISABLE.test(segment) ? `/${segment}/…` : '/…';
}

const ERREUR_INTERNE = { erreur: 'interne' };

/**
 * Le gestionnaire d'erreurs racine (1e-D14). Une erreur 4xx passe intacte : on la rend au
 * gestionnaire par défaut de Fastify, qui la journalise à son niveau et la rend avec son statut et
 * son corps d'origine (le 400 d'un corps JSON illisible, R12 du lot 1d ; le refus de débit,
 * dont le statut n'est pas énumérable : voir `debit.ts`). Une erreur 5xx, ou sans statut, ne
 * rend jamais son message : il pourrait citer une table, un chemin ou une requête. La cause part au
 * journal, au niveau `error`, et la réponse est la même pour toutes.
 *
 * Écart voulu avec Fastify : sans statut sur l'erreur, Fastify garderait un 4xx que la route aurait
 * posé sur la réponse avant de lever, et rendrait le message. Ici, c'est une erreur interne.
 */
function gererErreur(erreur: unknown, requete: FastifyRequest, reponse: FastifyReply): void {
  const statut = statutDe(erreur);
  if (statut !== undefined && statut >= 400 && statut < 500) {
    // `code` d'abord : le refus de débit n'est pas une `Error`, et sans statut posé ici la
    // réponse partirait en 200. Pour une `Error`, le gestionnaire par défaut reprend la main.
    reponse.code(statut).send(erreur);
    return;
  }
  requete.log.error({ err: erreur }, 'erreur interne');
  reponse.code(500).send(ERREUR_INTERNE);
}

/**
 * Le statut 4xx de l'erreur, lu dans `statusCode` puis `status` comme Fastify (`error-status.js`) ;
 * `undefined` si elle n'en a aucun. Un statut de 5xx, dans l'un ou l'autre champ, ôte aussi le 4xx
 * de l'autre : Fastify pourrait alors rendre le message avec un 500.
 */
function statutDe(erreur: unknown): number | undefined {
  if (typeof erreur !== 'object' || erreur === null) {
    return undefined;
  }
  const { status, statusCode } = erreur as { status?: unknown; statusCode?: unknown };
  const statuts = [statusCode, status].filter(
    (valeur): valeur is number => typeof valeur === 'number' && valeur >= 400,
  );
  return statuts.some((valeur) => valeur >= 500) ? undefined : statuts[0];
}

export function creerApp(deps: DependancesApp): FastifyInstance {
  const app = Fastify({
    routerOptions: { maxParamLength: LONGUEUR_MAX_PARAMETRE },
    logger: {
      stream: deps.journal,
      serializers: {
        // Jamais d'adresse IP, d'en-tête, de jeton ni d'identifiant dans le journal : la méthode
        // et le modèle de la route (1e-D10, ADR-0009).
        req: (requete) => ({ method: requete.method, url: urlJournalisee(requete) }),
      },
    },
  });

  const horloge = deps.horloge ?? (() => new Date());
  const depot = creerDepot(deps.base, horloge);

  // En premier : son crochet `onRoute` doit voir passer chaque route, pour refuser celles de l'API
  // qui n'ont pas de classement d'accès.
  enregistrerAcces(app, { depot, cours: deps.cours });
  // Sur toute réponse : page, fichier, route d'API, refus.
  app.addHook('onSend', async (_requete, reponse, corps) => {
    reponse.header('content-security-policy', POLITIQUE_DE_CONTENU);
    // Aucune adresse de l'application (ni `/invitation/…`, ni `/lien/…`) ne part dans l'en-tête
    // `Referer` d'une requête vers un autre site (1e-D14).
    reponse.header('referrer-policy', 'no-referrer');
    return corps;
  });
  // Sur l'instance racine : les plugins ci-dessous ne se chargent qu'après ce corps, et chaque
  // route prend le gestionnaire de son instance une fois chargée, où que cette ligne soit placée.
  app.setErrorHandler(gererErreur);
  app.register(fastifyCookie);
  // Aucune route limitée par défaut : les routes `/api/auth/*` partagent un budget
  // (`LIMITE_DEBIT_AUTH`, posé par `routesAuth`).
  app.register(fastifyRateLimit, OPTIONS_DEBIT);
  enregistrerSessions(app, { depot, horloge, urlPublique: deps.config.urlPublique });
  // Après la limite de débit, dont ces routes utilisent le décorateur (voir `debit.ts`).
  app.register(routesAuth, {
    base: deps.base,
    depot,
    cours: deps.cours,
    urlPublique: deps.config.urlPublique,
    horloge,
  });
  app.register(routesCompte, {
    base: deps.base,
    depot,
    urlPublique: deps.config.urlPublique,
    horloge,
  });
  app.register(routesAdmin, {
    base: deps.base,
    depot,
    cours: deps.cours,
    urlPublique: deps.config.urlPublique,
    horloge,
  });
  app.register(routesCours);
  app.register(routesJournal, { depot: creerDepotJournal(deps.base), horloge });

  app.get('/api/sante', { config: { acces: 'public' } }, async (requete, reponse) => {
    reponse.header('cache-control', 'no-store');
    try {
      const { schema, instance } = deps.etatBase();
      const corps: ReponseSante = {
        statut: 'ok',
        environnement: deps.config.environnement,
        version: deps.config.version,
        revision: deps.config.revision,
        schema,
        instance,
      };
      return corps;
    } catch (erreur) {
      requete.log.error({ err: erreur }, 'sonde de santé : état de la base illisible');
      return reponse.code(503).send({ statut: 'ko' });
    }
  });

  // Les valeurs de la notice de l'instance (S1-D8) : publiques, comme l'écran qui les affiche, avant
  // tout compte. Elles ne disent rien d'un cours (invariant 1). Rien de l'API n'entre dans un cache
  // (décision 11) : l'appareil en garde sa copie dans IndexedDB.
  app.get('/api/notice', { config: { acces: 'public' } }, async (_requete, reponse) => {
    reponse.header('cache-control', 'no-store');
    const corps: ValeursDeNotice = deps.notice;
    return corps;
  });

  const dossierClient = path.resolve(deps.config.dossierClient);
  const clientDisponible = fs.existsSync(path.join(dossierClient, 'index.html'));

  if (clientDisponible) {
    // `wildcard: false` : les fichiers présents au démarrage deviennent des routes, et le reste
    // tombe dans le gestionnaire « introuvable » ci-dessous, qui rend `index.html`.
    app.register(fastifyStatic, {
      root: dossierClient,
      wildcard: false,
      cacheControl: false,
      setHeaders: (reponse, fichier) => {
        const [premierDossier] = path.relative(dossierClient, fichier).split(path.sep);
        reponse.header(
          'cache-control',
          premierDossier === SOUS_DOSSIER_HACHE ? CACHE_FICHIER_HACHE : CACHE_REVALIDE,
        );
      },
    });
  } else {
    app.log.info({ dossier: dossierClient }, 'dossier client absent : interface non servie');
  }

  app.setNotFoundHandler((requete, reponse) => {
    if (clientDisponible && requete.method === 'GET' && !estRouteApi(requete.url)) {
      return reponse.code(200).sendFile('index.html');
    }
    return reponse.code(404).send(INTROUVABLE);
  });

  return app;
}
