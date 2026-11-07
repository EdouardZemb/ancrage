import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Base } from './base/base.js';
import { retenirLeWal } from './base/wal.fixture.js';
import type { Depot, PersonneEnregistree, SessionEnregistree } from './comptes/depot.js';
import { empreinte, nouveauJeton } from './comptes/jetons.js';
import { demanderOptionsDeLien, jetonDuLien } from './comptes/liens.fixture.js';
import { ajouterPasskeyDeTest } from './comptes/passkey.fixture.js';
import { POINT_DE_CONTROLE_INCOMPLET } from './comptes/suppression.js';
import { ORIGINE_DE_TEST } from './comptes/webauthn.fixture.js';
import {
  CATALOGUE,
  ID_A_VERIFIER,
  ID_DEROGE,
  ID_INEXISTANT,
  ID_SOURCE,
} from './cours-factices.fixture.js';
import { installerEnvironnement, profilsDeTest, T0 } from './environnement.fixture.js';
import { empreinteReponse } from './reponses.fixture.js';

const UNE_MINUTE = 60 * 1000;
const UN_JOUR = 24 * 60 * UNE_MINUTE;
const SEPT_JOURS = 7 * UN_JOUR;
const NON_CONNECTE = '{"erreur":"non_connecte"}';
const INTROUVABLE = '{"erreur":"introuvable"}';
const REQUETE = '{"erreur":"requete"}';
const REFUS_A_VERIFIER = '{"erreur":"cours_a_verifier_sans_derogation"}';
const NOM_DEJA_PRIS = '{"erreur":"nom_deja_pris"}';
const LIEN_INVALIDE = '{"erreur":"lien_invalide"}';
// La forme des liens que l'API rend : l'origine, l'écran et un jeton de 43 caractères. `jetonDuLien`
// la contrôle en lisant le jeton.
const INVITATION_ATTENDUE = { ecran: 'invitation', origine: ORIGINE_DE_TEST } as const;
const CONNEXION_ATTENDUE = { ecran: 'lien', origine: ORIGINE_DE_TEST } as const;

// --- L'application ---

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
  { cours: CATALOGUE },
);

const { creerPersonne, connecter } = profilsDeTest(() => depot, T0);

/** Le propriétaire, avec sa session. */
function proprietaire() {
  const personne = creerPersonne('Prüfer Test', true);
  return { personne, ...connecter(personne) };
}

type Methode = 'GET' | 'HEAD' | 'POST' | 'DELETE';

