import { describe, expect, it } from 'vitest';
import { enregistrerSw } from './enregistrer-sw.js';

/** Un `navigator.serviceWorker` simulé, qui note les enregistrements demandés. */
function conteneur(resultat: 'reussi' | 'refuse' = 'reussi') {
  const appels: [string, RegistrationOptions | undefined][] = [];
  return {
    appels,
    register: async (adresse: string | URL, options?: RegistrationOptions) => {
      appels.push([String(adresse), options]);
      if (resultat === 'refuse') {
        throw new DOMException('enregistrement refusé', 'SecurityError');
      }
      return {} as ServiceWorkerRegistration;
    },
  };
}

describe('enregistrerSw', () => {
  it('en_production_enregistre_sw_js_a_la_racine', async () => {
    const navigateur = conteneur();

    const enregistre = await enregistrerSw({ production: true, conteneur: navigateur });

    expect(enregistre).toBe(true);
    expect(navigateur.appels).toEqual([['/sw.js', { scope: '/' }]]);
  });

  it('en_developpement_n_enregistre_rien', async () => {
    const navigateur = conteneur();

    const enregistre = await enregistrerSw({ production: false, conteneur: navigateur });

    expect(enregistre).toBe(false);
    expect(navigateur.appels).toEqual([]);
  });

  it('sans_service_worker_dans_le_navigateur_rien_n_est_tente', async () => {
    const enregistre = await enregistrerSw({ production: true, conteneur: undefined });

    expect(enregistre).toBe(false);
  });

  it('un_echec_d_enregistrement_ne_casse_pas_l_application', async () => {
    const navigateur = conteneur('refuse');

    const enregistre = await enregistrerSw({ production: true, conteneur: navigateur });

    expect(enregistre).toBe(false);
    expect(navigateur.appels).toHaveLength(1);
  });
});
