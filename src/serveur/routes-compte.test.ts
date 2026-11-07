import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { coursDeTest } from '../domaine/contenu/cours-de-test.fixture.js';
import type { Base } from './base/base.js';
import { retenirLeWal } from './base/wal.fixture.js';
import type { TypeAppareil } from './comptes/appareil.js';
import type { Depot, PersonneEnregistree, SessionEnregistree } from './comptes/depot.js';
import { empreinte, nouveauJeton } from './comptes/jetons.js';
import { demanderOptionsDeLien, jetonDuLien } from './comptes/liens.fixture.js';
import { ajouterPasskeyDeTest } from './comptes/passkey.fixture.js';
import { POINT_DE_CONTROLE_INCOMPLET } from './comptes/suppression.js';
import { ORIGINE_DE_TEST } from './comptes/webauthn.fixture.js';
import { installerEnvironnement, profilsDeTest, T0 } from './environnement.fixture.js';
import { creerDepotJournal } from './journal/depot-journal.js';
import { APPAREIL_DE_TEST, idDeTest, reponseDeTest } from './journal/evenements.fixture.js';

const UNE_MINUTE = 60 * 1000;
const UNE_HEURE = 60 * UNE_MINUTE;
const UN_JOUR = 24 * UNE_HEURE;
const NON_CONNECTE = '{"erreur":"non_connecte"}';
const INTROUVABLE = '{"erreur":"introuvable"}';
const REQUETE = '{"erreur":"requete"}';
const DERNIERE_PASSKEY = '{"erreur":"derniere_passkey"}';
const LIEN_INVALIDE = '{"erreur":"lien_invalide"}';
const COURS_A = 'a1b2c3d4';
const COURS_B = 'e5f6a7b8';
const TITRE_A = 'Kurs Alpha';
const TITRE_B = 'Kurs Beta';
// Une unité de chaque cours, que seuls les événements de ce cours citent.
const UNITE_A = 'unitealp';
const UNITE_B = 'unitebet';

let base: Base;
let depot: Depot;
const {
  horloge,
  journalServeur,
  creerApp: creerAppDeTest,
} = installerEnvironnement(
  (environnement) => {
    ({ base, depot } = environnement);
  },
  { cours: [coursDeTest(COURS_A, TITRE_A), coursDeTest(COURS_B, TITRE_B)] },
);

const { creerPersonne, connecter } = profilsDeTest(() => depot, T0);

function ajouterPasskey(
  personne: PersonneEnregistree,
  id: string,
  appareil: TypeAppareil = 'Android',
) {
  return ajouterPasskeyDeTest(depot, personne, id, appareil);
}

type Methode = 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'DELETE';

/**
 * L'en-tête de la personne dont l'écran est ouvert : la suppression du compte l'exige (1e-R13) ;
 * les appareils, le profil et le lien pour un autre appareil le contrôlent s'il est là (1e-R15).
 */
const enteteDe = (personne: { id: string }) => ({ 'x-ancrage-personne': personne.id });

/**
 * Les valeurs de l'en-tête qui ne nomment pas `session`, la personne de la session, quand l'écran
 * est celui de `ecran` : l'autre personne, un identifiant inconnu, un en-tête vide, ou un en-tête
 * répété (joint par Node), qui ne nomme personne.
 */
const autresQue = (session: { id: string }, ecran: { id: string }) => [
  ecran.id,
  'personne-inconnue',
  '',
  `${session.id}, ${ecran.id}`,
];

