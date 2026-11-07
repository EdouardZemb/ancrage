import type { FastifyInstance, FastifyRequest } from 'fastify';
import { expect, it } from 'vitest';
import type { Base } from '../base/base.js';
import type { Depot } from '../comptes/depot.js';
import { nouveauJeton } from '../comptes/jetons.js';
import { supprimerPersonne } from '../comptes/suppression.js';
import {
  CATALOGUE,
  COURS_A_VERIFIER,
  COURS_DEROGE,
  COURS_SOURCE,
  ID_A_VERIFIER,
  ID_DEROGE,
  ID_INEXISTANT,
  ID_SOURCE,
} from '../cours-factices.fixture.js';
import { installerEnvironnement, ouvrirSessionDeTest, T0 } from '../environnement.fixture.js';
import { demander, empreinteReponse, issueDuDemarrage } from '../reponses.fixture.js';
import {
  type Classement,
  coursAutorise,
  coursVisiblesPour,
  ENTETE_PERSONNE,
  inventaireDesRoutes,
  ouvertureAutoriseePour,
  personneConnectee,
} from './index.js';

const UN_JOUR = 24 * 60 * 60 * 1000;
const NON_CONNECTE = '{"erreur":"non_connecte"}';
const INTROUVABLE = '{"erreur":"introuvable"}';
const COMPTE_SUPPRIME = '{"erreur":"compte_supprime"}';

/*
 * L'inventaire des routes d'API de `creerApp`, chacune avec son classement. Une route ajoutée
 * l'est ici aussi, avec un classement choisi et relu : une route qui sert des données de cours (les
 * statistiques, l'export de `GET /api/moi/export`) est classée `cours` ou `connecte`, avec ses
 * propres tests de fuite.
 */
const INVENTAIRE_ATTENDU = [
  'GET /api/sante public',
  'HEAD /api/sante public',
  'GET /api/notice public',
  'HEAD /api/notice public',
  'POST /api/auth/invitation/options public',
  'POST /api/auth/invitation public',
  'POST /api/auth/connexion/options public',
  'POST /api/auth/connexion public',
  'POST /api/auth/lien/options public',
  'POST /api/auth/lien public',
  'POST /api/auth/deconnexion public',
  'GET /api/cours connecte',
  'HEAD /api/cours connecte',
  'GET /api/cours/:id cours',
  'HEAD /api/cours/:id cours',
  'POST /api/cours/:id/journal cours',
  'GET /api/cours/:id/journal cours',
  'HEAD /api/cours/:id/journal cours',
  'GET /api/moi connecte',
  'HEAD /api/moi connecte',
  'PATCH /api/moi connecte',
  'DELETE /api/moi connecte',
  'GET /api/moi/appareils connecte',
  'HEAD /api/moi/appareils connecte',
  'GET /api/moi/export connecte',
  'HEAD /api/moi/export connecte',
  'DELETE /api/moi/sessions/:id connecte',
  'DELETE /api/moi/passkeys/:id connecte',
  'POST /api/moi/lien connecte',
  'DELETE /api/moi/lien connecte',
  'GET /api/admin/personnes proprietaire',
  'HEAD /api/admin/personnes proprietaire',
  'POST /api/admin/personnes/:id/lien proprietaire',
  'DELETE /api/admin/personnes/:id proprietaire',
  'DELETE /api/admin/personnes/:id/sessions proprietaire',
  'DELETE /api/admin/personnes/:id/passkeys/:passkey proprietaire',
  'POST /api/admin/invitations proprietaire',
  'GET /api/admin/groupes proprietaire',
  'HEAD /api/admin/groupes proprietaire',
  'POST /api/admin/groupes proprietaire',
  'POST /api/admin/groupes/:id/membres proprietaire',
  'DELETE /api/admin/groupes/:id/membres/:personne proprietaire',
  'GET /api/admin/autorisations proprietaire',
  'HEAD /api/admin/autorisations proprietaire',
  'POST /api/admin/autorisations proprietaire',
  'DELETE /api/admin/autorisations/:id proprietaire',
];

