import type { ReponseSante } from '../domaine/sante.js';

export async function lireSante(recuperer: typeof fetch = fetch): Promise<ReponseSante> {
  const reponse = await recuperer('/api/sante');
  if (!reponse.ok) {
    throw new Error('serveur injoignable');
  }
  return (await reponse.json()) as ReponseSante;
}
