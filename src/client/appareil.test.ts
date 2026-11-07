import { afterEach, describe, expect, it, vi } from 'vitest';

const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLE = 'ancrage.appareil';

/** Un `localStorage` en mémoire. */
function stockageEnMemoire(initial: Record<string, string> = {}) {
  const valeurs = new Map(Object.entries(initial));
  return {
    valeurs,
    getItem: (cle: string) => valeurs.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => {
      valeurs.set(cle, valeur);
    },
  };
}

/** Le module à l'état neuf : ce que voit une nouvelle page. */
async function chargerPage() {
  vi.resetModules();
  return (await import('./appareil.js')).identifiantAppareil;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('identifiantAppareil', () => {
  it('identifiant_appareil_stable', async () => {
    const stockage = stockageEnMemoire();
    vi.stubGlobal('localStorage', stockage);

    const premiere = await chargerPage();
    const identifiant = premiere();

    expect(identifiant).toMatch(FORMAT_UUID);
    expect(premiere()).toBe(identifiant);
    expect(stockage.valeurs.get(CLE)).toBe(identifiant);
    // Une nouvelle page (le module repart de zéro) retrouve le même.
    expect((await chargerPage())()).toBe(identifiant);
  });

  it('un_identifiant_deja_garde_est_repris_tel_quel', async () => {
    const garde = '9e2d7c41-3a58-4f06-b1d9-0c6a8e5f2b34';
    vi.stubGlobal('localStorage', stockageEnMemoire({ [CLE]: garde }));

    expect((await chargerPage())()).toBe(garde);
  });

  it('deux_appareils_ont_deux_identifiants', async () => {
    vi.stubGlobal('localStorage', stockageEnMemoire());
    const a = (await chargerPage())();
    vi.stubGlobal('localStorage', stockageEnMemoire());
    const b = (await chargerPage())();

    expect(a).not.toBe(b);
  });

  it('une_valeur_gardee_qui_n_est_pas_un_uuid_est_remplacee', async () => {
    // Le serveur refuse tout lot dont un `appareil` n'est pas un UUID : on ne le renvoie pas.
    const stockage = stockageEnMemoire({ [CLE]: 'pas-un-uuid' });
    vi.stubGlobal('localStorage', stockage);

    const identifiant = (await chargerPage())();

    expect(identifiant).toMatch(FORMAT_UUID);
    expect(stockage.valeurs.get(CLE)).toBe(identifiant);
  });

  it('sans_stockage_un_identifiant_par_chargement_de_page', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('refusé', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('refusé', 'SecurityError');
      },
    });

    const premiere = await chargerPage();
    const identifiant = premiere();

    expect(identifiant).toMatch(FORMAT_UUID);
    expect(premiere()).toBe(identifiant);
    expect((await chargerPage())()).not.toBe(identifiant);
  });

  it('sans_localstorage_du_tout_le_resultat_est_le_meme', async () => {
    vi.stubGlobal('localStorage', undefined);

    const premiere = await chargerPage();

    expect(premiere()).toMatch(FORMAT_UUID);
    expect(premiere()).toBe(premiere());
  });

  it('ecriture_refusee_l_identifiant_reste_stable_pendant_la_page', async () => {
    const stockage = stockageEnMemoire();
    vi.stubGlobal('localStorage', {
      getItem: stockage.getItem,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });

    const premiere = await chargerPage();
    const identifiant = premiere();

    expect(premiere()).toBe(identifiant);
    expect(stockage.valeurs.size).toBe(0);
  });
});
