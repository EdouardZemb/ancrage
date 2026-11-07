/*
 * Les routes de connexion (ADR-0002), toutes sous `/api/auth/` :
 * - l'invitation crée le compte, sa première passkey et sa session ;
 * - la connexion se fait par passkey, sans nom à saisir : la clé est résidente ;
 * - le lien de secours ajoute une passkey à un compte existant et ouvre la session ;
 * - la déconnexion ferme la session.
 *
 * Une cérémonie WebAuthn a deux temps. `…/options` rend les options et une `ceremonie` :
 * l'identifiant du défi, gardé 5 minutes en mémoire, à usage unique, lié à son but et, pour une
 * inscription, à son lien. La route elle-même vérifie ensuite la réponse du téléphone avec
 * SimpleWebAuthn, puis écrit tout dans une seule transaction : un échec n'écrit rien et ne
 * consomme pas le lien.
 *
 * Les échecs ne se distinguent pas (pas d'oracle) : `lien_invalide` pour l'invitation et le lien
 * de secours, `connexion_impossible` pour la connexion, `requete` pour un corps mal formé. Ni
 * jeton, ni identifiant de clé, ni nom dans les journaux. Les routes partagent un même budget
 * de débit par client (décision 11) ; le contrôle de l'origine vaut pour toute l'API
 * (`session.ts`).
 */
import { randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { COSEALG } from '@simplewebauthn/server/helpers';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import type { Cours } from '../../domaine/contenu/modele.js';
import { octetsDeLIdentifiant } from '../../domaine/identifiant-webauthn.js';
import { NOM_AFFICHE_MAX, nomValide } from '../../domaine/nom-affiche.js';
import type { Base } from '../base/base.js';
import { typeAppareil } from './appareil.js';
import { LIMITE_DEBIT_AUTH } from './debit.js';
import { creerMagasinDefis } from './defis.js';
import type { Depot, Lien, Octroi, PasskeyEnregistree, TypeLien } from './depot.js';
import { empreinte, memeEmpreinte, nouveauJeton } from './jetons.js';
import { fermerSession, ouvrirSession } from './session.js';

export interface OptionsRoutesAuth {
  base: Base;
  depot: Depot;
  /** Les cours chargés au démarrage : l'octroi d'une invitation ignore les autres. */
  cours: readonly Cours[];
  urlPublique: string;
  horloge: () => Date;
}

const LIEN_INVALIDE = { erreur: 'lien_invalide' };
const CONNEXION_IMPOSSIBLE = { erreur: 'connexion_impossible' };
const REQUETE = { erreur: 'requete' };

// Le classement d'accès de toutes ces routes (`../acces/`) : elles authentifient elles-mêmes.
const PUBLIQUE = { config: { acces: 'public' } } as const;

const NOM_DU_SITE = 'ancrage';
// Le nom que le téléphone garde avec la passkey est le nom affiché de la personne (1e-D6) : le
// pseudonyme qu'elle a choisi, gardé par le gestionnaire de mots de passe de son propre téléphone.
// Le serveur ne le donne à aucun autre service ; il passe par Cloudflare, comme tout échange avec
// le téléphone, et les sauvegardes le contiennent, comme toute la base (voir la notice).
// L'identifiant d'utilisateur reste l'UUID opaque de la personne. `NOM_PAR_DEFAUT` sert quand
// l'invitation ne dit pas de nom : le client précédent, encore précaché sur les téléphones,
// n'envoie que le jeton (invariant 8).
const NOM_PAR_DEFAUT = 'ancrage';
// Les algorithmes par défaut de SimpleWebAuthn, sans ML-DSA : encore expérimental dans Node, le
// sonder émet un avertissement.
const ALGORITHMES = [COSEALG.EdDSA, COSEALG.ES256, COSEALG.RS256];
// Seuls ces transports sont gardés : le reste est une donnée du client sans usage.
const TRANSPORTS_CONNUS: ReadonlySet<string> = new Set([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
]);
// Le détail d'une vérification WebAuthn ratée va au journal : le nom de l'erreur et son message,
// dont chaque segment entre guillemets devient `"…"`, tronqués. La bibliothèque cite entre guillemets
// ce qu'elle a reçu et ce qu'elle attendait, le défi de la cérémonie compris : seul le reste du
// message, qui dit ce qui diffère (origine, RP ID, type, compteur), reste lisible (2b-D8).
const DETAIL_MAX = 200;

// --- Les corps des requêtes ---

const enBase64url = (longueurMax: number) =>
  z
    .string()
    .max(longueurMax)
    .regex(/^[A-Za-z0-9_-]+$/);

const jeton = z.string().min(1).max(256);
const ceremonie = z.string().min(1).max(256);
/**
 * Un nom que la personne ou l'administration saisit : le nom affiché, le nom d'un groupe. La règle
 * est celle que le client applique aussi (`domaine/nom-affiche.ts`) ; le nom est gardé tel qu'après
 * `trim`.
 */
export function nomAffichable(longueurMax: number) {
  return z
    .string()
    .trim()
    .refine((nom) => nomValide(nom, longueurMax) !== undefined);
}

export const nomAffiche = nomAffichable(NOM_AFFICHE_MAX);
export const langue = z.enum(['de', 'fr']);
// Un identifiant de clé fait au plus 1023 octets (WebAuthn, § 5.1).
const identifiantCle = enBase64url(1400);

const reponseInscription = z.object({
  id: identifiantCle,
  rawId: identifiantCle,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: enBase64url(8192),
    attestationObject: enBase64url(65536),
    transports: z.array(z.string().max(32)).max(10).optional(),
  }),
});

