import { describe, expect, it } from 'vitest';
import { octetsDeLIdentifiant } from './identifiant-webauthn.js';

describe('octetsDeLIdentifiant', () => {
  it('octets_utf8_de_l_identifiant', () => {
    // « p-0001 » en ASCII : un octet par caractère.
    expect(Array.from(octetsDeLIdentifiant('p-0001'))).toEqual([
      0x70, 0x2d, 0x30, 0x30, 0x30, 0x31,
    ]);
    // L'UTF-8, pas le latin-1 : « é » tient sur deux octets.
    expect(Array.from(octetsDeLIdentifiant('é'))).toEqual([0xc3, 0xa9]);
  });
});
