import { describe, expect, it } from 'vitest';
import { distance, egalStrict, juger } from './correction.js';

describe('correction', () => {
  it('distance_de_levenshtein', () => {
    expect(distance('', '')).toBe(0);
    expect(distance('abc', '')).toBe(3);
    expect(distance('', 'abc')).toBe(3);
    expect(distance('zystitis', 'zystitis')).toBe(0);
    expect(distance('kitten', 'sitting')).toBe(3);
    expect(distance('zystits', 'zystitis')).toBe(1);
  });

  it('juger_juste_presque_faux', () => {
    const acceptees = new Set(['zystitis']);
    const cas: [string, { juste: boolean; presque: boolean }][] = [
      ['Zystitis', { juste: true, presque: false }],
      ['cystitis', { juste: true, presque: false }],
      ['Zystits', { juste: false, presque: true }],
      ['Gastritis', { juste: false, presque: false }],
      ['', { juste: false, presque: false }],
    ];
    for (const [saisie, attendu] of cas) {
      expect(juger(saisie, acceptees), saisie).toEqual(attendu);
    }
  });

  it('juger_presque_selon_la_longueur_de_la_saisie', () => {
    const faux = { juste: false, presque: false };
    const presque = { juste: false, presque: true };
    // Jusqu'à 9 caractères, une faute au plus ; au-delà de 9, deux.
    expect(juger('zystit', new Set(['zystitis']))).toEqual(faux);
    expect(juger('zystiis', new Set(['zystitis']))).toEqual(presque);
    expect(juger('gastritis', new Set(['gastritisss']))).toEqual(faux);
    expect(juger('gastritiss', new Set(['gastritissss']))).toEqual(presque);
    expect(juger('hepatosplenomegal', new Set(['hepatosplenomegalie']))).toEqual(presque);
    expect(juger('hepatosplenomega', new Set(['hepatosplenomegalie']))).toEqual(faux);
  });

  it('juger_presque_exige_quatre_caracteres_et_prend_la_plus_petite_distance', () => {
    expect(juger('zys', new Set(['zyst']))).toEqual({ juste: false, presque: false });
    expect(juger('zyst', new Set(['zysx']))).toEqual({ juste: false, presque: true });
    expect(juger('zystitis', new Set(['gastritis', 'zystitus']))).toEqual({
      juste: false,
      presque: true,
    });
    expect(juger('zystitis', new Set())).toEqual({ juste: false, presque: false });
  });

  it('egal_strict', () => {
    const x = 'Zitrusfrucht';
    expect(egalStrict('Citrusfrucht', 'Zitrusfrucht')).toBe(false);
    expect(egalStrict(' zitrusfrucht ', 'Zitrusfrucht')).toBe(true);
    expect(egalStrict(`${x}x`, x)).toBe(false);
    expect(egalStrict('Zitrusfrucht  sehr', 'zitrusfrucht sehr')).toBe(true);
    expect(egalStrict('é', 'é')).toBe(true);
  });
});
