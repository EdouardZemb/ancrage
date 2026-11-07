import { describe, expect, it } from 'vitest';
import type { ReponseSante } from '../domaine/sante.js';
import { lireSante } from './sante.js';

const CORPS: ReponseSante = {
  statut: 'ok',
  environnement: 'ci',
  version: '1.2.3',
  revision: 'abcdef0123456789',
  schema: 1,
  instance: 'i-1',
};

describe('lireSante', () => {
  it('lire_sante_renvoie_le_corps', async () => {
    const appels: string[] = [];
    const recuperer = (async (entree: string | URL | Request) => {
      appels.push(String(entree));
      return new Response(JSON.stringify(CORPS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const sante = await lireSante(recuperer);

    expect(sante).toEqual(CORPS);
    expect(appels).toEqual(['/api/sante']);
  });

  it('lire_sante_leve_si_503', async () => {
    const recuperer = (async () =>
      new Response(JSON.stringify({ statut: 'ko' }), { status: 503 })) as typeof fetch;

    await expect(lireSante(recuperer)).rejects.toThrow('serveur injoignable');
  });
});
