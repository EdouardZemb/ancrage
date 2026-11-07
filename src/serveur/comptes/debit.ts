/*
 * La limite de débit des routes de connexion et de lien (décision 11) : 120 requêtes par minute et
 * par client, pour l'ensemble de ces routes. Le plafond, d'abord de 20, est relevé pour la classe
 * (ancrage-donnees#9) : derrière le réseau de l'école, tous ses appareils sortent par la même adresse, donc
 * partagent un seul compteur. Une création de compte ou une connexion coûte deux requêtes ; une
 * dizaine d'élèves qui s'y mettent ensemble, avec une reprise chacune, en font une soixantaine. Un
 * budget plus large ne coûte presque rien : un jeton de 256 bits ne se devine pas, et une passkey ne
 * s'essaie pas. Les compteurs restent en mémoire ; leur clé, une
 * adresse IP, n'est ni écrite, ni journalisée, ni renvoyée (ADR-0007), et le magasin
 * (`magasin-debit.ts`) l'oublie à la fin de sa fenêtre.
 */
import {
  normalizeIP,
  type RateLimitOptions,
  type RateLimitPluginOptions,
} from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import { MagasinQuiOublie } from './magasin-debit.js';

/**
 * Le budget commun des routes `/api/auth/*` : un seul crochet
 * `routes.addHook('onRequest', routes.rateLimit(LIMITE_DEBIT_AUTH))` dans leur plugin, donc un seul
 * compteur par client pour toutes (`routes-auth.ts`). Ce plugin doit être enregistré après
 * `@fastify/rate-limit`, qui pose le décorateur `rateLimit`. Sur une seule route, `config: {
 * rateLimit: LIMITE_DEBIT_AUTH }` lui donnerait un compteur à elle.
 *
 * Le refus n'est pas une `Error` (voir `tropDeRequetes`) : un gestionnaire d'erreurs qui le
 * relancerait le ferait partir en 200.
 */
export const LIMITE_DEBIT_AUTH = {
  max: 120,
  timeWindow: '1 minute',
} as const satisfies RateLimitOptions;

/**
 * Le client : l'en-tête que pose Cloudflare, sinon l'adresse de la connexion. Comme le greffon le
 * fait par défaut, `normalizeIP` réduit une adresse IPv6 à son sous-réseau /64 : un client qui
 * change d'adresse dans son préfixe garde le même compteur.
 */
function cleDuClient(requete: FastifyRequest): string {
  const entete = requete.headers['cf-connecting-ip'];
  return normalizeIP(typeof entete === 'string' && entete !== '' ? entete : requete.ip);
}

function tropDeRequetes(): object {
  // Fastify lit le statut dans `statusCode`. Non énumérable, il reste hors du corps, qui n'est que
  // `{"erreur":"trop_de_requetes"}` : ni la clé, ni le délai.
  return Object.defineProperty({ erreur: 'trop_de_requetes' }, 'statusCode', { value: 429 });
}

/**
 * Les options de `@fastify/rate-limit` : une route n'est limitée que si elle le demande. Le magasin
 * oublie une adresse à la fin de sa fenêtre d'une minute, au lieu de la garder jusqu'au redémarrage
 * (1f-D9, d'après 1e-R23).
 */
export const OPTIONS_DEBIT: RateLimitPluginOptions = {
  global: false,
  keyGenerator: cleDuClient,
  errorResponseBuilder: tropDeRequetes,
  store: MagasinQuiOublie,
};
