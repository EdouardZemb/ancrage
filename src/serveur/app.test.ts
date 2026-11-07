import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coursDeTest } from '../domaine/contenu/cours-de-test.fixture.js';
import { valeursDeNoticeDExemple } from '../domaine/contenu/exemple.fixture.js';
import { creerApp, type DependancesApp } from './app.js';
import {
  appliquerMigrations,
  type Base,
  fermerBase,
  initialiserInstance,
  ouvrirBase,
  versionSchema,
} from './base/base.js';
import { NOMBRE_DE_MIGRATIONS } from './base/schema.fixture.js';
import { lireConfig } from './config.js';

// Une base temporaire migrée par test : `creerApp` y range les sessions.
let dossierBase: string;
let base: Base;

beforeEach(() => {
  dossierBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-'));
  base = ouvrirBase(path.join(dossierBase, 'x.sqlite'));
  appliquerMigrations(base);
});

afterEach(() => {
  // Windows verrouille les fichiers ouverts : on ferme avant de supprimer.
  fermerBase(base);
  fs.rmSync(dossierBase, { recursive: true, force: true });
});

function creerJournalMemoire() {
  const lignes: string[] = [];
  return {
    journal: {
      write: (ligne: string) => {
        lignes.push(ligne);
      },
    },
    texte: () => lignes.join(''),
  };
}

// Dossier qui n'existe pas : le résultat ne dépend pas d'un `dist/client` laissé par un build.
const CLIENT_ABSENT = path.join(os.tmpdir(), 'ancrage-client-absent');

// Une page, un fichier, une route d'API, une API inconnue, et une méthode refusée.
const TOUTES_LES_REPONSES = [
  ['GET', '/'],
  ['GET', '/cours/x'],
  ['GET', '/assets/app-abc123.js'],
  ['GET', '/api/sante'],
  ['GET', '/api/notice'],
  ['GET', '/api/moi'],
  ['GET', '/api/inconnue'],
  ['POST', '/cours/x'],
] as const;

function creerAppDeTest(surcharge: Partial<DependancesApp> = {}, client: string = CLIENT_ABSENT) {
  const { journal, texte } = creerJournalMemoire();
  const app = creerApp({
    config: lireConfig({
      ANCRAGE_ENV: 'ci',
      ANCRAGE_VERSION: '1.2.3',
      ANCRAGE_REVISION: 'abc',
      ANCRAGE_CLIENT: client,
    }),
    base,
    cours: [],
    notice: valeursDeNoticeDExemple(),
    etatBase: () => ({ schema: 1, instance: 'i-1' }),
    journal,
    ...surcharge,
  });
  return { app, texteJournal: texte };
}

