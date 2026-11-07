import { describe, expect, it } from 'vitest';
import {
  annulerLienDeConnexion,
  appeler,
  compteSupprime,
  creerLienDeConnexion,
  ErreurApi,
  envoyerJournal,
  lireCours,
  lireJournal,
  lireMoi,
  listerCours,
  modifierMoi,
  supprimerSonCompte,
} from './api.js';
import { json } from './reponse.fixture.js';

interface Appel {
  url: string;
  init: RequestInit | undefined;
}

/** Un `fetch` qui note ses appels et rend la réponse de `reponse`. */
function faux(reponse: () => Response | Promise<Response>) {
  const appels: Appel[] = [];
  const recuperer = (async (entree: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(entree), init });
    return reponse();
  }) as typeof fetch;
  return { appels, recuperer };
}

describe('appeler', () => {
  it('appeler_sans_corps_n_envoie_pas_de_content_type', async () => {
    const { appels, recuperer } = faux(() => new Response(null, { status: 204 }));

    const resultat = await appeler('POST', '/api/auth/deconnexion', undefined, recuperer);

    expect(resultat).toBeUndefined();
    expect(appels).toHaveLength(1);
    const init = appels[0]?.init;
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('appeler_avec_corps_envoie_du_json', async () => {
    const { appels, recuperer } = faux(() => json({ lien: 'http://localhost:3000/lien/x' }));

    const resultat = await appeler<{ lien: string }>(
      'POST',
      '/api/admin/invitations',
      { groupes: ['g1'], cours: [] },
      recuperer,
    );

    expect(resultat).toEqual({ lien: 'http://localhost:3000/lien/x' });
    const init = appels[0]?.init;
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(init?.body).toBe('{"groupes":["g1"],"cours":[]}');
    expect(init?.credentials).toBe('same-origin');
  });

  it('appeler_traduit_un_code_connu_du_serveur', async () => {
    const codes = [
      [400, 'lien_invalide'],
      [400, 'connexion_impossible'],
      [400, 'requete'],
      [429, 'trop_de_requetes'],
      [409, 'derniere_passkey'],
      [409, 'nom_deja_pris'],
      [409, 'cours_a_verifier_sans_derogation'],
      [404, 'introuvable'],
      [401, 'non_connecte'],
      [409, 'autre_personne'],
      // Le compte du propriétaire ne se supprime pas (1e-D4), et le serveur en panne parle sans rien
      // dire de lui (1e-D14).
      [409, 'proprietaire'],
      [500, 'interne'],
    ] as const;

    for (const [statut, code] of codes) {
      const { recuperer } = faux(() => json({ erreur: code }, statut));
      const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);
      expect(erreur, code).toBeInstanceOf(ErreurApi);
      expect(erreur).toMatchObject({ statut, code });
    }
  });

  it('code_origine_reconnu', async () => {
    // Le 403 du serveur sur une requête dont l'`Origin` n'est pas le sien (proxy mal réglé).
    const { recuperer } = faux(() => json({ erreur: 'origine' }, 403));

    const erreur = await appeler('POST', '/api/x', {}, recuperer).catch((e) => e);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect(erreur).toMatchObject({ statut: 403, code: 'origine' });
  });
  it('appeler_ne_laisse_pas_passer_un_corps_d_erreur_inconnu', async () => {
    // La forme d'erreur de Fastify, un code que le client ne connaît pas, une page HTML.
    const fabriques = [
      () =>
        json({ statusCode: 400, code: 'FST_ERR_CTP_EMPTY_JSON_BODY', error: 'Bad Request' }, 400),
      () => json({ erreur: 'autre_chose' }, 400),
      () => json({ erreur: { detail: 'objet' } }, 500),
      () => new Response('<html>Bad gateway</html>', { status: 502 }),
      () => new Response('', { status: 500 }),
    ];

    for (const fabrique of fabriques) {
      const { recuperer } = faux(fabrique);
      const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);
      expect(erreur).toBeInstanceOf(ErreurApi);
      expect(erreur).toMatchObject({ code: 'inconnue' });
      // Le message de l'exception ne cite rien du corps.
      expect((erreur as Error).message).not.toMatch(/Bad|html|objet|autre_chose/);
    }
  });

  it('appeler_se_rabat_sur_le_statut_quand_le_corps_n_est_pas_connu', async () => {
    const sansSession = faux(() => new Response('', { status: 401 }));
    expect(
      await appeler('GET', '/api/x', undefined, sansSession.recuperer).catch((e) => e),
    ).toMatchObject({ code: 'non_connecte' });

    const trop = faux(() => new Response('Too Many', { status: 429 }));
    expect(await appeler('GET', '/api/x', undefined, trop.recuperer).catch((e) => e)).toMatchObject(
      { code: 'trop_de_requetes' },
    );
  });

  it('compte_supprime_lu_comme_non_connecte_marque', async () => {
    const { recuperer } = faux(() => json({ erreur: 'compte_supprime' }, 401));

    const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect(erreur).toMatchObject({ statut: 401, code: 'non_connecte', compteSupprime: true });
  });

  it('non_connecte_n_est_pas_marque', async () => {
    const fabriques = [
      () => json({ erreur: 'non_connecte' }, 401),
      () => new Response('x', { status: 401 }),
    ];

    for (const fabrique of fabriques) {
      const { recuperer } = faux(fabrique);
      const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);
      expect(erreur).toMatchObject({ code: 'non_connecte', compteSupprime: false });
    }
  });

  it('compte_supprime_sur_un_autre_statut_n_est_pas_marque', async () => {
    const { recuperer } = faux(() => json({ erreur: 'compte_supprime' }, 400));

    const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);

    expect(erreur).toMatchObject({ statut: 400, code: 'inconnue', compteSupprime: false });
  });

  it('appeler_signale_un_serveur_injoignable', async () => {
    const { recuperer } = faux(() => {
      throw new TypeError('Failed to fetch');
    });

    const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect(erreur).toMatchObject({ statut: 0, code: 'reseau' });
  });

  it('appeler_signale_un_succes_sans_json', async () => {
    const { recuperer } = faux(() => new Response('<html></html>', { status: 200 }));

    const erreur = await appeler('GET', '/api/x', undefined, recuperer).catch((e) => e);

    expect(erreur).toMatchObject({ statut: 200, code: 'inconnue' });
  });
});

