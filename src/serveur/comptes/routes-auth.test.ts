import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { coursDeTest } from '../../domaine/contenu/cours-de-test.fixture.js';
import type { Base } from '../base/base.js';
import { espionnerLesTransactions } from '../base/wal.fixture.js';
import { installerEnvironnement, T0 } from '../environnement.fixture.js';
import { cookiesPoses } from '../reponses.fixture.js';
import type { Depot, Octroi, TypeLien } from './depot.js';
import { empreinte, nouveauJeton } from './jetons.js';
import {
  type Authentificateur,
  creerAuthentificateur,
  ORIGINE_DE_TEST,
  type Surcharge,
} from './webauthn.fixture.js';

const UNE_MINUTE = 60 * 1000;
const CINQ_MINUTES = 5 * UNE_MINUTE;
const UNE_HEURE = 60 * UNE_MINUTE;
const UN_JOUR = 24 * UNE_HEURE;
const SEPT_JOURS = 7 * UN_JOUR;
const UA_PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const COURS_CONNU = 'terminologie-medicale';
const LIEN_INVALIDE = '{"erreur":"lien_invalide"}';
const CONNEXION_IMPOSSIBLE = '{"erreur":"connexion_impossible"}';
const REQUETE = '{"erreur":"requete"}';
const ROUTES_AUTH = [
  '/api/auth/invitation/options',
  '/api/auth/invitation',
  '/api/auth/connexion/options',
  '/api/auth/connexion',
  '/api/auth/lien/options',
  '/api/auth/lien',
  '/api/auth/deconnexion',
] as const;

type OptionsInscription = { options: PublicKeyCredentialCreationOptionsJSON; ceremonie: string };
type OptionsConnexion = { options: PublicKeyCredentialRequestOptionsJSON; ceremonie: string };

let depot: Depot;
let base: Base;
const {
  horloge,
  journalServeur,
  creerApp: creerAppDeTest,
} = installerEnvironnement(
  (environnement) => {
    ({ depot, base } = environnement);
  },
  { cours: [coursDeTest(COURS_CONNU)] },
);

function plus(duree: number): Date {
  return new Date(horloge.maintenant.getTime() + duree);
}

/** Un lien écrit directement en base, et son jeton. */
function creerLien(
  type: TypeLien,
  options: { personne?: string; proprietaire?: boolean; octroi?: Octroi; expireLe?: Date } = {},
): string {
  const jeton = nouveauJeton();
  const { expireLe = plus(type === 'invitation' ? SEPT_JOURS : UN_JOUR), ...reste } = options;
  depot.creerLien({
    empreinte: empreinte(jeton),
    type,
    expireLe: expireLe.toISOString(),
    ...reste,
  });
  return jeton;
}

function lienEncoreUtilisable(jeton: string, type: TypeLien): boolean {
  return depot.lienUtilisable(empreinte(jeton), type) !== undefined;
}

let numeroClient = 0;

/**
 * Une adresse de client neuve à chaque requête : le budget de débit, commun aux routes
 * d'authentification, n'est éprouvé que par les tests qui le visent (`limite de débit`).
 */
function clientSuivant(): string {
  numeroClient += 1;
  return `198.18.${Math.floor(numeroClient / 256) % 256}.${numeroClient % 256}`;
}

async function poster(
  app: FastifyInstance,
  url: string,
  corps?: unknown,
  jetonSession?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url,
    remoteAddress: clientSuivant(),
    headers: { origin: ORIGINE_DE_TEST, 'user-agent': UA_PIXEL },
    ...(corps === undefined ? {} : { payload: corps as object }),
    ...(jetonSession === undefined ? {} : { cookies: { ancrage_session: jetonSession } }),
  });
}

/** Le jeton du cookie de session posé par la réponse. */
function jetonDeSession(reponse: LightMyRequestResponse): string {
  const cookies = cookiesPoses(reponse);
  expect(cookies).toHaveLength(1);
  const [, jeton = ''] = /^ancrage_session=([^;]*);/.exec(cookies[0] ?? '') ?? [];
  expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return jeton;
}

function idUtilisateur(options: PublicKeyCredentialCreationOptionsJSON): string {
  return Buffer.from(options.user.id, 'base64url').toString('utf8');
}

function attendreRefus(reponse: LightMyRequestResponse, corps: string, contexte?: string): void {
  expect(reponse.statusCode, contexte).toBe(400);
  expect(reponse.body, contexte).toBe(corps);
  expect(cookiesPoses(reponse), contexte).toEqual([]);
}

/** Sans `nomAffiche`, comme le client précédent (1e-D6, invariant 8). */
async function optionsInvitation(
  app: FastifyInstance,
  jeton: string,
  nomAffiche?: string,
): Promise<OptionsInscription> {
  const corps = nomAffiche === undefined ? { jeton } : { jeton, nomAffiche };
  const reponse = await poster(app, '/api/auth/invitation/options', corps);
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as OptionsInscription;
}

async function optionsLien(app: FastifyInstance, jeton: string): Promise<OptionsInscription> {
  const reponse = await poster(app, '/api/auth/lien/options', { jeton });
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as OptionsInscription;
}

async function optionsConnexion(app: FastifyInstance): Promise<OptionsConnexion> {
  const reponse = await poster(app, '/api/auth/connexion/options');
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as OptionsConnexion;
}

/** Toute l'invitation : les options, puis l'inscription. */
async function inscrire(
  app: FastifyInstance,
  jeton: string,
  authentificateur: Authentificateur = creerAuthentificateur(),
  champs: Record<string, unknown> = {},
): Promise<LightMyRequestResponse> {
  const { options, ceremonie } = await optionsInvitation(app, jeton);
  return poster(app, '/api/auth/invitation', {
    jeton,
    ceremonie,
    nomAffiche: 'Lernende Test',
    langue: 'de',
    reponse: authentificateur.inscription(options),
    ...champs,
  });
}