async function appeler(
  app: FastifyInstance,
  methode: Methode,
  url: string,
  options: {
    jeton?: string;
    corps?: unknown;
    sansOrigine?: boolean;
    entetes?: Record<string, string>;
  } = {},
): Promise<LightMyRequestResponse> {
  const { jeton, corps, sansOrigine = false, entetes = {} } = options;
  return app.inject({
    method: methode,
    url,
    headers: { ...(sansOrigine ? {} : { origin: ORIGINE_DE_TEST }), ...entetes },
    ...(corps === undefined ? {} : { payload: corps as object }),
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

/** Le cookie de session que la réponse efface, s'il le fait. */
function cookieEfface(reponse: LightMyRequestResponse): boolean {
  const cookie = reponse.cookies.find((c) => c.name === 'ancrage_session');
  return cookie !== undefined && cookie.value === '' && cookie.maxAge === 0;
}

/**
 * La requête, faite pour chacun des écrans qui ne sont pas celui de la session (`autresQue`), est
 * refusée : 409 `autre_personne`, sans cache, et sans effacer le cookie. `envoyer` reçoit l'en-tête
 * qui nomme l'écran.
 */
async function attendreRefusAutresEcrans(
  session: { id: string },
  ecran: { id: string },
  envoyer: (entetes: Record<string, string>) => Promise<LightMyRequestResponse>,
): Promise<void> {
  for (const nomme of autresQue(session, ecran)) {
    const reponse = await envoyer({ 'x-ancrage-personne': nomme });

    expect(reponse.statusCode, nomme).toBe(409);
    expect(reponse.body, nomme).toBe('{"erreur":"autre_personne"}');
    expect(reponse.headers['cache-control'], nomme).toBe('no-store');
    expect(cookieEfface(reponse), nomme).toBe(false);
  }
}

/**
 * Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe s'est connectée dans un autre
 * onglet. Berthe a créé un lien pour un autre appareil ; `jeton` est celui de sa session.
 */
async function aliceEtBerthe(app: FastifyInstance) {
  const alice = creerPersonne('Lernende Test');
  const berthe = creerPersonne('Andere Test');
  const { jeton } = connecter(berthe);
  const jetonDeBerthe = jetonDuLien(
    ((await appeler(app, 'POST', '/api/moi/lien', { jeton })).json() as { lien: string }).lien,
  );
  return { alice, berthe, jeton, jetonDeBerthe };
}

/** Un `PATCH /api/moi` dont le corps est envoyé tel quel, en JSON. */
async function patcherBrut(
  app: FastifyInstance,
  jeton: string,
  payload: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'PATCH',
    url: '/api/moi',
    headers: { origin: ORIGINE_DE_TEST, 'content-type': 'application/json' },
    cookies: { ancrage_session: jeton },
    payload,
  });
}

function nombreDeLiens(): number {
  const ligne = base.sqlite.prepare('select count(*) as n from lien').get() as { n: number };
  return ligne.n;
}

describe('toutes les routes du compte', () => {
  const ROUTES: readonly [Methode, string][] = [
    ['GET', '/api/moi'],
    ['PATCH', '/api/moi'],
    ['DELETE', '/api/moi'],
    ['GET', '/api/moi/appareils'],
    ['GET', '/api/moi/export'],
    ['DELETE', '/api/moi/sessions/une-session'],
    ['DELETE', '/api/moi/passkeys/une-cle'],
    ['POST', '/api/moi/lien'],
    ['DELETE', '/api/moi/lien'],
  ];

  it('moi_sans_session_401', async () => {
    const app = creerAppDeTest();

    for (const [methode, url] of ROUTES) {
      for (const jeton of [undefined, nouveauJeton()]) {
        const reponse = await appeler(app, methode, url, { jeton, corps: {} });

        expect(reponse.statusCode, `${methode} ${url}`).toBe(401);
        expect(reponse.body, `${methode} ${url}`).toBe(NON_CONNECTE);
      }
    }
  });

  it('moi_methodes_non_sures_sans_origine_403', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    for (const [methode, url] of ROUTES.filter(([methode]) => methode !== 'GET')) {
      const reponse = await appeler(app, methode, url, { jeton, corps: {}, sansOrigine: true });

      expect(reponse.statusCode, `${methode} ${url}`).toBe(403);
    }
  });

  it('moi_ne_se_met_jamais_en_cache', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    const autre = connecter(personne).session;
    ajouterPasskey(personne, 'cle-a');
    ajouterPasskey(personne, 'cle-b');

    const reponses = [
      await appeler(app, 'GET', '/api/moi', { jeton }),
      await appeler(app, 'PATCH', '/api/moi', { jeton, corps: { langue: 'fr' } }),
      await appeler(app, 'GET', '/api/moi/appareils', { jeton }),
      await appeler(app, 'GET', '/api/moi/export', { jeton }),
      await appeler(app, 'POST', '/api/moi/lien', { jeton }),
      await appeler(app, 'DELETE', '/api/moi/lien', { jeton }),
      await appeler(app, 'DELETE', `/api/moi/sessions/${autre.id}`, { jeton }),
      await appeler(app, 'DELETE', '/api/moi/passkeys/cle-a', { jeton }),
      await appeler(app, 'DELETE', '/api/moi/passkeys/cle-a', { jeton }),
      // En dernier : le compte n'existe plus ensuite.
      await appeler(app, 'DELETE', '/api/moi', { jeton, entetes: enteteDe(personne) }),
    ];

    expect(reponses.map((reponse) => reponse.statusCode)).toEqual([
      200, 200, 200, 200, 200, 204, 204, 204, 404, 204,
    ]);
    for (const reponse of reponses) {
      expect(reponse.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('GET /api/moi', () => {
  it('moi_renvoie_le_profil', async () => {
    const app = creerAppDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'fr' });
    const proprietaire = creerPersonne('Prüfer Test', true);

    const reponse = await appeler(app, 'GET', '/api/moi', { jeton: connecter(personne).jeton });
    const reponseProprietaire = await appeler(app, 'GET', '/api/moi', {
      jeton: connecter(proprietaire).jeton,
    });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toStrictEqual({
      id: personne.id,
      nomAffiche: 'Lernende Test',
      langue: 'fr',
      proprietaire: false,
    });
    expect(reponseProprietaire.json()).toStrictEqual({
      id: proprietaire.id,
      nomAffiche: 'Prüfer Test',
      langue: 'de',
      proprietaire: true,
    });
  });
});

describe('PATCH /api/moi', () => {
  it('patch_moi_change_nom_et_langue', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const { jeton } = connecter(personne);

    const reponse = await appeler(app, 'PATCH', '/api/moi', {
      jeton,
      corps: { nomAffiche: '  Neue Lernende  ', langue: 'fr' },
    });

    expect(reponse.statusCode).toBe(200);
    // Le nom est gardé tel qu'après `trim`, comme à l'invitation.
    const attendu = {
      id: personne.id,
      nomAffiche: 'Neue Lernende',
      langue: 'fr',
      proprietaire: false,
    };
    expect(reponse.json()).toStrictEqual(attendu);
    expect(depot.personne(personne.id)).toMatchObject({
      nomAffiche: 'Neue Lernende',
      langue: 'fr',
    });
    expect(depot.personne(autre.id)?.nomAffiche).toBe('Andere Test');
    expect((await appeler(app, 'GET', '/api/moi', { jeton })).json()).toStrictEqual(attendu);
  });

  it('patch_moi_change_un_seul_champ', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    const langue = await appeler(app, 'PATCH', '/api/moi', { jeton, corps: { langue: 'fr' } });
    const nom = await appeler(app, 'PATCH', '/api/moi', { jeton, corps: { nomAffiche: 'Neu' } });

    expect(langue.statusCode).toBe(200);
    expect(nom.statusCode).toBe(200);
    expect(depot.personne(personne.id)).toMatchObject({ nomAffiche: 'Neu', langue: 'fr' });
  });

  it('patch_moi_ne_change_ni_le_role_ni_l_identifiant', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    for (const corps of [
      { proprietaire: true },
      { id: 'autre-id' },
      { langue: 'fr', proprietaire: true },
    ]) {
      const reponse = await appeler(app, 'PATCH', '/api/moi', { jeton, corps });

      expect(reponse.statusCode).toBe(400);
      expect(reponse.body).toBe(REQUETE);
    }
    expect(depot.personne(personne.id)).toMatchObject({ langue: 'de', proprietaire: false });
  });

  it('patch_moi_corps_invalide_400', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    const corpsInvalides: unknown[] = [
      {},
      { nomAffiche: '' },
      { nomAffiche: '   ' },
      { nomAffiche: 'a'.repeat(41) },
      { nomAffiche: 'Lernende\nTest' },
      { nomAffiche: 'Lernende‮Test' },
      { nomAffiche: 42 },
      { nomAffiche: null },
      { langue: 'en' },
      { langue: null },
      { nomAffiche: 'Neu', langue: 'en' },
      [],
    ];

    for (const corps of corpsInvalides) {
      const reponse = await appeler(app, 'PATCH', '/api/moi', {
        jeton,
        corps: corps as object,
      });

      expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
      expect(reponse.body, JSON.stringify(corps)).toBe(REQUETE);
    }
    // Un JSON qui n'est pas un objet : la même réponse.
    for (const payload of ['"texte"', 'null', '[]', '42']) {
      const reponse = await patcherBrut(app, jeton, payload);

      expect(reponse.statusCode, payload).toBe(400);
      expect(reponse.body, payload).toBe(REQUETE);
    }
    // Un JSON illisible ou vide est refusé par Fastify, avant même la route : 400, et rien ne change.
    for (const payload of ['{"langue":', '']) {
      const reponse = await patcherBrut(app, jeton, payload);

      expect(reponse.statusCode, payload).toBe(400);
    }
    expect(depot.personne(personne.id)).toMatchObject({
      nomAffiche: 'Lernende Test',
      langue: 'de',
    });
  });

  it('patch_moi_sans_entete_ou_au_nom_de_la_personne_de_la_session_200', async () => {
    // Sans l'en-tête : le client précaché d'une version précédente ne l'envoie pas, rien n'est
    // contrôlé (invariant 8). Avec la personne de la session : même réponse.
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    for (const [entetes, nomAffiche] of [
      [undefined, 'Ohne Kopfzeile'],
      [enteteDe(personne), 'Mit Kopfzeile'],
    ] as const) {
      const reponse = await appeler(app, 'PATCH', '/api/moi', {
        jeton,
        entetes,
        corps: { nomAffiche },
      });

      expect(reponse.statusCode).toBe(200);
      expect((reponse.json() as { nomAffiche: string }).nomAffiche).toBe(nomAffiche);
      expect(depot.personne(personne.id)?.nomAffiche).toBe(nomAffiche);
    }
  });

  it('patch_moi_au_nom_d_une_autre_personne_409_et_rien_change', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe s'est connectée dans un autre
    // onglet. Le nom tapé par Alice ne doit pas devenir celui de Berthe, ni la réponse faire passer
    // l'écran d'Alice sur le profil de Berthe : refusé avant tout effet.
    const app = creerAppDeTest();
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    const { jeton } = connecter(berthe);

    await attendreRefusAutresEcrans(berthe, alice, (entetes) =>
      appeler(app, 'PATCH', '/api/moi', {
        jeton,
        entetes,
        corps: { nomAffiche: 'Name von Alice', langue: 'fr' },
      }),
    );
    expect(depot.personne(berthe.id)).toMatchObject({ nomAffiche: 'Andere Test', langue: 'de' });
    expect(depot.personne(alice.id)).toMatchObject({ nomAffiche: 'Lernende Test', langue: 'de' });
    // La session de Berthe, elle, reste valable.
    expect((await appeler(app, 'GET', '/api/moi', { jeton })).statusCode).toBe(200);
  });

  it('patch_moi_accepte_un_nom_de_40_caracteres', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    const reponse = await appeler(app, 'PATCH', '/api/moi', {
      jeton,
      corps: { nomAffiche: '𝔸'.repeat(40) },
    });

    expect(reponse.statusCode).toBe(200);
  });

  it('patch_moi_d_un_compte_disparu_404_et_efface_le_cookie', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    // Une autre requête supprime le compte entre le contrôle de la session et la route.
    app.addHook('preHandler', async () => {
      base.sqlite.prepare('delete from personne where id = ?').run(personne.id);
    });

    const reponse = await appeler(app, 'PATCH', '/api/moi', { jeton, corps: { langue: 'fr' } });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.body).toBe(INTROUVABLE);
    // La session n'ouvre plus rien : le cookie est effacé (1f-D12).
    expect(cookieEfface(reponse)).toBe(true);
  });
});

