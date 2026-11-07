import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Base } from '../base/base.js';
import { installerEnvironnement, ouvrirSessionDeTest, T0 } from '../environnement.fixture.js';
import { cookiesPoses } from '../reponses.fixture.js';
import { LIMITE_DEBIT_AUTH } from './debit.js';
import type { Depot, PersonneEnregistree } from './depot.js';
import { empreinte, nouveauJeton } from './jetons.js';
import { MagasinQuiOublie } from './magasin-debit.js';
import { fermerSession, ouvrirSession, type PersonneConnectee } from './session.js';

const UNE_SECONDE = 1000;
const UNE_HEURE = 60 * 60 * UNE_SECONDE;
const CENT_QUATRE_VINGTS_JOURS = 180 * 24 * UNE_HEURE;
// L'origine de `urlPublique` par défaut en `ci`.
const ORIGINE = 'http://localhost:3000';
const UA_PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const ATTRIBUTS_COOKIE = ['HttpOnly', 'Max-Age=15552000', 'Path=/', 'SameSite=Lax', 'Secure'];
const METHODES_NON_SURES = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const PUBLIQUE = { config: { acces: 'public' } } as const;

let base: Base;
let depot: Depot;
const { horloge, journalServeur, creerApp } = installerEnvironnement((environnement) => {
  ({ base, depot } = environnement);
});

function plus(instant: Date, duree: number): Date {
  return new Date(instant.getTime() + duree);
}

/** L'application, avec des routes factices qui n'existent que dans ces tests. */
function creerAppDeTest(): FastifyInstance {
  const app = creerApp();
  // Dans un plugin : enregistrées après ceux de `creerApp`, dont la limite de débit. Publiques pour
  // le contrôle des droits : ces tests éprouvent la session, pas les droits.
  app.register(async (routes) => {
    routes.get('/api/essai/moi', PUBLIQUE, async (requete) => ({
      personne: requete.personne ?? null,
    }));
    routes.get('/essai/page', async (requete) => ({ personne: requete.personne ?? null }));
    routes.post<{ Body: { personne: string } }>(
      '/api/essai/ouvrir',
      PUBLIQUE,
      async (requete, reponse) => ({
        session: ouvrirSession(reponse, requete.body.personne, requete.headers['user-agent']),
      }),
    );
    routes.post('/api/essai/fermer', PUBLIQUE, async (requete, reponse) => {
      fermerSession(requete, reponse);
      return reponse.code(204).send();
    });
    for (const url of ['/api/essai/ecrire', '/api']) {
      routes.route({
        method: [...METHODES_NON_SURES],
        url,
        ...PUBLIQUE,
        handler: async () => ({ ecrit: true }),
      });
    }
    routes.post(
      '/api/auth/essai',
      { config: { acces: 'public', rateLimit: LIMITE_DEBIT_AUTH } },
      async () => ({ ok: true }),
    );
  });
  return app;
}

function creerPersonne(): PersonneEnregistree {
  return depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
}

/** Une session écrite directement en base, et le jeton de son cookie. */
function sessionEnBase(
  personne: string,
  expireLe: Date = plus(horloge.maintenant, CENT_QUATRE_VINGTS_JOURS),
) {
  return ouvrirSessionDeTest(depot, personne, expireLe);
}