let depot: Depot;
let base: Base;
const { creerApp: creerAppDeTest } = installerEnvironnement(
  (environnement) => {
    ({ depot, base } = environnement);
  },
  { cours: CATALOGUE },
);

/** L'application, avec une route factice par classement, enregistrée après coup. */
function creerAppAvecRoutesDeTest(): FastifyInstance {
  const app = creerAppDeTest();
  app.register(async (routes) => {
    for (const acces of ['public', 'connecte', 'proprietaire'] as const) {
      routes.get(`/api/essai/${acces}`, { config: { acces } }, async () => ({ servi: acces }));
    }
    // Les routes `cours` : le cours du paramètre `:id`, ou une route qui n'en a pas.
    routes.get('/api/essai/cours/:id', { config: { acces: 'cours' } }, async (requete) => ({
      cours: coursAutorise(requete).id,
    }));
    routes.get('/api/essai/cours-sans-id', { config: { acces: 'cours' } }, async () => ({}));
    // Les cours que la requête peut lister, même sans session.
    routes.get('/api/essai/visibles', { config: { acces: 'public' } }, async (requete) => ({
      cours: coursVisiblesPour(requete).map((cours) => cours.id),
    }));
    // Une route qui demande le cours contrôlé sans être classée `cours` : une erreur de code.
    routes.get('/api/essai/sans-cours', { config: { acces: 'connecte' } }, async (requete) => ({
      cours: coursAutorise(requete).id,
    }));
    // Une route publique n'a pas de personne contrôlée : en demander une est une erreur de code.
    routes.get('/api/essai/sans-personne', { config: { acces: 'public' } }, async (requete) => ({
      personne: personneConnectee(requete).id,
    }));
  });
  return app;
}

/** Une session valide pour une nouvelle personne, et le jeton de son cookie. */
function connecter(proprietaire = false): string {
  const personne = depot.creerPersonne({
    nomAffiche: proprietaire ? 'Prüfer Test' : 'Lernende Test',
    langue: 'de',
    proprietaire,
  });
  return ouvrirSessionDeTest(depot, personne.id, new Date(T0.getTime() + UN_JOUR)).jeton;
}

/**
 * Les chemins des routes, lus dans l'arbre que dessine le routeur de Fastify : une source qui ne
 * doit rien au crochet `onRoute`.
 */
function cheminsDuRouteur(app: FastifyInstance): string[] {
  const pile: string[] = [];
  const chemins: string[] = [];
  for (const ligne of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const noeud = /^((?:[│ ] {3})*)[├└]── (.+?)(?: \(([A-Z, ]+)\))?$/.exec(ligne);
    if (noeud === null) {
      continue;
    }
    const [, retrait = '', segment = '', methodes] = noeud;
    pile.length = retrait.length / 4;
    pile.push(segment);
    if (methodes !== undefined) {
      chemins.push(pile.join(''));
    }
  }
  return chemins;
}

it('toute_route_est_classee', async () => {
  const app = creerAppDeTest();
  await app.ready();

  const inventaire = inventaireDesRoutes(app).map(
    ({ methode, url, acces }) => `${methode} ${url} ${acces}`,
  );

  expect([...inventaire].sort()).toEqual([...INVENTAIRE_ATTENDU].sort());
  // Indépendamment du crochet : chaque route d'API que connaît le routeur est à l'inventaire.
  const classees = new Set(inventaireDesRoutes(app).map((route) => route.url));
  const routesApi = cheminsDuRouteur(app).filter(
    (chemin) => chemin === '/api' || chemin.startsWith('/api/'),
  );
  expect(routesApi.length).toBeGreaterThan(0);
  expect([...new Set(routesApi)].sort()).toEqual([...classees].sort());
});

