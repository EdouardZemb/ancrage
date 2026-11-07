/*
 * Ce que les tests des routes se partagent pour lire une réponse de l'application (1f-D4 : une
 * seule copie). Exclu de la construction, comme tout `*.fixture.ts`.
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

/**
 * Le statut, les en-têtes et le corps : de quoi comparer deux réponses à l'octet près. Sauf la
 * date, qui change d'une seconde à l'autre.
 */
export function empreinteReponse(reponse: LightMyRequestResponse) {
  const { date: _date, ...entetes } = reponse.headers;
  return { statut: reponse.statusCode, entetes, corps: reponse.body };
}

/** Une lecture, avec le cookie de session `jeton` s'il y en a un. */
export async function demander(
  app: FastifyInstance,
  url: string,
  jeton?: string,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

/** Les cookies que la réponse pose (`set-cookie`), un par ligne. */
export function cookiesPoses(reponse: LightMyRequestResponse): string[] {
  const entete = reponse.headers['set-cookie'];
  if (entete === undefined) {
    return [];
  }
  return Array.isArray(entete) ? entete : [entete];
}

/**
 * Le message de l'erreur qui empêche `app` de démarrer, ou `'démarrée'`. Vitest ne sait pas
 * afficher une instance de Fastify : `rejects` sur un démarrage réussi donnerait un message illisible.
 */
export async function issueDuDemarrage(app: FastifyInstance): Promise<string> {
  return app.ready().then(
    () => 'démarrée',
    (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)),
  );
}