describe('DELETE /api/moi', () => {
  it('supprimer_mon_compte', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Témoin-Zoé-7f3a');
    const autre = creerPersonne('Andere Test');
    const courante = connecter(personne);
    const telephone = connecter(personne, 'iPhone');
    ajouterPasskey(personne, 'cle-a');
    const sessionAutre = connecter(autre);
    ajouterPasskey(autre, 'cle-autre');

    const reponse = await appeler(app, 'DELETE', '/api/moi', {
      jeton: courante.jeton,
      entetes: enteteDe(personne),
    });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    expect(cookieEfface(reponse)).toBe(true);
    // Plus rien du compte : la personne, ses sessions et ses passkeys.
    expect(depot.personne(personne.id)).toBeUndefined();
    expect(depot.sessionsDe(personne.id)).toEqual([]);
    expect(depot.passkeysDe(personne.id)).toEqual([]);
    expect(base.sqlite.prepare('select personne from suppression').all()).toStrictEqual([
      { personne: personne.id },
    ]);
    // L'ancien cookie, et celui de l'autre appareil de la personne, n'ouvrent plus rien.
    for (const jeton of [courante.jeton, telephone.jeton]) {
      const apres = await appeler(app, 'GET', '/api/moi', { jeton });

      expect(apres.statusCode).toBe(401);
      expect(apres.body).toBe(NON_CONNECTE);
    }
    // Une autre personne n'est pas touchée.
    expect(depot.personne(autre.id)?.nomAffiche).toBe('Andere Test');
    expect(depot.passkeysDe(autre.id)).toHaveLength(1);
    expect((await appeler(app, 'GET', '/api/moi', { jeton: sessionAutre.jeton })).statusCode).toBe(
      200,
    );
  });

  it('supprimer_mon_compte_ne_cite_ni_la_personne_ni_son_jeton_au_journal', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Témoin-Zoé-7f3a');
    const { jeton, session } = connecter(personne);

    await appeler(app, 'DELETE', '/api/moi', { jeton, entetes: enteteDe(personne) });

    // La ligne de la suppression elle-même (1e-D10) : ni identifiant, ni nom, ni jeton.
    const lignes = journalServeur.lignes.filter((ligne) => ligne.includes('compte supprimé'));
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] as string)).toMatchObject({ par: 'personne' });
    for (const secret of [personne.id, 'Témoin-Zoé-7f3a', jeton, empreinte(jeton), session.id]) {
      expect(lignes[0]).not.toContain(secret);
    }
  });

  it('supprimer_mon_compte_avertit_sans_identifiant_si_le_wal_est_retenu', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Témoin-Zoé-7f3a');
    const { jeton } = connecter(personne);
    // La sauvegarde de nuit retient le WAL : le point de contrôle de la suppression est incomplet.
    const liberer = retenirLeWal(base);
    let reponse: LightMyRequestResponse;
    try {
      reponse = await appeler(app, 'DELETE', '/api/moi', { jeton, entetes: enteteDe(personne) });
    } finally {
      liberer();
    }

    // La suppression a bien eu lieu ; le journal avertit, sans rien citer de la personne.
    expect(reponse.statusCode).toBe(204);
    expect(depot.personne(personne.id)).toBeUndefined();
    const avertissements = journalServeur.lignes.filter((ligne) =>
      ligne.includes(POINT_DE_CONTROLE_INCOMPLET),
    );
    expect(avertissements).toHaveLength(1);
    expect(JSON.parse(avertissements[0] as string)).toMatchObject({
      level: 40,
      msg: POINT_DE_CONTROLE_INCOMPLET,
    });
    for (const secret of [personne.id, 'Témoin-Zoé-7f3a', jeton, empreinte(jeton)]) {
      expect(avertissements[0]).not.toContain(secret);
    }
  });

  it('supprimer_mon_compte_proprietaire_refuse', async () => {
    const app = creerAppDeTest();
    const chef = creerPersonne('Prüfer Test', true);
    const { jeton } = connecter(chef);
    ajouterPasskey(chef, 'cle-chef');

    const reponse = await appeler(app, 'DELETE', '/api/moi', { jeton, entetes: enteteDe(chef) });

    expect(reponse.statusCode).toBe(409);
    expect(reponse.body).toBe('{"erreur":"proprietaire"}');
    // Rien n'a changé : le compte, sa passkey, et la session, dont le cookie reste.
    expect(cookieEfface(reponse)).toBe(false);
    expect(depot.personne(chef.id)).toBeDefined();
    expect(depot.passkeysDe(chef.id)).toHaveLength(1);
    expect((await appeler(app, 'GET', '/api/moi', { jeton })).statusCode).toBe(200);
    expect(base.sqlite.prepare('select count(*) as n from suppression').get()).toStrictEqual({
      n: 0,
    });
  });

  it('supprimer_mon_compte_sans_entete_400_et_rien_supprime', async () => {
    // Sans la personne dont l'écran demande la suppression, la route ne sait pas quel compte
    // l'écran a sous les yeux : elle ne supprime rien (1e-R13).
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');

    for (const entetes of [undefined, { 'x-ancrage-personne': '' }]) {
      const reponse = await appeler(app, 'DELETE', '/api/moi', { jeton, entetes });

      expect(reponse.statusCode).toBe(400);
      expect(reponse.body).toBe('{"erreur":"requete"}');
      expect(reponse.headers['cache-control']).toBe('no-store');
      expect(cookieEfface(reponse)).toBe(false);
    }
    // Rien n'a changé : le compte, sa passkey, la session, et pas de ligne au registre.
    expect(depot.personne(personne.id)).toBeDefined();
    expect(depot.passkeysDe(personne.id)).toHaveLength(1);
    expect((await appeler(app, 'GET', '/api/moi', { jeton })).statusCode).toBe(200);
    expect(base.sqlite.prepare('select count(*) as n from suppression').get()).toStrictEqual({
      n: 0,
    });
  });

  it('supprimer_mon_compte_au_nom_d_une_autre_personne_409_et_rien_supprime', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe s'est connectée dans un autre
    // onglet. La session est celle de Berthe : sa suppression, au nom d'Alice, est refusée avant
    // toute suppression, celle de Berthe comme celle d'Alice (1e-R13).
    const app = creerAppDeTest();
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    const sessionDeBerthe = connecter(berthe);
    ajouterPasskey(berthe, 'cle-berthe');
    ajouterPasskey(alice, 'cle-alice');

    // L'en-tête d'une autre personne, un identifiant inconnu, ou un en-tête répété (joint par
    // Node), qui ne nomme personne.
    for (const nomme of [alice.id, 'personne-inconnue', `${berthe.id}, ${alice.id}`]) {
      const reponse = await appeler(app, 'DELETE', '/api/moi', {
        jeton: sessionDeBerthe.jeton,
        entetes: { 'x-ancrage-personne': nomme },
      });

      expect(reponse.statusCode, nomme).toBe(409);
      expect(reponse.body, nomme).toBe('{"erreur":"autre_personne"}');
      expect(cookieEfface(reponse), nomme).toBe(false);
    }
    expect(depot.personne(berthe.id)).toBeDefined();
    expect(depot.passkeysDe(berthe.id)).toHaveLength(1);
    expect(depot.personne(alice.id)).toBeDefined();
    expect(depot.passkeysDe(alice.id)).toHaveLength(1);
    expect(
      (await appeler(app, 'GET', '/api/moi', { jeton: sessionDeBerthe.jeton })).statusCode,
    ).toBe(200);
    expect(base.sqlite.prepare('select count(*) as n from suppression').get()).toStrictEqual({
      n: 0,
    });
  });

  it('supprimer_mon_compte_deja_supprime_404', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    // Une autre requête supprime le compte entre le contrôle de la session et la route.
    app.addHook('preHandler', async () => {
      base.sqlite.prepare('delete from personne where id = ?').run(personne.id);
    });

    const reponse = await appeler(app, 'DELETE', '/api/moi', {
      jeton,
      entetes: enteteDe(personne),
    });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.body).toBe(INTROUVABLE);
    // La session n'ouvre plus rien : le cookie est effacé (1f-D12).
    expect(cookieEfface(reponse)).toBe(true);
    expect(base.sqlite.prepare('select count(*) as n from suppression').get()).toStrictEqual({
      n: 0,
    });
  });
});