async function appeler(
  app: FastifyInstance,
  methode: Methode,
  url: string,
  options: { jeton?: string; corps?: unknown; sansOrigine?: boolean } = {},
): Promise<LightMyRequestResponse> {
  const { jeton, corps, sansOrigine = false } = options;
  return app.inject({
    method: methode,
    url,
    headers: sansOrigine ? {} : { origin: ORIGINE_DE_TEST },
    ...(corps === undefined ? {} : { payload: corps as object }),
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

function nombreDeLiens(): number {
  const ligne = base.sqlite.prepare('select count(*) as n from lien').get() as { n: number };
  return ligne.n;
}

function lienDeLaBase(jeton: string, type: 'invitation' | 'connexion') {
  return depot.lienUtilisable(empreinte(jeton), type);
}

/** Les autorisations de la base, sans identifiant ni date : de quoi les comparer. */
function droitsEnBase(): string[] {
  return depot
    .autorisations()
    .map(({ cours, sujet }) => `${cours} ${sujet.type} ${sujet.id}`)
    .sort();
}

/** Chaque corps est refusé (400 `requete`), et aucun droit n'est ouvert. */
async function attendreAutorisationsRefusees(
  app: FastifyInstance,
  jeton: string,
  corpsRefuses: unknown[],
): Promise<void> {
  for (const corps of corpsRefuses) {
    const reponse = await appeler(app, 'POST', '/api/admin/autorisations', { jeton, corps });

    expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
    expect(reponse.body, JSON.stringify(corps)).toBe(REQUETE);
  }
  expect(droitsEnBase()).toEqual([]);
}

/** Le chemin d'une passkey d'une personne : l'identifiant de la clé est encodé comme dans l'URL. */
function urlPasskey(personne: string, passkey: string): string {
  return `/api/admin/personnes/${personne}/passkeys/${encodeURIComponent(passkey)}`;
}

/*
 * Toutes les routes d'administration, avec des cibles qui existent : une personne, sa passkey, un
 * groupe et une autorisation. Le corps est celui d'une requête valide.
 */
function routesAdmin(cibles: {
  personne: string;
  passkey: string;
  groupe: string;
  autorisation: string;
}) {
  return [
    ['GET', '/api/admin/personnes', undefined],
    ['POST', '/api/admin/invitations', { cours: [ID_SOURCE] }],
    ['POST', `/api/admin/personnes/${cibles.personne}/lien`, undefined],
    ['DELETE', `/api/admin/personnes/${cibles.personne}/sessions`, undefined],
    ['DELETE', urlPasskey(cibles.personne, cibles.passkey), undefined],
    ['GET', '/api/admin/groupes', undefined],
    ['POST', '/api/admin/groupes', { nom: 'Klasse Neu' }],
    ['POST', `/api/admin/groupes/${cibles.groupe}/membres`, { personne: cibles.personne }],
    ['DELETE', `/api/admin/groupes/${cibles.groupe}/membres/${cibles.personne}`, undefined],
    ['GET', '/api/admin/autorisations', undefined],
    [
      'POST',
      '/api/admin/autorisations',
      { cours: ID_SOURCE, sujet: { type: 'groupe', id: cibles.groupe } },
    ],
    ['DELETE', `/api/admin/autorisations/${cibles.autorisation}`, undefined],
    // En dernier : la suppression emporte les droits et les appartenances de la personne.
    ['DELETE', `/api/admin/personnes/${cibles.personne}`, undefined],
  ] as const satisfies readonly (readonly [Methode, string, unknown])[];
}

/**
 * Une personne, sa passkey, un groupe où elle est membre et un droit nominatif : les cibles des
 * routes.
 */
function installerCibles() {
  const victime = creerPersonne('Opfer Test');
  const passkey = ajouterPasskeyDeTest(depot, victime, 'cle-victime').id;
  const groupe = depot.creerGroupe('Klasse Test');
  depot.ajouterMembre(groupe.id, victime.id);
  const autorisation = depot.autoriser({
    cours: ID_SOURCE,
    sujet: { type: 'personne', id: victime.id },
  });
  const sessionVictime = connecter(victime);
  return { victime, passkey, groupe, autorisation, sessionVictime };
}

describe("protection de l'administration", () => {
  it('admin_sans_session_401', async () => {
    const app = creerAppDeTest();
    const { victime, passkey, groupe, autorisation } = installerCibles();
    const routes = routesAdmin({
      personne: victime.id,
      passkey,
      groupe: groupe.id,
      autorisation: autorisation.id,
    });

    for (const [methode, url, corps] of routes) {
      for (const jeton of [undefined, nouveauJeton()]) {
        const reponse = await appeler(app, methode, url, { jeton, corps });

        expect(reponse.statusCode, `${methode} ${url}`).toBe(401);
        expect(reponse.body, `${methode} ${url}`).toBe(NON_CONNECTE);
      }
    }
    expect(nombreDeLiens()).toBe(0);
    expect(depot.groupes()).toHaveLength(1);
    expect(depot.passkeysDe(victime.id)).toHaveLength(1);
  });

  it('admin_refuse_a_un_non_proprietaire_404', async () => {
    const app = creerAppDeTest();
    const cibles = installerCibles();
    const { victime, passkey, groupe, autorisation, sessionVictime } = cibles;
    // Une personne qui a des droits, mais n'est pas le propriétaire.
    const { jeton } = connecter(creerPersonne('Lernende Test'));
    const routes = routesAdmin({
      personne: victime.id,
      passkey,
      groupe: groupe.id,
      autorisation: autorisation.id,
    });

    for (const [methode, url, corps] of routes) {
      const refus = await appeler(app, methode, url, { jeton, corps });
      // Une route qui n'existe pas, avec la même méthode et le même corps.
      const inexistante = await appeler(app, methode, '/api/admin/inexistante', { jeton, corps });

      expect(refus.statusCode, `${methode} ${url}`).toBe(404);
      expect(refus.body, `${methode} ${url}`).toBe(INTROUVABLE);
      expect(empreinteReponse(refus), `${methode} ${url}`).toStrictEqual(
        empreinteReponse(inexistante),
      );
    }
    // Aucun effet.
    expect(nombreDeLiens()).toBe(0);
    expect(depot.groupes().map((g) => g.id)).toEqual([groupe.id]);
    expect(depot.groupesDe(victime.id)).toEqual([groupe.id]);
    expect(droitsEnBase()).toEqual([`${ID_SOURCE} personne ${victime.id}`]);
    expect(depot.sessionsDe(victime.id).map((s) => s.id)).toEqual([sessionVictime.session.id]);
    expect(depot.passkeysDe(victime.id).map((p) => p.id)).toEqual([passkey]);
  });

  // Fastify lit le corps avant le contrôle des droits : ce qu'il refuse l'est pareil sur une route
  // d'administration et sur une route qui n'existe pas, et ne dit pas à une autre personne
  // connectée que la route existe.
  it('admin_corps_refuse_par_fastify_comme_une_route_inexistante', async () => {
    const app = creerAppDeTest();
    const { jeton } = connecter(creerPersonne('Lernende Test'));

    for (const [typeDeContenu, payload] of [
      ['application/json', '{"nom":'],
      ['application/json', ''],
      ['application/json', '{"nom":"Klasse Neu"}'],
      ['text/plain', 'Klasse'],
    ] as const) {
      const requete = {
        method: 'POST',
        headers: { origin: ORIGINE_DE_TEST, 'content-type': typeDeContenu },
        cookies: { ancrage_session: jeton },
        payload,
      } as const;

      const admin = await app.inject({ ...requete, url: '/api/admin/groupes' });
      const inexistante = await app.inject({ ...requete, url: '/api/admin/inexistante' });

      expect(empreinteReponse(admin), `${typeDeContenu} ${payload}`).toStrictEqual(
        empreinteReponse(inexistante),
      );
    }
    expect(depot.groupes()).toHaveLength(0);
  });

  it('admin_methodes_non_sures_sans_origine_403', async () => {
    const app = creerAppDeTest();
    const { jeton } = proprietaire();
    const { victime, passkey, groupe, autorisation } = installerCibles();

    for (const [methode, url, corps] of routesAdmin({
      personne: victime.id,
      passkey,
      groupe: groupe.id,
      autorisation: autorisation.id,
    }).filter(([methode]) => methode !== 'GET')) {
      const reponse = await appeler(app, methode, url, { jeton, corps, sansOrigine: true });

      expect(reponse.statusCode, `${methode} ${url}`).toBe(403);
    }
    expect(nombreDeLiens()).toBe(0);
    expect(droitsEnBase()).toHaveLength(1);
    expect(depot.passkeysDe(victime.id)).toHaveLength(1);
  });

  it('admin_ne_se_met_jamais_en_cache', async () => {
    const app = creerAppDeTest();
    const { jeton } = proprietaire();
    const { victime, passkey, groupe, autorisation } = installerCibles();

    const reponses: LightMyRequestResponse[] = [];
    for (const [methode, url, corps] of routesAdmin({
      personne: victime.id,
      passkey,
      groupe: groupe.id,
      autorisation: autorisation.id,
    })) {
      reponses.push(await appeler(app, methode, url, { jeton, corps }));
    }
    // Les refus de la route aussi : 400, 404 et 409.
    reponses.push(
      await appeler(app, 'POST', '/api/admin/groupes', { jeton, corps: {} }),
      await appeler(app, 'DELETE', '/api/admin/autorisations/inconnue', { jeton }),
      await appeler(app, 'POST', '/api/admin/groupes', { jeton, corps: { nom: 'Klasse Test' } }),
      await appeler(app, 'DELETE', urlPasskey(victime.id, 'cle-inconnue'), { jeton }),
    );

    expect(reponses.map((r) => r.statusCode)).toEqual([
      200, 200, 200, 204, 204, 200, 201, 204, 204, 200, 200, 204, 204, 400, 404, 409, 404,
    ]);
    for (const reponse of reponses) {
      expect(reponse.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('GET /api/admin/personnes', () => {
  it('personnes_listees_avec_groupes_droits_et_appareils', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    horloge.maintenant = new Date(T0.getTime() + UNE_MINUTE);
    const groupeA = depot.creerGroupe('Klasse A');
    const groupeB = depot.creerGroupe('Klasse B');
    const lernende = creerPersonne('Lernende Test');
    horloge.maintenant = new Date(T0.getTime() + 2 * UNE_MINUTE);
    const mitglied = creerPersonne('Mitglied Test');
    horloge.maintenant = new Date(T0.getTime() + 3 * UNE_MINUTE);
    const sansRien = creerPersonne('Ohne Recht Test');
    depot.ajouterMembre(groupeA.id, lernende.id);
    depot.ajouterMembre(groupeB.id, lernende.id);
    depot.ajouterMembre(groupeA.id, mitglied.id);
    depot.autoriser({ cours: ID_SOURCE, sujet: { type: 'personne', id: lernende.id } });
    depot.autoriser({ cours: ID_A_VERIFIER, sujet: { type: 'personne', id: lernende.id } });
    // Un droit de groupe n'est pas un droit direct de ses membres.
    depot.autoriser({ cours: ID_DEROGE, sujet: { type: 'groupe', id: groupeA.id } });
    connecter(lernende, 'iPhone');
    connecter(lernende, 'Android');
    // Une session expirée n'est pas un appareil.
    connecter(lernende, 'Mac', new Date(T0.getTime() - 1000));
    connecter(mitglied, 'Windows');
    horloge.maintenant = new Date(T0.getTime() + 10 * UNE_MINUTE);

    const reponse = await appeler(app, 'GET', '/api/admin/personnes', { jeton: chef.jeton });

    expect(reponse.statusCode).toBe(200);
    const personnes = reponse.json() as {
      id: string;
      nomAffiche: string;
      proprietaire: boolean;
      groupes: string[];
      droits: string[];
      nbAppareils: number;
    }[];
    // Exactement ces champs, dans l'ordre de création des comptes.
    expect(personnes.map((p) => Object.keys(p).sort())).toEqual(
      Array(4).fill([
        'droits',
        'groupes',
        'id',
        'nbAppareils',
        'nomAffiche',
        'passkeys',
        'proprietaire',
      ]),
    );
    expect(personnes.map((p) => [p.id, p.nomAffiche, p.proprietaire])).toEqual([
      [chef.personne.id, 'Prüfer Test', true],
      [lernende.id, 'Lernende Test', false],
      [mitglied.id, 'Mitglied Test', false],
      [sansRien.id, 'Ohne Recht Test', false],
    ]);
    const [, ligneLernende, ligneMitglied, ligneSansRien] = personnes;
    expect(ligneLernende?.groupes.sort()).toEqual([groupeA.id, groupeB.id].sort());
    expect(ligneLernende?.droits.sort()).toEqual([ID_A_VERIFIER, ID_SOURCE].sort());
    expect(ligneLernende?.nbAppareils).toBe(2);
    expect(ligneMitglied).toMatchObject({ groupes: [groupeA.id], droits: [], nbAppareils: 1 });
    expect(ligneSansRien).toMatchObject({ groupes: [], droits: [], nbAppareils: 0 });
    expect(personnes[0]).toMatchObject({ groupes: [], droits: [], nbAppareils: 1 });
  });

  it('admin_voit_les_passkeys', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    horloge.maintenant = new Date(T0.getTime() + UNE_MINUTE);
    const lernende = creerPersonne('Lernende Test');
    const sansPasskey = creerPersonne('Ohne Passkey Test');
    ajouterPasskeyDeTest(depot, chef.personne, 'cle-chef', 'Windows');
    horloge.maintenant = new Date(T0.getTime() + 2 * UNE_MINUTE);
    ajouterPasskeyDeTest(depot, lernende, 'cle-b', 'Android');
    horloge.maintenant = new Date(T0.getTime() + 3 * UNE_MINUTE);
    ajouterPasskeyDeTest(depot, lernende, 'cle-a', 'iPhone');
    // La seconde a déjà servi.
    depot.majCompteurPasskey('cle-a', 5);
    horloge.maintenant = new Date(T0.getTime() + 10 * UNE_MINUTE);

    const reponse = await appeler(app, 'GET', '/api/admin/personnes', { jeton: chef.jeton });

    expect(reponse.statusCode).toBe(200);
    const personnes = reponse.json() as { id: string; passkeys: unknown[] }[];
    const passkeysDe = (id: string) => personnes.find((p) => p.id === id)?.passkeys;
    // Exactement ces champs, du plus ancien au plus récent : ni la clé publique, ni le compteur.
    expect(passkeysDe(lernende.id)).toStrictEqual([
      {
        id: 'cle-b',
        appareil: 'Android',
        creeLe: new Date(T0.getTime() + 2 * UNE_MINUTE).toISOString(),
        utiliseLe: null,
      },
      {
        id: 'cle-a',
        appareil: 'iPhone',
        creeLe: new Date(T0.getTime() + 3 * UNE_MINUTE).toISOString(),
        utiliseLe: new Date(T0.getTime() + 3 * UNE_MINUTE).toISOString(),
      },
    ]);
    // Chacune a les siennes, et une personne sans passkey a une liste vide.
    expect(passkeysDe(chef.personne.id)).toMatchObject([{ id: 'cle-chef', appareil: 'Windows' }]);
    expect(passkeysDe(sansPasskey.id)).toStrictEqual([]);
  });

  it('personnes_sans_jeton_ni_empreinte', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const { sessionVictime } = installerCibles();

    const reponse = await appeler(app, 'GET', '/api/admin/personnes', { jeton: chef.jeton });

    expect(reponse.body).not.toContain(chef.jeton);
    expect(reponse.body).not.toContain(chef.session.empreinte);
    expect(reponse.body).not.toContain(sessionVictime.jeton);
    expect(reponse.body).not.toContain(sessionVictime.session.empreinte);
  });
});

describe('POST /api/admin/invitations', () => {
  it('invitation_avec_octroi', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');

    const reponse = await appeler(app, 'POST', '/api/admin/invitations', {
      jeton: chef.jeton,
      // Un cours « à vérifier » : l'octroi le donne à la personne, pas à un groupe (R4).
      corps: { groupes: [groupe.id], cours: [ID_A_VERIFIER, ID_SOURCE] },
    });

    expect(reponse.statusCode).toBe(200);
    const corps = reponse.json() as { lien: string };
    expect(Object.keys(corps)).toEqual(['lien']);
    const jeton = jetonDuLien(corps.lien, INVITATION_ATTENDUE);
    expect(lienDeLaBase(jeton, 'invitation')).toEqual({
      empreinte: empreinte(jeton),
      type: 'invitation',
      personne: null,
      proprietaire: false,
      octroi: { groupes: [groupe.id], cours: [ID_A_VERIFIER, ID_SOURCE] },
      creePar: chef.personne.id,
      creeLe: T0.toISOString(),
      expireLe: new Date(T0.getTime() + SEPT_JOURS).toISOString(),
      utiliseLe: null,
    });
    // La règle d'ouverture à un groupe ne s'applique pas : aucun droit n'est créé maintenant.
    expect(droitsEnBase()).toEqual([]);
    const lignes = base.sqlite.prepare('select * from lien').all() as object[];
    expect(JSON.stringify(lignes)).not.toContain(jeton);
    expect(journalServeur.lignes.join('\n')).not.toContain(jeton);
    expect(journalServeur.lignes.join('\n')).not.toContain(empreinte(jeton));
  });

  it('invitation_utilisable_par_les_routes_de_connexion', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const reponse = await appeler(app, 'POST', '/api/admin/invitations', {
      jeton: chef.jeton,
      corps: {},
    });
    const jeton = jetonDuLien((reponse.json() as { lien: string }).lien, INVITATION_ATTENDUE);

    const options = await appeler(app, 'POST', '/api/auth/invitation/options', {
      corps: { jeton },
    });

    expect(options.statusCode).toBe(200);
    expect(options.json()).toHaveProperty('ceremonie');
  });

  it('invitation_sans_octroi_avec_ou_sans_corps', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();

    const sansCorps = await appeler(app, 'POST', '/api/admin/invitations', { jeton: chef.jeton });
    const corpsVide = await appeler(app, 'POST', '/api/admin/invitations', {
      jeton: chef.jeton,
      corps: {},
    });

    for (const reponse of [sansCorps, corpsVide]) {
      expect(reponse.statusCode).toBe(200);
      const jeton = jetonDuLien((reponse.json() as { lien: string }).lien, INVITATION_ATTENDUE);
      expect(lienDeLaBase(jeton, 'invitation')?.octroi).toEqual({ groupes: [], cours: [] });
    }
  });

  it('invitation_sans_doublon_dans_l_octroi', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');

    const reponse = await appeler(app, 'POST', '/api/admin/invitations', {
      jeton: chef.jeton,
      corps: { groupes: [groupe.id, groupe.id], cours: [ID_SOURCE, ID_SOURCE] },
    });

    const jeton = jetonDuLien((reponse.json() as { lien: string }).lien, INVITATION_ATTENDUE);
    expect(lienDeLaBase(jeton, 'invitation')?.octroi).toEqual({
      groupes: [groupe.id],
      cours: [ID_SOURCE],
    });
  });

  it('invitation_cours_inconnu_400', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');

    for (const corps of [
      { cours: [ID_INEXISTANT] },
      { cours: [ID_SOURCE, ID_INEXISTANT] },
      { groupes: ['groupe-inconnu'] },
      { groupes: [groupe.id, 'groupe-inconnu'], cours: [ID_SOURCE] },
      // Un identifiant de personne n'est pas un identifiant de groupe.
      { groupes: [chef.personne.id] },
    ]) {
      const reponse = await appeler(app, 'POST', '/api/admin/invitations', {
        jeton: chef.jeton,
        corps,
      });

      expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
      expect(reponse.body, JSON.stringify(corps)).toBe(REQUETE);
    }
    expect(nombreDeLiens()).toBe(0);
  });

  it('invitation_corps_invalide_400', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();

    for (const corps of [
      { groupes: ID_SOURCE },
      { cours: [1] },
      { cours: [null] },
      { cours: [''] },
      { cours: ['x'.repeat(65)] },
      { cours: Array(101).fill(ID_SOURCE) },
      { groupes: null },
      { proprietaire: true },
      { cours: [ID_SOURCE], expireLe: '2030-01-01T00:00:00.000Z' },
      [],
    ]) {
      const reponse = await appeler(app, 'POST', '/api/admin/invitations', {
        jeton: chef.jeton,
        corps: corps as object,
      });

      expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
      expect(reponse.body, JSON.stringify(corps)).toBe(REQUETE);
    }
    expect(nombreDeLiens()).toBe(0);
  });
});