/** Un compte créé par invitation, avec sa passkey et sa session. */
async function compteAvecPasskey(app: FastifyInstance) {
  const authentificateur = creerAuthentificateur();
  const reponse = await inscrire(app, creerLien('invitation'), authentificateur);
  expect(reponse.statusCode).toBe(200);
  const { personne: id } = reponse.json() as { personne: string };
  return { id, authentificateur, jetonSession: jetonDeSession(reponse) };
}

async function seConnecter(
  app: FastifyInstance,
  authentificateur: Authentificateur,
  surcharge?: Surcharge,
): Promise<LightMyRequestResponse> {
  const { options, ceremonie } = await optionsConnexion(app);
  return poster(app, '/api/auth/connexion', {
    ceremonie,
    reponse: authentificateur.assertion(options, surcharge),
  });
}

describe('invitation', () => {
  it('invitation_cree_le_compte_la_passkey_et_la_session', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');
    const authentificateur = creerAuthentificateur();

    const { options, ceremonie } = await optionsInvitation(app, jeton);
    const reponse = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie,
      nomAffiche: '  Lernende Test  ',
      langue: 'de',
      reponse: authentificateur.inscription(options),
    });

    // Les options : clé résidente exigée, et sans nom demandé (client précédent), le nom neutre.
    expect(options).toMatchObject({
      rp: { name: 'ancrage', id: 'localhost' },
      user: { name: 'ancrage', displayName: 'ancrage' },
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
      excludeCredentials: [],
    });
    expect(reponse.statusCode).toBe(200);
    const { personne: id } = reponse.json() as { personne: string };
    expect(reponse.json()).toEqual({ personne: id });
    // L'identifiant d'utilisateur de la passkey est celui, opaque, de la personne.
    expect(idUtilisateur(options)).toBe(id);
    expect(depot.personnes()).toEqual([
      {
        id,
        nomAffiche: 'Lernende Test',
        langue: 'de',
        proprietaire: false,
        creeLe: T0.toISOString(),
      },
    ]);
    expect(depot.passkeysDe(id)).toEqual([
      {
        id: authentificateur.idCle,
        personne: id,
        clePublique: expect.any(Uint8Array),
        compteur: 0,
        transports: ['hybrid', 'internal'],
        appareil: 'Android',
        creeLe: T0.toISOString(),
        utiliseLe: null,
      },
    ]);
    const jetonSession = jetonDeSession(reponse);
    expect(depot.sessionsDe(id)).toMatchObject([
      { empreinte: empreinte(jetonSession), appareil: 'Android' },
    ]);
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(false);
    const journal = journalServeur.lignes.join('');
    expect(journal).toContain('/api/auth/invitation');
    for (const secret of [jeton, jetonSession, authentificateur.idCle, 'Lernende Test']) {
      expect(journal).not.toContain(secret);
    }
  });

  it('invitation_applique_l_octroi', async () => {
    const app = creerAppDeTest();
    const groupe = depot.creerGroupe('Klasse Test');
    depot.creerGroupe('Andere Klasse');
    // Un groupe supprimé ou un cours retiré depuis l'invitation sont ignorés.
    const jeton = creerLien('invitation', {
      octroi: { groupes: [groupe.id, 'groupe-inconnu'], cours: [COURS_CONNU, 'cours-inconnu'] },
    });

    const reponse = await inscrire(app, jeton);

    expect(reponse.statusCode).toBe(200);
    const { personne: id } = reponse.json() as { personne: string };
    expect(depot.groupesDe(id)).toEqual([groupe.id]);
    expect(depot.autorisations()).toEqual([
      { cours: COURS_CONNU, permission: 'apprendre', sujet: { type: 'personne', id } },
    ]);
  });

  it('invitation_proprietaire_cree_un_proprietaire', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation', { proprietaire: true });

    const reponse = await inscrire(app, jeton, creerAuthentificateur(), {
      nomAffiche: 'Prüfer Test',
      langue: 'fr',
    });

    expect(reponse.statusCode).toBe(200);
    const { personne: id } = reponse.json() as { personne: string };
    expect(depot.personne(id)).toMatchObject({
      nomAffiche: 'Prüfer Test',
      langue: 'fr',
      proprietaire: true,
    });
  });

  it('second_proprietaire_refuse', async () => {
    const app = creerAppDeTest();
    const premier = creerLien('invitation', { proprietaire: true });
    const second = creerLien('invitation', { proprietaire: true });
    // Les options du second lien sont prises avant que le premier serve.
    const { options, ceremonie } = await optionsInvitation(app, second);

    expect((await inscrire(app, premier)).statusCode).toBe(200);
    const reponse = await poster(app, '/api/auth/invitation', {
      jeton: second,
      ceremonie,
      nomAffiche: 'Prüfer Test',
      langue: 'fr',
      reponse: creerAuthentificateur().inscription(options),
    });

    attendreRefus(reponse, LIEN_INVALIDE);
    expect(depot.personnes()).toHaveLength(1);
    // Tout a été annulé : le lien n'est pas consommé.
    expect(lienEncoreUtilisable(second, 'invitation')).toBe(true);
    attendreRefus(
      await poster(app, '/api/auth/invitation/options', { jeton: second }),
      LIEN_INVALIDE,
    );
  });

  it('invitation_utilisee_deux_fois_refusee', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');
    const premiere = await optionsInvitation(app, jeton);
    const seconde = await optionsInvitation(app, jeton);

    const reussie = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie: premiere.ceremonie,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: creerAuthentificateur().inscription(premiere.options),
    });
    const refusee = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie: seconde.ceremonie,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: creerAuthentificateur().inscription(seconde.options),
    });

    expect(reussie.statusCode).toBe(200);
    attendreRefus(refusee, LIEN_INVALIDE);
    expect(depot.personnes()).toHaveLength(1);
    attendreRefus(await poster(app, '/api/auth/invitation/options', { jeton }), LIEN_INVALIDE);
  });

  it('invitation_expiree_refusee', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation', { expireLe: plus(2 * UNE_MINUTE) });
    const { options, ceremonie } = await optionsInvitation(app, jeton);
    // Le lien expire pendant la cérémonie, dont le défi vaut encore.
    horloge.maintenant = plus(2 * UNE_MINUTE);

    const reponse = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: creerAuthentificateur().inscription(options),
    });

    attendreRefus(reponse, LIEN_INVALIDE);
    expect(depot.personnes()).toEqual([]);
    attendreRefus(await poster(app, '/api/auth/invitation/options', { jeton }), LIEN_INVALIDE);
  });

  it('options_invitation_avec_nom', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');

    // Le nom est celui que la personne a choisi, après `trim` (1e-D6).
    const { options } = await optionsInvitation(app, jeton, 'Mia');
    const { options: rognees } = await optionsInvitation(app, jeton, '  Zoë  ');

    expect(options.user).toMatchObject({ name: 'Mia', displayName: 'Mia' });
    expect(rognees.user).toMatchObject({ name: 'Zoë', displayName: 'Zoë' });
    // Le nom ne va pas au journal du serveur.
    expect(journalServeur.lignes.join('')).not.toContain('Mia');
  });

  it('options_invitation_sans_nom', async () => {
    const app = creerAppDeTest();

    // Le client précédent, encore précaché sur les téléphones, n'envoie que le jeton (invariant 8).
    const { options } = await optionsInvitation(app, creerLien('invitation'));

    expect(options.user).toMatchObject({ name: 'ancrage', displayName: 'ancrage' });
  });

  it('options_invitation_nom_invalide_refuse', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');

    for (const nomAffiche of [
      '',
      '   ',
      'L'.repeat(41),
      'Lernende\nTest',
      'Lernende\u202ETest',
      42,
      null,
    ]) {
      attendreRefus(
        await poster(app, '/api/auth/invitation/options', { jeton, nomAffiche }),
        REQUETE,
        JSON.stringify(nomAffiche),
      );
    }
    // Aucune cérémonie n'a été ouverte, et le lien reste utilisable.
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(true);
    expect((await inscrire(app, jeton)).statusCode).toBe(200);
  });

  it('options_ne_consomment_pas_le_lien', async () => {
    const app = creerAppDeTest();
    const invitation = creerLien('invitation');
    const { id } = await compteAvecPasskey(app);
    const secours = creerLien('connexion', { personne: id });

    await optionsInvitation(app, invitation);
    await optionsInvitation(app, invitation);
    await optionsLien(app, secours);
    await optionsLien(app, secours);

    expect(lienEncoreUtilisable(invitation, 'invitation')).toBe(true);
    expect(lienEncoreUtilisable(secours, 'connexion')).toBe(true);
    expect((await inscrire(app, invitation)).statusCode).toBe(200);
  });

  it('nom_affiche_invalide_refuse', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');
    const { options, ceremonie } = await optionsInvitation(app, jeton);
    const reponseNavigateur = creerAuthentificateur().inscription(options);
    const corps = { jeton, ceremonie, nomAffiche: 'Lernende Test', langue: 'de' };

    for (const champs of [
      { nomAffiche: '' },
      { nomAffiche: '   ' },
      { nomAffiche: 'L'.repeat(41) },
      { nomAffiche: ` ${'L'.repeat(41)} ` },
      { nomAffiche: 'Lernende\u0007Test' },
      { nomAffiche: 'Lernende\nTest' },
      { nomAffiche: 'Lernende\u0085Test' },
      // Contrôles bidirectionnels (dont LRM, RLM et ALM), séparateurs de ligne et de paragraphe,
      // espace sans largeur, gluon de mots et U+FEFF : invisibles, ils déguiseraient un nom.
      { nomAffiche: 'Lernende\u202ETest' },
      { nomAffiche: 'Lernende\u2067Test' },
      { nomAffiche: 'Lernende\u200ETest' },
      { nomAffiche: 'Lernende\u200FTest' },
      { nomAffiche: 'Lernende\u061CTest' },
      { nomAffiche: 'Lernende\u2028Test' },
      { nomAffiche: 'Lernende\u2029Test' },
      { nomAffiche: 'Lernende\u200BTest' },
      { nomAffiche: 'Lernende\u2060Test' },
      { nomAffiche: 'Lernende\uFEFFTest' },
      // Les autres caractères de mise en forme et les remplissages hangul : la règle commune
      // (`domaine/nom-affiche.ts`).
      { nomAffiche: 'Lernende\u{00AD}Test' },
      { nomAffiche: 'Lernende\u{3164}Test' },
      { nomAffiche: 42 },
      { nomAffiche: undefined },
      { langue: 'en' },
      { langue: 'DE' },
      { langue: undefined },
    ]) {
      const reponse = await poster(app, '/api/auth/invitation', {
        ...corps,
        reponse: reponseNavigateur,
        ...champs,
      });

      attendreRefus(reponse, REQUETE, JSON.stringify(champs));
    }
    expect(depot.personnes()).toEqual([]);

    // Un corps refusé ne consomme rien : la même cérémonie aboutit avec un nom valide. Quarante
    // caractères au plus, comptés en caractères et non en unités UTF-16, après `trim` ; le liant
    // sans largeur (U+200D) d'un émoji composé est permis.
    const quarante = `${'Ä'.repeat(36)}\u{1F469}\u200D\u2695\uFE0F`;
    const reponse = await poster(app, '/api/auth/invitation', {
      ...corps,
      nomAffiche: ` ${quarante}\t`,
      reponse: reponseNavigateur,
    });
    expect(reponse.statusCode).toBe(200);
    expect(depot.personnes().map((personne) => personne.nomAffiche)).toEqual([quarante]);

    // L'antiliant sans largeur (U+200C) est permis aussi : certaines écritures en ont besoin.
    const avecAntiliant = 'Lernende\u200CTest';
    const antiliant = await inscrire(app, creerLien('invitation'), creerAuthentificateur(), {
      nomAffiche: avecAntiliant,
    });
    expect(antiliant.statusCode).toBe(200);
    expect(
      depot
        .personnes()
        .map((personne) => personne.nomAffiche)
        .sort(),
    ).toEqual([quarante, avecAntiliant].sort());
  });

  it('journal_d_un_echec_sans_le_defi', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');
    const { options, ceremonie } = await optionsInvitation(app, jeton);

    const reponse = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: creerAuthentificateur().inscription(options, { defi: 'un-autre-defi' }),
    });

    attendreRefus(reponse, LIEN_INVALIDE);
    // Le message de la bibliothèque cite les deux défis entre guillemets : le journal garde le nom
    // de l'erreur et le début du message, sans ce qui est entre guillemets (2b-D8).
    const journal = journalServeur.lignes.join('');
    expect(journal).toContain('Error: Unexpected registration response challenge');
    expect(journal).not.toContain(options.challenge);
    expect(journal).not.toContain('un-autre-defi');
  });

  it('inscription_ecrit_en_transaction_immediate', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');
    const espion = espionnerLesTransactions(base.sqlite);

    expect((await inscrire(app, jeton)).statusCode).toBe(200);

    expect(espion.manieres).toContain('immediate');
    expect(espion.manieres).not.toContain('deferred');
    expect(espion.manieres).not.toContain('exclusive');
  });

  it('inscription_non_verifiee_refusee_sans_rien_ecrire', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');
    const authentificateur = creerAuthentificateur();
    const secrets = [jeton, authentificateur.idCle, 'Lernende Test'];

    for (const surcharge of [
      { origine: 'https://ailleurs.example' },
      { origine: 'http://localhost:3001' },
      { rpId: 'ailleurs.example' },
      { type: 'webauthn.get' },
      { defi: 'un-autre-defi' },
      { presence: false },
    ] satisfies Surcharge[]) {
      const { options, ceremonie } = await optionsInvitation(app, jeton);
      secrets.push(ceremonie, idUtilisateur(options));
      const reponse = await poster(app, '/api/auth/invitation', {
        jeton,
        ceremonie,
        nomAffiche: 'Lernende Test',
        langue: 'de',
        reponse: authentificateur.inscription(options, surcharge),
      });

      attendreRefus(reponse, LIEN_INVALIDE, JSON.stringify(surcharge));
    }
    expect(depot.personnes()).toEqual([]);
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(true);
    // Le journal dit pourquoi (une `ANCRAGE_URL_PUBLIQUE` fausse se voit), sans rien de secret.
    const journal = journalServeur.lignes.join('');
    expect(journal).toContain('"motif":"webauthn"');
    expect(journal).toContain('Unexpected registration response origin');
    expect(journal).toContain('Unexpected RP ID hash');
    for (const secret of secrets) {
      expect(journal).not.toContain(secret);
    }
    // Sans vérification de l'utilisateur, l'inscription passe : elle est « préférée », pas exigée.
    const { options, ceremonie } = await optionsInvitation(app, jeton);
    const reponse = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: authentificateur.inscription(options, { verification: false }),
    });
    expect(reponse.statusCode).toBe(200);
  });

  it('passkey_deja_enregistree_refusee', async () => {
    const app = creerAppDeTest();
    const { authentificateur } = await compteAvecPasskey(app);
    const jeton = creerLien('invitation');

    // La même clé présentée à une autre invitation.
    const reponse = await inscrire(app, jeton, authentificateur);

    attendreRefus(reponse, LIEN_INVALIDE);
    expect(depot.personnes()).toHaveLength(1);
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(true);
  });
});