async function moi(app: FastifyInstance, jeton?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: '/api/essai/moi',
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

function personneDe(reponse: LightMyRequestResponse): PersonneConnectee | null {
  expect(reponse.statusCode).toBe(200);
  return (reponse.json() as { personne: PersonneConnectee | null }).personne;
}

/** Le seul cookie posé, découpé : `nom=valeur` d'une part, les attributs triés d'autre part. */
function cookieUnique(reponse: LightMyRequestResponse): { nomValeur: string; attributs: string[] } {
  const cookies = cookiesPoses(reponse);
  expect(cookies).toHaveLength(1);
  const [nomValeur = '', ...attributs] = (cookies[0] ?? '').split('; ');
  return { nomValeur, attributs: attributs.sort() };
}

describe('session', () => {
  it('sans_cookie_pas_de_personne', async () => {
    const app = creerAppDeTest();
    creerPersonne();

    const reponse = await moi(app);

    expect(personneDe(reponse)).toBeNull();
    expect(cookiesPoses(reponse)).toEqual([]);
  });

  it('cookie_inconnu_pas_de_personne', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const { jeton } = sessionEnBase(personne.id);

    for (const inconnu of [nouveauJeton(), '', 'x', empreinte(jeton)]) {
      expect(personneDe(await moi(app, inconnu)), inconnu).toBeNull();
    }
  });

  it('session_valide_pose_la_personne', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const groupe = depot.creerGroupe('Klasse Test');
    depot.ajouterMembre(groupe.id, personne.id);
    const { jeton, session } = sessionEnBase(personne.id);

    const reponse = await moi(app, jeton);

    expect(personneDe(reponse)).toEqual({
      id: personne.id,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      proprietaire: false,
      groupes: [groupe.id],
      sessionId: session.id,
    });
    // Utilisée à l'instant : ni prolongation, ni nouveau cookie.
    expect(cookiesPoses(reponse)).toEqual([]);
  });

  it('session_expiree_refusee', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const echue = sessionEnBase(personne.id, horloge.maintenant);
    const derniereMilliseconde = sessionEnBase(personne.id, plus(horloge.maintenant, 1));

    expect(personneDe(await moi(app, echue.jeton))).toBeNull();
    expect(personneDe(await moi(app, derniereMilliseconde.jeton))?.id).toBe(personne.id);

    // 180 jours sans usage : la session ne vaut plus, et elle n'est pas prolongée.
    const { jeton, session } = sessionEnBase(personne.id);
    horloge.maintenant = plus(T0, CENT_QUATRE_VINGTS_JOURS);
    const reponse = await moi(app, jeton);

    expect(personneDe(reponse)).toBeNull();
    expect(cookiesPoses(reponse)).toEqual([]);
    expect(depot.sessionParEmpreinte(empreinte(jeton))).toEqual(session);
  });

  it('date_d_expiration_illisible_refusee', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const { jeton, session } = sessionEnBase(personne.id);
    base.sqlite
      .prepare("update session set expire_le = 'pas une date' where id = ?")
      .run(session.id);

    expect(personneDe(await moi(app, jeton))).toBeNull();
  });

  it('session_prolongee_a_l_usage_au_plus_une_fois_par_heure', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const { jeton, session } = sessionEnBase(personne.id);
    const enBase = () => depot.sessionParEmpreinte(empreinte(jeton));

    // Moins d'une heure après la dernière écriture : rien n'est écrit, aucun cookie.
    horloge.maintenant = plus(T0, UNE_HEURE - UNE_SECONDE);
    const avant = await moi(app, jeton);
    expect(personneDe(avant)?.id).toBe(personne.id);
    expect(cookiesPoses(avant)).toEqual([]);
    expect(enBase()).toEqual(session);

    // Une heure : la session est prolongée de 180 jours et le cookie renvoyé.
    const T1 = plus(T0, UNE_HEURE);
    horloge.maintenant = T1;
    const prolongee = await moi(app, jeton);
    expect(personneDe(prolongee)?.id).toBe(personne.id);
    expect(cookieUnique(prolongee)).toEqual({
      nomValeur: `ancrage_session=${jeton}`,
      attributs: ATTRIBUTS_COOKIE,
    });
    expect(enBase()).toMatchObject({
      utiliseLe: T1.toISOString(),
      expireLe: plus(T1, CENT_QUATRE_VINGTS_JOURS).toISOString(),
    });

    // Une demi-heure plus tard : rien de nouveau.
    horloge.maintenant = plus(T1, UNE_HEURE / 2);
    const ensuite = await moi(app, jeton);
    expect(cookiesPoses(ensuite)).toEqual([]);
    expect(enBase()).toMatchObject({ utiliseLe: T1.toISOString() });

    // Une heure après la prolongation : une de plus.
    const T2 = plus(T1, UNE_HEURE);
    horloge.maintenant = T2;
    expect(cookiesPoses(await moi(app, jeton))).toHaveLength(1);
    expect(enBase()).toMatchObject({
      utiliseLe: T2.toISOString(),
      expireLe: plus(T2, CENT_QUATRE_VINGTS_JOURS).toISOString(),
    });
  });

  it('cookie_pose_httponly_secure_lax', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/essai/ouvrir',
      headers: { origin: ORIGINE, 'user-agent': UA_PIXEL },
      payload: { personne: personne.id },
    });

    expect(reponse.statusCode).toBe(200);
    const { nomValeur, attributs } = cookieUnique(reponse);
    expect(attributs).toEqual(ATTRIBUTS_COOKIE);
    const [nom, jeton = ''] = nomValeur.split('=');
    expect(nom).toBe('ancrage_session');
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // La base ne garde que l'empreinte du jeton, et le type d'appareil grossier.
    expect(depot.sessionsDe(personne.id)).toEqual([
      {
        id: (reponse.json() as { session: string }).session,
        empreinte: empreinte(jeton),
        personne: personne.id,
        appareil: 'Android',
        creeLe: T0.toISOString(),
        utiliseLe: T0.toISOString(),
        expireLe: plus(T0, CENT_QUATRE_VINGTS_JOURS).toISOString(),
      },
    ]);
    expect(personneDe(await moi(app, jeton))?.id).toBe(personne.id);
    expect(journalServeur.lignes.join('')).not.toContain(jeton);
  });

  it('fermer_session_supprime_et_efface_le_cookie', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const fermee = sessionEnBase(personne.id);
    const autre = sessionEnBase(personne.id);

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/essai/fermer',
      headers: { origin: ORIGINE },
      cookies: { ancrage_session: fermee.jeton },
    });

    expect(reponse.statusCode).toBe(204);
    expect(cookieUnique(reponse)).toEqual({
      nomValeur: 'ancrage_session=',
      attributs: ['HttpOnly', 'Max-Age=0', 'Path=/', 'SameSite=Lax', 'Secure'],
    });
    // Seule la session fermée disparaît : celle d'un autre appareil reste ouverte.
    expect(depot.sessionsDe(personne.id).map((session) => session.id)).toEqual([autre.session.id]);
    expect(personneDe(await moi(app, fermee.jeton))).toBeNull();
    expect(personneDe(await moi(app, autre.jeton))?.id).toBe(personne.id);
  });

  it('hors_api_la_session_n_est_ni_lue_ni_prolongee', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();
    const { jeton, session } = sessionEnBase(personne.id);
    horloge.maintenant = plus(T0, 2 * UNE_HEURE);

    const reponse = await app.inject({
      method: 'GET',
      url: '/essai/page',
      cookies: { ancrage_session: jeton },
    });

    expect(reponse.json()).toEqual({ personne: null });
    expect(cookiesPoses(reponse)).toEqual([]);
    expect(depot.sessionParEmpreinte(empreinte(jeton))).toEqual(session);
  });
});