it('route_non_classee_empeche_le_demarrage', async () => {
  const tous = 'tous' as unknown as Classement;
  const casDePlugin: [string, (app: FastifyInstance) => void][] = [
    [
      'GET /api/essai/oubliee',
      (app) => app.register(async (r) => r.get('/api/essai/oubliee', async () => ({}))),
    ],
    [
      'POST /api/essai/vide',
      (app) =>
        app.register(async (r) => r.post('/api/essai/vide', { config: {} }, async () => ({}))),
    ],
    [
      'GET /api/essai/inconnu',
      (app) =>
        app.register(async (r) =>
          r.get('/api/essai/inconnu', { config: { acces: tous } }, async () => ({})),
        ),
    ],
    [
      'GET /api/essai/prefixee',
      (app) =>
        app.register(async (r) => r.get('/prefixee', async () => ({})), { prefix: '/api/essai' }),
    ],
    [
      'PUT,DELETE /api',
      (app) =>
        app.register(async (r) =>
          r.route({ method: ['PUT', 'DELETE'], url: '/api', handler: async () => ({}) }),
        ),
    ],
  ];
  for (const [route, enregistrer] of casDePlugin) {
    const app = creerAppDeTest();
    enregistrer(app);
    expect(await issueDuDemarrage(app), route).toContain(route);
  }

  // Directement sur l'application, la route est refusée sur-le-champ.
  const app = creerAppDeTest();
  expect(() => app.get('/api/essai/directe', async () => ({}))).toThrow('GET /api/essai/directe');
});

// Une route générique répondrait à des chemins `/api/…` sans être une route d'API.
it('route_generique_non_classee_empeche_le_demarrage', async () => {
  for (const url of ['/*', '/api*', '*', '/a*', '/:page', '/:page/cours', '/ap:suite']) {
    const app = creerAppDeTest();
    app.register(async (routes) => {
      routes.get(url, async () => ({ capte: true }));
    });

    expect(await issueDuDemarrage(app), url).toContain(`GET ${url}`);
  }
});

it('route_generique_classee_acceptee', async () => {
  const app = creerAppDeTest();
  app.register(async (routes) => {
    routes.get('/*', { config: { acces: 'connecte' } }, async () => ({ capte: true }));
  });

  await app.ready();

  expect(inventaireDesRoutes(app)).toContainEqual({
    methode: 'GET',
    url: '/*',
    acces: 'connecte',
  });
  // Le classement s'applique aussi sous `/api/` : sans session, 401.
  expect((await demander(app, '/api/essai/captee')).statusCode).toBe(401);
});

it('route_hors_api_sans_classement_acceptee', async () => {
  const app = creerAppDeTest();
  app.register(async (routes) => {
    routes.get('/essai/page', async () => ({ page: true }));
    routes.get('/apis', async () => ({ page: true }));
    // Ni un paramètre après un premier segment fixe, ni un joker après un préfixe qui n'est
    // pas celui de `api` ne peuvent capter un chemin `/api/…`.
    routes.get('/essai/:id', async () => ({ page: true }));
    routes.get('/apix*', async () => ({ page: true }));
  });

  await app.ready();

  for (const url of ['/essai/page', '/apis', '/essai/42', '/apixyz']) {
    expect((await demander(app, url)).statusCode, url).toBe(200);
  }
  expect((await demander(app, '/api/essai')).statusCode).toBe(404);
  const inventaire = inventaireDesRoutes(app).map((route) => route.url);
  for (const url of ['/essai/page', '/apis', '/essai/:id', '/apix*']) {
    expect(inventaire).not.toContain(url);
  }
});

it('classement_public_repond_sans_session', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, '/api/essai/public');

  expect(reponse.statusCode).toBe(200);
  expect(reponse.json()).toEqual({ servi: 'public' });
});

it('classement_connecte_sans_session_401', async () => {
  const app = creerAppAvecRoutesDeTest();

  for (const jeton of [undefined, nouveauJeton()]) {
    const reponse = await demander(app, '/api/essai/connecte', jeton);

    expect(reponse.statusCode).toBe(401);
    expect(reponse.body).toBe(NON_CONNECTE);
  }
});