describe('autorisations', () => {
  it('autorisations_listees_avec_le_titre_du_cours', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');
    const lernende = creerPersonne('Lernende Test');
    horloge.maintenant = new Date(T0.getTime() + UNE_MINUTE);
    const premiere = depot.autoriser({
      cours: ID_SOURCE,
      sujet: { type: 'personne', id: lernende.id },
    });
    horloge.maintenant = new Date(T0.getTime() + 2 * UNE_MINUTE);
    const seconde = depot.autoriser({ cours: ID_DEROGE, sujet: { type: 'groupe', id: groupe.id } });
    horloge.maintenant = new Date(T0.getTime() + 3 * UNE_MINUTE);
    // Un cours qui n'est plus chargé : le droit reste visible, pour qu'on puisse le retirer.
    const orpheline = depot.autoriser({
      cours: ID_INEXISTANT,
      sujet: { type: 'personne', id: lernende.id },
    });

    const reponse = await appeler(app, 'GET', '/api/admin/autorisations', { jeton: chef.jeton });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toStrictEqual([
      {
        id: premiere.id,
        cours: ID_SOURCE,
        coursTitre: 'Quellenkurs',
        sujet: { type: 'personne', id: lernende.id },
      },
      {
        id: seconde.id,
        cours: ID_DEROGE,
        coursTitre: 'Ausnahmekurs',
        sujet: { type: 'groupe', id: groupe.id },
      },
      {
        id: orpheline.id,
        cours: ID_INEXISTANT,
        coursTitre: null,
        sujet: { type: 'personne', id: lernende.id },
      },
    ]);
  });

  it('ouvrir_cours_a_verifier_a_un_groupe_refuse', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');

    const reponse = await appeler(app, 'POST', '/api/admin/autorisations', {
      jeton: chef.jeton,
      corps: { cours: ID_A_VERIFIER, sujet: { type: 'groupe', id: groupe.id } },
    });

    expect(reponse.statusCode).toBe(409);
    expect(reponse.body).toBe(REFUS_A_VERIFIER);
    expect(droitsEnBase()).toEqual([]);
  });

  it('ouvrir_cours_a_verifier_a_une_personne_accepte', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');

    const reponse = await appeler(app, 'POST', '/api/admin/autorisations', {
      jeton: chef.jeton,
      corps: { cours: ID_A_VERIFIER, sujet: { type: 'personne', id: lernende.id } },
    });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toStrictEqual({
      id: depot.autorisationsAvecIdentifiant()[0]?.id,
      cours: ID_A_VERIFIER,
      coursTitre: 'Übungskurs',
      sujet: { type: 'personne', id: lernende.id },
    });
    expect(droitsEnBase()).toEqual([`${ID_A_VERIFIER} personne ${lernende.id}`]);
    // Et la personne lit le cours.
    const lecture = await appeler(app, 'GET', `/api/cours/${ID_A_VERIFIER}`, {
      jeton: connecter(lernende).jeton,
    });
    expect(lecture.statusCode).toBe(200);
  });

  it('ouvrir_avec_derogation_a_un_groupe_accepte', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');
    const membre = creerPersonne('Mitglied Test');
    depot.ajouterMembre(groupe.id, membre.id);

    const reponse = await appeler(app, 'POST', '/api/admin/autorisations', {
      jeton: chef.jeton,
      corps: { cours: ID_DEROGE, sujet: { type: 'groupe', id: groupe.id } },
    });

    expect(reponse.statusCode).toBe(200);
    expect(droitsEnBase()).toEqual([`${ID_DEROGE} groupe ${groupe.id}`]);
    const lecture = await appeler(app, 'GET', `/api/cours/${ID_DEROGE}`, {
      jeton: connecter(membre).jeton,
    });
    expect(lecture.statusCode).toBe(200);
  });

  it('ouvrir_cours_source_a_un_groupe_accepte', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');

    const reponse = await appeler(app, 'POST', '/api/admin/autorisations', {
      jeton: chef.jeton,
      corps: { cours: ID_SOURCE, sujet: { type: 'groupe', id: groupe.id } },
    });

    expect(reponse.statusCode).toBe(200);
    expect(droitsEnBase()).toEqual([`${ID_SOURCE} groupe ${groupe.id}`]);
  });

  it('ouvrir_deux_fois_ne_cree_qu_un_droit', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const corps = { cours: ID_SOURCE, sujet: { type: 'personne', id: lernende.id } };

    const premiere = await appeler(app, 'POST', '/api/admin/autorisations', {
      jeton: chef.jeton,
      corps,
    });
    const seconde = await appeler(app, 'POST', '/api/admin/autorisations', {
      jeton: chef.jeton,
      corps,
    });

    expect(premiere.statusCode).toBe(200);
    expect(seconde.statusCode).toBe(200);
    expect(seconde.json()).toStrictEqual(premiere.json());
    expect(depot.autorisationsAvecIdentifiant()).toHaveLength(1);
  });

  it('ouvrir_cours_ou_sujet_inconnu_400', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');
    const lernende = creerPersonne('Lernende Test');

    await attendreAutorisationsRefusees(app, chef.jeton, [
      { cours: ID_INEXISTANT, sujet: { type: 'personne', id: lernende.id } },
      { cours: ID_SOURCE, sujet: { type: 'personne', id: 'personne-inconnue' } },
      { cours: ID_SOURCE, sujet: { type: 'groupe', id: 'groupe-inconnu' } },
      // Le bon identifiant, mais du mauvais type de sujet.
      { cours: ID_SOURCE, sujet: { type: 'groupe', id: lernende.id } },
      { cours: ID_SOURCE, sujet: { type: 'personne', id: groupe.id } },
    ]);
  });

  it('ouvrir_corps_invalide_400', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const sujet = { type: 'personne', id: lernende.id };

    await attendreAutorisationsRefusees(app, chef.jeton, [
      {},
      { cours: ID_SOURCE },
      { sujet },
      { cours: 42, sujet },
      { cours: ID_SOURCE, sujet: lernende.id },
      { cours: ID_SOURCE, sujet: { type: 'role', id: lernende.id } },
      { cours: ID_SOURCE, sujet: { type: 'personne' } },
      { cours: ID_SOURCE, sujet: { id: lernende.id } },
      { cours: ID_SOURCE, sujet: { ...sujet, extra: 1 } },
      { cours: ID_SOURCE, sujet, permission: 'administrer' },
    ]);
  });

  it('retirer_une_autorisation', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const droit = depot.autoriser({
      cours: ID_SOURCE,
      sujet: { type: 'personne', id: lernende.id },
    });
    depot.autoriser({ cours: ID_SOURCE, sujet: { type: 'personne', id: autre.id } });
    const { jeton } = connecter(lernende);

    const reponse = await appeler(app, 'DELETE', `/api/admin/autorisations/${droit.id}`, {
      jeton: chef.jeton,
    });
    const encore = await appeler(app, 'DELETE', `/api/admin/autorisations/${droit.id}`, {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    expect(encore.statusCode).toBe(404);
    expect(encore.body).toBe(INTROUVABLE);
    expect(droitsEnBase()).toEqual([`${ID_SOURCE} personne ${autre.id}`]);
    expect((await appeler(app, 'GET', `/api/cours/${ID_SOURCE}`, { jeton })).statusCode).toBe(404);
  });
});