describe('GET /api/moi/appareils', () => {
  it('appareils_listes_avec_courante', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const autrePersonne = creerPersonne('Andere Test');
    const premiere = connecter(personne, 'iPhone');
    // Moins d'une heure d'écart avec la requête : la session courante n'est pas prolongée, ses
    // dates restent celles de sa création.
    horloge.maintenant = new Date(T0.getTime() + 30 * UNE_MINUTE);
    const courante = connecter(personne, 'Android');
    ajouterPasskey(personne, 'cle-a', 'iPhone');
    horloge.maintenant = new Date(T0.getTime() + 40 * UNE_MINUTE);
    ajouterPasskey(personne, 'cle-b', 'Android');
    depot.majCompteurPasskey('cle-b', 3);
    // Ce qui appartient à une autre personne n'apparaît pas.
    connecter(autrePersonne, 'Windows');
    ajouterPasskey(autrePersonne, 'cle-autre', 'Windows');

    const reponse = await appeler(app, 'GET', '/api/moi/appareils', { jeton: courante.jeton });

    expect(reponse.statusCode).toBe(200);
    // Exactement ces champs : ni l'empreinte du jeton, ni la clé publique, ni le compteur. Aucun
    // lien pour un autre appareil n'est actif : `lien` vaut `null`, il n'est pas absent (1e-D7).
    expect(reponse.json()).toStrictEqual({
      lien: null,
      sessions: [
        {
          id: premiere.session.id,
          appareil: 'iPhone',
          creeLe: T0.toISOString(),
          utiliseLe: T0.toISOString(),
          courante: false,
        },
        {
          id: courante.session.id,
          appareil: 'Android',
          creeLe: new Date(T0.getTime() + 30 * UNE_MINUTE).toISOString(),
          utiliseLe: new Date(T0.getTime() + 30 * UNE_MINUTE).toISOString(),
          courante: true,
        },
      ],
      passkeys: [
        {
          id: 'cle-a',
          appareil: 'iPhone',
          creeLe: new Date(T0.getTime() + 30 * UNE_MINUTE).toISOString(),
          utiliseLe: null,
        },
        {
          id: 'cle-b',
          appareil: 'Android',
          creeLe: new Date(T0.getTime() + 40 * UNE_MINUTE).toISOString(),
          utiliseLe: new Date(T0.getTime() + 40 * UNE_MINUTE).toISOString(),
        },
      ],
    });
    expect(reponse.body).not.toContain(premiere.session.empreinte);
    expect(reponse.body).not.toContain(courante.jeton);
  });

  it('appareils_sans_entete_ou_au_nom_de_la_personne_de_la_session_200', async () => {
    // Sans l'en-tête : le client précaché d'une version précédente ne l'envoie pas, rien n'est
    // contrôlé (invariant 8, 1e-R15). Avec la personne de la session : même réponse.
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');

    for (const entetes of [undefined, enteteDe(personne)]) {
      const reponse = await appeler(app, 'GET', '/api/moi/appareils', { jeton, entetes });

      expect(reponse.statusCode).toBe(200);
      const { passkeys } = reponse.json() as { passkeys: { id: string }[] };
      expect(passkeys.map((passkey) => passkey.id)).toEqual(['cle-a']);
    }
  });

  it('appareils_au_nom_d_une_autre_personne_409_sans_rien_dire_de_la_session', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe s'est connectée dans un autre
    // onglet. La liste de Berthe ne doit pas être rendue à l'écran d'Alice, qui dirait au
    // téléphone de ne garder que ces passkeys-là (1e-R15).
    const app = creerAppDeTest();
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    const { jeton } = connecter(berthe, 'Android', new Date(T0.getTime() + 3 * UN_JOUR));
    ajouterPasskey(berthe, 'cle-berthe');
    ajouterPasskey(alice, 'cle-alice');
    const creation = await appeler(app, 'POST', '/api/moi/lien', { jeton });
    expect(creation.statusCode).toBe(200);

    await attendreRefusAutresEcrans(berthe, alice, (entetes) =>
      appeler(app, 'GET', '/api/moi/appareils', { jeton, entetes }),
    );
    // La session de Berthe, elle, reste valable.
    expect((await appeler(app, 'GET', '/api/moi', { jeton })).statusCode).toBe(200);
  });

  it('appareils_sans_les_sessions_expirees', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton, session } = connecter(personne);
    // Une session que le jeton ne peut plus ouvrir n'est plus un appareil connecté.
    connecter(personne, 'iPad', new Date(T0.getTime() - 1000));
    connecter(personne, 'Mac', T0);

    const reponse = await appeler(app, 'GET', '/api/moi/appareils', { jeton });

    const { sessions } = reponse.json() as { sessions: { id: string }[] };
    expect(sessions.map((s) => s.id)).toEqual([session.id]);
  });

  it('appareils_montre_le_lien_actif', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    // Une session qui dure plus que le lien.
    const { jeton } = connecter(personne, 'Android', new Date(T0.getTime() + 3 * UN_JOUR));
    const creation = await appeler(app, 'POST', '/api/moi/lien', { jeton });
    const jetonDuLienCree = jetonDuLien((creation.json() as { lien: string }).lien);
    // Le lien d'une autre personne n'est pas le sien.
    depot.creerLien({
      empreinte: 'lien-d-une-autre-personne',
      type: 'connexion',
      personne: creerPersonne('Andere Test').id,
      expireLe: new Date(T0.getTime() + 2 * UN_JOUR).toISOString(),
    });
    horloge.maintenant = new Date(T0.getTime() + UNE_HEURE);

    const reponse = await appeler(app, 'GET', '/api/moi/appareils', { jeton });

    // La date d'expiration seule : 24 heures après la création, ni jeton ni empreinte (1e-D7).
    expect((reponse.json() as { lien: unknown }).lien).toStrictEqual({
      expireLe: new Date(T0.getTime() + UN_JOUR).toISOString(),
    });
    expect(reponse.body).not.toContain(jetonDuLienCree);
    expect(reponse.body).not.toContain(empreinte(jetonDuLienCree));
  });

  it('appareils_sans_lien_utilise_ni_expire', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne, 'Android', new Date(T0.getTime() + 3 * UN_JOUR));
    const creation = await appeler(app, 'POST', '/api/moi/lien', { jeton });
    const empreinteDuLien = empreinte(jetonDuLien((creation.json() as { lien: string }).lien));

    // Utilisé : le lien existe encore en base, mais ne peut plus servir.
    depot.consommerLien(empreinteDuLien, 'connexion');
    const utilise = await appeler(app, 'GET', '/api/moi/appareils', { jeton });
    expect((utilise.json() as { lien: unknown }).lien).toBeNull();

    // Expiré, à l'instant exact de l'expiration.
    await appeler(app, 'POST', '/api/moi/lien', { jeton });
    horloge.maintenant = new Date(T0.getTime() + UN_JOUR);
    const expire = await appeler(app, 'GET', '/api/moi/appareils', { jeton });
    expect((expire.json() as { lien: unknown }).lien).toBeNull();
  });
});

