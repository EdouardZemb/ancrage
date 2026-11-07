/*
 * Ce que les tests des routes de compte et d'administration, et ceux de la commande `cli`, font
 * d'un lien rendu par le serveur : en lire le jeton (et, au besoin, en contrôler la forme), et
 * demander les options de sa cérémonie, que le serveur refuse (`lien_invalide`) dès que le lien
 * n'est plus utilisable. Exclu de la construction, comme tout `*.fixture.ts`.
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { ORIGINE_DE_TEST } from './webauthn.fixture.js';

/** Un jeton : 32 octets en base64url, sans remplissage. */
const JETON = /^[A-Za-z0-9_-]{43}$/;

/**
 * Le jeton d'un lien rendu par l'API : le dernier segment de l'adresse.
 *
 * Avec `attendu`, le lien doit valoir `<origine>/<écran>/<jeton de 43 caractères base64url>` : un
 * test qui contrôlait la forme d'un lien la contrôle ainsi en le lisant. L'origine n'est contrôlée
 * que si elle est donnée. Un lien qui ne convient pas lève `lien inattendu`.
 */
export function jetonDuLien(
  lien: string,
  attendu?: { ecran: 'invitation' | 'lien'; origine?: string },
): string {
  const jeton = lien.split('/').at(-1);
  if (jeton === undefined || jeton === '') {
    throw new Error(`lien inattendu : ${lien}`);
  }
  if (attendu !== undefined) {
    // Tout ce qui précède le jeton, barre finale comprise.
    const avant = lien.slice(0, lien.length - jeton.length);
    const ecran = `/${attendu.ecran}/`;
    const conforme =
      JETON.test(jeton) &&
      (attendu.origine === undefined
        ? avant.endsWith(ecran)
        : avant === `${attendu.origine}${ecran}`);
    if (!conforme) {
      throw new Error(`lien inattendu : ${lien}`);
    }
  }
  return jeton;
}

/** 200 si le lien est utilisable, 400 `lien_invalide` sinon (sans rien consommer). */
export async function demanderOptionsDeLien(
  app: FastifyInstance,
  jeton: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/lien/options',
    headers: { origin: ORIGINE_DE_TEST },
    payload: { jeton },
  });
}
