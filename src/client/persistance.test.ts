import { afterEach, describe, expect, it, vi } from 'vitest';
import { demanderLaPersistance } from './persistance.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demanderLaPersistance (1e-D12)', () => {
  it('persistance_demandee_si_pas_encore', async () => {
    const stockage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };

    expect(await demanderLaPersistance(stockage)).toBe(true);

    expect(stockage.persist).toHaveBeenCalledTimes(1);
  });

  it('persistance_refusee_par_le_navigateur_rend_false', async () => {
    // Chrome refuse sans bruit si le site est peu fréquenté : ce n'est pas une erreur.
    const stockage = { persisted: async () => false, persist: vi.fn(async () => false) };

    expect(await demanderLaPersistance(stockage)).toBe(false);

    expect(stockage.persist).toHaveBeenCalledTimes(1);
  });

  it('persistance_deja_acquise_ne_redemande_pas', async () => {
    const stockage = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) };

    expect(await demanderLaPersistance(stockage)).toBe(true);

    expect(stockage.persist).not.toHaveBeenCalled();
  });

  it('persistance_absente_ou_en_erreur_rend_false', async () => {
    // Un navigateur sans l'API, ou un contexte qui la refuse : jamais d'exception.
    vi.stubGlobal('navigator', {});
    expect(await demanderLaPersistance()).toBe(false);
    vi.stubGlobal('navigator', undefined);
    expect(await demanderLaPersistance()).toBe(false);

    const refus = new DOMException('refusé', 'SecurityError');
    expect(
      await demanderLaPersistance({
        persisted: async () => false,
        persist: () => Promise.reject(refus),
      }),
    ).toBe(false);
    expect(
      await demanderLaPersistance({
        persisted: () => Promise.reject(refus),
        persist: async () => true,
      }),
    ).toBe(false);
    // Une méthode qui lève tout de suite, ou qui manque.
    expect(
      await demanderLaPersistance({
        persisted: () => {
          throw refus;
        },
        persist: async () => true,
      }),
    ).toBe(false);
    const sansPersisted = { persist: async () => true } as unknown as Parameters<
      typeof demanderLaPersistance
    >[0];
    expect(await demanderLaPersistance(sansPersisted)).toBe(false);
  });

  it('persistance_prend_le_stockage_du_navigateur_par_defaut', async () => {
    const stockage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    vi.stubGlobal('navigator', { storage: stockage });

    expect(await demanderLaPersistance()).toBe(true);

    expect(stockage.persist).toHaveBeenCalledTimes(1);
  });
});