describe('GET /api/sante', () => {
  it('sante_repond_ok_avec_les_metadonnees', async () => {
    const { app } = creerAppDeTest();

    const reponse = await app.inject({ method: 'GET', url: '/api/sante' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toEqual({
      statut: 'ok',
      environnement: 'ci',
      version: '1.2.3',
      revision: 'abc',
      schema: 1,
      instance: 'i-1',
    });
  });

  it('sante_repond_503_si_la_base_echoue', async () => {
    const { app } = creerAppDeTest({
      etatBase: () => {
        throw new Error('disque');
      },
    });

    const reponse = await app.inject({ method: 'GET', url: '/api/sante' });

    expect(reponse.statusCode).toBe(503);
    expect(reponse.json()).toEqual({ statut: 'ko' });
    expect(reponse.headers['cache-control']).toBe('no-store');
  });

  it('sante_journalise_la_cause_de_l_echec', async () => {
    const { app, texteJournal } = creerAppDeTest({
      etatBase: () => {
        throw new Error('disque');
      },
    });

    await app.inject({ method: 'GET', url: '/api/sante' });

    expect(texteJournal()).toContain('disque');
  });

  it('sante_n_est_pas_mise_en_cache', async () => {
    const { app } = creerAppDeTest();

    const reponse = await app.inject({ method: 'GET', url: '/api/sante' });

    expect(reponse.headers['cache-control']).toBe('no-store');
  });

  it('journal_sans_adresse_ip', async () => {
    const { app, texteJournal } = creerAppDeTest();

    await app.inject({ method: 'GET', url: '/api/sante', remoteAddress: '203.0.113.7' });

    expect(texteJournal()).toContain('/api/sante');
    expect(texteJournal()).not.toContain('203.0.113.7');
    expect(texteJournal()).not.toContain('remoteAddress');
  });
});

describe('GET /api/sante avec une vraie base', () => {
  it('sante_reflete_la_base_reelle', async () => {
    const instance = initialiserInstance(base);
    const { app } = creerAppDeTest({
      etatBase: () => ({ schema: versionSchema(base), instance }),
    });

    const reponse = await app.inject({ method: 'GET', url: '/api/sante' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ statut: 'ok', schema: NOMBRE_DE_MIGRATIONS, instance });
  });
});

describe('GET /api/notice', () => {
  it('notice_route_publique_sans_session', async () => {
    // Les valeurs chargées au démarrage, telles quelles, à qui que ce soit (S1-D8) : rien d'un
    // cours (invariant 1), et rien dans un cache (décision 11).
    const notice = valeursDeNoticeDExemple();
    const { app } = creerAppDeTest({ notice, cours: [coursDeTest('j5by5stz')] });

    const reponse = await app.inject({ method: 'GET', url: '/api/notice' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['cache-control']).toBe('no-store');
    expect(reponse.headers['set-cookie']).toBeUndefined();
    expect(reponse.json()).toEqual(notice);
    expect(Object.keys(reponse.json())).toEqual(['date', 'valeurs', 'liens']);
  });
});

describe('interface servie par le serveur', () => {
  const dossiers: string[] = [];

  afterEach(() => {
    for (const dossier of dossiers.splice(0)) {
      fs.rmSync(dossier, { recursive: true, force: true });
    }
  });

  function creerDossierClient(): string {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-client-'));
    dossiers.push(dossier);
    fs.mkdirSync(path.join(dossier, 'assets'));
    fs.writeFileSync(path.join(dossier, 'index.html'), '<!doctype html><title>ancrage</title>');
    fs.writeFileSync(path.join(dossier, 'assets', 'app-abc123.js'), 'console.log(1);');
    return dossier;
  }

  it('route_client_renvoie_index_html', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'GET', url: '/cours/x' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toContain('text/html');
    expect(reponse.body).toContain('<title>ancrage</title>');
  });

  // De la forme d'un jeton (43 caractères base64url), écrit à la main.
  const JETON = 'Zq3vXb7nTq2wKp9sLm4yRc8dHf1gJa6eUo5iNt0xWkE';

  it('jeton_d_invitation_absent_des_journaux', async () => {
    const { app, texteJournal } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'GET', url: `/invitation/${JETON}` });
    for (const url of [
      `/invitation/${JETON}?langue=de&jeton=${JETON}`,
      `//invitation/${JETON}`,
      `/%69nvitation/${JETON}`,
      `/invitation%2F${JETON}`,
    ]) {
      await app.inject({ method: 'GET', url });
    }
    await app.inject({ method: 'GET', url: '/cours/x?vue=liste' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.body).toContain('<title>ancrage</title>');
    expect(texteJournal()).toContain('"url":"/invitation/…"');
    expect(texteJournal()).not.toContain(JETON);
    // Un autre chemin sans route ne laisse que son premier segment, sans la requête (1e-D10).
    expect(texteJournal()).toContain('"url":"/cours/…"');
    expect(texteJournal()).not.toContain('vue=liste');
  });

  it('jeton_de_lien_absent_des_journaux', async () => {
    const { app, texteJournal } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'GET', url: `/lien/${JETON}` });
    for (const url of [`/lien/${JETON}?jeton=${JETON}`, `/%6Cien/${JETON}`]) {
      await app.inject({ method: 'GET', url });
    }

    expect(reponse.statusCode).toBe(200);
    expect(texteJournal()).toContain('"url":"/lien/…"');
    expect(texteJournal()).not.toContain(JETON);
  });

  // 1e-D10, ADR-0009 : le journal ne garde que le modèle de la route, ou le premier segment d'un
  // chemin sans route. Les valeurs ci-dessous sont écrites à la main.
  it('journal_sans_identifiant', async () => {
    const { app, texteJournal } = creerAppDeTest({}, creerDossierClient());
    const idCle = 'identifiant-de-cle-factice-0042';
    const personne = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const cours = 'cours-sans-droit';

    for (const [methode, url] of [
      ['DELETE', `/api/moi/passkeys/${idCle}`],
      ['POST', `/api/admin/personnes/${personne}/lien`],
      ['GET', `/api/cours/${cours}/journal?depuis=12`],
      ['GET', `/cours/${cours}/lernen`],
      ['GET', `/invitation/${JETON}`],
    ] as const) {
      await app.inject({ method: methode, url });
    }

    const journal = texteJournal();
    expect(journal).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    for (const interdit of ['depuis=', idCle, personne, cours, JETON]) {
      expect(journal, interdit).not.toContain(interdit);
    }
    // Le modèle de la route, ou le premier segment d'un chemin sans route.
    for (const attendu of [
      '"url":"/api/moi/passkeys/:id"',
      '"url":"/api/admin/personnes/:id/lien"',
      '"url":"/api/cours/:id/journal"',
      '"url":"/cours/…"',
      '"url":"/invitation/…"',
    ]) {
      expect(journal, attendu).toContain(attendu);
    }
  });

  it('journal_hors_route_premier_segment_seulement', async () => {
    const { app, texteJournal } = creerAppDeTest({}, creerDossierClient());

    for (const url of [
      '/?a=1',
      '/api/inconnue/x?depuis=3',
      '//cours//x',
      '/%63ours/x',
      // Une requête ou un fragment encodés ne prolongent pas le premier segment.
      `/invitation%3F${JETON}`,
      `/lien%23${JETON}`,
      // Un premier segment qui ne ressemble pas à un nom d'écran ne va pas au journal.
      `/invitation;${JETON}`,
      `/invitation%3B${JETON}`,
      `/invitation%253F${JETON}`,
      `/${JETON}`,
    ]) {
      await app.inject({ method: 'GET', url });
    }

    const journal = texteJournal();
    expect(journal).not.toContain(JETON);
    expect(journal).not.toContain('a=1');
    expect(journal).not.toContain('depuis=');
    expect(journal).not.toContain('%63');
    expect(journal).toContain('"url":"/"');
    expect(journal).toContain('"url":"/api/…"');
    expect(journal).toContain('"url":"/invitation/…"');
    expect(journal).toContain('"url":"/lien/…"');
    // `//cours` et `%63ours` sont `cours` : le journal les écrit de la même façon.
    expect(journal.match(/"url":"\/cours\/…"/g)).toHaveLength(2);
    // Les quatre derniers : `/…`, sans le segment.
    expect(journal.match(/"url":"\/…"/g)).toHaveLength(4);
  });

  it('erreur_interne_sans_message', async () => {
    const { app, texteJournal } = creerAppDeTest({}, creerDossierClient());
    app.register(async (routes) => {
      routes.get('/api/essai/panne', { config: { acces: 'public' } }, async () => {
        throw new Error('no such table: secret');
      });
    });

    const reponse = await app.inject({ method: 'GET', url: '/api/essai/panne' });

    expect(reponse.statusCode).toBe(500);
    expect(reponse.json()).toEqual({ erreur: 'interne' });
    expect(reponse.body).not.toContain('secret');
    // La cause reste pour l'exploitation, au niveau erreur.
    expect(texteJournal()).toContain('no such table: secret');
    expect(texteJournal()).toContain('"level":50');
  });

  // Un statut de 5xx, même à côté d'un 4xx, ne laisse pas sortir le message de l'erreur.
  it('erreur_avec_statut_5xx_rend_une_erreur_interne', async () => {
    const { app, texteJournal } = creerAppDeTest({}, creerDossierClient());
    const erreurs = {
      sans_statut: new Error('secret'),
      statut_503: Object.assign(new Error('secret'), { statusCode: 503 }),
      status_500: Object.assign(new Error('secret'), { status: 500 }),
      statuts_en_conflit: Object.assign(new Error('secret'), { statusCode: 404, status: 500 }),
    };
    app.register(async (routes) => {
      for (const [nom, erreur] of Object.entries(erreurs)) {
        routes.get(`/api/essai/${nom}`, { config: { acces: 'public' } }, async () => {
          throw erreur;
        });
      }
    });

    for (const nom of Object.keys(erreurs)) {
      const reponse = await app.inject({ method: 'GET', url: `/api/essai/${nom}` });

      expect(reponse.statusCode, nom).toBe(500);
      expect(reponse.json(), nom).toEqual({ erreur: 'interne' });
    }
    expect(texteJournal().match(/"msg":"erreur interne"/g)).toHaveLength(4);
  });

  it('erreur_4xx_passe_intacte', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());
    app.register(async (routes) => {
      routes.get('/api/essai/conflit', { config: { acces: 'public' } }, async () => {
        throw Object.assign(new Error('conflit'), { statusCode: 409 });
      });
      routes.post('/api/essai/corps', { config: { acces: 'public' } }, async () => ({}));
    });

    const conflit = await app.inject({ method: 'GET', url: '/api/essai/conflit' });
    // R12 (lot 1d) : le 400 standard de Fastify pour un corps JSON illisible.
    const illisible = await app.inject({
      method: 'POST',
      url: '/api/essai/corps',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: '{pas du json',
    });

    expect(conflit.statusCode).toBe(409);
    expect(conflit.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'conflit' });
    expect(illisible.statusCode).toBe(400);
    expect(illisible.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      error: 'Bad Request',
      message: "Body is not valid JSON but content-type is set to 'application/json'",
    });
  });

  // 1e-D14 : une page, un fichier, une route d'API, un 404 et un refus.
  it('referrer_policy_partout', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    for (const [methode, url] of TOUTES_LES_REPONSES) {
      const reponse = await app.inject({ method: methode, url });

      expect(reponse.headers['referrer-policy'], `${methode} ${url}`).toBe('no-referrer');
    }
  });

  it('racine_renvoie_index_html', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'GET', url: '/' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toContain('text/html');
    expect(reponse.body).toContain('<title>ancrage</title>');
  });

  it('index_html_n_est_jamais_mis_en_cache', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    for (const url of ['/', '/index.html', '/cours/x']) {
      const reponse = await app.inject({ method: 'GET', url });

      expect(reponse.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('fichiers_haches_mis_en_cache_longtemps', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toContain('javascript');
    expect(reponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  // Le service worker et le manifeste n'ont pas de hachage dans leur nom : le navigateur doit les
  // revalider à chaque fois, sinon une nouvelle version de l'application ne serait jamais vue.
  it('sw_et_manifeste_revalides', async () => {
    const dossier = creerDossierClient();
    fs.writeFileSync(path.join(dossier, 'sw.js'), 'self.addEventListener("install", () => {});');
    fs.writeFileSync(path.join(dossier, 'manifest.webmanifest'), '{"name":"ancrage"}');
    const { app } = creerAppDeTest({}, dossier);

    const sw = await app.inject({ method: 'GET', url: '/sw.js' });
    const manifeste = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });

    expect(sw.statusCode).toBe(200);
    expect(sw.headers['content-type']).toContain('javascript');
    expect(sw.headers['cache-control']).toBe('no-cache');
    expect(manifeste.statusCode).toBe(200);
    expect(manifeste.headers['content-type']).toContain('application/manifest+json');
    expect(manifeste.headers['cache-control']).toBe('no-cache');
  });

  it('api_inconnue_renvoie_404_json', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    for (const url of ['/api/inconnue', '/api/sante/autre', '/api/']) {
      const reponse = await app.inject({ method: 'GET', url });

      expect(reponse.statusCode, url).toBe(404);
      expect(reponse.headers['content-type'], url).toContain('application/json');
      expect(reponse.json(), url).toEqual({ erreur: 'introuvable' });
    }
  });

  it('api_sante_reste_servie_avec_le_client', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'GET', url: '/api/sante' });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ statut: 'ok' });
  });

  it('methode_autre_que_get_hors_api_renvoie_404_json', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());

    const reponse = await app.inject({ method: 'POST', url: '/cours/x' });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.json()).toEqual({ erreur: 'introuvable' });
  });

  // R37 : la politique de sécurité du contenu, sur toute réponse du serveur.
  it('csp_sur_toutes_les_reponses', async () => {
    const { app } = creerAppDeTest({}, creerDossierClient());
    const CSP =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; " +
      "frame-ancestors 'none'; form-action 'self'";

    for (const [methode, url] of TOUTES_LES_REPONSES) {
      const reponse = await app.inject({ method: methode, url });

      expect(reponse.headers['content-security-policy'], `${methode} ${url}`).toBe(CSP);
    }
  });

  it('sans_dossier_client_rien_n_est_servi', async () => {
    const { app } = creerAppDeTest();

    const reponse = await app.inject({ method: 'GET', url: '/' });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.json()).toEqual({ erreur: 'introuvable' });
  });
});
