/*
 * Un authentificateur WebAuthn de test : une paire de clés ES256 (P-256) qui fabrique de vraies
 * réponses, une inscription avec attestation `none` et des assertions signées. Le serveur les
 * vérifie avec SimpleWebAuthn, sans rien simuler. Comme un téléphone, l'authentificateur garde
 * l'identifiant d'utilisateur reçu à l'inscription et le rend dans chaque assertion (`userHandle`).
 * Exclu de la construction, comme tout `*.fixture.ts`.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

/** L'origine de `urlPublique` par défaut en `ci`. */
export const ORIGINE_DE_TEST = 'http://localhost:3000';

// Les drapeaux des données d'authentificateur (WebAuthn, § 6.1).
const PRESENCE = 0x01;
const VERIFICATION = 0x04;
const DONNEES_ATTESTEES = 0x40;

// COSE (RFC 9053) : clé EC2, algorithme ES256, courbe P-256.
const COSE_KTY = 1;
const COSE_ALG = 3;
const COSE_CRV = -1;
const COSE_X = -2;
const COSE_Y = -3;
const KTY_EC2 = 2;
const ALG_ES256 = -7;
const CRV_P256 = 1;

// --- Un encodeur CBOR (RFC 8949) réduit à ce qu'il faut ici ---

type ValeurCbor = number | string | Uint8Array | Map<ValeurCbor, ValeurCbor>;

function enteteCbor(typeMajeur: number, argument: number): Buffer {
  if (argument < 24) {
    return Buffer.from([(typeMajeur << 5) | argument]);
  }
  if (argument < 0x100) {
    return Buffer.from([(typeMajeur << 5) | 24, argument]);
  }
  if (argument < 0x10000) {
    const entete = Buffer.alloc(3);
    entete[0] = (typeMajeur << 5) | 25;
    entete.writeUInt16BE(argument, 1);
    return entete;
  }
  throw new Error('CBOR : argument trop grand pour cet encodeur');
}

function cbor(valeur: ValeurCbor): Buffer {
  if (typeof valeur === 'number') {
    return valeur >= 0 ? enteteCbor(0, valeur) : enteteCbor(1, -1 - valeur);
  }
  if (typeof valeur === 'string') {
    const octets = Buffer.from(valeur, 'utf8');
    return Buffer.concat([enteteCbor(3, octets.length), octets]);
  }
  if (valeur instanceof Uint8Array) {
    return Buffer.concat([enteteCbor(2, valeur.length), valeur]);
  }
  const paires = [...valeur].flatMap(([cle, contenu]) => [cbor(cle), cbor(contenu)]);
  return Buffer.concat([enteteCbor(5, valeur.size), ...paires]);
}

function sha256(donnees: string | Uint8Array): Buffer {
  return createHash('sha256').update(donnees).digest();
}

function base64url(octets: Uint8Array): string {
  return Buffer.from(octets).toString('base64url');
}

/** Ce qu'un test peut fausser dans une réponse, pour vérifier que le serveur la refuse. */
export interface Surcharge {
  defi?: string;
  origine?: string;
  rpId?: string;
  /** Le `type` de `clientDataJSON`. */
  type?: string;
  compteur?: number;
  /** La présence de l'utilisateur (un geste sur le téléphone) : constatée par défaut. */
  presence?: boolean;
  /** La vérification de l'utilisateur (empreinte, code) : faite par défaut. */
  verification?: boolean;
  /** L'identifiant d'utilisateur rendu par l'assertion ; `null` pour n'en rendre aucun. */
  userHandle?: string | null;
}

/** Les champs des options d'inscription que lit un authentificateur. */
export interface OptionsInscription {
  challenge: string;
  rp: { id?: string };
  user: { id: string };
}

/** Les champs des options d'authentification que lit un authentificateur. */
export interface OptionsAuthentification {
  challenge: string;
  rpId?: string;
}