it('classement_connecte_avec_session_servi', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, '/api/essai/connecte', connecter());

  expect(reponse.statusCode).toBe(200);
  expect(reponse.json()).toEqual({ servi: 'connecte' });
});

it('classement_proprietaire_sans_session_401', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, '/api/essai/proprietaire');

  expect(reponse.statusCode).toBe(401);
  expect(reponse.body).toBe(NON_CONNECTE);
});

it('classement_proprietaire_refuse_comme_une_route_inexistante', async () => {
  const app = creerAppAvecRoutesDeTest();
  const jeton = connecter();

  const refus = await demander(app, '/api/essai/proprietaire', jeton);
  const inexistante = await demander(app, '/api/essai/inexistante', jeton);

  expect(refus.statusCode).toBe(404);
  expect(refus.body).toBe(INTROUVABLE);
  expect(empreinteReponse(refus)).toEqual(empreinteReponse(inexistante));
});

it('classement_proprietaire_servi_au_proprietaire', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, '/api/essai/proprietaire', connecter(true));

  expect(reponse.statusCode).toBe(200);
  expect(reponse.json()).toEqual({ servi: 'proprietaire' });
});

it('cours_autorise_hors_route_cours_est_une_erreur', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, '/api/essai/sans-cours', connecter(true));

  expect(reponse.statusCode).toBe(500);
});

it('personne_connectee_hors_route_classee_est_une_erreur', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, '/api/essai/sans-personne');

  expect(reponse.statusCode).toBe(500);
});

it('personne_connectee_rend_la_personne_de_la_session', async () => {
  const app = creerAppAvecRoutesDeTest();

  // Sur une route publique, la session est tout de même lue : la personne y est quand il y en a une.
  const reponse = await demander(app, '/api/essai/sans-personne', connecter());

  expect(reponse.statusCode).toBe(200);
  expect(reponse.json()).toEqual({ personne: expect.any(String) });
});

/** Une session pour une nouvelle personne, avec un droit nominatif sur ces cours. */
function connecterAvecDroits(...cours: string[]): string {
  const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
  for (const id of cours) {
    depot.autoriser({ cours: id, sujet: { type: 'personne', id: personne.id } });
  }
  return ouvrirSessionDeTest(depot, personne.id, new Date(T0.getTime() + UN_JOUR)).jeton;
}

/** Une session pour un membre d'un groupe, que ce groupe ouvre à ces cours. */
function connecterMembreDeGroupe(...cours: string[]): string {
  const groupe = depot.creerGroupe('Klasse Test');
  const personne = depot.creerPersonne({ nomAffiche: 'Mitglied Test', langue: 'de' });
  depot.ajouterMembre(groupe.id, personne.id);
  for (const id of cours) {
    depot.autoriser({ cours: id, sujet: { type: 'groupe', id: groupe.id } });
  }
  return ouvrirSessionDeTest(depot, personne.id, new Date(T0.getTime() + UN_JOUR)).jeton;
}

it('route_hors_api_ou_sous_un_autre_prefixe_acceptee_sans_classement', async () => {
  for (const url of ['/apix', '/apia:x', '/x/api', '/b*', '/x/:y', '/']) {
    const app = creerAppDeTest();
    app.register(async (routes) => {
      routes.get(url, async () => ({}));
    });

    expect(await issueDuDemarrage(app), url).toBe('démarrée');
  }
});

it('route_sous_api_non_classee_refusee_dans_tous_les_cas_de_chemin', async () => {
  for (const url of ['/api', '/api/x', '/api*', '/ap:suite', '/a:x', '/:page']) {
    const app = creerAppDeTest();
    app.register(async (routes) => {
      routes.get(url, async () => ({}));
    });

    expect(await issueDuDemarrage(app), url).not.toBe('démarrée');
  }
});

it('route_non_classee_message_nomme_ses_methodes_et_son_adresse', async () => {
  const app = creerAppDeTest();
  app.register(async (routes) => {
    routes.route({ method: ['PUT', 'DELETE'], url: '/api/essai/deux', handler: async () => ({}) });
  });

  expect(await issueDuDemarrage(app)).toBe(
    "route qui répond sous /api sans classement d'accès (config.acces) : PUT,DELETE /api/essai/deux",
  );
});