const reponseAuthentification = z.object({
  id: identifiantCle,
  rawId: identifiantCle,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: enBase64url(8192),
    authenticatorData: enBase64url(8192),
    signature: enBase64url(2048),
    userHandle: enBase64url(128).optional(),
  }),
});

type ReponseInscription = z.infer<typeof reponseInscription>;
type ReponseAuthentification = z.infer<typeof reponseAuthentification>;

// Le nom est facultatif : le client précédent ne l'envoie pas (invariant 8).
const corpsOptionsInvitation = z.object({ jeton, nomAffiche: nomAffiche.optional() });
// Le nom d'un lien est celui de la personne : le corps n'en porte pas (un champ en plus : ignoré).
const corpsOptionsLien = z.object({ jeton });
const corpsInvitation = z.object({
  jeton,
  ceremonie,
  nomAffiche,
  langue,
  reponse: reponseInscription,
});
const corpsLien = z.object({ jeton, ceremonie, reponse: reponseInscription });
const corpsConnexion = z.object({ ceremonie, reponse: reponseAuthentification });

// --- Les cérémonies ---

interface CeremonieInscription {
  but: 'invitation' | 'lien';
  defi: string;
  /** Le lien pour lequel la cérémonie a été ouverte : elle ne vaut pas pour un autre. */
  empreinteLien: string;
  /** L'identifiant de la personne : à créer pour une invitation, existante pour un lien. */
  personne: string;
}

interface CeremonieConnexion {
  but: 'connexion';
  defi: string;
}

/**
 * L'identifiant d'utilisateur que garde la passkey : l'UUID de la personne, en UTF-8. Le client
 * signale le même, en base64url, tiré des mêmes octets (`octetsDeLIdentifiant`).
 */
function identifiantUtilisateur(personne: string): Uint8Array<ArrayBuffer> {
  return octetsDeLIdentifiant(personne);
}

/** Le résultat d'une vérification WebAuthn : sa valeur, ou de quoi diagnostiquer l'échec. */
type Verification<T> = { valeur: T } | { echec: string };