describe('origine', () => {
  it('post_sans_origine_refuse', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne();

    for (const method of METHODES_NON_SURES) {
      const reponse = await app.inject({ method, url: '/api/essai/ecrire' });

      expect(reponse.statusCode, method).toBe(403);
      expect(reponse.json(), method).toEqual({ erreur: 'origine' });
    }
    const ouverture = await app.inject({
      method: 'POST',
      url: '/api/essai/ouvrir',
      payload: { personne: personne.id },
    });
    expect(ouverture.statusCode).toBe(403);
    expect(depot.sessionsDe(personne.id)).toEqual([]);
  });

  it('post_autre_origine_refuse', async () => {
    const app = creerAppDeTest();

    for (const origine of [
      'https://ailleurs.example',
      'null',
      'http://localhost:3001',
      'https://localhost:3000',
      'http://localhost:3000.ailleurs.example',
      'http://localhost',
    ]) {
      const reponse = await app.inject({
        method: 'POST',
        url: '/api/essai/ecrire',
        headers: { origin: origine },
      });

      expect(reponse.statusCode, origine).toBe(403);
      expect(reponse.json(), origine).toEqual({ erreur: 'origine' });
    }
  });

  it('chemin_encode_ne_contourne_pas_l_origine', async () => {
    const app = creerAppDeTest();

    // Le routeur décode le chemin : ces URL mènent à `/api/essai/ecrire`.
    for (const url of ['/%61pi/essai/ecrire', '/api/essai/%65crire']) {
      const reponse = await app.inject({ method: 'POST', url });

      expect(reponse.statusCode, url).toBe(403);
      expect(reponse.json(), url).toEqual({ erreur: 'origine' });
    }
    // Décodée une seule fois, celle-ci ne mène à aucune route.
    const doublementEncode = await app.inject({ method: 'POST', url: '/%2561pi/essai/ecrire' });
    expect(doublementEncode.statusCode).toBe(404);
  });

  it('post_bonne_origine_accepte', async () => {
    const app = creerAppDeTest();

    for (const method of METHODES_NON_SURES) {
      const reponse = await app.inject({
        method,
        url: '/api/essai/ecrire',
        headers: { origin: ORIGINE },
      });

      expect(reponse.statusCode, method).toBe(200);
      expect(reponse.json(), method).toEqual({ ecrit: true });
    }
  });

  it('get_sans_origine_accepte', async () => {
    const app = creerAppDeTest();

    const reponse = await moi(app);

    expect(reponse.statusCode).toBe(200);
  });

  it('route_api_racine_controlee', async () => {
    const app = creerAppDeTest();

    const sansOrigine = await app.inject({ method: 'POST', url: '/api' });
    const avecOrigine = await app.inject({
      method: 'POST',
      url: '/api',
      headers: { origin: ORIGINE },
    });

    expect(sansOrigine.statusCode).toBe(403);
    expect(sansOrigine.json()).toEqual({ erreur: 'origine' });
    expect(avecOrigine.statusCode).toBe(200);
  });

  it('route_api_inconnue_sans_origine_introuvable', async () => {
    const app = creerAppDeTest();

    // Écart accepté : aucune route, donc aucun gestionnaire ; la réponse est celle d'une route
    // inexistante, et non un refus d'origine.
    const reponse = await app.inject({ method: 'POST', url: '/api/inconnue' });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.json()).toEqual({ erreur: 'introuvable' });
  });
});