describe('groupes', () => {
  it('groupes_et_membres', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');

    const creation = await appeler(app, 'POST', '/api/admin/groupes', {
      jeton: chef.jeton,
      corps: { nom: '  Klasse Test  ' },
    });
    expect(creation.statusCode).toBe(201);
    const groupe = creation.json() as { id: string; nom: string };
    // Gardé tel qu'après `trim`.
    expect(groupe).toStrictEqual({ id: depot.groupes()[0]?.id, nom: 'Klasse Test' });
    const autre = await appeler(app, 'POST', '/api/admin/groupes', {
      jeton: chef.jeton,
      corps: { nom: 'Andere Klasse' },
    });
    const liste = await appeler(app, 'GET', '/api/admin/groupes', { jeton: chef.jeton });
    // Par nom.
    expect(liste.statusCode).toBe(200);
    expect(liste.json()).toStrictEqual([
      { id: (autre.json() as { id: string }).id, nom: 'Andere Klasse' },
      groupe,
    ]);

    // Ajouter un membre ; recommencer ne change rien.
    for (let fois = 0; fois < 2; fois += 1) {
      const ajout = await appeler(app, 'POST', `/api/admin/groupes/${groupe.id}/membres`, {
        jeton: chef.jeton,
        corps: { personne: lernende.id },
      });
      expect(ajout.statusCode).toBe(204);
      expect(ajout.body).toBe('');
    }
    expect(depot.groupesDe(lernende.id)).toEqual([groupe.id]);
    const personnes = await appeler(app, 'GET', '/api/admin/personnes', { jeton: chef.jeton });
    expect(
      (personnes.json() as { id: string; groupes: string[] }[]).find((p) => p.id === lernende.id)
        ?.groupes,
    ).toEqual([groupe.id]);

    // Retirer ce membre.
    const retrait = await appeler(
      app,
      'DELETE',
      `/api/admin/groupes/${groupe.id}/membres/${lernende.id}`,
      { jeton: chef.jeton },
    );
    expect(retrait.statusCode).toBe(204);
    expect(retrait.body).toBe('');
    expect(depot.groupesDe(lernende.id)).toEqual([]);
    const encore = await appeler(
      app,
      'DELETE',
      `/api/admin/groupes/${groupe.id}/membres/${lernende.id}`,
      { jeton: chef.jeton },
    );
    expect(encore.statusCode).toBe(404);
    expect(encore.body).toBe(INTROUVABLE);
  });

  it('un_membre_ajoute_recoit_les_droits_du_groupe_et_les_perd_au_retrait', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');
    depot.autoriser({ cours: ID_SOURCE, sujet: { type: 'groupe', id: groupe.id } });
    const lernende = creerPersonne('Lernende Test');
    const { jeton } = connecter(lernende);

    await appeler(app, 'POST', `/api/admin/groupes/${groupe.id}/membres`, {
      jeton: chef.jeton,
      corps: { personne: lernende.id },
    });
    const avec = await appeler(app, 'GET', `/api/cours/${ID_SOURCE}`, { jeton });
    await appeler(app, 'DELETE', `/api/admin/groupes/${groupe.id}/membres/${lernende.id}`, {
      jeton: chef.jeton,
    });
    const sans = await appeler(app, 'GET', `/api/cours/${ID_SOURCE}`, { jeton });

    expect(avec.statusCode).toBe(200);
    expect(sans.statusCode).toBe(404);
  });

  it('nom_de_groupe_deja_pris_409', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    depot.creerGroupe('Klasse Test');

    for (const nom of ['Klasse Test', '  Klasse Test ']) {
      const reponse = await appeler(app, 'POST', '/api/admin/groupes', {
        jeton: chef.jeton,
        corps: { nom },
      });

      expect(reponse.statusCode, nom).toBe(409);
      expect(reponse.body, nom).toBe(NOM_DEJA_PRIS);
    }
    expect(depot.groupes()).toHaveLength(1);
  });

  it('nom_de_groupe_invalide_400', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();

    for (const corps of [
      {},
      { nom: '' },
      { nom: '   ' },
      { nom: 'a'.repeat(61) },
      { nom: 'Klasse\nTest' },
      { nom: 'Klasse‮Test' },
      { nom: 'Klasse​Test' },
      { nom: 42 },
      { nom: null },
      { nom: 'Klasse Test', id: 'mon-id' },
      [],
    ]) {
      const reponse = await appeler(app, 'POST', '/api/admin/groupes', {
        jeton: chef.jeton,
        corps: corps as object,
      });

      expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
      expect(reponse.body, JSON.stringify(corps)).toBe(REQUETE);
    }
    expect(depot.groupes()).toEqual([]);
  });

  it('nom_de_groupe_de_60_caracteres_accepte', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();

    const reponse = await appeler(app, 'POST', '/api/admin/groupes', {
      jeton: chef.jeton,
      corps: { nom: '𝔸'.repeat(60) },
    });

    expect(reponse.statusCode).toBe(201);
  });

  it('membres_groupe_ou_personne_inconnus', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');
    const lernende = creerPersonne('Lernende Test');

    const groupeInconnu = await appeler(app, 'POST', '/api/admin/groupes/inconnu/membres', {
      jeton: chef.jeton,
      corps: { personne: lernende.id },
    });
    const personneInconnue = await appeler(app, 'POST', `/api/admin/groupes/${groupe.id}/membres`, {
      jeton: chef.jeton,
      corps: { personne: 'personne-inconnue' },
    });
    const retraitGroupeInconnu = await appeler(
      app,
      'DELETE',
      `/api/admin/groupes/inconnu/membres/${lernende.id}`,
      { jeton: chef.jeton },
    );
    const retraitPersonneInconnue = await appeler(
      app,
      'DELETE',
      `/api/admin/groupes/${groupe.id}/membres/personne-inconnue`,
      { jeton: chef.jeton },
    );

    expect(groupeInconnu.statusCode).toBe(404);
    expect(groupeInconnu.body).toBe(INTROUVABLE);
    expect(personneInconnue.statusCode).toBe(400);
    expect(personneInconnue.body).toBe(REQUETE);
    expect(retraitGroupeInconnu.statusCode).toBe(404);
    expect(retraitGroupeInconnu.body).toBe(INTROUVABLE);
    expect(retraitPersonneInconnue.statusCode).toBe(404);
    expect(retraitPersonneInconnue.body).toBe(INTROUVABLE);
    expect(depot.groupesDe(lernende.id)).toEqual([]);
  });

  it('membre_corps_invalide_400', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const groupe = depot.creerGroupe('Klasse Test');
    const lernende = creerPersonne('Lernende Test');

    for (const corps of [{}, { personne: 42 }, { personne: '' }, { personne: lernende.id, x: 1 }]) {
      const reponse = await appeler(app, 'POST', `/api/admin/groupes/${groupe.id}/membres`, {
        jeton: chef.jeton,
        corps,
      });

      expect(reponse.statusCode, JSON.stringify(corps)).toBe(400);
      expect(reponse.body, JSON.stringify(corps)).toBe(REQUETE);
    }
    expect(depot.groupesDe(lernende.id)).toEqual([]);
  });
});

