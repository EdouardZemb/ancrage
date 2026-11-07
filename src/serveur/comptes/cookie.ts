/*
 * Le nom du cookie de session, seul, sans dépendance : le test de bout en bout l'importe d'ici
 * plutôt que de `session.ts`, qui tire Fastify et le dépôt.
 */
export const NOM_COOKIE_SESSION = 'ancrage_session';