it('route_a_plusieurs_methodes_une_ligne_d_inventaire_par_methode', async () => {
  const app = creerAppDeTest();
  app.register(async (routes) => {
    routes.route({
      method: ['PUT', 'DELETE'],
      url: '/api/essai/deux',
      config: { acces: 'proprietaire' },
      handler: async () => ({}),
    });
  });
  await app.ready();

  const lignes = inventaireDesRoutes(app).filter((route) => route.url === '/api/essai/deux');

  expect(lignes).toEqual([
    { methode: 'PUT', url: '/api/essai/deux', acces: 'proprietaire' },
    { methode: 'DELETE', url: '/api/essai/deux', acces: 'proprietaire' },
  ]);
});

it('inventaire_rendu_est_une_copie', async () => {
  const app = creerAppDeTest();
  await app.ready();

  const premier = inventaireDesRoutes(app);
  const longueur = premier.length;
  (premier as unknown[]).push('intrus');

  expect(inventaireDesRoutes(app)).toHaveLength(longueur);
});

it('cours_sans_session_401', async () => {
  const app = creerAppAvecRoutesDeTest();

  const reponse = await demander(app, `/api/essai/cours/${ID_SOURCE}`);

  expect(reponse.statusCode).toBe(401);
  expect(reponse.body).toBe(NON_CONNECTE);
});

it('cours_refus_identique_pour_inexistant_sans_droit_et_sans_parametre', async () => {
  const app = creerAppAvecRoutesDeTest();
  // Un droit sur un cours qui n'est pas chargé, et un autre sur un cours qu'on n'ouvre pas.
  const jeton = connecterAvecDroits(ID_INEXISTANT, ID_DEROGE);

  const refus = [
    await demander(app, `/api/essai/cours/${ID_INEXISTANT}`, jeton),
    await demander(app, `/api/essai/cours/${ID_SOURCE}`, jeton),
    await demander(app, `/api/essai/cours/${ID_SOURCE.toUpperCase()}`, jeton),
    await demander(app, '/api/essai/cours-sans-id', jeton),
  ];
  const inexistante = await demander(app, '/api/essai/inexistante', jeton);

  for (const reponse of refus) {
    expect(reponse.statusCode).toBe(404);
    expect(reponse.body).toBe(INTROUVABLE);
    expect(empreinteReponse(reponse)).toEqual(empreinteReponse(inexistante));
  }
});

it('cours_refus_identique_quand_le_parametre_n_est_pas_une_chaine', async () => {
  const app = creerAppAvecRoutesDeTest();
  app.register(async (routes) => {
    routes.addHook('onRequest', async (requete) => {
      (requete as { params: unknown }).params = { id: 42 };
    });
    routes.get('/api/essai/cours-numerique', { config: { acces: 'cours' } }, async () => ({}));
  });
  const jeton = connecterAvecDroits(ID_SOURCE);

  const refus = await demander(app, '/api/essai/cours-numerique', jeton);
  const inexistante = await demander(app, '/api/essai/inexistante', jeton);

  expect(refus.statusCode).toBe(404);
  expect(empreinteReponse(refus)).toEqual(empreinteReponse(inexistante));
});

it('cours_droit_nominatif_ouvre_le_cours', async () => {
  const app = creerAppAvecRoutesDeTest();
  const jeton = connecterAvecDroits(ID_SOURCE);

  const reponse = await demander(app, `/api/essai/cours/${ID_SOURCE}`, jeton);

  expect(reponse.statusCode).toBe(200);
  expect(reponse.json()).toEqual({ cours: ID_SOURCE });
});