describe('connexion', () => {
  it('connexion_par_passkey_ouvre_une_session', async () => {
    const app = creerAppDeTest();
    const { id, authentificateur } = await compteAvecPasskey(app);
    horloge.maintenant = plus(UNE_HEURE);

    const { options, ceremonie } = await optionsConnexion(app);
    const reponse = await poster(app, '/api/auth/connexion', {
      ceremonie,
      reponse: authentificateur.assertion(options),
    });

    // Sans `allowCredentials` : le téléphone propose les passkeys du site, sans nom à saisir.
    expect(options).toMatchObject({ rpId: 'localhost', userVerification: 'preferred' });
    expect(options).not.toHaveProperty('allowCredentials');
    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    const jetonSession = jetonDeSession(reponse);
    expect(depot.sessionParEmpreinte(empreinte(jetonSession))).toMatchObject({
      personne: id,
      appareil: 'Android',
      creeLe: horloge.maintenant.toISOString(),
    });
    expect(depot.sessionsDe(id)).toHaveLength(2);
    expect(depot.passkey(authentificateur.idCle)?.utiliseLe).toBe(horloge.maintenant.toISOString());
    const journal = journalServeur.lignes.join('');
    for (const secret of [jetonSession, authentificateur.idCle, id]) {
      expect(journal).not.toContain(secret);
    }
  });

  it('connexion_passkey_inconnue_refusee', async () => {
    const app = creerAppDeTest();
    await compteAvecPasskey(app);

    const reponse = await seConnecter(app, creerAuthentificateur());

    attendreRefus(reponse, CONNEXION_IMPOSSIBLE);
  });

  it('connexion_signee_par_une_autre_cle_refusee', async () => {
    const app = creerAppDeTest();
    const { authentificateur } = await compteAvecPasskey(app);
    const { options, ceremonie } = await optionsConnexion(app);

    // L'identifiant d'une clé connue, la signature d'une autre.
    const fausse = {
      ...creerAuthentificateur().assertion(options),
      id: authentificateur.idCle,
      rawId: authentificateur.idCle,
    };
    const reponse = await poster(app, '/api/auth/connexion', { ceremonie, reponse: fausse });

    attendreRefus(reponse, CONNEXION_IMPOSSIBLE);
    expect(depot.passkey(authentificateur.idCle)?.utiliseLe).toBeNull();
  });

  it('connexion_non_verifiee_refusee', async () => {
    const app = creerAppDeTest();
    const { id, authentificateur, jetonSession } = await compteAvecPasskey(app);

    for (const surcharge of [
      { origine: 'https://ailleurs.example' },
      { rpId: 'ailleurs.example' },
      { type: 'webauthn.create' },
      { defi: 'un-autre-defi' },
      { presence: false },
    ] satisfies Surcharge[]) {
      attendreRefus(
        await seConnecter(app, authentificateur, surcharge),
        CONNEXION_IMPOSSIBLE,
        JSON.stringify(surcharge),
      );
    }
    const journal = journalServeur.lignes.join('');
    expect(journal).toContain('"motif":"webauthn"');
    expect(journal).toContain('Unexpected authentication response origin');
    expect(journal).toContain('User not present during authentication');
    for (const secret of [id, authentificateur.idCle, jetonSession, 'Lernende Test']) {
      expect(journal).not.toContain(secret);
    }
    // La vérification de l'utilisateur est « préférée », pas exigée.
    expect((await seConnecter(app, authentificateur, { verification: false })).statusCode).toBe(
      204,
    );
  });

  it('connexion_identifiant_utilisateur_different_refuse', async () => {
    const app = creerAppDeTest();
    const lernende = await compteAvecPasskey(app);
    const autre = await compteAvecPasskey(app);

    const reponse = await seConnecter(app, lernende.authentificateur, {
      userHandle: Buffer.from(autre.id, 'utf8').toString('base64url'),
    });

    attendreRefus(reponse, CONNEXION_IMPOSSIBLE);
    // Sans identifiant d'utilisateur, la clé seule suffit.
    expect(
      (await seConnecter(app, lernende.authentificateur, { userHandle: null })).statusCode,
    ).toBe(204);
  });

  it('compteur_mis_a_jour', async () => {
    const app = creerAppDeTest();
    const { authentificateur } = await compteAvecPasskey(app);
    const passkey = () => depot.passkey(authentificateur.idCle);

    expect((await seConnecter(app, authentificateur, { compteur: 5 })).statusCode).toBe(204);
    expect(passkey()).toMatchObject({ compteur: 5, utiliseLe: T0.toISOString() });

    // Un compteur qui n'avance pas trahit une clé copiée : refusé, et le compteur ne bouge pas.
    attendreRefus(await seConnecter(app, authentificateur, { compteur: 5 }), CONNEXION_IMPOSSIBLE);
    attendreRefus(await seConnecter(app, authentificateur, { compteur: 4 }), CONNEXION_IMPOSSIBLE);
    expect(passkey()?.compteur).toBe(5);
    expect((await seConnecter(app, authentificateur, { compteur: 6 })).statusCode).toBe(204);
    expect(passkey()?.compteur).toBe(6);
  });
});