function donneesClient(type: string, defi: string, origine: string): Buffer {
  return Buffer.from(
    JSON.stringify({ type, challenge: defi, origin: origine, crossOrigin: false }),
  );
}

function donneesAuthentificateur(
  rpId: string,
  drapeaux: number,
  compteur: number,
  donneesAttestees: Buffer = Buffer.alloc(0),
): Buffer {
  const octetsCompteur = Buffer.alloc(4);
  octetsCompteur.writeUInt32BE(compteur);
  return Buffer.concat([sha256(rpId), Buffer.from([drapeaux]), octetsCompteur, donneesAttestees]);
}

export interface Authentificateur {
  /** L'identifiant de la clé, en base64url. */
  idCle: string;
  inscription(options: OptionsInscription, surcharge?: Surcharge): RegistrationResponseJSON;
  assertion(options: OptionsAuthentification, surcharge?: Surcharge): AuthenticationResponseJSON;
}

/** Un authentificateur neuf : une paire de clés et un identifiant de clé tirés au hasard. */
export function creerAuthentificateur(): Authentificateur {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cleCose = cbor(
    new Map<ValeurCbor, ValeurCbor>([
      [COSE_KTY, KTY_EC2],
      [COSE_ALG, ALG_ES256],
      [COSE_CRV, CRV_P256],
      [COSE_X, Buffer.from(jwk.x ?? '', 'base64url')],
      [COSE_Y, Buffer.from(jwk.y ?? '', 'base64url')],
    ]),
  );
  const octetsIdCle = randomBytes(32);
  const idCle = base64url(octetsIdCle);
  // Comme une clé résidente : l'identifiant d'utilisateur reçu à l'inscription.
  let utilisateur: string | undefined;

  function drapeaux(surcharge: Surcharge): number {
    return (
      (surcharge.presence === false ? 0 : PRESENCE) |
      (surcharge.verification === false ? 0 : VERIFICATION)
    );
  }

  return {
    idCle,

    inscription(options, surcharge = {}) {
      utilisateur = options.user.id;
      const longueurId = Buffer.alloc(2);
      longueurId.writeUInt16BE(octetsIdCle.length);
      const donneesAttestees = Buffer.concat([
        Buffer.alloc(16), // AAGUID nul, comme le donne l'attestation `none`.
        longueurId,
        octetsIdCle,
        cleCose,
      ]);
      const authData = donneesAuthentificateur(
        surcharge.rpId ?? options.rp.id ?? '',
        drapeaux(surcharge) | DONNEES_ATTESTEES,
        surcharge.compteur ?? 0,
        donneesAttestees,
      );
      const attestation = cbor(
        new Map<ValeurCbor, ValeurCbor>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      );
      const clientData = donneesClient(
        surcharge.type ?? 'webauthn.create',
        surcharge.defi ?? options.challenge,
        surcharge.origine ?? ORIGINE_DE_TEST,
      );
      return {
        id: idCle,
        rawId: idCle,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientData),
          attestationObject: base64url(attestation),
          transports: ['hybrid', 'internal'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },

    assertion(options, surcharge = {}) {
      const authData = donneesAuthentificateur(
        surcharge.rpId ?? options.rpId ?? '',
        drapeaux(surcharge),
        surcharge.compteur ?? 0,
      );
      const clientData = donneesClient(
        surcharge.type ?? 'webauthn.get',
        surcharge.defi ?? options.challenge,
        surcharge.origine ?? ORIGINE_DE_TEST,
      );
      // ECDSA en DER, sur les données de l'authentificateur suivies de l'empreinte du client.
      const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), privateKey);
      const userHandle = surcharge.userHandle === undefined ? utilisateur : surcharge.userHandle;
      return {
        id: idCle,
        rawId: idCle,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientData),
          authenticatorData: base64url(authData),
          signature: base64url(signature),
          ...(userHandle === null || userHandle === undefined ? {} : { userHandle }),
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
  };
}