it('cours_droit_de_groupe_ouvre_le_cours', async () => {
  const app = creerAppAvecRoutesDeTest();
  const jeton = connecterMembreDeGroupe(ID_SOURCE);

  const reponse = await demander(app, `/api/essai/cours/${ID_SOURCE}`, jeton);
  const autre = await demander(app, `/api/essai/cours/${ID_DEROGE}`, jeton);

  expect(reponse.statusCode).toBe(200);
  expect(reponse.json()).toEqual({ cours: ID_SOURCE });
  expect(autre.statusCode).toBe(404);
});

it('cours_droit_de_groupe_suspendu_sur_un_cours_a_verifier', async () => {
  const app = creerAppAvecRoutesDeTest();
  const jeton = connecterMembreDeGroupe(ID_A_VERIFIER, ID_DEROGE);

  const refuse = await demander(app, `/api/essai/cours/${ID_A_VERIFIER}`, jeton);
  const deroge = await demander(app, `/api/essai/cours/${ID_DEROGE}`, jeton);

  expect(refuse.statusCode).toBe(404);
  expect(refuse.body).toBe(INTROUVABLE);
  expect(deroge.statusCode).toBe(200);
});

it('cours_proprietaire_lit_un_cours_charge_mais_pas_un_inexistant', async () => {
  const app = creerAppAvecRoutesDeTest();
  const jeton = connecter(true);

  const charge = await demander(app, `/api/essai/cours/${ID_A_VERIFIER}`, jeton);
  const inexistant = await demander(app, `/api/essai/cours/${ID_INEXISTANT}`, jeton);

  expect(charge.statusCode).toBe(200);
  expect(charge.json()).toEqual({ cours: ID_A_VERIFIER });
  expect(inexistant.statusCode).toBe(404);
  expect(inexistant.body).toBe(INTROUVABLE);
});

it('cours_visibles_dans_l_ordre_du_chargement', async () => {
  const app = creerAppAvecRoutesDeTest();

  const proprietaire = await demander(app, '/api/essai/visibles', connecter(true));
  // Les droits sont donnés dans l'ordre inverse de celui du chargement.
  const personne = await demander(
    app,
    '/api/essai/visibles',
    connecterAvecDroits(ID_DEROGE, ID_A_VERIFIER),
  );

  expect(proprietaire.json()).toEqual({ cours: CATALOGUE.map((cours) => cours.id) });
  expect(personne.json()).toEqual({ cours: [ID_A_VERIFIER, ID_DEROGE] });
});

it('cours_visibles_aucun_sans_session_ni_droit', async () => {
  const app = creerAppAvecRoutesDeTest();

  const anonyme = await demander(app, '/api/essai/visibles');
  const sansDroit = await demander(app, '/api/essai/visibles', connecter());

  expect(anonyme.json()).toEqual({ cours: [] });
  expect(sansDroit.json()).toEqual({ cours: [] });
});

it('cours_visibles_sans_le_cours_a_verifier_pour_un_groupe', async () => {
  const app = creerAppAvecRoutesDeTest();
  const jeton = connecterMembreDeGroupe(ID_A_VERIFIER, ID_SOURCE);

  const reponse = await demander(app, '/api/essai/visibles', jeton);

  expect(reponse.json()).toEqual({ cours: [ID_SOURCE] });
});

it('ouverture_refusee_a_un_groupe_pour_un_cours_a_verifier_sans_derogation', () => {
  expect(ouvertureAutoriseePour(COURS_A_VERIFIER, { type: 'groupe', id: 'g' })).toBe(
    'cours_a_verifier_sans_derogation',
  );
});

it('ouverture_permise_dans_les_autres_cas', () => {
  expect(ouvertureAutoriseePour(COURS_A_VERIFIER, { type: 'personne', id: 'p' })).toBeUndefined();
  expect(ouvertureAutoriseePour(COURS_SOURCE, { type: 'groupe', id: 'g' })).toBeUndefined();
  expect(ouvertureAutoriseePour(COURS_DEROGE, { type: 'groupe', id: 'g' })).toBeUndefined();
});