describe('lien de secours', () => {
  it('lien_de_secours_ajoute_une_passkey_et_ouvre_la_session', async () => {
    const app = creerAppDeTest();
    const { id, authentificateur: ancien } = await compteAvecPasskey(app);
    const jeton = creerLien('connexion', { personne: id });
    const nouveau = creerAuthentificateur();

    const { options, ceremonie } = await optionsLien(app, jeton);
    const reponse = await poster(app, '/api/auth/lien', {
      jeton,
      ceremonie,
      reponse: nouveau.inscription(options),
    });

    // Les options : la personne du lien, son nom affiché, et ses passkeys exclues pour ne pas les
    // recréer.
    expect(idUtilisateur(options)).toBe(id);
    expect(options).toMatchObject({
      rp: { name: 'ancrage', id: 'localhost' },
      user: { name: 'Lernende Test', displayName: 'Lernende Test' },
      attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: [
        { id: ancien.idCle, type: 'public-key', transports: ['hybrid', 'internal'] },
      ],
    });
    expect(reponse.statusCode).toBe(204);
    expect(reponse.body).toBe('');
    expect(
      depot
        .passkeysDe(id)
        .map((passkey) => passkey.id)
        .sort(),
    ).toEqual([ancien.idCle, nouveau.idCle].sort());
    const jetonSession = jetonDeSession(reponse);
    expect(depot.sessionParEmpreinte(empreinte(jetonSession))?.personne).toBe(id);
    expect(depot.personnes()).toHaveLength(1);
    expect(lienEncoreUtilisable(jeton, 'connexion')).toBe(false);
    attendreRefus(await poster(app, '/api/auth/lien/options', { jeton }), LIEN_INVALIDE);
    // La nouvelle passkey sert à se connecter.
    expect((await seConnecter(app, nouveau)).statusCode).toBe(204);
    expect(journalServeur.lignes.join('')).not.toContain(jeton);
  });

  it('options_lien_nom_de_la_personne', async () => {
    const app = creerAppDeTest();
    const { id } = await compteAvecPasskey(app);
    // C'est le nom d'aujourd'hui, pas celui de l'invitation (1e-D6).
    depot.modifierPersonne(id, { nomAffiche: 'Mia' });
    const jeton = creerLien('connexion', { personne: id });

    const { options } = await optionsLien(app, jeton);

    expect(options.user).toMatchObject({ name: 'Mia', displayName: 'Mia' });
  });

  it('options_lien_ignore_un_nom_envoye', async () => {
    const app = creerAppDeTest();
    const { id } = await compteAvecPasskey(app);
    const jeton = creerLien('connexion', { personne: id });

    // Le nom d'un lien est celui de la personne : un nom du corps n'y change rien, même invalide.
    for (const nomAffiche of ['Autre', '']) {
      const reponse = await poster(app, '/api/auth/lien/options', { jeton, nomAffiche });

      expect(reponse.statusCode).toBe(200);
      expect((reponse.json() as OptionsInscription).options.user).toMatchObject({
        name: 'Lernende Test',
        displayName: 'Lernende Test',
      });
    }
  });

  it('lien_utilise_deux_fois_refuse', async () => {
    const app = creerAppDeTest();
    const { id } = await compteAvecPasskey(app);
    const jeton = creerLien('connexion', { personne: id });
    const premiere = await optionsLien(app, jeton);
    const seconde = await optionsLien(app, jeton);

    const reussie = await poster(app, '/api/auth/lien', {
      jeton,
      ceremonie: premiere.ceremonie,
      reponse: creerAuthentificateur().inscription(premiere.options),
    });
    const refusee = await poster(app, '/api/auth/lien', {
      jeton,
      ceremonie: seconde.ceremonie,
      reponse: creerAuthentificateur().inscription(seconde.options),
    });

    expect(reussie.statusCode).toBe(204);
    attendreRefus(refusee, LIEN_INVALIDE);
    expect(depot.passkeysDe(id)).toHaveLength(2);
  });

  it('lien_refuse_une_passkey_deja_enregistree', async () => {
    const app = creerAppDeTest();
    const { id, authentificateur } = await compteAvecPasskey(app);
    const jeton = creerLien('connexion', { personne: id });
    const { options, ceremonie } = await optionsLien(app, jeton);

    const reponse = await poster(app, '/api/auth/lien', {
      jeton,
      ceremonie,
      reponse: authentificateur.inscription(options),
    });

    attendreRefus(reponse, LIEN_INVALIDE);
    expect(depot.passkeysDe(id)).toHaveLength(1);
    expect(lienEncoreUtilisable(jeton, 'connexion')).toBe(true);
  });
});

