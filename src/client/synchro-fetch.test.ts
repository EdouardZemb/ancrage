import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../domaine/cours/cours.fixture.js';
import type { CoursResume } from './api.js';
import { json } from './reponse.fixture.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import {
  coursLocal,
  enregistrerCours,
  enregistrerListe,
  listeLocale,
} from './stockage/cours-local.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  idDeTest,
  reponseDeTest,
} from './stockage/evenements.fixture.js';
import {
  curseurDuCours,
  evenementsDuCours,
  fileDuCours,
  recevoirEvenements,
} from './stockage/journal-local.js';
import { ids, idsDe, repondre } from './synchro.fixture.js';
import { apiDuJournal, envoyerFile, synchroniserCours } from './synchro.js';

afterEach(() => {
  fermerLesBasesDeTest();
  vi.restoreAllMocks();
});

describe('synchroniserCours par fetch', () => {
  it('acceptes_zero_est_un_succes_et_la_file_est_videe', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    // `acceptes: 0` : le serveur avait déjà les deux réponses ; la lecture les rend donc.
    const deja = [reponseDeTest(COURS_DE_TEST, 1), reponseDeTest(COURS_DE_TEST, 2)];
    const recuperer = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === 'POST'
        ? json({ acceptes: 0 })
        : json({ evenements: deja, curseur: 2, suite: false }),
    );

    const resultat = await synchroniserCours(
      base,
      ALICE,
      COURS_DE_TEST,
      apiDuJournal(recuperer as typeof fetch),
    );

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    const appels = recuperer.mock.calls.map(([url, init]) => [init?.method, String(url)]);
    expect(appels).toEqual([
      ['POST', `/api/cours/${COURS_DE_TEST}/journal`],
      ['GET', `/api/cours/${COURS_DE_TEST}/journal?depuis=0`],
    ]);
    const corps = JSON.parse(String(recuperer.mock.calls[0]?.[1]?.body));
    expect(Object.keys(corps)).toEqual(['evenements']);
    expect(ids(corps.evenements)).toEqual(idsDe(1, 2));
    // L'envoi nomme la personne dont il porte la file (R21), la lecture celle dont elle range le
    // journal (R32).
    expect(recuperer.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-ancrage-personne': ALICE });
    expect(recuperer.mock.calls[1]?.[1]?.headers).toEqual({ 'x-ancrage-personne': ALICE });
  });

  it('lecture_autre_personne_rien_n_est_range', async () => {
    const base = await ouvrirBaseDeTest();
    // Alice a déjà lu un événement ; sa file est vide.
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 1)], 1);
    // La session du navigateur est devenue celle de Berthe (un autre onglet) : le serveur refuse de
    // rendre un journal pour Alice (R32).
    const autreSession = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const entetes = (init?.headers ?? {}) as Record<string, string | undefined>;
      return entetes['x-ancrage-personne'] === BERTHE
        ? json({ evenements: [reponseDeTest(COURS_DE_TEST, 50)], curseur: 1, suite: false })
        : json({ erreur: 'autre_personne' }, 409);
    });

    const resultat = await synchroniserCours(
      base,
      ALICE,
      COURS_DE_TEST,
      apiDuJournal(autreSession as unknown as typeof fetch),
    );

    expect(resultat).toEqual({ etat: 'reconnexion', enAttente: 0 });
    expect(autreSession).toHaveBeenCalledTimes(1);
    // Rien de Berthe dans la partition d'Alice, et son curseur n'a pas bougé.
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual([idDeTest(1)]);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(1);
  });

  it('un_409_autre_personne_garde_la_file_et_demande_la_reconnexion', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 3, 3);
    // La session du navigateur est celle d'une autre personne : le serveur refuse la file d'Alice.
    const autreSession = vi.fn(async () => json({ erreur: 'autre_personne' }, 409));
    const api = apiDuJournal(autreSession as unknown as typeof fetch);

    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, api)).toEqual({
      etat: 'reconnexion',
      enAttente: 2,
    });
    expect(await envoyerFile(base, ALICE, api)).toBe('reconnexion');
    // Pas d'insistance : un envoi par tentative, et rien n'a quitté la file.
    expect(autreSession).toHaveBeenCalledTimes(2);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
  });

  it('le_corps_d_erreur_par_defaut_de_fastify_est_une_erreur_de_requete', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    const recuperer = vi.fn(async () =>
      json(
        {
          statusCode: 400,
          code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
          error: 'Bad Request',
          message: '…',
        },
        400,
      ),
    );

    const resultat = await synchroniserCours(
      base,
      ALICE,
      COURS_DE_TEST,
      apiDuJournal(recuperer as unknown as typeof fetch),
    );

    expect(resultat).toEqual({ etat: 'en_attente', enAttente: 2 });
    expect(recuperer).toHaveBeenCalledTimes(1);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
  });

  it('un_fetch_qui_echoue_est_hors_ligne_et_un_401_demande_la_reconnexion', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);

    const sansReseau = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(
      await synchroniserCours(
        base,
        ALICE,
        COURS_DE_TEST,
        apiDuJournal(sansReseau as unknown as typeof fetch),
      ),
    ).toEqual({ etat: 'hors_ligne', enAttente: 1 });

    const expire = vi.fn(async () => json({ erreur: 'non_connecte' }, 401));
    expect(
      await synchroniserCours(
        base,
        ALICE,
        COURS_DE_TEST,
        apiDuJournal(expire as unknown as typeof fetch),
      ),
    ).toEqual({ etat: 'reconnexion', enAttente: 1 });
  });

  it('un_404_du_serveur_efface_le_cours_et_garde_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    await enregistrerCours(base, ALICE, coursServiDeTest());
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    // Le journal du cours est introuvable, et la liste des cours (qui répond) ne le contient plus.
    const introuvable = vi.fn(async (url: string | URL | Request) =>
      String(url) === '/api/cours' ? json([]) : json({ erreur: 'introuvable' }, 404),
    );

    const resultat = await synchroniserCours(
      base,
      ALICE,
      COURS_DE_TEST,
      apiDuJournal(introuvable as unknown as typeof fetch),
    );

    expect(resultat).toEqual({ etat: 'indisponible', enAttente: 1 });
    expect(introuvable.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/cours/${COURS_DE_TEST}/journal`,
      '/api/cours',
    ]);
    expect(await coursLocal(base, ALICE, COURS_DE_TEST)).toBeUndefined();
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });

  // R36 : la liste qui confirme un « introuvable » nomme la personne ; sous la session d'une autre,
  // le serveur la refuse, et le cours n'est pas oublié d'après la liste de l'autre.
  it('liste_d_une_autre_personne_n_oublie_rien', async () => {
    const base = await ouvrirBaseDeTest();
    await enregistrerCours(base, ALICE, coursServiDeTest());
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    // La session est celle de Berthe, qui n'a pas ce cours : le journal d'Alice est « introuvable »
    // pour elle, et sa liste à elle ne le contient pas.
    const sessionDeBerthe = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== '/api/cours') return json({ erreur: 'introuvable' }, 404);
      const personne = (init?.headers as Record<string, string> | undefined)?.[
        'x-ancrage-personne'
      ];
      return personne === undefined || personne === BERTHE
        ? json([])
        : json({ erreur: 'autre_personne' }, 409);
    });

    const resultat = await synchroniserCours(
      base,
      ALICE,
      COURS_DE_TEST,
      apiDuJournal(sessionDeBerthe as unknown as typeof fetch),
    );

    expect(resultat).toEqual({ etat: 'en_attente', enAttente: 1 });
    expect(sessionDeBerthe.mock.calls.at(-1)?.[1]?.headers).toEqual({
      'x-ancrage-personne': ALICE,
    });
    expect(await coursLocal(base, ALICE, COURS_DE_TEST)).toEqual(coursServiDeTest());
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });

  it('route_absente_apres_retour_arriere_n_oublie_rien', async () => {
    const base = await ouvrirBaseDeTest();
    const cours = coursServiDeTest();
    const resume: CoursResume = { id: cours.id, titre: cours.titre, langue: 'de' };
    await enregistrerCours(base, ALICE, cours);
    await enregistrerListe(base, ALICE, [resume]);
    await repondre(base, ALICE, cours.id, 1, 2);
    // Après un retour arrière vers une image d'avant le journal, toute route d'API inconnue répond
    // 404 {"erreur":"introuvable"}, comme un cours sans droit. La liste des cours, elle, existe
    // encore et contient le cours.
    const ancienneImage = vi.fn(async (url: string | URL | Request) =>
      String(url) === '/api/cours' ? json([resume]) : json({ erreur: 'introuvable' }, 404),
    );

    for (let i = 0; i < 2; i += 1) {
      const resultat = await synchroniserCours(
        base,
        ALICE,
        cours.id,
        apiDuJournal(ancienneImage as unknown as typeof fetch),
      );

      expect(resultat).toEqual({ etat: 'en_attente', enAttente: 2 });
    }

    expect(await coursLocal(base, ALICE, cours.id)).toEqual(cours);
    expect(await evenementsDuCours(base, ALICE, cours.id)).toHaveLength(2);
    expect(await listeLocale(base, ALICE)).toEqual([resume]);
    expect(await fileDuCours(base, ALICE, cours.id)).toHaveLength(2);
  });
});
