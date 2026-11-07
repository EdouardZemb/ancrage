import { describe, expect, it } from 'vitest';
import { texteDeVersion } from './version.js';

const sante = {
  statut: 'ok',
  environnement: 'prod',
  version: '0.7.3',
  revision: 'e3cf6c29450f15fe',
  schema: 4,
  instance: 'x',
} as const;

describe('texteDeVersion', () => {
  it('version_du_serveur_quand_le_telephone_a_le_meme_code', () => {
    expect(texteDeVersion(sante, 'e3cf6c29450f15fe', 'Gerät: {revision}')).toBe(
      'prod · 0.7.3 · e3cf6c2',
    );
  });

  it('version_du_telephone_ajoutee_quand_elle_differe', () => {
    expect(texteDeVersion(sante, 'a577526e92197b53', 'Gerät: {revision}')).toBe(
      'prod · 0.7.3 · e3cf6c2 · Gerät: a577526',
    );
  });
});