describe('session précédente', () => {
  it('session_precedente_remplacee', async () => {
    const app = creerAppDeTest();
    const { id, authentificateur, jetonSession: premiere } = await compteAvecPasskey(app);
    const empreintesDe = (personne: string) =>
      depot.sessionsDe(personne).map((session) => session.empreinte);

    // Une connexion depuis un téléphone déjà connecté remplace sa session : pas d'appareil fantôme.
    const connexion = await optionsConnexion(app);
    const reconnecte = await poster(
      app,
      '/api/auth/connexion',
      { ceremonie: connexion.ceremonie, reponse: authentificateur.assertion(connexion.options) },
      premiere,
    );
    expect(reconnecte.statusCode).toBe(204);
    const seconde = jetonDeSession(reconnecte);
    expect(empreintesDe(id)).toEqual([empreinte(seconde)]);

    // De même par un lien de secours.
    const jeton = creerLien('connexion', { personne: id });
    const lien = await optionsLien(app, jeton);
    const parLien = await poster(
      app,
      '/api/auth/lien',
      {
        jeton,
        ceremonie: lien.ceremonie,
        reponse: creerAuthentificateur().inscription(lien.options),
      },
      seconde,
    );
    expect(parLien.statusCode).toBe(204);
    const troisieme = jetonDeSession(parLien);
    expect(empreintesDe(id)).toEqual([empreinte(troisieme)]);

    // Et par une invitation : le téléphone passe au nouveau compte, l'ancien n'y garde rien.
    const invitation = creerLien('invitation');
    const inscription = await optionsInvitation(app, invitation);
    const parInvitation = await poster(
      app,
      '/api/auth/invitation',
      {
        jeton: invitation,
        ceremonie: inscription.ceremonie,
        nomAffiche: 'Andere Test',
        langue: 'fr',
        reponse: creerAuthentificateur().inscription(inscription.options),
      },
      troisieme,
    );
    expect(parInvitation.statusCode).toBe(200);
    const { personne: autre } = parInvitation.json() as { personne: string };
    const quatrieme = jetonDeSession(parInvitation);
    expect(empreintesDe(id)).toEqual([]);
    expect(empreintesDe(autre)).toEqual([empreinte(quatrieme)]);

    // Une cérémonie ratée ne touche pas à la session en cours.
    const ratee = await optionsConnexion(app);
    const refusee = await poster(
      app,
      '/api/auth/connexion',
      {
        ceremonie: ratee.ceremonie,
        reponse: authentificateur.assertion(ratee.options, { origine: 'https://ailleurs.example' }),
      },
      quatrieme,
    );
    attendreRefus(refusee, CONNEXION_IMPOSSIBLE);
    expect(empreintesDe(autre)).toEqual([empreinte(quatrieme)]);
  });
});

