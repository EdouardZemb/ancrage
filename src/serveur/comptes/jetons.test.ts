import { describe, expect, it } from 'vitest';
import { empreinte, memeEmpreinte, nouveauJeton } from './jetons.js';

describe('jetons', () => {
  it('jeton_de_256_bits_base64url', () => {
    const jeton = nouveauJeton();

    // 32 octets en base64url, sans remplissage : 43 caractères.
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(jeton, 'base64url')).toHaveLength(32);
    expect(nouveauJeton()).not.toBe(jeton);
  });

  it('empreinte_stable_et_differente_du_jeton', () => {
    const jeton = nouveauJeton();

    expect(empreinte(jeton)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte(jeton)).toBe(empreinte(jeton));
    expect(empreinte(jeton)).not.toBe(jeton);
    expect(empreinte(jeton)).not.toBe(empreinte(nouveauJeton()));
    // Le SHA-256 de « abc » (FIPS 180-2).
    expect(empreinte('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('meme_empreinte_longueurs_differentes_faux', () => {
    const a = empreinte('a');

    expect(memeEmpreinte(a, a)).toBe(true);
    expect(memeEmpreinte(a, empreinte('b'))).toBe(false);
    expect(memeEmpreinte(a, a.slice(0, -1))).toBe(false);
    expect(memeEmpreinte(a, `${a}0`)).toBe(false);
    expect(memeEmpreinte(a, '')).toBe(false);
  });
});
