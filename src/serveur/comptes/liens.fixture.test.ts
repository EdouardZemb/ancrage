import { describe, expect, it } from 'vitest';
import { jetonDuLien } from './liens.fixture.js';
import { ORIGINE_DE_TEST } from './webauthn.fixture.js';

// Un jeton factice de 43 caractères base64url, écrit à la main (invariant 7).
const JETON = `${'aB3_-'.repeat(8)}xyz`;

describe('jetonDuLien', () => {
  it('jeton_d_un_lien_d_invitation', () => {
    const lien = `${ORIGINE_DE_TEST}/invitation/${JETON}`;

    expect(JETON).toHaveLength(43);
    expect(jetonDuLien(lien, { ecran: 'invitation', origine: ORIGINE_DE_TEST })).toBe(JETON);
    // L'origine n'est contrôlée que si elle est donnée.
    expect(jetonDuLien(lien, { ecran: 'invitation' })).toBe(JETON);
    expect(jetonDuLien(`${ORIGINE_DE_TEST}/lien/${JETON}`, { ecran: 'lien' })).toBe(JETON);
  });

  it('sans_attendu_le_dernier_segment', () => {
    // Sans `attendu`, ni l'écran, ni la longueur, ni l'origine ne sont contrôlés.
    expect(jetonDuLien(`${ORIGINE_DE_TEST}/invitation/${JETON}`)).toBe(JETON);
    expect(jetonDuLien('http://ailleurs.example/lien/court')).toBe('court');
  });

  it('lien_sans_jeton_leve', () => {
    for (const lien of ['', `${ORIGINE_DE_TEST}/lien/`]) {
      expect(() => jetonDuLien(lien)).toThrow(`lien inattendu : ${lien}`);
      expect(() => jetonDuLien(lien, { ecran: 'lien' })).toThrow(`lien inattendu : ${lien}`);
    }
  });

  it('ecran_inattendu_leve', () => {
    const lienDeConnexion = `${ORIGINE_DE_TEST}/lien/${JETON}`;
    const lienDInvitation = `${ORIGINE_DE_TEST}/invitation/${JETON}`;

    expect(() => jetonDuLien(lienDeConnexion, { ecran: 'invitation' })).toThrow(
      `lien inattendu : ${lienDeConnexion}`,
    );
    expect(() => jetonDuLien(lienDInvitation, { ecran: 'lien', origine: ORIGINE_DE_TEST })).toThrow(
      `lien inattendu : ${lienDInvitation}`,
    );
    // Un écran qui n'est qu'un suffixe de l'écran attendu n'est pas l'écran attendu.
    const lienDEcranVoisin = `${ORIGINE_DE_TEST}/anti-lien/${JETON}`;
    expect(() => jetonDuLien(lienDEcranVoisin, { ecran: 'lien' })).toThrow(
      `lien inattendu : ${lienDEcranVoisin}`,
    );
  });

  it('origine_inattendue_leve', () => {
    const lien = `https://ailleurs.example/invitation/${JETON}`;

    expect(() => jetonDuLien(lien, { ecran: 'invitation', origine: ORIGINE_DE_TEST })).toThrow(
      `lien inattendu : ${lien}`,
    );
    // Une origine qui n'est qu'un préfixe de celle du lien n'est pas la sienne.
    const lienDUnPortVoisin = `${ORIGINE_DE_TEST}0/invitation/${JETON}`;
    expect(() =>
      jetonDuLien(lienDUnPortVoisin, { ecran: 'invitation', origine: ORIGINE_DE_TEST }),
    ).toThrow(`lien inattendu : ${lienDUnPortVoisin}`);
  });

  it('jeton_trop_court_leve', () => {
    const lien = `${ORIGINE_DE_TEST}/invitation/${JETON.slice(0, 42)}`;

    expect(() => jetonDuLien(lien, { ecran: 'invitation', origine: ORIGINE_DE_TEST })).toThrow(
      `lien inattendu : ${lien}`,
    );
    // Trop long, ou hors de l'alphabet base64url : pas un jeton non plus.
    for (const jeton of [`${JETON}a`, `${JETON.slice(0, 42)}+`, `${JETON.slice(0, 42)}=`]) {
      const autre = `${ORIGINE_DE_TEST}/invitation/${jeton}`;
      expect(() => jetonDuLien(autre, { ecran: 'invitation' })).toThrow(
        `lien inattendu : ${autre}`,
      );
    }
  });
});