describe('déconnexion', () => {
  it('deconnexion_ferme_la_session', async () => {
    const app = creerAppDeTest();
    const { id, jetonSession } = await compteAvecPasskey(app);

    const reponse = await poster(app, '/api/auth/deconnexion', undefined, jetonSession);

    expect(reponse.statusCode).toBe(204);
    expect(cookiesPoses(reponse)).toEqual([
      'ancrage_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(depot.sessionsDe(id)).toEqual([]);
    // Sans session, la déconnexion réussit aussi.
    expect((await poster(app, '/api/auth/deconnexion')).statusCode).toBe(204);
  });
});

describe('défis', () => {
  it('defi_reutilise_refuse', async () => {
    const app = creerAppDeTest();
    const { authentificateur } = await compteAvecPasskey(app);
    const { options, ceremonie } = await optionsConnexion(app);
    const assertion = authentificateur.assertion(options);

    const premiere = await poster(app, '/api/auth/connexion', { ceremonie, reponse: assertion });
    const rejouee = await poster(app, '/api/auth/connexion', { ceremonie, reponse: assertion });

    expect(premiere.statusCode).toBe(204);
    attendreRefus(rejouee, CONNEXION_IMPOSSIBLE);

    // Une cérémonie d'inscription ratée est consommée elle aussi : pas de second essai.
    const jeton = creerLien('invitation');
    const invitation = await optionsInvitation(app, jeton);
    const corps = { jeton, ceremonie: invitation.ceremonie, nomAffiche: 'Lernende Test' };
    const ratee = await poster(app, '/api/auth/invitation', {
      ...corps,
      langue: 'de',
      reponse: creerAuthentificateur().inscription(invitation.options, {
        origine: 'https://ailleurs.example',
      }),
    });
    const reprise = await poster(app, '/api/auth/invitation', {
      ...corps,
      langue: 'de',
      reponse: creerAuthentificateur().inscription(invitation.options),
    });
    attendreRefus(ratee, LIEN_INVALIDE);
    attendreRefus(reprise, LIEN_INVALIDE);
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(true);
  });

  it('defi_expire_refuse', async () => {
    const app = creerAppDeTest();
    const { authentificateur } = await compteAvecPasskey(app);
    const jeton = creerLien('invitation');

    const avantLaFin = await optionsConnexion(app);
    const connexion = await optionsConnexion(app);
    const invitation = await optionsInvitation(app, jeton);
    horloge.maintenant = plus(CINQ_MINUTES - 1);
    const reussie = await poster(app, '/api/auth/connexion', {
      ceremonie: avantLaFin.ceremonie,
      reponse: authentificateur.assertion(avantLaFin.options),
    });
    horloge.maintenant = plus(1);
    const tropTard = await poster(app, '/api/auth/connexion', {
      ceremonie: connexion.ceremonie,
      reponse: authentificateur.assertion(connexion.options),
    });
    const invitationTropTard = await poster(app, '/api/auth/invitation', {
      jeton,
      ceremonie: invitation.ceremonie,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: creerAuthentificateur().inscription(invitation.options),
    });

    expect(reussie.statusCode).toBe(204);
    attendreRefus(tropTard, CONNEXION_IMPOSSIBLE);
    attendreRefus(invitationTropTard, LIEN_INVALIDE);
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(true);
  });

  it('defi_lie_a_son_lien_et_a_son_but', async () => {
    const app = creerAppDeTest();
    const { id } = await compteAvecPasskey(app);
    const lienA = creerLien('invitation');
    const lienB = creerLien('invitation');
    const secours = creerLien('connexion', { personne: id });
    const authentificateur = creerAuthentificateur();
    const corps = { nomAffiche: 'Lernende Test', langue: 'de' };

    // Le défi du lien A ne vérifie pas une inscription par le lien B.
    const a = await optionsInvitation(app, lienA);
    const parB = await poster(app, '/api/auth/invitation', {
      ...corps,
      jeton: lienB,
      ceremonie: a.ceremonie,
      reponse: authentificateur.inscription(a.options),
    });
    // Le défi d'une invitation ne sert pas au lien de secours, et inversement.
    const invitation = await optionsInvitation(app, lienA);
    const commeSecours = await poster(app, '/api/auth/lien', {
      jeton: secours,
      ceremonie: invitation.ceremonie,
      reponse: authentificateur.inscription(invitation.options),
    });
    const lien = await optionsLien(app, secours);
    const commeInvitation = await poster(app, '/api/auth/invitation', {
      ...corps,
      jeton: lienA,
      ceremonie: lien.ceremonie,
      reponse: authentificateur.inscription(lien.options),
    });
    // Le défi d'une connexion ne sert pas à une inscription.
    const connexion = await optionsConnexion(app);
    const inscriptionParConnexion = await poster(app, '/api/auth/invitation', {
      ...corps,
      jeton: lienA,
      ceremonie: connexion.ceremonie,
      reponse: authentificateur.inscription({
        challenge: connexion.options.challenge,
        rp: { id: 'localhost' },
        user: { id: Buffer.from('x').toString('base64url') },
      }),
    });

    attendreRefus(parB, LIEN_INVALIDE);
    attendreRefus(commeSecours, LIEN_INVALIDE);
    attendreRefus(commeInvitation, LIEN_INVALIDE);
    attendreRefus(inscriptionParConnexion, LIEN_INVALIDE);
    expect(depot.personnes()).toHaveLength(1);
    expect(depot.passkeysDe(id)).toHaveLength(1);
    for (const [jeton, type] of [
      [lienA, 'invitation'],
      [lienB, 'invitation'],
      [secours, 'connexion'],
    ] as const) {
      expect(lienEncoreUtilisable(jeton, type)).toBe(true);
    }
  });
});

describe('échecs', () => {
  it('messages_d_echec_identiques', async () => {
    const app = creerAppDeTest();
    const { id, authentificateur } = await compteAvecPasskey(app);
    const expire = creerLien('invitation', { expireLe: plus(UNE_MINUTE) });
    const utilise = creerLien('invitation');
    expect((await inscrire(app, utilise)).statusCode).toBe(200);
    const secoursExpire = creerLien('connexion', { personne: id, expireLe: plus(UNE_MINUTE) });
    // Valable : seul son type diffère de celui qu'attend l'invitation.
    const secoursValable = creerLien('connexion', { personne: id });
    const secoursUtilise = creerLien('connexion', { personne: id });
    const { options, ceremonie } = await optionsLien(app, secoursUtilise);
    expect(
      (
        await poster(app, '/api/auth/lien', {
          jeton: secoursUtilise,
          ceremonie,
          reponse: creerAuthentificateur().inscription(options),
        })
      ).statusCode,
    ).toBe(204);
    const invitation = creerLien('invitation');
    horloge.maintenant = plus(UNE_MINUTE);
    const inscription = {
      ceremonie: nouveauJeton(),
      nomAffiche: 'Lernende Test',
      langue: 'de',
      reponse: creerAuthentificateur().inscription(options),
    };

    const refus = {
      // Inconnu, expiré, utilisé, ou d'un autre type.
      'invitation inconnue': await poster(app, '/api/auth/invitation/options', {
        jeton: nouveauJeton(),
      }),
      'invitation expirée': await poster(app, '/api/auth/invitation/options', { jeton: expire }),
      'invitation utilisée': await poster(app, '/api/auth/invitation/options', { jeton: utilise }),
      'secours comme invitation': await poster(app, '/api/auth/invitation/options', {
        jeton: secoursValable,
      }),
      'lien inconnu': await poster(app, '/api/auth/lien/options', { jeton: nouveauJeton() }),
      'lien expiré': await poster(app, '/api/auth/lien/options', { jeton: secoursExpire }),
      'lien utilisé': await poster(app, '/api/auth/lien/options', { jeton: secoursUtilise }),
      'invitation comme secours': await poster(app, '/api/auth/lien/options', {
        jeton: invitation,
      }),
      // La seconde étape, cérémonie inconnue.
      'inscription sans cérémonie': await poster(app, '/api/auth/invitation', {
        ...inscription,
        jeton: invitation,
      }),
      'secours sans cérémonie': await poster(app, '/api/auth/lien', {
        ...inscription,
        jeton: secoursUtilise,
      }),
    };

    for (const [cas, reponse] of Object.entries(refus)) {
      attendreRefus(reponse, LIEN_INVALIDE, cas);
      expect(reponse.headers['content-type'], cas).toBe('application/json; charset=utf-8');
    }

    const connexion = await optionsConnexion(app);
    const refusConnexion = {
      'cérémonie inconnue': await poster(app, '/api/auth/connexion', {
        ceremonie: nouveauJeton(),
        reponse: authentificateur.assertion(connexion.options),
      }),
      'passkey inconnue': await seConnecter(app, creerAuthentificateur()),
      'assertion non vérifiée': await seConnecter(app, authentificateur, {
        defi: 'un-autre-defi',
      }),
    };
    for (const [cas, reponse] of Object.entries(refusConnexion)) {
      attendreRefus(reponse, CONNEXION_IMPOSSIBLE, cas);
      expect(reponse.headers['content-type'], cas).toBe('application/json; charset=utf-8');
    }
  });

  it('corps_mal_forme_refuse', async () => {
    const app = creerAppDeTest();
    const jeton = creerLien('invitation');

    for (const url of ROUTES_AUTH.filter(
      (route) => route !== '/api/auth/connexion/options' && route !== '/api/auth/deconnexion',
    )) {
      attendreRefus(await poster(app, url), REQUETE, `${url} sans corps`);
      for (const json of [
        '',
        '{"jeton": ',
        'null',
        '[]',
        '"texte"',
        '{}',
        '{"jeton": 42}',
        '{"jeton": ["x"]}',
        `{"jeton": "${jeton}", "__proto__": {"x": 1}}`,
      ]) {
        const reponse = await app.inject({
          method: 'POST',
          url,
          remoteAddress: clientSuivant(),
          headers: { origin: ORIGINE_DE_TEST, 'content-type': 'application/json' },
          payload: json,
        });
        attendreRefus(reponse, REQUETE, `${url} ${json}`);
      }
    }
    // Une réponse WebAuthn mal formée est une requête mal formée.
    const { ceremonie } = await optionsInvitation(app, jeton);
    for (const reponse of [{}, { id: 'x' }, { id: 'x', rawId: 'x', type: 'public-key' }]) {
      attendreRefus(
        await poster(app, '/api/auth/invitation', {
          jeton,
          ceremonie,
          nomAffiche: 'Lernende Test',
          langue: 'de',
          reponse,
        }),
        REQUETE,
        JSON.stringify(reponse),
      );
    }
    expect(lienEncoreUtilisable(jeton, 'invitation')).toBe(true);
  });
});

describe('limite de débit', () => {
  const TROP_DE_REQUETES = '{"erreur":"trop_de_requetes"}';
  // Le plafond de `LIMITE_DEBIT_AUTH`, écrit en dur : le test le fixe. Il est relevé de 20 à 120
  // pour la classe, qui partage une seule adresse derrière le réseau de l'école (ancrage-donnees#9).
  const PLAFOND = 120;

  /** Une requête d'un client donné, par défaut toujours le même. */
  async function depuis(
    app: FastifyInstance,
    url: string,
    client = '192.0.2.1',
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url,
      remoteAddress: client,
      headers: { origin: ORIGINE_DE_TEST },
      payload: {},
    });
  }

  /**
   * Le refus tel que le client le reçoit : 429 et son corps, avec les en-têtes que
   * `@fastify/rate-limit` pose avant de refuser. Le gestionnaire d'erreurs racine (`app.ts`) doit
   * les laisser passer : une 4xx est rendue comme sans lui.
   */
  function attendreRefusDeDebit(refusee: LightMyRequestResponse): void {
    expect(refusee.statusCode).toBe(429);
    expect(refusee.body).toBe(TROP_DE_REQUETES);
    expect(refusee.headers['x-ratelimit-limit']).toBe(String(PLAFOND));
    expect(refusee.headers['x-ratelimit-remaining']).toBe('0');
    const attente = Number(refusee.headers['retry-after']);
    expect(attente).toBeGreaterThan(0);
    expect(attente).toBeLessThanOrEqual(60);
  }

  it('budget_commun_aux_routes_d_authentification', async () => {
    const app = creerAppDeTest();

    // Le plafond, par minute et par client, vaut pour l'ensemble des routes, et non pour chacune.
    for (let numero = 1; numero <= PLAFOND / 2; numero += 1) {
      expect((await depuis(app, '/api/auth/connexion/options')).statusCode).toBe(200);
      expect((await depuis(app, '/api/auth/invitation/options')).statusCode).toBe(400);
    }
    const refusee = await depuis(app, '/api/auth/deconnexion');

    attendreRefusDeDebit(refusee);
    // Un autre client garde tout son budget.
    expect((await depuis(app, '/api/auth/deconnexion', '192.0.2.2')).statusCode).toBe(204);
  });

  it.each(ROUTES_AUTH)('route_couverte_par_la_limite %s', async (url) => {
    const app = creerAppDeTest();
    const autre =
      url === '/api/auth/deconnexion' ? '/api/auth/connexion/options' : '/api/auth/deconnexion';

    // Le budget épuisé sur une autre route vaut aussi pour celle-ci.
    for (let numero = 1; numero <= PLAFOND; numero += 1) {
      expect((await depuis(app, autre)).statusCode, `requête ${numero}`).not.toBe(429);
    }
    const refusee = await depuis(app, url);

    attendreRefusDeDebit(refusee);
  });
});
