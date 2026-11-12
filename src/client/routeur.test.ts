// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  cheminDOuverture,
  cheminDuCours,
  destinationDeLAccueil,
  naviguer,
  type Route,
  redirection,
  route,
  surNavigation,
  type Visiteur,
} from './routeur.js';

describe('route', () => {
  it('routeur_reconnait_chaque_chemin', () => {
    const cas: [string, Route][] = [
      ['/', { ecran: 'accueil' }],
      ['/compte', { ecran: 'compte' }],
      ['/connexion', { ecran: 'connexion' }],
      ['/invitation/abc_DEF-123', { ecran: 'invitation', jeton: 'abc_DEF-123' }],
      ['/lien/xyz_789-ABC', { ecran: 'lien', jeton: 'xyz_789-ABC' }],
      ['/appareils', { ecran: 'appareils' }],
      ['/admin', { ecran: 'admin' }],
      ['/confidentialite', { ecran: 'confidentialite' }],
    ];

    for (const [chemin, attendu] of cas) {
      expect(route(chemin), chemin).toEqual(attendu);
    }
  });

  it('routes_compte_et_cours', () => {
    expect(route('/compte')).toEqual({ ecran: 'compte' });
    expect(route('/cours/abc12345')).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'apercu',
    });
    expect(route('/cours/abc12345/quiz')).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'quiz',
    });
    // Un onglet inconnu mène à l'aperçu du cours, pas à l'accueil.
    expect(route('/cours/abc12345/inconnu')).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'apercu',
    });
    for (const onglet of [
      'heute',
      'cartes',
      'quiz',
      'mots',
      'schemas',
      'textes',
      'exercices',
      'feuilles',
      'examen',
      'progression',
    ] as const) {
      expect(route(`/cours/abc12345/${onglet}`), onglet).toEqual({
        ecran: 'cours',
        cours: 'abc12345',
        onglet,
      });
    }
    expect(route('/cours/abc12345/cartes/?x=1#y')).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'cartes',
    });
  });

  it('chemin_du_cours_et_de_ses_onglets', () => {
    expect(cheminDuCours('abc12345')).toBe('/cours/abc12345');
    expect(cheminDuCours('abc12345', 'apercu')).toBe('/cours/abc12345');
    expect(cheminDuCours('abc12345', 'progression')).toBe('/cours/abc12345/progression');
    // Le chemin d'un onglet se relit en ce même onglet.
    expect(route(cheminDuCours('abc12345', 'examen'))).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'examen',
    });
  });

  it('heute_a_son_chemin_et_l_ouverture_du_cours_y_mene', () => {
    // M2-P1 : « Heute » est à `/cours/<id>/heute`, l'aperçu reste à `/cours/<id>`.
    const heute: Route = { ecran: 'cours', cours: 'abc12345', onglet: 'heute' };
    expect(route('/cours/abc12345/heute')).toEqual(heute);
    expect(cheminDuCours('abc12345', 'heute')).toBe('/cours/abc12345/heute');
    expect(cheminDOuverture('abc12345')).toBe('/cours/abc12345/heute');
    expect(route(cheminDOuverture('abc12345'))).toEqual(heute);
    expect(route('/cours/abc12345')).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'apercu',
    });
    expect(route('/cours/abc12345/Heute')).toEqual({
      ecran: 'cours',
      cours: 'abc12345',
      onglet: 'apercu',
    });
  });

  it('route_feuilles', () => {
    // L'onglet des Arbeitsblätter a son chemin, qui se relit en lui-même (F1-D1).
    const feuilles: Route = { ecran: 'cours', cours: 'abc12345', onglet: 'feuilles' };
    expect(route('/cours/abc12345/feuilles')).toEqual(feuilles);
    expect(cheminDuCours('abc12345', 'feuilles')).toBe('/cours/abc12345/feuilles');
    expect(route(cheminDuCours('abc12345', 'feuilles'))).toEqual(feuilles);
  });

  it('accueil_mene_au_cours_unique_sinon_au_compte', () => {
    expect(destinationDeLAccueil([{ id: 'abc12345' }])).toBe('/cours/abc12345/heute');
    expect(destinationDeLAccueil([])).toBe('/compte');
    expect(destinationDeLAccueil([{ id: 'abc12345' }, { id: 'def67890' }])).toBe('/compte');
  });

  it('routeur_renvoie_a_l_accueil_pour_tout_autre_chemin', () => {
    const autres = [
      '',
      '/inconnu',
      '/invitation',
      '/invitation/',
      '/invitation/a/b',
      '/lien',
      '/lien/a/b',
      '/admin/personnes',
      '/appareils/1',
      '/Connexion',
      '/connexion/oups',
      '/api/moi',
      '/compte/1',
      '/cours',
      '/cours/',
      '/cours/abc12345/quiz/1',
      '/confidentialite/de',
      '/Confidentialite',
    ];

    for (const chemin of autres) {
      expect(route(chemin), chemin).toEqual({ ecran: 'accueil' });
    }
  });

  it('routeur_ignore_la_barre_finale_la_requete_et_le_fragment', () => {
    expect(route('/connexion/')).toEqual({ ecran: 'connexion' });
    expect(route('/admin?x=1')).toEqual({ ecran: 'admin' });
    expect(route('/appareils#haut')).toEqual({ ecran: 'appareils' });
    expect(route('/invitation/abc/')).toEqual({ ecran: 'invitation', jeton: 'abc' });
    expect(route('/lien/abc?x=1#y')).toEqual({ ecran: 'lien', jeton: 'abc' });
    // Le jeton ne contient ni requête ni fragment.
    expect(route('/invitation/abc?jeton=autre')).toEqual({ ecran: 'invitation', jeton: 'abc' });
  });
});