describe('sessions et liens des personnes', () => {
  it('deconnecter_tous_les_appareils_d_une_personne', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const telephone = connecter(lernende, 'Android');
    const tablette = connecter(lernende, 'iPad');
    // Même une session expirée : la ligne est supprimée.
    connecter(lernende, 'Mac', new Date(T0.getTime() - 1000));
    const sessionAutre = connecter(autre);

    const reponse = await appeler(app, 'DELETE', `/api/admin/personnes/${lernende.id}/sessions`, {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    expect(depot.sessionsDe(lernende.id)).toEqual([]);
    for (const { jeton } of [telephone, tablette]) {
      expect((await appeler(app, 'GET', '/api/moi', { jeton })).statusCode).toBe(401);
    }
    // Ni l'autre personne, ni le propriétaire ne sont déconnectés.
    expect((await appeler(app, 'GET', '/api/moi', { jeton: sessionAutre.jeton })).statusCode).toBe(
      200,
    );
    expect((await appeler(app, 'GET', '/api/moi', { jeton: chef.jeton })).statusCode).toBe(200);
    // Recommencer ne change rien.
    const encore = await appeler(app, 'DELETE', `/api/admin/personnes/${lernende.id}/sessions`, {
      jeton: chef.jeton,
    });
    expect(encore.statusCode).toBe(204);
  });

  it('deconnecter_ses_propres_appareils_efface_le_cookie', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const autreAppareil = connecter(chef.personne, 'iPhone');

    const reponse = await appeler(
      app,
      'DELETE',
      `/api/admin/personnes/${chef.personne.id}/sessions`,
      {
        jeton: chef.jeton,
      },
    );

    expect(reponse.statusCode).toBe(204);
    const cookie = reponse.cookies.find((c) => c.name === 'ancrage_session');
    expect(cookie).toMatchObject({ value: '', maxAge: 0 });
    expect(depot.sessionsDe(chef.personne.id)).toEqual([]);
    expect((await appeler(app, 'GET', '/api/moi', { jeton: autreAppareil.jeton })).statusCode).toBe(
      401,
    );
  });

  it('personne_inconnue_404', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();

    for (const [methode, url] of [
      ['DELETE', '/api/admin/personnes/inconnue/sessions'],
      ['POST', '/api/admin/personnes/inconnue/lien'],
    ] as const) {
      const reponse = await appeler(app, methode, url, { jeton: chef.jeton });

      expect(reponse.statusCode, url).toBe(404);
      expect(reponse.body, url).toBe(INTROUVABLE);
    }
    expect(nombreDeLiens()).toBe(0);
  });

  it('lien_de_secours_pour_une_personne', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');

    const reponse = await appeler(app, 'POST', `/api/admin/personnes/${lernende.id}/lien`, {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(200);
    const corps = reponse.json() as { lien: string };
    expect(Object.keys(corps)).toEqual(['lien']);
    const jeton = jetonDuLien(corps.lien, CONNEXION_ATTENDUE);
    expect(lienDeLaBase(jeton, 'connexion')).toEqual({
      empreinte: empreinte(jeton),
      type: 'connexion',
      personne: lernende.id,
      proprietaire: false,
      octroi: { groupes: [], cours: [] },
      creePar: chef.personne.id,
      creeLe: T0.toISOString(),
      expireLe: new Date(T0.getTime() + UN_JOUR).toISOString(),
      utiliseLe: null,
    });
    // Ni invitation, ni lien pour quelqu'un d'autre.
    expect(lienDeLaBase(jeton, 'invitation')).toBeUndefined();
    const lignes = base.sqlite.prepare('select * from lien').all() as object[];
    expect(JSON.stringify(lignes)).not.toContain(jeton);
    expect(journalServeur.lignes.join('\n')).not.toContain(jeton);
    expect(journalServeur.lignes.join('\n')).not.toContain(empreinte(jeton));
    // Les routes de connexion l'acceptent : il ouvre une cérémonie d'ajout de passkey.
    const options = await demanderOptionsDeLien(app, jeton);
    expect(options.statusCode).toBe(200);
  });

  it('lien_de_secours_valable_24_heures_pas_plus', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const reponse = await appeler(app, 'POST', `/api/admin/personnes/${lernende.id}/lien`, {
      jeton: chef.jeton,
    });
    const jeton = jetonDuLien((reponse.json() as { lien: string }).lien, CONNEXION_ATTENDUE);

    horloge.maintenant = new Date(T0.getTime() + UN_JOUR - 1);
    expect(lienDeLaBase(jeton, 'connexion')).toBeDefined();
    horloge.maintenant = new Date(T0.getTime() + UN_JOUR);
    expect(lienDeLaBase(jeton, 'connexion')).toBeUndefined();
  });

  it('lien_de_secours_remplace_le_precedent', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const url = `/api/admin/personnes/${lernende.id}/lien`;
    const lienDeLAutre = await appeler(app, 'POST', `/api/admin/personnes/${autre.id}/lien`, {
      jeton: chef.jeton,
    });

    const premier = await appeler(app, 'POST', url, { jeton: chef.jeton });
    const second = await appeler(app, 'POST', url, { jeton: chef.jeton });

    const jetonPremier = jetonDuLien((premier.json() as { lien: string }).lien, CONNEXION_ATTENDUE);
    const jetonSecond = jetonDuLien((second.json() as { lien: string }).lien, CONNEXION_ATTENDUE);
    const refuse = await demanderOptionsDeLien(app, jetonPremier);
    expect(refuse.statusCode).toBe(400);
    expect(refuse.body).toBe(LIEN_INVALIDE);
    expect((await demanderOptionsDeLien(app, jetonSecond)).statusCode).toBe(200);
    // Le lien d'une autre personne reste : un seul lien actif par personne, pas par propriétaire.
    const jetonAutre = jetonDuLien(
      (lienDeLAutre.json() as { lien: string }).lien,
      CONNEXION_ATTENDUE,
    );
    expect((await demanderOptionsDeLien(app, jetonAutre)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(2);
  });

  it('lien_de_secours_remplace_celui_que_la_personne_a_cree', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const sienne = connecter(lernende);
    const lienDeLaPersonne = await appeler(app, 'POST', '/api/moi/lien', { jeton: sienne.jeton });
    const jetonDeLaPersonne = jetonDuLien(
      (lienDeLaPersonne.json() as { lien: string }).lien,
      CONNEXION_ATTENDUE,
    );

    const secours = await appeler(app, 'POST', `/api/admin/personnes/${lernende.id}/lien`, {
      jeton: chef.jeton,
    });

    // Quel que soit l'auteur, un seul lien reste actif (1e-D7).
    expect((await demanderOptionsDeLien(app, jetonDeLaPersonne)).statusCode).toBe(400);
    const jetonSecours = jetonDuLien((secours.json() as { lien: string }).lien, CONNEXION_ATTENDUE);
    expect((await demanderOptionsDeLien(app, jetonSecours)).statusCode).toBe(200);
    expect(nombreDeLiens()).toBe(1);
  });

  it('lien_de_secours_ne_touche_pas_aux_invitations', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const invitation = await appeler(app, 'POST', '/api/admin/invitations', { jeton: chef.jeton });
    const jetonInvitation = jetonDuLien(
      (invitation.json() as { lien: string }).lien,
      INVITATION_ATTENDUE,
    );

    await appeler(app, 'POST', `/api/admin/personnes/${lernende.id}/lien`, { jeton: chef.jeton });
    await appeler(app, 'POST', `/api/admin/personnes/${lernende.id}/lien`, { jeton: chef.jeton });

    expect(lienDeLaBase(jetonInvitation, 'invitation')).toBeDefined();
    expect(nombreDeLiens()).toBe(2);
  });
});

