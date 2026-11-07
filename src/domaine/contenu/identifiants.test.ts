import { describe, expect, it } from 'vitest';
import {
  ALPHABET_IDENTIFIANT,
  estIdentifiant,
  FORMAT_IDENTIFIANT,
  nouvelIdentifiant,
} from './identifiants.js';

describe('identifiants', () => {
  it('format_et_alphabet', () => {
    expect(ALPHABET_IDENTIFIANT).toHaveLength(32);
    expect(new Set(ALPHABET_IDENTIFIANT).size).toBe(32);

    for (let i = 0; i < 1000; i++) {
      const id = nouvelIdentifiant(new Set());
      expect(id).toMatch(FORMAT_IDENTIFIANT);
      expect(id).not.toMatch(/[ilou]/);
    }
  });

  it('evite_les_identifiants_pris', () => {
    const reponses = [new Uint8Array(8).fill(10), new Uint8Array(8).fill(11)];
    const aleatoire = (n: number): Uint8Array => {
      expect(n).toBe(8);
      return reponses.shift() ?? new Uint8Array(n);
    };

    expect(nouvelIdentifiant(new Set(['aaaaaaaa']), aleatoire)).toBe('bbbbbbbb');
    expect(reponses).toHaveLength(0);
  });

  it('reconnait_un_identifiant', () => {
    expect(estIdentifiant('abcdefgh')).toBe(true);
    expect(estIdentifiant('abcdefgi')).toBe(false);
    expect(estIdentifiant('ABCDEFGH')).toBe(false);
    expect(estIdentifiant('abc')).toBe(false);
    expect(estIdentifiant(12345678)).toBe(false);
  });
});
