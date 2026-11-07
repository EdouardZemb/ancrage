import { describe, expect, it } from 'vitest';
import { lireConfig } from './config.js';

describe('lireConfig', () => {
  it('valeurs_par_defaut', () => {
    expect(lireConfig({})).toEqual({
      environnement: 'dev',
      version: 'dev',
      revision: 'local',
      cheminBase: 'donnees/ancrage.sqlite',
      hote: '127.0.0.1',
      port: 3000,
      dossierClient: 'dist/client',
      // Sans défaut : sans dossier monté, le démarrage se replie sur l'exemple, sauf en prod (S1-D3).
      dossierContenus: undefined,
      dossierExemple: 'exemple-contenu',
      urlPublique: 'http://localhost:3000',
    });
  });

  it('lit_les_variables', () => {
    const config = lireConfig({
      ANCRAGE_ENV: 'prod',
      ANCRAGE_VERSION: '0.1.0',
      ANCRAGE_REVISION: 'abc',
      ANCRAGE_BASE: '/donnees/ancrage.sqlite',
      HOST: '0.0.0.0',
      PORT: '3000',
      ANCRAGE_CLIENT: '/app/dist/client',
      ANCRAGE_CONTENUS: '/app/contenus',
      ANCRAGE_EXEMPLE_CONTENU: '/app/exemple-contenu',
      ANCRAGE_URL_PUBLIQUE: 'https://ancrage.exemple.test',
    });

    expect(config).toEqual({
      environnement: 'prod',
      version: '0.1.0',
      revision: 'abc',
      cheminBase: '/donnees/ancrage.sqlite',
      hote: '0.0.0.0',
      port: 3000,
      dossierClient: '/app/dist/client',
      dossierContenus: '/app/contenus',
      dossierExemple: '/app/exemple-contenu',
      urlPublique: 'https://ancrage.exemple.test',
    });
  });

  it('variable_vide_vaut_absente', () => {
    const defauts = lireConfig({});

    expect(
      lireConfig({
        ANCRAGE_ENV: '',
        ANCRAGE_VERSION: '',
        ANCRAGE_REVISION: '',
        ANCRAGE_BASE: '',
        HOST: '',
        PORT: '',
        ANCRAGE_CLIENT: '',
        ANCRAGE_CONTENUS: '',
        ANCRAGE_EXEMPLE_CONTENU: '',
        ANCRAGE_URL_PUBLIQUE: '',
      }),
    ).toEqual(defauts);
  });

  it('ancrage_env_invalide_refuse', () => {
    expect(() => lireConfig({ ANCRAGE_ENV: 'production' })).toThrow(
      'ANCRAGE_ENV invalide : production',
    );
  });

  it('port_non_numerique_refuse', () => {
    expect(() => lireConfig({ PORT: 'abc' })).toThrow('PORT invalide : abc');
  });

  it('port_hors_plage_refuse', () => {
    expect(() => lireConfig({ PORT: '70000' })).toThrow('PORT invalide : 70000');
  });

  it('url_publique_par_defaut_en_dev', () => {
    expect(lireConfig({ ANCRAGE_ENV: 'dev' }).urlPublique).toBe('http://localhost:3000');
    expect(lireConfig({ ANCRAGE_ENV: 'ci' }).urlPublique).toBe('http://localhost:3000');
    expect(
      lireConfig({ ANCRAGE_ENV: 'dev', ANCRAGE_URL_PUBLIQUE: 'http://localhost:5173' }).urlPublique,
    ).toBe('http://localhost:5173');
  });

  it('url_publique_obligatoire_en_prod', () => {
    for (const environnement of ['staging', 'prod']) {
      for (const valeur of [undefined, '']) {
        expect(
          () => lireConfig({ ANCRAGE_ENV: environnement, ANCRAGE_URL_PUBLIQUE: valeur }),
          `${environnement} ${valeur}`,
        ).toThrow('ANCRAGE_URL_PUBLIQUE manquante');
      }
    }
    expect(
      lireConfig({
        ANCRAGE_ENV: 'staging',
        ANCRAGE_URL_PUBLIQUE: 'https://ancrage-staging.exemple.test',
      }).urlPublique,
    ).toBe('https://ancrage-staging.exemple.test');
  });

  it('url_publique_invalide_refusee_sans_repeter_la_valeur', () => {
    function messageDErreur(valeur: string): string {
      try {
        lireConfig({ ANCRAGE_URL_PUBLIQUE: valeur });
      } catch (erreur) {
        return (erreur as Error).message;
      }
      throw new Error(`aucune erreur pour ${valeur}`);
    }

    for (const valeur of [
      'ancrage.exemple.test',
      'pas une url',
      'ftp://ancrage.exemple.test',
      'https://ancrage.exemple.test/chemin',
      'https://ancrage.exemple.test/?a=1',
      'https://ancrage.exemple.test/#a',
      'https://nom:secret@ancrage.exemple.test',
    ]) {
      // Le message ne reprend pas la valeur : elle peut contenir des identifiants.
      expect(messageDErreur(valeur), valeur).toBe(
        'ANCRAGE_URL_PUBLIQUE invalide : attendu http(s)://hôte[:port], sans chemin, requête, ' +
          'fragment ni identifiants',
      );
    }
    expect(messageDErreur('https://nom:secret@ancrage.exemple.test')).not.toContain('secret');
  });

  it('url_publique_reduite_a_son_origine', () => {
    expect(lireConfig({ ANCRAGE_URL_PUBLIQUE: 'https://Ancrage.Exemple.Test/' }).urlPublique).toBe(
      'https://ancrage.exemple.test',
    );
    expect(
      lireConfig({ ANCRAGE_URL_PUBLIQUE: 'https://ancrage.exemple.test:443' }).urlPublique,
    ).toBe('https://ancrage.exemple.test');
  });
});