describe('DELETE /api/admin/personnes/:id/passkeys/:passkey', () => {
  it('admin_supprime_une_passkey_meme_la_derniere', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    ajouterPasskeyDeTest(depot, lernende, 'cle-a');

    const reponse = await appeler(app, 'DELETE', urlPasskey(lernende.id, 'cle-a'), {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    // Contrairement à la personne (`DELETE /api/moi/passkeys/:id`), le propriétaire peut retirer la
    // dernière : un téléphone perdu ou volé (1e-D8).
    expect(depot.passkeysDe(lernende.id)).toEqual([]);
    const liste = await appeler(app, 'GET', '/api/admin/personnes', { jeton: chef.jeton });
    const personnes = liste.json() as { id: string; passkeys: unknown[] }[];
    expect(personnes.find((p) => p.id === lernende.id)?.passkeys).toEqual([]);
  });

  it('admin_supprime_une_seule_passkey', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    ajouterPasskeyDeTest(depot, lernende, 'cle-a');
    ajouterPasskeyDeTest(depot, lernende, 'cle-b');
    ajouterPasskeyDeTest(depot, autre, 'cle-autre');
    const telephone = connecter(lernende);

    const reponse = await appeler(app, 'DELETE', urlPasskey(lernende.id, 'cle-a'), {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(depot.passkeysDe(lernende.id).map((p) => p.id)).toEqual(['cle-b']);
    expect(depot.passkeysDe(autre.id).map((p) => p.id)).toEqual(['cle-autre']);
    // Les sessions de la personne ne sont pas fermées : on retire une clé, pas un appareil.
    expect((await appeler(app, 'GET', '/api/moi', { jeton: telephone.jeton })).statusCode).toBe(
      200,
    );
  });

  it('admin_passkey_d_une_autre_personne', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    ajouterPasskeyDeTest(depot, lernende, 'cle-a');
    ajouterPasskeyDeTest(depot, autre, 'cle-autre');

    // La clé existe, mais n'est pas à cette personne : comme une clé inconnue.
    const autrui = await appeler(app, 'DELETE', urlPasskey(lernende.id, 'cle-autre'), {
      jeton: chef.jeton,
    });
    const inconnue = await appeler(app, 'DELETE', urlPasskey(lernende.id, 'cle-inconnue'), {
      jeton: chef.jeton,
    });
    const personneInconnue = await appeler(app, 'DELETE', urlPasskey('inconnue', 'cle-a'), {
      jeton: chef.jeton,
    });

    for (const reponse of [autrui, inconnue, personneInconnue]) {
      expect(reponse.statusCode).toBe(404);
      expect(reponse.body).toBe(INTROUVABLE);
    }
    expect(empreinteReponse(autrui)).toStrictEqual(empreinteReponse(inconnue));
    expect(depot.passkeysDe(lernende.id).map((p) => p.id)).toEqual(['cle-a']);
    expect(depot.passkeysDe(autre.id).map((p) => p.id)).toEqual(['cle-autre']);
  });

  // Un identifiant de clé fait jusqu'à 1023 octets, soit 1364 caractères en base64url.
  it('admin_passkey_a_identifiant_long_supprimable', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const lernende = creerPersonne('Lernende Test');
    const longue = 'L-_'.repeat(454).concat('LL');
    expect(longue).toHaveLength(1364);
    ajouterPasskeyDeTest(depot, lernende, longue);

    const reponse = await appeler(app, 'DELETE', urlPasskey(lernende.id, longue), {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(depot.passkeysDe(lernende.id)).toEqual([]);
  });
});

/**
 * Ce qu'aucune ligne du journal d'une suppression ne doit contenir (1e-D10) : de la victime, son
 * identifiant, son nom, sa session et son jeton ; du propriétaire qui agit, les mêmes. Un jeton est
 * cherché en clair et par son empreinte, celle que la base garde.
 */
function secretsDeLaSuppression(
  victime: PersonneEnregistree,
  sessionVictime: { jeton: string; session: SessionEnregistree },
  chef: ReturnType<typeof proprietaire>,
): string[] {
  return [
    victime.id,
    victime.nomAffiche,
    sessionVictime.session.id,
    sessionVictime.jeton,
    empreinte(sessionVictime.jeton),
    chef.personne.id,
    chef.session.id,
    chef.jeton,
    empreinte(chef.jeton),
  ];
}

describe('DELETE /api/admin/personnes/:id', () => {
  it('admin_supprime_un_compte', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const { victime, groupe, autorisation, sessionVictime } = installerCibles();
    const autre = creerPersonne('Andere Test');
    depot.ajouterMembre(groupe.id, autre.id);
    // Le droit du groupe n'est pas celui de la victime : il doit survivre à sa suppression.
    const droitDeGroupe = depot.autoriser({
      cours: ID_SOURCE,
      sujet: { type: 'groupe', id: groupe.id },
    });
    const sessionAutre = connecter(autre);
    const telephone = connecter(victime, 'iPhone');

    const reponse = await appeler(app, 'DELETE', `/api/admin/personnes/${victime.id}`, {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    // Le cookie du propriétaire reste : ce n'est pas sa session qui est fermée.
    expect(reponse.cookies.find((c) => c.name === 'ancrage_session')).toBeUndefined();
    expect(depot.personne(victime.id)).toBeUndefined();
    expect(depot.sessionsDe(victime.id)).toEqual([]);
    // Ses sessions n'ouvrent plus rien.
    for (const { jeton } of [sessionVictime, telephone]) {
      const apres = await appeler(app, 'GET', '/api/moi', { jeton });

      expect(apres.statusCode).toBe(401);
      expect(apres.body).toBe(NON_CONNECTE);
    }
    // Son droit nominatif est parti avec elle ; le groupe, son droit, son autre membre et la liste
    // restent.
    const droits = depot.autorisationsAvecIdentifiant();
    expect(droits.map(({ id }) => id)).not.toContain(autorisation.id);
    expect(droits).toStrictEqual([droitDeGroupe]);
    expect(droitsEnBase()).toEqual([`${ID_SOURCE} groupe ${groupe.id}`]);
    expect(depot.groupes().map((g) => g.id)).toEqual([groupe.id]);
    expect(depot.groupesDe(autre.id)).toEqual([groupe.id]);
    expect(base.sqlite.prepare('select personne from suppression').all()).toStrictEqual([
      { personne: victime.id },
    ]);
    const liste = await appeler(app, 'GET', '/api/admin/personnes', { jeton: chef.jeton });
    expect((liste.json() as { id: string }[]).map((p) => p.id).sort()).toEqual(
      [chef.personne.id, autre.id].sort(),
    );
    // Ni le propriétaire ni l'autre personne ne sont déconnectés.
    expect((await appeler(app, 'GET', '/api/moi', { jeton: chef.jeton })).statusCode).toBe(200);
    expect((await appeler(app, 'GET', '/api/moi', { jeton: sessionAutre.jeton })).statusCode).toBe(
      200,
    );
  });

  it('admin_supprime_un_compte_sans_citer_la_personne_au_journal', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const victime = creerPersonne('Témoin-Zoé-7f3a');
    const sessionVictime = connecter(victime);

    await appeler(app, 'DELETE', `/api/admin/personnes/${victime.id}`, { jeton: chef.jeton });

    // La ligne de la suppression elle-même (1e-D10) : ni identifiant, ni nom, ni jeton, ni session,
    // ni de la victime ni du propriétaire qui agit.
    const lignes = journalServeur.lignes.filter((ligne) => ligne.includes('compte supprimé'));
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] as string)).toMatchObject({ par: 'proprietaire' });
    for (const secret of secretsDeLaSuppression(victime, sessionVictime, chef)) {
      expect(lignes[0]).not.toContain(secret);
    }
  });

  it('admin_supprime_un_compte_avertit_sans_identifiant_si_le_wal_est_retenu', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const victime = creerPersonne('Témoin-Zoé-7f3a');
    const sessionVictime = connecter(victime);
    // La sauvegarde de nuit retient le WAL : le point de contrôle de la suppression est incomplet.
    const liberer = retenirLeWal(base);
    let reponse: LightMyRequestResponse;
    try {
      reponse = await appeler(app, 'DELETE', `/api/admin/personnes/${victime.id}`, {
        jeton: chef.jeton,
      });
    } finally {
      liberer();
    }

    // La suppression a bien eu lieu ; le journal avertit, sans rien citer de la personne.
    expect(reponse.statusCode).toBe(204);
    expect(depot.personne(victime.id)).toBeUndefined();
    const avertissements = journalServeur.lignes.filter((ligne) =>
      ligne.includes(POINT_DE_CONTROLE_INCOMPLET),
    );
    expect(avertissements).toHaveLength(1);
    expect(JSON.parse(avertissements[0] as string)).toMatchObject({
      level: 40,
      msg: POINT_DE_CONTROLE_INCOMPLET,
    });
    for (const secret of secretsDeLaSuppression(victime, sessionVictime, chef)) {
      expect(avertissements[0]).not.toContain(secret);
    }
  });

  it('admin_supprime_le_proprietaire_refuse', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const { victime } = installerCibles();

    const reponse = await appeler(app, 'DELETE', `/api/admin/personnes/${chef.personne.id}`, {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(409);
    expect(reponse.body).toBe('{"erreur":"proprietaire"}');
    // Rien n'a changé : le compte, sa session, et les autres personnes.
    expect(depot.personne(chef.personne.id)).toBeDefined();
    expect(depot.personne(victime.id)).toBeDefined();
    expect((await appeler(app, 'GET', '/api/moi', { jeton: chef.jeton })).statusCode).toBe(200);
    expect(base.sqlite.prepare('select count(*) as n from suppression').get()).toStrictEqual({
      n: 0,
    });
  });

  it('admin_supprime_inconnu', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const { victime } = installerCibles();

    const reponse = await appeler(app, 'DELETE', '/api/admin/personnes/inconnue', {
      jeton: chef.jeton,
    });

    expect(reponse.statusCode).toBe(404);
    expect(reponse.body).toBe(INTROUVABLE);
    expect(depot.personne(victime.id)).toBeDefined();
    expect(base.sqlite.prepare('select count(*) as n from suppression').get()).toStrictEqual({
      n: 0,
    });
  });

  it('admin_supprime_deux_fois_la_meme_personne', async () => {
    const app = creerAppDeTest();
    const chef = proprietaire();
    const { victime } = installerCibles();
    const url = `/api/admin/personnes/${victime.id}`;

    const premiere = await appeler(app, 'DELETE', url, { jeton: chef.jeton });
    const seconde = await appeler(app, 'DELETE', url, { jeton: chef.jeton });

    expect(premiere.statusCode).toBe(204);
    expect(seconde.statusCode).toBe(404);
    expect(seconde.body).toBe(INTROUVABLE);
  });
});
