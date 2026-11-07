import { describe, expect, it } from 'vitest';
import { type Cadre, cibleSous, placer, retirer } from './glisser.js';

/* Données factices, écrites à la main (invariant 7). */

/** Deux cases l'une sous l'autre, comme sur un téléphone : 300 px de large, 48 px de haut. */
const cadre = (haut: number): Cadre => ({ gauche: 10, haut, droite: 310, bas: haut + 48 });
const CIBLES = [
  { id: 'fb000001', cadre: cadre(100) },
  { id: 'fb000002', cadre: cadre(160) },
];

describe('glisser', () => {
  it('cible_sous_le_point', () => {
    expect(cibleSous(150, 120, CIBLES)).toBe('fb000001');
    expect(cibleSous(150, 200, CIBLES)).toBe('fb000002');
    // Les bords sont dans la case.
    expect(cibleSous(10, 100, CIBLES)).toBe('fb000001');
    expect(cibleSous(310, 148, CIBLES)).toBe('fb000001');
    expect(cibleSous(310, 208, CIBLES)).toBe('fb000002');
  });

  it('aucune_cible_hors_des_cadres', () => {
    // Entre les deux cases, à gauche, à droite, au-dessus, au-dessous.
    expect(cibleSous(150, 154, CIBLES)).toBeNull();
    expect(cibleSous(9, 120, CIBLES)).toBeNull();
    expect(cibleSous(311, 120, CIBLES)).toBeNull();
    expect(cibleSous(150, 99, CIBLES)).toBeNull();
    expect(cibleSous(150, 209, CIBLES)).toBeNull();
    expect(cibleSous(150, 120, [])).toBeNull();
  });

  it('appariement_deplace_l_occupant', () => {
    const avant = new Map([
      ['fb000011', 'fb000011'],
      ['fb000012', 'fb000013'],
    ]);

    // La case occupée reçoit le nouveau terme ; l'ancien retourne dans la réserve.
    const apres = placer(avant, 'fb000013', 'fb000011', true);
    expect(apres).toEqual(
      new Map([
        ['fb000012', 'fb000013'],
        ['fb000013', 'fb000011'],
      ]),
    );
    // Un terme posé qui change de case libère la sienne ; l'entrée n'est jamais touchée.
    expect(placer(apres, 'fb000012', 'fb000014', true)).toEqual(
      new Map([
        ['fb000012', 'fb000014'],
        ['fb000013', 'fb000011'],
      ]),
    );
    expect(avant.get('fb000011')).toBe('fb000011');
    expect(avant.has('fb000013')).toBe(false);
  });

  it('classement_accepte_plusieurs_termes', () => {
    const avant = new Map([['fb000021', 'Tempo']]);

    const apres = placer(avant, 'fb000022', 'Tempo', false);
    expect(apres).toEqual(
      new Map([
        ['fb000021', 'Tempo'],
        ['fb000022', 'Tempo'],
      ]),
    );
    // Un terme posé change de zone, sans déloger les autres.
    expect(placer(apres, 'fb000021', 'Lage', false)).toEqual(
      new Map([
        ['fb000021', 'Lage'],
        ['fb000022', 'Tempo'],
      ]),
    );
    expect(avant.has('fb000022')).toBe(false);
  });

  it('retirer_rend_le_terme', () => {
    const avant = new Map([
      ['fb000021', 'Tempo'],
      ['fb000022', 'Tempo'],
    ]);

    expect(retirer(avant, 'fb000021')).toEqual(new Map([['fb000022', 'Tempo']]));
    // Un terme déjà dans la réserve : rien ne change.
    expect(retirer(avant, 'fb000023')).toEqual(avant);
    expect(avant.size).toBe(2);
  });
});