function echecDe(erreur: unknown): { echec: string } {
  const detail = erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : String(erreur);
  return { echec: detail.replace(/"[^"]*"/g, '"…"').slice(0, DETAIL_MAX) };
}

class Annulation extends Error {}

/** Exécute `ecrire` dans une transaction ; s'il rend `undefined`, tout est annulé. */
function enTransaction<T>(base: Base, ecrire: () => T | undefined): T | undefined {
  const transaction = base.sqlite.transaction(() => {
    const resultat = ecrire();
    if (resultat === undefined) {
      throw new Annulation();
    }
    return resultat;
  });
  try {
    return transaction.immediate();
  } catch (erreur) {
    if (erreur instanceof Annulation) {
      return undefined;
    }
    throw erreur;
  }
}

/**
 * Le motif, et pour WebAuthn le message de l'échec, vont au journal, pour l'exploitation ; la
 * réponse est la même pour tous.
 */
function refuser(
  reponse: FastifyReply,
  corps: object,
  motif: string,
  detail?: string,
): FastifyReply {
  reponse.log.info(
    detail === undefined ? { motif } : { motif, detail },
    'authentification refusée',
  );
  return reponse.code(400).send(corps);
}

export const routesAuth: FastifyPluginAsync<OptionsRoutesAuth> = async (routes, options) => {
  const { base, depot, horloge } = options;
  const { hostname: rpID, origin: origine } = new URL(options.urlPublique);
  const coursConnus: ReadonlySet<string> = new Set(options.cours.map((cours) => cours.id));
  const ceremonies = creerMagasinDefis<CeremonieInscription | CeremonieConnexion>(horloge);

  // Un seul crochet pour toutes les routes du plugin, donc un seul compteur : 120 requêtes par
  // minute et par client pour l'ensemble de `/api/auth/*`, et non 120 par route.
  routes.addHook('onRequest', routes.rateLimit(LIMITE_DEBIT_AUTH));

  // Un JSON illisible ou vide arrive aux routes comme un corps absent, que la validation refuse
  // (`requete`). L'analyse reste celle de Fastify, avec sa protection contre `__proto__`. Pas de
  // gestionnaire d'erreurs ici : relancé par lui, le refus de la limite de débit, qui n'est pas une
  // `Error` (voir `debit.ts`), partirait en 200.
  // Le type de Fastify mêle deux formes ; celle-ci est la forme à rappel, à trois arguments.
  const lireJson = routes.getDefaultJsonParser('error', 'error') as (
    requete: FastifyRequest,
    corps: string,
    fini: (erreur: Error | null, valeur?: unknown) => void,
  ) => void;
  routes.addContentTypeParser('application/json', { parseAs: 'string' }, (requete, corps, fini) => {
    lireJson(requete, corps as string, (erreur, valeur) => {
      fini(null, erreur === null ? valeur : undefined);
    });
  });

  function poserCeremonie(ceremonie: CeremonieInscription | CeremonieConnexion): string {
    const cle = nouveauJeton();
    ceremonies.poser(cle, ceremonie);
    return cle;
  }

  /** La cérémonie, prise (donc consommée), si elle a ce but et qu'elle a été ouverte pour ce lien. */
  function prendreCeremonieDeLien(
    cle: string,
    but: CeremonieInscription['but'],
    empreinteLien: string,
  ): CeremonieInscription | undefined {
    const ceremonie = ceremonies.prendre(cle);
    if (
      ceremonie === undefined ||
      ceremonie.but === 'connexion' ||
      ceremonie.but !== but ||
      !memeEmpreinte(ceremonie.empreinteLien, empreinteLien)
    ) {
      return undefined;
    }
    return ceremonie;
  }

  /**
   * Ouvre la session de `personne`, après avoir supprimé celle que portait la requête : un
   * téléphone qui se reconnecte ou change de compte ne laisse pas d'appareil fantôme. À appeler
   * dans la transaction de la cérémonie.
   */
  function remplacerSession(
    requete: FastifyRequest,
    reponse: FastifyReply,
    personne: string,
  ): string {
    if (requete.personne !== undefined) {
      depot.supprimerSession(requete.personne.sessionId, requete.personne.id);
    }
    return ouvrirSession(reponse, personne, requete.headers['user-agent']);
  }

  function lienUtilisable(empreinteLien: string, type: TypeLien): Lien | undefined {
    const lien = depot.lienUtilisable(empreinteLien, type);
    return lien !== undefined && memeEmpreinte(lien.empreinte, empreinteLien) ? lien : undefined;
  }

  async function optionsInscription(
    personne: string,
    exclues: readonly PasskeyEnregistree[],
    nom: string,
  ) {
    return generateRegistrationOptions({
      rpName: NOM_DU_SITE,
      rpID,
      userName: nom,
      userDisplayName: nom,
      userID: identifiantUtilisateur(personne),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: exclues.map(({ id, transports }) => ({ id, transports })),
      supportedAlgorithmIDs: ALGORITHMES,
    });
  }

  /** La clé de la réponse d'inscription, si SimpleWebAuthn la vérifie contre ce défi. */
  async function verifierInscription(
    reponse: ReponseInscription,
    defi: string,
  ): Promise<Verification<WebAuthnCredential>> {
    try {
      const verification = await verifyRegistrationResponse({
        response: { ...reponse, clientExtensionResults: {} },
        expectedChallenge: defi,
        expectedOrigin: origine,
        expectedRPID: rpID,
        // La vérification de l'utilisateur est « préférée » (décision 8), pas exigée.
        requireUserVerification: false,
        supportedAlgorithmIDs: ALGORITHMES,
      });
      return verification.verified
        ? { valeur: verification.registrationInfo.credential }
        : { echec: 'attestation non vérifiée' };
    } catch (erreur) {
      return echecDe(erreur);
    }
  }

  /** Le nouveau compteur de la clé, si SimpleWebAuthn vérifie l'assertion contre ce défi. */
  async function verifierAssertion(
    reponse: ReponseAuthentification,
    defi: string,
    passkey: PasskeyEnregistree,
  ): Promise<Verification<number>> {
    try {
      const verification = await verifyAuthenticationResponse({
        response: { ...reponse, clientExtensionResults: {} },
        expectedChallenge: defi,
        expectedOrigin: origine,
        expectedRPID: rpID,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.clePublique),
          counter: passkey.compteur,
          transports: passkey.transports,
        },
        requireUserVerification: false,
      });
      return verification.verified
        ? { valeur: verification.authenticationInfo.newCounter }
        : { echec: 'signature non vérifiée' };
    } catch (erreur) {
      return echecDe(erreur);
    }
  }

  function enregistrerPasskey(
    personne: string,
    cle: WebAuthnCredential,
    userAgent: string | undefined,
  ): void {
    depot.ajouterPasskey({
      id: cle.id,
      personne,
      clePublique: cle.publicKey,
      compteur: cle.counter,
      transports: [...new Set(cle.transports ?? [])].filter((transport) =>
        TRANSPORTS_CONNUS.has(transport),
      ),
      appareil: typeAppareil(userAgent),
    });
  }

  /**
   * Les groupes et les droits de l'invitation. Un groupe supprimé ou un cours retiré depuis sont
   * ignorés. Les droits sont personnels : l'invitation n'ouvre jamais un cours à un groupe.
   */
  function appliquerOctroi(personne: string, octroi: Octroi): void {
    const groupesExistants = new Set(depot.groupes().map((groupe) => groupe.id));
    for (const groupe of octroi.groupes) {
      if (groupesExistants.has(groupe)) {
        depot.ajouterMembre(groupe, personne);
      }
    }
    for (const cours of octroi.cours) {
      if (coursConnus.has(cours)) {
        depot.autoriser({ cours, sujet: { type: 'personne', id: personne } });
      }
    }
  }

  // --- Invitation ---

  routes.post('/api/auth/invitation/options', PUBLIQUE, async (requete, reponse) => {
    const corps = corpsOptionsInvitation.safeParse(requete.body);
    if (!corps.success) {
      return refuser(reponse, REQUETE, 'corps');
    }
    const empreinteLien = empreinte(corps.data.jeton);
    const lien = lienUtilisable(empreinteLien, 'invitation');
    if (lien === undefined || (lien.proprietaire && depot.existeProprietaire())) {
      return refuser(reponse, LIEN_INVALIDE, 'lien');
    }
    // L'identifiant du compte à créer : la passkey le garde dès l'inscription.
    const personne = randomUUID();
    const optionsWebAuthn = await optionsInscription(
      personne,
      [],
      corps.data.nomAffiche ?? NOM_PAR_DEFAUT,
    );
    const cle = poserCeremonie({
      but: 'invitation',
      defi: optionsWebAuthn.challenge,
      empreinteLien,
      personne,
    });
    return { options: optionsWebAuthn, ceremonie: cle };
  });

  routes.post('/api/auth/invitation', PUBLIQUE, async (requete, reponse) => {
    const corps = corpsInvitation.safeParse(requete.body);
    if (!corps.success) {
      return refuser(reponse, REQUETE, 'corps');
    }
    const empreinteLien = empreinte(corps.data.jeton);
    const ceremonie = prendreCeremonieDeLien(corps.data.ceremonie, 'invitation', empreinteLien);
    if (ceremonie === undefined) {
      return refuser(reponse, LIEN_INVALIDE, 'cérémonie');
    }
    const verification = await verifierInscription(corps.data.reponse, ceremonie.defi);
    if ('echec' in verification) {
      return refuser(reponse, LIEN_INVALIDE, 'webauthn', verification.echec);
    }
    const cle = verification.valeur;
    const userAgent = requete.headers['user-agent'];
    const personne = enTransaction(base, () => {
      const lien = depot.consommerLien(empreinteLien, 'invitation');
      if (
        lien === undefined ||
        // Jamais deux propriétaires, même si deux invitations de propriétaire ont circulé.
        (lien.proprietaire && depot.existeProprietaire()) ||
        depot.passkey(cle.id) !== undefined
      ) {
        return undefined;
      }
      const { id } = depot.creerPersonne({
        id: ceremonie.personne,
        nomAffiche: corps.data.nomAffiche,
        langue: corps.data.langue,
        proprietaire: lien.proprietaire,
      });
      enregistrerPasskey(id, cle, userAgent);
      appliquerOctroi(id, lien.octroi);
      remplacerSession(requete, reponse, id);
      return id;
    });
    if (personne === undefined) {
      return refuser(reponse, LIEN_INVALIDE, 'écriture');
    }
    return { personne };
  });

  // --- Connexion ---

  routes.post('/api/auth/connexion/options', PUBLIQUE, async () => {
    // Sans `allowCredentials` : le téléphone propose lui-même les passkeys du site.
    const optionsWebAuthn = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });
    const cle = poserCeremonie({ but: 'connexion', defi: optionsWebAuthn.challenge });
    return { options: optionsWebAuthn, ceremonie: cle };
  });

  routes.post('/api/auth/connexion', PUBLIQUE, async (requete, reponse) => {
    const corps = corpsConnexion.safeParse(requete.body);
    if (!corps.success) {
      return refuser(reponse, REQUETE, 'corps');
    }
    const ceremonie = ceremonies.prendre(corps.data.ceremonie);
    if (ceremonie?.but !== 'connexion') {
      return refuser(reponse, CONNEXION_IMPOSSIBLE, 'cérémonie');
    }
    const assertion = corps.data.reponse;
    const passkey = depot.passkey(assertion.id);
    if (passkey === undefined) {
      return refuser(reponse, CONNEXION_IMPOSSIBLE, 'passkey');
    }
    // S'il est rendu, l'identifiant d'utilisateur doit être celui de la personne de la clé.
    const { userHandle } = assertion.response;
    const attendu = Buffer.from(identifiantUtilisateur(passkey.personne)).toString('base64url');
    if (userHandle !== undefined && userHandle !== attendu) {
      return refuser(reponse, CONNEXION_IMPOSSIBLE, 'utilisateur');
    }
    const verification = await verifierAssertion(assertion, ceremonie.defi, passkey);
    if ('echec' in verification) {
      return refuser(reponse, CONNEXION_IMPOSSIBLE, 'webauthn', verification.echec);
    }
    const compteur = verification.valeur;
    const session = enTransaction(base, () => {
      // Pendant la vérification, la clé a pu être supprimée, ou servir à une autre connexion.
      if (depot.passkey(passkey.id)?.compteur !== passkey.compteur) {
        return undefined;
      }
      depot.majCompteurPasskey(passkey.id, compteur);
      return remplacerSession(requete, reponse, passkey.personne);
    });
    if (session === undefined) {
      return refuser(reponse, CONNEXION_IMPOSSIBLE, 'écriture');
    }
    return reponse.code(204).send();
  });

  // --- Lien de secours ---

  routes.post('/api/auth/lien/options', PUBLIQUE, async (requete, reponse) => {
    const corps = corpsOptionsLien.safeParse(requete.body);
    if (!corps.success) {
      return refuser(reponse, REQUETE, 'corps');
    }
    const empreinteLien = empreinte(corps.data.jeton);
    const personne = lienUtilisable(empreinteLien, 'connexion')?.personne;
    if (personne === undefined || personne === null) {
      return refuser(reponse, LIEN_INVALIDE, 'lien');
    }
    // Ses passkeys sont exclues : le téléphone n'en recrée pas une qu'il a déjà.
    const optionsWebAuthn = await optionsInscription(
      personne,
      depot.passkeysDe(personne),
      depot.personne(personne)?.nomAffiche ?? NOM_PAR_DEFAUT,
    );
    const cle = poserCeremonie({
      but: 'lien',
      defi: optionsWebAuthn.challenge,
      empreinteLien,
      personne,
    });
    return { options: optionsWebAuthn, ceremonie: cle };
  });

  routes.post('/api/auth/lien', PUBLIQUE, async (requete, reponse) => {
    const corps = corpsLien.safeParse(requete.body);
    if (!corps.success) {
      return refuser(reponse, REQUETE, 'corps');
    }
    const empreinteLien = empreinte(corps.data.jeton);
    const ceremonie = prendreCeremonieDeLien(corps.data.ceremonie, 'lien', empreinteLien);
    if (ceremonie === undefined) {
      return refuser(reponse, LIEN_INVALIDE, 'cérémonie');
    }
    const verification = await verifierInscription(corps.data.reponse, ceremonie.defi);
    if ('echec' in verification) {
      return refuser(reponse, LIEN_INVALIDE, 'webauthn', verification.echec);
    }
    const cle = verification.valeur;
    const session = enTransaction(base, () => {
      const lien = depot.consommerLien(empreinteLien, 'connexion');
      if (
        lien === undefined ||
        lien.personne !== ceremonie.personne ||
        depot.passkey(cle.id) !== undefined
      ) {
        return undefined;
      }
      enregistrerPasskey(ceremonie.personne, cle, requete.headers['user-agent']);
      return remplacerSession(requete, reponse, ceremonie.personne);
    });
    if (session === undefined) {
      return refuser(reponse, LIEN_INVALIDE, 'écriture');
    }
    return reponse.code(204).send();
  });

  // --- Déconnexion ---

  routes.post('/api/auth/deconnexion', PUBLIQUE, async (requete, reponse) => {
    fermerSession(requete, reponse);
    return reponse.code(204).send();
  });
};