describe('GET /api/moi/export', () => {
  /** Un événement du cours, avec l'unité propre à ce cours. */
  function evenementDe(cours: string, unite: string, n: number) {
    return { ...reponseDeTest(cours, n), unite };
  }

  /** Une réponse de la personne au cours A, dans son journal. */
  function ajouterUnEvenementDeA(personne: PersonneEnregistree): void {
    creerDepotJournal(base).ajouter(
      personne.id,
      [evenementDe(COURS_A, UNITE_A, 1)],
      T0.toISOString(),
    );
  }

  /**
   * Tout l'export que la route rend à une personne qui n'a que la session de `connecter` et aucune
   * passkey, écrit à la main : une clé de plus ou de moins fait échouer la comparaison. Seuls les
   * groupes et les cours sont à donner.
   */
  function exportAttendu(
    personne: PersonneEnregistree,
    session: SessionEnregistree,
    contenu: { groupes: string[]; cours: unknown[] },
  ) {
    return {
      format: 'ancrage-export',
      version: 1,
      exporteLe: '2026-10-16T08:00:00.000Z',
      personne: {
        id: personne.id,
        nomAffiche: personne.nomAffiche,
        langue: 'de',
        proprietaire: false,
        creeLe: '2026-10-16T08:00:00.000Z',
      },
      passkeys: [],
      sessions: [
        {
          id: session.id,
          appareil: 'Android',
          creeLe: '2026-10-16T08:00:00.000Z',
          utiliseLe: '2026-10-16T08:00:00.000Z',
          expireLe: '2026-10-17T08:00:00.000Z',
        },
      ],
      ...contenu,
    };
  }

  it('export_route_entetes', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    depot.autoriser({ cours: COURS_A, sujet: { type: 'personne', id: personne.id } });
    ajouterUnEvenementDeA(personne);

    const reponse = await appeler(app, 'GET', '/api/moi/export', { jeton });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(reponse.headers['content-disposition']).toBe(
      'attachment; filename="ancrage-export-2026-10-16.json"',
    );
    expect(reponse.headers['cache-control']).toBe('no-store');
    // Un JSON indenté de 2 espaces.
    const corps = JSON.parse(reponse.body) as { personne: { id: string }; cours: { id: string }[] };
    expect(reponse.body).toBe(JSON.stringify(corps, null, 2));
    expect(corps.personne.id).toBe(personne.id);
    expect(corps.cours.map((cours) => cours.id)).toEqual([COURS_A]);
  });

  it('export_nomme_le_fichier_du_jour_du_serveur', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'), 'Android', new Date('2026-10-19'));
    horloge.maintenant = new Date('2026-10-17T23:59:59.000Z');

    const reponse = await appeler(app, 'GET', '/api/moi/export', { jeton });

    expect(reponse.headers['content-disposition']).toBe(
      'attachment; filename="ancrage-export-2026-10-17.json"',
    );
    expect(JSON.parse(reponse.body)).toMatchObject({ exporteLe: '2026-10-17T23:59:59.000Z' });
  });

  // Invariant 1 : rien d'un cours où la personne n'a plus de droit, pas même son identifiant.
  it.each(['personne', 'groupe'] as const)(
    'export_ne_dit_rien_d_un_cours_sans_droit (droit retiré, sujet : %s)',
    async (sorte) => {
      const app = creerAppDeTest();
      const personne = creerPersonne('Lernende Test');
      const { jeton, session } = connecter(personne);
      const groupe = depot.creerGroupe('Klasse Test');
      depot.ajouterMembre(groupe.id, personne.id);
      const droitA = depot.autoriser({
        cours: COURS_A,
        sujet:
          sorte === 'personne'
            ? { type: 'personne', id: personne.id }
            : { type: 'groupe', id: groupe.id },
      });
      depot.autoriser({ cours: COURS_B, sujet: { type: 'personne', id: personne.id } });
      const journal = creerDepotJournal(base);
      journal.ajouter(
        personne.id,
        [evenementDe(COURS_A, UNITE_A, 1), evenementDe(COURS_A, UNITE_A, 2)],
        T0.toISOString(),
      );
      journal.ajouter(personne.id, [evenementDe(COURS_B, UNITE_B, 3)], T0.toISOString());

      // Avec le droit, le cours A y est : le test éprouve bien ce qu'il croit éprouver.
      const avant = await appeler(app, 'GET', '/api/moi/export', { jeton });
      for (const present of [COURS_A, TITRE_A, UNITE_A, idDeTest(1)]) {
        expect(avant.body, present).toContain(present);
      }

      expect(depot.retirerAutorisation(droitA.id)).toBe(true);
      const apres = await appeler(app, 'GET', '/api/moi/export', { jeton });

      expect(apres.statusCode).toBe(200);
      for (const secret of [COURS_A, TITRE_A, UNITE_A, idDeTest(1), idDeTest(2)]) {
        expect(apres.body, secret).not.toContain(secret);
      }
      // L'export en entier : son profil, et le seul cours qu'elle voit encore, avec son événement.
      expect(JSON.parse(apres.body)).toEqual(
        exportAttendu(personne, session, {
          groupes: ['Klasse Test'],
          cours: [
            {
              id: COURS_B,
              titre: TITRE_B,
              evenements: [
                {
                  id: idDeTest(3),
                  numero: 1,
                  unite: UNITE_B,
                  type: 'reponse',
                  resultat: { juste: true },
                  reponduA: '2026-10-17T08:15:30.250+02:00',
                  appareil: APPAREIL_DE_TEST,
                  v: 1,
                  recuA: '2026-10-16T08:00:00.000Z',
                },
              ],
            },
          ],
        }),
      );
    },
  );

  it('export_ne_dit_rien_d_un_cours_que_la_personne_ne_voit_pas', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton, session } = connecter(personne);
    // Aucun droit : même un événement resté en base (droit retiré, base restaurée) ne sort pas.
    ajouterUnEvenementDeA(personne);

    const reponse = await appeler(app, 'GET', '/api/moi/export', { jeton });

    expect(reponse.statusCode).toBe(200);
    expect(JSON.parse(reponse.body)).toEqual(
      exportAttendu(personne, session, { groupes: [], cours: [] }),
    );
    for (const secret of [COURS_A, TITRE_A, UNITE_A, idDeTest(1), COURS_B, TITRE_B]) {
      expect(reponse.body, secret).not.toContain(secret);
    }
  });

  it('export_ne_contient_que_la_personne_connectee', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const { jeton, session } = connecter(personne);
    connecter(autre);
    ajouterPasskey(autre, 'cle-de-l-autre');
    for (const id of [personne.id, autre.id]) {
      depot.autoriser({ cours: COURS_A, sujet: { type: 'personne', id } });
    }
    ajouterUnEvenementDeA(autre);

    const reponse = await appeler(app, 'GET', '/api/moi/export', { jeton });

    expect(reponse.statusCode).toBe(200);
    // Ni sa passkey, ni sa session, ni son événement : l'export est celui de la personne connectée.
    expect(JSON.parse(reponse.body)).toEqual(
      exportAttendu(personne, session, {
        groupes: [],
        cours: [{ id: COURS_A, titre: TITRE_A, evenements: [] }],
      }),
    );
    for (const secret of [autre.id, 'Andere Test', 'cle-de-l-autre', idDeTest(1)]) {
      expect(reponse.body, secret).not.toContain(secret);
    }
  });

  it('export_sans_empreinte_ni_jeton', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton, session } = connecter(personne);
    const lien = (await appeler(app, 'POST', '/api/moi/lien', { jeton })).json() as {
      lien: string;
    };
    const jetonDuLienCree = jetonDuLien(lien.lien);

    const reponse = await appeler(app, 'GET', '/api/moi/export', { jeton });

    expect(JSON.parse(reponse.body)).toEqual(
      exportAttendu(personne, session, { groupes: [], cours: [] }),
    );
    // Ni la valeur d'une empreinte ou d'un jeton, ni même le mot : l'empreinte ne sort jamais.
    expect(reponse.body).not.toContain('empreinte');
    for (const secret of [jeton, empreinte(jeton), jetonDuLienCree, empreinte(jetonDuLienCree)]) {
      expect(reponse.body).not.toContain(secret);
    }
  });

  it('export_d_un_compte_disparu_404', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    depot.autoriser({ cours: COURS_A, sujet: { type: 'personne', id: personne.id } });
    // Une autre requête supprime le compte entre le contrôle de la session et la route.
    app.addHook('preHandler', async () => {
      base.sqlite.prepare('delete from personne where id = ?').run(personne.id);
    });

    const reponse = await appeler(app, 'GET', '/api/moi/export', { jeton });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.body).toBe(INTROUVABLE);
    // Rien n'a été exporté : pas de pièce jointe.
    expect(reponse.headers['content-disposition']).toBeUndefined();
    // La session n'ouvre plus rien : le cookie est effacé (1f-D12).
    expect(cookieEfface(reponse)).toBe(true);
  });

  it('export_ne_cite_ni_la_personne_ni_son_jeton_au_journal', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Témoin-Zoé-7f3a');
    const { jeton, session } = connecter(personne);
    depot.autoriser({ cours: COURS_A, sujet: { type: 'personne', id: personne.id } });

    await appeler(app, 'GET', '/api/moi/export', { jeton });

    // Le journal dit la route, jamais ce que la réponse contient (1e-D10).
    expect(journalServeur.lignes.length).toBeGreaterThan(0);
    const journal = journalServeur.lignes.join('\n');
    for (const secret of [personne.id, 'Témoin-Zoé-7f3a', jeton, empreinte(jeton), session.id]) {
      expect(journal).not.toContain(secret);
    }
  });
});

