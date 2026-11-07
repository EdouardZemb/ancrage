import { beforeEach, describe, expect, it } from 'vitest';
import { creerMagasinDefis } from './defis.js';

const T0 = new Date('2026-10-16T08:00:00.000Z');
const UNE_MINUTE = 60 * 1000;
const CINQ_MINUTES = 5 * UNE_MINUTE;

let maintenant: Date;

beforeEach(() => {
  maintenant = T0;
});

function plus(duree: number): Date {
  return new Date(T0.getTime() + duree);
}

describe('défis', () => {
  it('defi_pris_une_seule_fois', () => {
    const defis = creerMagasinDefis<string>(() => maintenant);
    defis.poser('c-1', 'défi 1');

    expect(defis.prendre('c-1')).toBe('défi 1');
    expect(defis.prendre('c-1')).toBeUndefined();
    expect(defis.prendre('inconnue')).toBeUndefined();
  });

  it('defi_valable_cinq_minutes', () => {
    const defis = creerMagasinDefis<string>(() => maintenant);
    defis.poser('c-1', 'défi 1');
    defis.poser('c-2', 'défi 2');

    maintenant = plus(CINQ_MINUTES - 1);
    expect(defis.prendre('c-1')).toBe('défi 1');
    // À l'instant exact des cinq minutes, le défi est déjà périmé.
    maintenant = plus(CINQ_MINUTES);
    expect(defis.prendre('c-2')).toBeUndefined();
  });

  it('defi_perime_reste_perime_apres_un_nettoyage', () => {
    const defis = creerMagasinDefis<string>(() => maintenant);
    defis.poser('c-1', 'défi 1');
    maintenant = plus(CINQ_MINUTES);

    defis.nettoyer();

    expect(defis.prendre('c-1')).toBeUndefined();
  });

  it('nettoyer_libere_la_place_des_defis_perimes', () => {
    const defis = creerMagasinDefis<string>(() => maintenant, 2);
    defis.poser('ancien', 'défi 0');
    maintenant = plus(CINQ_MINUTES);

    defis.nettoyer();
    defis.poser('c-1', 'défi 1');
    defis.poser('c-2', 'défi 2');

    // Le défi périmé a laissé sa place : les deux nouveaux tiennent.
    expect(defis.prendre('c-1')).toBe('défi 1');
    expect(defis.prendre('c-2')).toBe('défi 2');
  });

  it('plein_le_plus_ancien_cede_sa_place', () => {
    const defis = creerMagasinDefis<string>(() => maintenant, 2);
    defis.poser('c-1', 'défi 1');
    defis.poser('c-2', 'défi 2');

    defis.poser('c-3', 'défi 3');

    expect(defis.prendre('c-1')).toBeUndefined();
    expect(defis.prendre('c-2')).toBe('défi 2');
    expect(defis.prendre('c-3')).toBe('défi 3');
  });
});