it('classement_inconnu_a_l_execution_refuse_comme_introuvable', async () => {
  const app = creerAppAvecRoutesDeTest();
  app.register(async (routes) => {
    // Le classement est valable au démarrage ; ce crochet le défait avant le contrôle, pour
    // exercer le refus par défaut du crochet `preHandler`.
    routes.addHook('onRequest', async (requete) => {
      (requete.routeOptions.config as { acces: unknown }).acces = 'tous';
    });
    routes.get('/api/essai/deteriore', { config: { acces: 'connecte' } }, async () => ({
      servi: true,
    }));
  });
  const jeton = connecter(true);

  const refus = await demander(app, '/api/essai/deteriore', jeton);
  const inexistante = await demander(app, '/api/essai/inexistante', jeton);

  expect(refus.statusCode).toBe(404);
  expect(refus.body).toBe(INTROUVABLE);
  expect(empreinteReponse(refus)).toEqual(empreinteReponse(inexistante));
});

it('cours_autorise_dit_pourquoi_il_leve', () => {
  expect(() => coursAutorise({} as FastifyRequest)).toThrow(
    "coursAutorise : la route n'est pas classée « cours »",
  );
});

it('personne_connectee_dit_pourquoi_elle_leve', () => {
  expect(() => personneConnectee({ personne: undefined } as FastifyRequest)).toThrow(
    'personneConnectee : aucune personne sur la requête : route sans session valide',
  );
});

/** Comme `demander`, avec l'en-tête `x-ancrage-personne`. */
function demanderNomme(
  app: FastifyInstance,
  url: string,
  personne: string | string[],
  jeton?: string,
) {
  return app.inject({
    method: 'GET',
    url,
    headers: { [ENTETE_PERSONNE]: personne },
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

function comptes() {
  const vivante = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
  const partie = depot.creerPersonne({ nomAffiche: 'Partie Test', langue: 'de' });
  supprimerPersonne(base, partie.id, T0);
  return { vivante: vivante.id, partie: partie.id };
}

it('compte_supprime_nomme_sans_session_401_compte_supprime', async () => {
  const app = creerAppAvecRoutesDeTest();
  const { partie } = comptes();
  const urls = ['/api/essai/connecte', '/api/essai/proprietaire', `/api/essai/cours/${ID_SOURCE}`];

  for (const url of urls) {
    for (const jeton of [undefined, nouveauJeton()]) {
      const reponse = await demanderNomme(app, url, partie, jeton);
      expect(reponse.statusCode).toBe(401);
      expect(reponse.body).toBe(COMPTE_SUPPRIME);
    }
  }
});

it('compte_vivant_nomme_sans_session_401_non_connecte', async () => {
  const app = creerAppAvecRoutesDeTest();
  const { vivante } = comptes();

  const reponse = await demanderNomme(app, '/api/essai/connecte', vivante);
  expect(reponse.statusCode).toBe(401);
  expect(reponse.body).toBe(NON_CONNECTE);
});

it('entete_absent_vide_ou_repete_401_non_connecte', async () => {
  const app = creerAppAvecRoutesDeTest();
  const { partie } = comptes();

  const sans = await demander(app, '/api/essai/connecte');
  const vide = await demanderNomme(app, '/api/essai/connecte', '');
  const repete = await demanderNomme(app, '/api/essai/connecte', [partie, partie]);
  for (const reponse of [sans, vide, repete]) {
    expect(reponse.statusCode).toBe(401);
    expect(reponse.body).toBe(NON_CONNECTE);
  }
});

it('session_valide_l_emporte_sur_l_entete_d_un_compte_supprime', async () => {
  const app = creerAppAvecRoutesDeTest();
  const { partie } = comptes();

  const reponse = await demanderNomme(app, '/api/essai/connecte', partie, connecter());
  expect(reponse.statusCode).toBe(200);
});

it('route_publique_ignore_l_entete_d_un_compte_supprime', async () => {
  const app = creerAppAvecRoutesDeTest();
  const { partie } = comptes();

  const reponse = await demanderNomme(app, '/api/essai/public', partie);
  expect(reponse.statusCode).toBe(200);
});