describe('DELETE /api/moi/sessions/:id', () => {
  it('deconnecter_un_appareil', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const courante = connecter(personne, 'Android');
    const telephone = connecter(personne, 'iPhone');

    const reponse = await appeler(app, 'DELETE', `/api/moi/sessions/${telephone.session.id}`, {
      jeton: courante.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    // L'autre appareil est déconnecté ; celui-ci ne l'est pas, et son cookie reste.
    expect(cookieEfface(reponse)).toBe(false);
    expect((await appeler(app, 'GET', '/api/moi', { jeton: telephone.jeton })).statusCode).toBe(
      401,
    );
    expect((await appeler(app, 'GET', '/api/moi', { jeton: courante.jeton })).statusCode).toBe(200);
    expect(depot.sessionsDe(personne.id).map((s) => s.id)).toEqual([courante.session.id]);
  });

  it('deconnecter_la_session_courante_efface_le_cookie', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const courante = connecter(personne);
    const autre = connecter(personne);

    const reponse = await appeler(app, 'DELETE', `/api/moi/sessions/${courante.session.id}`, {
      jeton: courante.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(cookieEfface(reponse)).toBe(true);
    expect((await appeler(app, 'GET', '/api/moi', { jeton: courante.jeton })).statusCode).toBe(401);
    expect((await appeler(app, 'GET', '/api/moi', { jeton: autre.jeton })).statusCode).toBe(200);
  });

  it('deconnecter_la_session_d_une_autre_personne_comme_une_session_inconnue', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const victime = creerPersonne('Andere Test');
    const { jeton } = connecter(personne);
    const sessionVictime = connecter(victime);

    const autrui = await appeler(app, 'DELETE', `/api/moi/sessions/${sessionVictime.session.id}`, {
      jeton,
    });
    const inconnue = await appeler(app, 'DELETE', '/api/moi/sessions/session-inconnue', { jeton });

    expect(autrui.statusCode).toBe(404);
    expect(autrui.body).toBe(INTROUVABLE);
    expect(inconnue.statusCode).toBe(404);
    expect(inconnue.body).toBe(INTROUVABLE);
    expect(autrui.headers).toStrictEqual({ ...inconnue.headers, date: autrui.headers.date });
    // Rien n'a été supprimé.
    expect(depot.sessionsDe(victime.id).map((s) => s.id)).toEqual([sessionVictime.session.id]);
    expect(
      (await appeler(app, 'GET', '/api/moi', { jeton: sessionVictime.jeton })).statusCode,
    ).toBe(200);
  });
});

describe('DELETE /api/moi/passkeys/:id', () => {
  it('supprimer_une_passkey_quand_il_en_reste_une', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');
    ajouterPasskey(personne, 'cle-b');

    const reponse = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-a', { jeton });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    expect(depot.passkeysDe(personne.id).map((p) => p.id)).toEqual(['cle-b']);
  });

  it('derniere_passkey_non_supprimable', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');

    const reponse = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-a', { jeton });

    expect(reponse.statusCode).toBe(409);
    expect(reponse.body).toBe(DERNIERE_PASSKEY);
    expect(depot.passkeysDe(personne.id).map((p) => p.id)).toEqual(['cle-a']);
  });

  it('derniere_passkey_apres_en_avoir_supprime_une', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');
    ajouterPasskey(personne, 'cle-b');

    const premiere = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-a', { jeton });
    const seconde = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-b', { jeton });

    expect(premiere.statusCode).toBe(204);
    expect(seconde.statusCode).toBe(409);
    expect(seconde.body).toBe(DERNIERE_PASSKEY);
  });

  it('passkey_d_une_autre_personne_comme_une_passkey_inconnue', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const victime = creerPersonne('Andere Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');
    ajouterPasskey(personne, 'cle-b');
    ajouterPasskey(victime, 'cle-victime');
    ajouterPasskey(victime, 'cle-victime-2');

    const autrui = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-victime', { jeton });
    const inconnue = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-inconnue', { jeton });

    expect(autrui.statusCode).toBe(404);
    expect(autrui.body).toBe(INTROUVABLE);
    expect(inconnue.statusCode).toBe(404);
    expect(inconnue.body).toBe(INTROUVABLE);
    expect(depot.passkeysDe(victime.id).map((p) => p.id)).toEqual(['cle-victime', 'cle-victime-2']);
    expect(depot.passkeysDe(personne.id)).toHaveLength(2);
  });

  it('passkey_d_une_autre_personne_comme_inconnue_meme_quand_c_est_sa_derniere', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const victime = creerPersonne('Andere Test');
    const { jeton } = connecter(personne);
    ajouterPasskey(personne, 'cle-a');
    ajouterPasskey(victime, 'cle-victime');

    // Pas de 409 : il révélerait que la clé existe et que c'est la dernière de quelqu'un.
    const autrui = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-victime', { jeton });

    expect(autrui.statusCode).toBe(404);
    expect(autrui.body).toBe(INTROUVABLE);
    expect(depot.passkeysDe(victime.id)).toHaveLength(1);
  });

  it('passkey_inconnue_sans_passkey_404', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    const reponse = await appeler(app, 'DELETE', '/api/moi/passkeys/cle-inconnue', { jeton });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.body).toBe(INTROUVABLE);
  });

  // Un identifiant de clé fait jusqu'à 1023 octets, soit 1364 caractères en base64url.
  it('passkey_a_identifiant_long_supprimable', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    const longue = 'L'.repeat(1364);
    ajouterPasskey(personne, longue);
    ajouterPasskey(personne, 'cle-b');

    const reponse = await appeler(app, 'DELETE', `/api/moi/passkeys/${longue}`, { jeton });

    expect(reponse.statusCode).toBe(204);
    expect(depot.passkeysDe(personne.id).map((p) => p.id)).toEqual(['cle-b']);
  });
});

