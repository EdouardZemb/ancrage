/*
 * La réponse JSON que les tests du client font rendre à un `fetch` factice (1f-D4). Exclu de la
 * construction, comme tout `*.fixture.*`.
 */

/** Une réponse HTTP dont le corps est `corps`, en JSON ; 200 par défaut. */
export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}