describe('debit', () => {
  async function essaiAuth(
    app: FastifyInstance,
    client: { ip?: string; cf?: string } = {},
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url: '/api/auth/essai',
      remoteAddress: client.ip ?? '192.0.2.1',
      headers: {
        origin: ORIGINE,
        ...(client.cf === undefined ? {} : { 'cf-connecting-ip': client.cf }),
      },
    });
  }

  // Le plafond de `LIMITE_DEBIT_AUTH`, écrit en dur : le test le fixe. Il est relevé de 20 à 120
  // pour la classe, qui partage une seule adresse derrière le réseau de l'école (ancrage-donnees#9).
  const PLAFOND = 120;

  async function epuiser(app: FastifyInstance, client: { ip?: string; cf?: string } = {}) {
    for (let numero = 1; numero <= PLAFOND; numero += 1) {
      expect((await essaiAuth(app, client)).statusCode, `requête ${numero}`).toBe(200);
    }
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Ce que la mémoire de la limite garde, en adresses : la somme de ce que gardent les magasins
   * que le greffon a tirés de `child`, un par groupe de routes limitées (1f-D9).
   */
  function adressesGardees(enfants: MockInstance<MagasinQuiOublie['child']>): number {
    return enfants.mock.results.reduce(
      (somme, resultat) => somme + (resultat.type === 'return' ? resultat.value.taille : 0),
      0,
    );
  }

  it('requete_au_dela_du_plafond_refusee', async () => {
    const app = creerAppDeTest();

    await epuiser(app);
    const refusee = await essaiAuth(app);

    expect(refusee.statusCode).toBe(429);
    expect(refusee.headers['content-type']).toContain('application/json');
    expect(refusee.body).toBe('{"erreur":"trop_de_requetes"}');
    // Un autre client n'est pas touché.
    expect((await essaiAuth(app, { ip: '192.0.2.2' })).statusCode).toBe(200);
  });

  it('cle_par_cf_connecting_ip', async () => {
    const app = creerAppDeTest();

    // Le même client derrière deux connexions : un seul compteur.
    for (let numero = 1; numero <= PLAFOND; numero += 1) {
      const ip = numero % 2 === 0 ? '192.0.2.1' : '192.0.2.2';
      expect((await essaiAuth(app, { ip, cf: '198.51.100.1' })).statusCode).toBe(200);
    }
    expect((await essaiAuth(app, { ip: '192.0.2.3', cf: '198.51.100.1' })).statusCode).toBe(429);
    // Deux clients derrière la même connexion : deux compteurs.
    expect((await essaiAuth(app, { ip: '192.0.2.1', cf: '198.51.100.2' })).statusCode).toBe(200);
    // Sans l'en-tête, c'est l'adresse de la connexion qui compte.
    expect((await essaiAuth(app, { ip: '192.0.2.1' })).statusCode).toBe(200);
  });

  it('cle_ipv6_regroupee_par_sous_reseau', async () => {
    const app = creerAppDeTest();

    // Par l'en-tête : deux adresses du même /64 partagent un compteur.
    for (let numero = 1; numero <= PLAFOND; numero += 1) {
      const cf = numero % 2 === 0 ? '2001:db8:1:2::1' : '2001:db8:1:2::2';
      expect((await essaiAuth(app, { cf })).statusCode, `requête ${numero}`).toBe(200);
    }
    expect((await essaiAuth(app, { cf: '2001:db8:1:2::1' })).statusCode).toBe(429);
    expect((await essaiAuth(app, { cf: '2001:db8:1:2:ffff::9' })).statusCode).toBe(429);
    expect((await essaiAuth(app, { cf: '2001:db8:1:3::1' })).statusCode).toBe(200);

    // Par l'adresse de la connexion, de même.
    for (let numero = 1; numero <= PLAFOND; numero += 1) {
      const ip = numero % 2 === 0 ? '2001:db8:5:6::1' : '2001:db8:5:6::2';
      expect((await essaiAuth(app, { ip })).statusCode, `requête ${numero}`).toBe(200);
    }
    expect((await essaiAuth(app, { ip: '2001:db8:5:6::3' })).statusCode).toBe(429);
    expect((await essaiAuth(app, { ip: '2001:db8:5:7::1' })).statusCode).toBe(200);

    // En IPv4, chaque adresse garde son compteur.
    await epuiser(app, { cf: '198.51.100.1' });
    expect((await essaiAuth(app, { cf: '198.51.100.1' })).statusCode).toBe(429);
    expect((await essaiAuth(app, { cf: '198.51.100.2' })).statusCode).toBe(200);
  });

  it('ip_absente_des_journaux', async () => {
    const app = creerAppDeTest();

    await epuiser(app, { ip: '203.0.113.7', cf: '198.51.100.23' });
    expect((await essaiAuth(app, { ip: '203.0.113.7', cf: '198.51.100.23' })).statusCode).toBe(429);
    await epuiser(app, { ip: '203.0.113.8' });
    expect((await essaiAuth(app, { ip: '203.0.113.8' })).statusCode).toBe(429);

    const journal = journalServeur.lignes.join('');
    expect(journal).toContain('/api/auth/essai');
    expect(journal).toContain('429');
    for (const interdit of [
      '203.0.113.7',
      '203.0.113.8',
      '198.51.100.23',
      'remoteAddress',
      'cf-connecting-ip',
    ]) {
      expect(journal).not.toContain(interdit);
    }
  });

  it('hors_auth_pas_de_limite', async () => {
    const app = creerAppDeTest();

    for (let numero = 1; numero <= 25; numero += 1) {
      expect((await app.inject({ method: 'GET', url: '/api/sante' })).statusCode).toBe(200);
    }
  });

  it('adresse_oubliee_a_la_fin_de_sa_fenetre', async () => {
    // Les minuteries et l'heure seulement : `inject` garde ses `setImmediate`.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const enfants = vi.spyOn(MagasinQuiOublie.prototype, 'child');
    const app = creerAppDeTest();

    await epuiser(app);
    expect((await essaiAuth(app)).statusCode).toBe(429);
    // Le magasin d'ancrage est bien celui du greffon, et il garde l'adresse...
    expect(adressesGardees(enfants)).toBe(1);

    // ... une minute, pas jusqu'au redémarrage (1f-D9). Le budget revient avec elle.
    vi.advanceTimersByTime(60_000);
    expect(adressesGardees(enfants)).toBe(0);
    expect((await essaiAuth(app)).statusCode).toBe(200);
  });

  it('plus_de_5000_adresses_en_une_minute', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const enfants = vi.spyOn(MagasinQuiOublie.prototype, 'child');
    const app = creerAppDeTest();
    const adresse = (numero: number) => `10.${numero >> 8}.${numero & 255}.1`;

    for (let numero = 0; numero <= 5000; numero += 1) {
      expect((await essaiAuth(app, { ip: adresse(numero) })).statusCode, `adresse ${numero}`).toBe(
        200,
      );
    }

    // La mémoire reste bornée ; le compte d'une adresse gardée ne change pas : le plafond, puis
    // le refus.
    expect(adressesGardees(enfants)).toBe(5000);
    for (let numero = 2; numero <= PLAFOND; numero += 1) {
      expect((await essaiAuth(app, { ip: adresse(5000) })).statusCode, `requête ${numero}`).toBe(
        200,
      );
    }
    expect((await essaiAuth(app, { ip: adresse(5000) })).statusCode).toBe(429);

    vi.advanceTimersByTime(60_000);
    expect(adressesGardees(enfants)).toBe(0);
  });
});