describe('POST /api/moi/lien', () => {
  it('lien_pour_un_autre_appareil', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    const reponse = await appeler(app, 'POST', '/api/moi/lien', { jeton });

    expect(reponse.statusCode).toBe(200);
    const corps = reponse.json() as { lien: string };
    expect(Object.keys(corps)).toEqual(['lien']);
    // L'adresse est celle de l'écran de connexion par lien, avec un jeton de 43 caractères.
    const jetonDuLienCree = jetonDuLien(corps.lien, { ecran: 'lien', origine: ORIGINE_DE_TEST });
    // La base ne garde que l'empreinte, et le lien est un lien de connexion de 24 heures à soi.
    expect(depot.lienUtilisable(empreinte(jetonDuLienCree), 'connexion')).toEqual({
      empreinte: empreinte(jetonDuLienCree),
      type: 'connexion',
      personne: personne.id,
      proprietaire: false,
      octroi: { groupes: [], cours: [] },
      creePar: personne.id,
      creeLe: T0.toISOString(),
      expireLe: new Date(T0.getTime() + UN_JOUR).toISOString(),
      utiliseLe: null,
    });
    expect(depot.lienUtilisable(empreinte(jetonDuLienCree), 'invitation')).toBeUndefined();
    const lignes = base.sqlite.prepare('select * from lien').all() as object[];
    expect(JSON.stringify(lignes)).not.toContain(jetonDuLienCree);
  });

  it('lien_pour_un_autre_appareil_est_valable_24_heures_pas_plus', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));
    const reponse = await appeler(app, 'POST', '/api/moi/lien', { jeton });
    const empreinteDuLien = empreinte(jetonDuLien((reponse.json() as { lien: string }).lien));

    horloge.maintenant = new Date(T0.getTime() + UN_JOUR - 1);
    expect(depot.lienUtilisable(empreinteDuLien, 'connexion')).toBeDefined();
    horloge.maintenant = new Date(T0.getTime() + UN_JOUR);
    expect(depot.lienUtilisable(empreinteDuLien, 'connexion')).toBeUndefined();
  });

  it('lien_pour_un_autre_appareil_sans_trace_du_jeton_au_journal', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    const reponse = await appeler(app, 'POST', '/api/moi/lien', { jeton });

    const jetonDuLienCree = jetonDuLien((reponse.json() as { lien: string }).lien);
    expect(journalServeur.lignes.length).toBeGreaterThan(0);
    expect(journalServeur.lignes.join('\n')).not.toContain(jetonDuLienCree);
    expect(journalServeur.lignes.join('\n')).not.toContain(empreinte(jetonDuLienCree));
    expect(journalServeur.lignes.join('\n')).not.toContain(jeton);
  });

  it('deux_liens_ont_deux_jetons_et_ne_se_repetent_pas', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    const premier = await appeler(app, 'POST', '/api/moi/lien', { jeton });
    const second = await appeler(app, 'POST', '/api/moi/lien', { jeton });

    expect((premier.json() as { lien: string }).lien).not.toBe(
      (second.json() as { lien: string }).lien,
    );
    // Le second a remplacé le premier : un seul lien reste en base (1e-D7).
    expect(nombreDeLiens()).toBe(1);
  });

  it('un_seul_lien_de_connexion_actif', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    const premier = await appeler(app, 'POST', '/api/moi/lien', { jeton });
    const second = await appeler(app, 'POST', '/api/moi/lien', { jeton });

    const jetonPremier = jetonDuLien((premier.json() as { lien: string }).lien);
    const jetonSecond = jetonDuLien((second.json() as { lien: string }).lien);
    // Le premier est annulé : comme un lien inconnu, il ne reçoit que `lien_invalide`.
    const refuse = await demanderOptionsDeLien(app, jetonPremier);
    expect(refuse.statusCode).toBe(400);
    expect(refuse.body).toBe(LIEN_INVALIDE);
    expect((await demanderOptionsDeLien(app, jetonSecond)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(1);
  });

  it('deux_creations_simultanees_un_seul_lien_actif', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    const reponses = await Promise.all([
      appeler(app, 'POST', '/api/moi/lien', { jeton }),
      appeler(app, 'POST', '/api/moi/lien', { jeton }),
    ]);

    expect(reponses.map((reponse) => reponse.statusCode)).toEqual([200, 200]);
    // On compte dans la base, pas dans les réponses : une seule ligne est encore utilisable.
    const utilisables = base.sqlite
      .prepare(
        `select count(*) as n from lien
         where type = 'connexion' and personne = ? and utilise_le is null and expire_le > ?`,
      )
      .get(personne.id, horloge.maintenant.toISOString()) as { n: number };
    expect(utilisables.n).toBe(1);
    // Et c'est l'un des deux liens rendus, pas un troisième.
    const options = await Promise.all(
      reponses.map((reponse) =>
        demanderOptionsDeLien(app, jetonDuLien((reponse.json() as { lien: string }).lien)),
      ),
    );
    expect(options.map((reponse) => reponse.statusCode).sort()).toEqual([200, 400]);
  });

  it('le_lien_de_la_personne_remplace_celui_du_proprietaire', async () => {
    const app = creerAppDeTest();
    const chef = creerPersonne('Prüfer Test', true);
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);
    // Un lien de secours créé par le propriétaire : quel que soit l'auteur, un seul lien reste.
    const jetonDuChef = nouveauJeton();
    depot.creerLien({
      empreinte: empreinte(jetonDuChef),
      type: 'connexion',
      personne: personne.id,
      creePar: chef.id,
      expireLe: new Date(T0.getTime() + UN_JOUR).toISOString(),
    });
    expect((await demanderOptionsDeLien(app, jetonDuChef)).statusCode).toBe(200);

    const reponse = await appeler(app, 'POST', '/api/moi/lien', { jeton });

    expect((await demanderOptionsDeLien(app, jetonDuChef)).statusCode).toBe(400);
    const jetonDeLaPersonne = jetonDuLien((reponse.json() as { lien: string }).lien);
    expect((await demanderOptionsDeLien(app, jetonDeLaPersonne)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(1);
  });

  it('lien_sans_entete_ou_au_nom_de_la_personne_de_la_session_200', async () => {
    // Sans l'en-tête : le client précaché d'une version précédente ne l'envoie pas (invariant 8).
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    for (const entetes of [undefined, enteteDe(personne)]) {
      const reponse = await appeler(app, 'POST', '/api/moi/lien', { jeton, entetes });

      expect(reponse.statusCode).toBe(200);
      const jetonCree = jetonDuLien((reponse.json() as { lien: string }).lien);
      expect(depot.lienUtilisable(empreinte(jetonCree), 'connexion')?.personne).toBe(personne.id);
    }
  });

  it('lien_au_nom_d_une_autre_personne_409_sans_creer_ni_annuler', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe s'est connectée dans un autre
    // onglet. Le lien de Berthe ne doit pas être montré à Alice, ni le précédent de Berthe annulé.
    const app = creerAppDeTest();
    const { alice, berthe, jeton, jetonDeBerthe } = await aliceEtBerthe(app);

    await attendreRefusAutresEcrans(berthe, alice, (entetes) =>
      appeler(app, 'POST', '/api/moi/lien', { jeton, entetes }),
    );
    // Le lien de Berthe vaut toujours, et c'est le seul.
    expect((await demanderOptionsDeLien(app, jetonDeBerthe)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(1);
  });

  it('le_lien_d_une_autre_personne_et_les_invitations_restent', async () => {
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const { jeton } = connecter(personne);
    const jetonAutre = jetonDuLien(
      (
        (await appeler(app, 'POST', '/api/moi/lien', { jeton: connecter(autre).jeton })).json() as {
          lien: string;
        }
      ).lien,
    );
    const jetonInvitation = nouveauJeton();
    depot.creerLien({
      empreinte: empreinte(jetonInvitation),
      type: 'invitation',
      expireLe: new Date(T0.getTime() + UN_JOUR).toISOString(),
    });

    await appeler(app, 'POST', '/api/moi/lien', { jeton });
    await appeler(app, 'POST', '/api/moi/lien', { jeton });

    expect((await demanderOptionsDeLien(app, jetonAutre)).statusCode).toBe(200);
    expect(depot.lienUtilisable(empreinte(jetonInvitation), 'invitation')).toBeDefined();
    // Celui de l'autre personne, l'invitation et le dernier lien de la personne.
    expect(nombreDeLiens()).toBe(3);
  });
});