describe('lireMoi', () => {
  it('lire_moi_rend_la_personne', async () => {
    const moi = { id: 'p1', nomAffiche: 'Lernende Test', langue: 'de', proprietaire: false };
    const { appels, recuperer } = faux(() => json(moi));

    expect(await lireMoi(recuperer)).toEqual(moi);
    expect(appels[0]?.url).toBe('/api/moi');
  });

  it('lire_moi_rend_undefined_sans_session', async () => {
    const { recuperer } = faux(() => json({ erreur: 'non_connecte' }, 401));

    expect(await lireMoi(recuperer)).toBeUndefined();
  });

  it('lire_moi_rend_undefined_pour_un_compte_supprime', async () => {
    const { recuperer } = faux(() => json({ erreur: 'compte_supprime' }, 401));

    expect(await lireMoi(recuperer)).toBeUndefined();
  });

  it('lire_moi_leve_les_autres_echecs', async () => {
    const { recuperer } = faux(() => new Response('', { status: 500 }));

    await expect(lireMoi(recuperer)).rejects.toBeInstanceOf(ErreurApi);
  });
});

describe('compteSupprime', () => {
  it('compte_supprime_demande_moi_avec_l_entete_de_la_personne', async () => {
    const supprime = faux(() => json({ erreur: 'compte_supprime' }, 401));

    expect(await compteSupprime('p1', supprime.recuperer)).toBe(true);

    expect(supprime.appels).toHaveLength(1);
    expect(supprime.appels[0]?.url).toBe('/api/moi');
    expect(supprime.appels[0]?.init?.method).toBe('GET');
    expect(supprime.appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p1' });

    // Tout le reste vaut « pas supprimé » : 200, ancien serveur, réseau, panne (point de revue 4).
    const autres = [
      () => json({ id: 'p1', nomAffiche: 'x', langue: 'de', proprietaire: false }),
      () => json({ erreur: 'non_connecte' }, 401),
      () => {
        throw new TypeError('Failed to fetch');
      },
      () => new Response('', { status: 500 }),
    ];
    for (const fabrique of autres) {
      const { recuperer } = faux(fabrique);
      expect(await compteSupprime('p1', recuperer)).toBe(false);
    }
  });
});

describe('supprimerSonCompte', () => {
  it('supprimer_son_compte_nomme_la_personne_de_l_ecran', async () => {
    const { appels, recuperer } = faux(() => new Response(null, { status: 204 }));

    expect(await supprimerSonCompte('p-alice', recuperer)).toBeUndefined();

    // 1e-R13 : le serveur refuse (400 sans l'en-tête, 409 s'il nomme une autre personne que celle
    // de la session) plutôt que de supprimer le compte d'une autre.
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe('/api/moi');
    expect(appels[0]?.init?.method).toBe('DELETE');
    expect(appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p-alice' });
    expect(appels[0]?.init?.body).toBeUndefined();
  });

  it('supprimer_son_compte_traduit_les_refus_du_serveur', async () => {
    for (const [statut, code] of [
      [409, 'autre_personne'],
      [409, 'proprietaire'],
      [400, 'requete'],
      [500, 'interne'],
    ] as const) {
      const refus = faux(() => json({ erreur: code }, statut));

      expect(
        await supprimerSonCompte('p-alice', refus.recuperer).catch((e) => e),
        code,
      ).toMatchObject({ statut, code });
    }
  });
});

describe('modifierMoi', () => {
  const ALICE = { id: 'p-alice', nomAffiche: 'Neuer Name', langue: 'de', proprietaire: false };

  it('modifier_moi_nomme_la_personne_de_l_ecran', async () => {
    const { appels, recuperer } = faux(() => json(ALICE));

    expect(await modifierMoi('p-alice', { nomAffiche: 'Neuer Name' }, recuperer)).toEqual(ALICE);

    // Le serveur refuse (409) si la session est celle d'une autre personne.
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe('/api/moi');
    expect(appels[0]?.init?.method).toBe('PATCH');
    expect(appels[0]?.init?.headers).toEqual({
      'x-ancrage-personne': 'p-alice',
      'content-type': 'application/json',
    });
    expect(appels[0]?.init?.body).toBe('{"nomAffiche":"Neuer Name"}');
  });

  it('modifier_moi_refuse_le_profil_d_une_autre_personne', async () => {
    // Un serveur d'avant le lot 1e (un retour arrière) ignore l'en-tête : il change le profil de
    // la session et le rend. Ce n'est pas celui de l'écran : comme le refus du serveur.
    const autre = faux(() => json({ ...ALICE, id: 'p-berthe' }));
    expect(
      await modifierMoi('p-alice', { langue: 'fr' }, autre.recuperer).catch((e) => e),
    ).toMatchObject({ code: 'autre_personne' });

    const refus = faux(() => json({ erreur: 'autre_personne' }, 409));
    expect(
      await modifierMoi('p-alice', { langue: 'fr' }, refus.recuperer).catch((e) => e),
    ).toMatchObject({ statut: 409, code: 'autre_personne' });
  });
});

describe('lien de connexion', () => {
  it('creer_un_lien_nomme_la_personne_de_l_ecran', async () => {
    const { appels, recuperer } = faux(() => json({ lien: 'https://ancrage.test/lien/exemple' }));

    expect(await creerLienDeConnexion('p-alice', recuperer)).toBe(
      'https://ancrage.test/lien/exemple',
    );

    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe('/api/moi/lien');
    expect(appels[0]?.init?.method).toBe('POST');
    expect(appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p-alice' });
    expect(appels[0]?.init?.body).toBeUndefined();
  });

  it('annuler_le_lien_nomme_la_personne_de_l_ecran', async () => {
    const { appels, recuperer } = faux(() => new Response(null, { status: 204 }));

    expect(await annulerLienDeConnexion('p-alice', recuperer)).toBeUndefined();

    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe('/api/moi/lien');
    expect(appels[0]?.init?.method).toBe('DELETE');
    expect(appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p-alice' });
  });

  it('les_liens_d_une_autre_personne_409', async () => {
    const refus = faux(() => json({ erreur: 'autre_personne' }, 409));

    for (const appel of [creerLienDeConnexion, annulerLienDeConnexion]) {
      expect(await appel('p-alice', refus.recuperer).catch((e) => e)).toMatchObject({
        statut: 409,
        code: 'autre_personne',
      });
    }
  });
});

describe('cours et journal', () => {
  const evenement = {
    id: '01929f3a-5b3c-7000-8000-000000000001',
    cours: 'cs000001',
    unite: 'abcd1234',
    type: 'reponse',
    resultat: { juste: true },
    repondu_a: '2026-10-17T08:00:01.000+02:00',
    appareil: '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17',
    v: 1,
  } as const;

  it('lister_cours_demande_la_liste', async () => {
    const liste = [{ id: 'cs000001', titre: 'Übungskurs', langue: 'de' }];
    const { appels, recuperer } = faux(() => json(liste));

    expect(await listerCours('p-alice', recuperer)).toEqual(liste);
    expect(appels[0]?.url).toBe('/api/cours');
    expect(appels[0]?.init?.method).toBe('GET');
    // R36 : la personne sous laquelle la liste sera rangée ; le serveur la compare à la session.
    expect(appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p-alice' });
  });

  it('lister_cours_refuse_une_forme_inattendue', async () => {
    // Une liste mal formée ne doit pas passer pour la liste des cours de la personne.
    for (const corps of [
      {},
      null,
      'cours',
      [null],
      [{ id: 'cs000001' }],
      [{ id: 1, titre: 'T', langue: 'de' }],
      [{ id: 'cs000001', titre: 'T', langue: 2 }],
    ]) {
      const { recuperer } = faux(() => json(corps));
      expect(
        await listerCours('p-alice', recuperer).catch((e) => e),
        JSON.stringify(corps),
      ).toMatchObject({
        statut: 200,
        code: 'inconnue',
      });
    }
    const { recuperer } = faux(() => json([]));
    expect(await listerCours('p-alice', recuperer)).toEqual([]);
  });

  it('lire_cours_demande_le_cours_par_son_identifiant', async () => {
    const { appels, recuperer } = faux(() => json({ id: 'cs000001' }));

    await lireCours('cs000001', 'p-alice', recuperer);

    expect(appels[0]?.url).toBe('/api/cours/cs000001');
    expect(appels[0]?.init?.method).toBe('GET');
    // R36 : la personne sous laquelle le contenu sera rangé.
    expect(appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p-alice' });
  });

  it('liste_et_contenu_d_une_autre_personne_409', async () => {
    const autre = faux(() => json({ erreur: 'autre_personne' }, 409));

    expect(await listerCours('p-alice', autre.recuperer).catch((e) => e)).toMatchObject({
      statut: 409,
      code: 'autre_personne',
    });
    expect(await lireCours('cs000001', 'p-alice', autre.recuperer).catch((e) => e)).toMatchObject({
      statut: 409,
      code: 'autre_personne',
    });
  });

  it('envoyer_journal_poste_les_evenements_et_rend_le_nombre_accepte', async () => {
    const { appels, recuperer } = faux(() => json({ acceptes: 1 }));

    const reponse = await envoyerJournal('cs000001', [evenement], 'p-alice', recuperer);

    expect(reponse).toEqual({ acceptes: 1 });
    expect(appels[0]?.url).toBe('/api/cours/cs000001/journal');
    expect(appels[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(appels[0]?.init?.body))).toEqual({ evenements: [evenement] });
  });

  it('envoyer_journal_nomme_la_personne_de_la_file', async () => {
    const { appels, recuperer } = faux(() => json({ acceptes: 1 }));

    await envoyerJournal('cs000001', [evenement], 'p-alice', recuperer);

    // R21 : le serveur refuse (409) une file qui n'est pas celle de la session.
    expect(appels[0]?.init?.headers).toEqual({
      'content-type': 'application/json',
      'x-ancrage-personne': 'p-alice',
    });
    // La personne n'est pas dans le message (invariant 6).
    expect(String(appels[0]?.init?.body)).not.toContain('p-alice');
    const autre = faux(() => json({ erreur: 'autre_personne' }, 409));
    expect(
      await envoyerJournal('cs000001', [evenement], 'p-alice', autre.recuperer).catch((e) => e),
    ).toMatchObject({ statut: 409, code: 'autre_personne' });
  });

  it('envoyer_journal_accepte_zero', async () => {
    const { recuperer } = faux(() => json({ acceptes: 0 }));

    expect(await envoyerJournal('cs000001', [evenement], 'p-alice', recuperer)).toEqual({
      acceptes: 0,
    });
  });

  it('lire_journal_demande_depuis_le_curseur', async () => {
    const page = { evenements: [evenement], curseur: 8, suite: true };
    const { appels, recuperer } = faux(() => json(page));

    expect(await lireJournal('cs000001', 7, 'p-alice', recuperer)).toEqual(page);
    expect(appels[0]?.url).toBe('/api/cours/cs000001/journal?depuis=7');
    expect(appels[0]?.init?.method).toBe('GET');
  });

  it('lire_journal_nomme_la_personne_dont_il_range_le_journal', async () => {
    const { appels, recuperer } = faux(() => json({ evenements: [], curseur: 0, suite: false }));

    await lireJournal('cs000001', 0, 'p-alice', recuperer);

    // R32 : le serveur refuse (409) une lecture pour une autre personne que celle de la session.
    expect(appels[0]?.init?.headers).toEqual({ 'x-ancrage-personne': 'p-alice' });
    expect(appels[0]?.init?.body).toBeUndefined();
    const autre = faux(() => json({ erreur: 'autre_personne' }, 409));
    expect(
      await lireJournal('cs000001', 0, 'p-alice', autre.recuperer).catch((e) => e),
    ).toMatchObject({ statut: 409, code: 'autre_personne' });
  });

  it('les_routes_du_journal_traduisent_les_erreurs_du_serveur', async () => {
    const introuvable = faux(() => json({ erreur: 'introuvable' }, 404));
    expect(
      await lireJournal('cs000001', 0, 'p-alice', introuvable.recuperer).catch((e) => e),
    ).toMatchObject({
      statut: 404,
      code: 'introuvable',
    });
    const expire = faux(() => json({ erreur: 'non_connecte' }, 401));
    expect(
      await envoyerJournal('cs000001', [evenement], 'p-alice', expire.recuperer).catch((e) => e),
    ).toMatchObject({ statut: 401, code: 'non_connecte' });
    const hors = faux(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(
      await lireJournal('cs000001', 0, 'p-alice', hors.recuperer).catch((e) => e),
    ).toMatchObject({
      statut: 0,
      code: 'reseau',
    });
  });

  it('une_reponse_de_forme_inattendue_est_une_erreur_et_non_un_succes', async () => {
    // Un succès qui n'a pas la forme du serveur ne doit jamais vider la file d'envoi.
    for (const corps of [{}, { acceptes: '1' }, { acceptes: -1 }, { acceptes: 1.5 }, [], null]) {
      const { recuperer } = faux(() => json(corps));
      expect(
        await envoyerJournal('cs000001', [evenement], 'p-alice', recuperer).catch((e) => e),
        JSON.stringify(corps),
      ).toMatchObject({ statut: 200, code: 'inconnue' });
    }
    for (const corps of [
      {},
      { evenements: [], curseur: 1 },
      { evenements: {}, curseur: 1, suite: false },
      { evenements: [], curseur: '1', suite: false },
      { evenements: [], curseur: -1, suite: false },
      { evenements: [], curseur: 1, suite: 'non' },
      null,
    ]) {
      const { recuperer } = faux(() => json(corps));
      expect(
        await lireJournal('cs000001', 0, 'p-alice', recuperer).catch((e) => e),
        JSON.stringify(corps),
      ).toMatchObject({ statut: 200, code: 'inconnue' });
    }
  });
});