describe('redirection', () => {
  const ecrans: Route[] = [
    { ecran: 'accueil' },
    { ecran: 'compte' },
    { ecran: 'cours', cours: 'abc12345', onglet: 'apercu' },
    { ecran: 'connexion' },
    { ecran: 'invitation', jeton: 'j' },
    { ecran: 'lien', jeton: 'j' },
    { ecran: 'appareils' },
    { ecran: 'admin' },
    { ecran: 'confidentialite' },
  ];

  it('redirection_n_agit_pas_tant_que_la_session_est_inconnue', () => {
    for (const ecran of ecrans) {
      expect(redirection(ecran, 'inconnu'), ecran.ecran).toBeUndefined();
    }
  });

  it('redirection_renvoie_un_visiteur_anonyme_a_la_connexion', () => {
    const attendu: [Route, string | undefined][] = [
      [{ ecran: 'accueil' }, '/connexion'],
      [{ ecran: 'appareils' }, '/connexion'],
      [{ ecran: 'admin' }, '/connexion'],
      [{ ecran: 'connexion' }, undefined],
      [{ ecran: 'invitation', jeton: 'j' }, undefined],
      [{ ecran: 'lien', jeton: 'j' }, undefined],
    ];

    for (const [ecran, cible] of attendu) {
      expect(redirection(ecran, 'anonyme'), ecran.ecran).toBe(cible);
    }
  });

  it('cours_et_compte_demandent_une_session', () => {
    const cours: Route = { ecran: 'cours', cours: 'abc12345', onglet: 'quiz' };
    expect(redirection({ ecran: 'compte' }, 'anonyme')).toBe('/connexion');
    expect(redirection(cours, 'anonyme')).toBe('/connexion');
    for (const visiteur of ['connecte', 'proprietaire'] as Visiteur[]) {
      expect(redirection({ ecran: 'compte' }, visiteur), visiteur).toBeUndefined();
      expect(redirection(cours, visiteur), visiteur).toBeUndefined();
    }
  });

  it('redirection_renvoie_une_personne_connectee_a_l_accueil_depuis_la_connexion', () => {
    for (const visiteur of ['connecte', 'proprietaire'] as Visiteur[]) {
      expect(redirection({ ecran: 'connexion' }, visiteur), visiteur).toBe('/');
      expect(redirection({ ecran: 'accueil' }, visiteur), visiteur).toBeUndefined();
      expect(redirection({ ecran: 'appareils' }, visiteur), visiteur).toBeUndefined();
      // Un lien ouvert pendant qu'une session existe la remplace, côté serveur.
      expect(redirection({ ecran: 'invitation', jeton: 'j' }, visiteur), visiteur).toBeUndefined();
      expect(redirection({ ecran: 'lien', jeton: 'j' }, visiteur), visiteur).toBeUndefined();
    }
  });

  it('notice_publique_sans_session', () => {
    // La notice se lit avant tout compte, depuis l'invitation ou la connexion (1e-D15), et reste
    // ouverte à une personne connectée.
    for (const visiteur of ['inconnu', 'anonyme', 'connecte', 'proprietaire'] as Visiteur[]) {
      expect(redirection({ ecran: 'confidentialite' }, visiteur), visiteur).toBeUndefined();
    }
  });

  it('redirection_reserve_l_administration_au_proprietaire', () => {
    expect(redirection({ ecran: 'admin' }, 'proprietaire')).toBeUndefined();
    expect(redirection({ ecran: 'admin' }, 'connecte')).toBe('/');
  });
});

describe('surNavigation', () => {
  it('sur_navigation_suit_naviguer_et_le_bouton_retour', () => {
    // L'abonné note l'adresse qu'il voit : celle d'arrivée, car il est appelé après le changement.
    const vues: string[] = [];
    const retirer = surNavigation(() => vues.push(location.pathname));

    naviguer('/compte');
    window.dispatchEvent(new PopStateEvent('popstate'));
    retirer();
    naviguer('/appareils');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(vues).toEqual(['/compte', '/compte']);
  });
});