describe('DELETE /api/moi/lien', () => {
  it('annuler_mon_lien', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));
    const jetonDuLienCree = jetonDuLien(
      ((await appeler(app, 'POST', '/api/moi/lien', { jeton })).json() as { lien: string }).lien,
    );

    const reponse = await appeler(app, 'DELETE', '/api/moi/lien', { jeton });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    // Le jeton est refusé, comme un lien inconnu, et la liste des appareils ne montre plus de lien.
    const refuse = await demanderOptionsDeLien(app, jetonDuLienCree);
    expect(refuse.statusCode).toBe(400);
    expect(refuse.body).toBe(LIEN_INVALIDE);
    const appareils = await appeler(app, 'GET', '/api/moi/appareils', { jeton });
    expect((appareils.json() as { lien: unknown }).lien).toBeNull();
    expect(nombreDeLiens()).toBe(0);
  });

  it('annuler_mon_lien_sans_lien_est_sans_effet', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    const premiere = await appeler(app, 'DELETE', '/api/moi/lien', { jeton });
    const seconde = await appeler(app, 'DELETE', '/api/moi/lien', { jeton });

    expect(premiere.statusCode).toBe(204);
    expect(seconde.statusCode).toBe(204);
  });

  it('annuler_mon_lien_sans_entete_ou_au_nom_de_la_personne_de_la_session_204', async () => {
    // Sans l'en-tête : le client précaché d'une version précédente ne l'envoie pas (invariant 8).
    const app = creerAppDeTest();
    const personne = creerPersonne('Lernende Test');
    const { jeton } = connecter(personne);

    for (const entetes of [undefined, enteteDe(personne)]) {
      const jetonCree = jetonDuLien(
        ((await appeler(app, 'POST', '/api/moi/lien', { jeton })).json() as { lien: string }).lien,
      );

      const reponse = await appeler(app, 'DELETE', '/api/moi/lien', { jeton, entetes });

      expect(reponse.statusCode).toBe(204);
      expect((await demanderOptionsDeLien(app, jetonCree)).statusCode).toBe(400);
    }
  });

  it('annuler_mon_lien_au_nom_d_une_autre_personne_409_et_le_lien_reste', async () => {
    // Sur un téléphone partagé : l'écran d'Alice annulerait le lien de Berthe, connectée dans un
    // autre onglet. Refusé, et le lien de Berthe vaut toujours.
    const app = creerAppDeTest();
    const { alice, berthe, jeton, jetonDeBerthe } = await aliceEtBerthe(app);

    await attendreRefusAutresEcrans(berthe, alice, (entetes) =>
      appeler(app, 'DELETE', '/api/moi/lien', { jeton, entetes }),
    );
    expect((await demanderOptionsDeLien(app, jetonDeBerthe)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(1);
  });

  it('annuler_mon_lien_ne_touche_pas_celui_d_une_autre_personne', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));
    const autre = connecter(creerPersonne('Andere Test'));
    const jetonAutre = jetonDuLien(
      (
        (await appeler(app, 'POST', '/api/moi/lien', { jeton: autre.jeton })).json() as {
          lien: string;
        }
      ).lien,
    );

    await appeler(app, 'DELETE', '/api/moi/lien', { jeton });

    expect((await demanderOptionsDeLien(app, jetonAutre)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(1);
  });
});
