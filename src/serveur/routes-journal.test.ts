import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { type Evenement, schemaEvenement } from '../domaine/journal/evenement.js';
import { inventaireDesRoutes } from './acces/index.js';
import type { Base } from './base/base.js';
import type { Depot } from './comptes/depot.js';
import { nouveauJeton } from './comptes/jetons.js';
import { ORIGINE_DE_TEST } from './comptes/webauthn.fixture.js';
import {
  COURS_A_VERIFIER,
  COURS_SOURCE,
  ID_A_VERIFIER,
  ID_INEXISTANT,
  ID_SOURCE,
} from './cours-factices.fixture.js';
import { installerEnvironnement, ouvrirSessionDeTest } from './environnement.fixture.js';
import { LOT_MAX, PAGE_MAX } from './journal/depot-journal.js';
import {
  APPAREIL_DE_TEST,
  examenDeTest,
  idDeTest,
  reponseDeTest,
  UNITE_DE_TEST,
} from './journal/evenements.fixture.js';
import { empreinteReponse } from './reponses.fixture.js';

const T0 = new Date('2026-10-17T08:00:00.000Z');
const UN_JOUR = 24 * 60 * 60 * 1000;
const LIMITE_DU_CORPS = 1_048_576;
const NON_CONNECTE = '{"erreur":"non_connecte"}';
const INTROUVABLE = '{"erreur":"introuvable"}';
const REQUETE = '{"erreur":"requete"}';
const AUTRE_PERSONNE = '{"erreur":"autre_personne"}';
/** L'en-tête qui nomme la personne dont le téléphone envoie la file (R21). */
const ENTETE_PERSONNE = 'x-ancrage-personne';

// --- L'application et les profils ---

let base: Base;
let depot: Depot;
/** La personne de chaque session créée par `connecter`, que `envoyer` nomme par défaut. */
let personnesDesJetons: Map<string, string>;
const {
  horloge,
  journalServeur,
  creerApp: creerAppDeTest,
} = installerEnvironnement(
  (environnement) => {
    ({ base, depot } = environnement);
    personnesDesJetons = new Map();
  },
  { debut: T0, cours: [COURS_A_VERIFIER, COURS_SOURCE] },
);

/** Une session valide pour la personne, et le jeton de son cookie. */
function connecter(personne: string): string {
  const { jeton } = ouvrirSessionDeTest(depot, personne, new Date(T0.getTime() + UN_JOUR));
  personnesDesJetons.set(jeton, personne);
  return jeton;
}

function creerPersonne(nomAffiche: string, proprietaire = false): string {
  return depot.creerPersonne({ nomAffiche, langue: 'de', proprietaire }).id;
}

/** Une personne autorisée nommément sur les deux cours. */
function creerLectrice(nomAffiche: string): { id: string; jeton: string } {
  const id = creerPersonne(nomAffiche);
  for (const cours of [ID_A_VERIFIER, ID_SOURCE]) {
    depot.autoriser({ cours, sujet: { type: 'personne', id } });
  }
  return { id, jeton: connecter(id) };
}

type Corps = unknown;

/** Ce que porte l'en-tête de la personne : une valeur, plusieurs (en-tête répété), ou rien. */
type Nommee = string | string[] | null;

/**
 * La personne que nomme l'en-tête `x-ancrage-personne` : celle de la session (`connecter`) par
 * défaut, comme le téléphone ; `personne` en nomme une autre (ou plusieurs), `null` l'omet.
 */
function personneNommee(jeton: string | undefined, personne: Nommee | undefined) {
  if (personne !== undefined) return personne ?? undefined;
  return jeton === undefined ? undefined : personnesDesJetons.get(jeton);
}

/** Un envoi, comme le téléphone le fait (voir `personneNommee`). */
async function envoyer(
  app: FastifyInstance,
  cours: string,
  corps: Corps,
  jeton?: string,
  options: { sansOrigine?: boolean; personne?: Nommee } = {},
): Promise<LightMyRequestResponse> {
  const personne = personneNommee(jeton, options.personne);
  return app.inject({
    method: 'POST',
    url: `/api/cours/${cours}/journal`,
    headers: {
      ...(options.sansOrigine ? {} : { origin: ORIGINE_DE_TEST }),
      ...(personne === undefined ? {} : { [ENTETE_PERSONNE]: personne }),
    },
    ...(corps === undefined ? {} : { payload: corps as object }),
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

/** Une lecture, comme le téléphone la fait (voir `personneNommee`). */
async function lire(
  app: FastifyInstance,
  cours: string,
  jeton?: string,
  requete = '',
  method: 'GET' | 'HEAD' = 'GET',
  options: { personne?: Nommee } = {},
): Promise<LightMyRequestResponse> {
  const personne = personneNommee(jeton, options.personne);
  return app.inject({
    method,
    url: `/api/cours/${cours}/journal${requete}`,
    ...(personne === undefined ? {} : { headers: { [ENTETE_PERSONNE]: personne } }),
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

interface Page {
  evenements: Evenement[];
  curseur: number;
  suite: boolean;
}

/** Une lecture qui doit réussir. */
async function page(
  app: FastifyInstance,
  cours: string,
  jeton: string,
  requete = '',
): Promise<Page> {
  const reponse = await lire(app, cours, jeton, requete);
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as Page;
}

function nombreDeLignes(): number {
  return (base.sqlite.prepare('select count(*) as n from evenement').get() as { n: number }).n;
}

/** Des réponses `n` à `n + taille - 1` du cours. */
function lot(cours: string, depuis: number, taille: number): Evenement[] {
  return Array.from({ length: taille }, (_, i) => reponseDeTest(cours, depuis + i));
}

// --- Les tests ---

describe('POST puis GET /api/cours/:id/journal', () => {
  it('envoi_puis_lecture_sans_personne_ni_recu_a', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const envoyes = [reponseDeTest(ID_SOURCE, 1), examenDeTest(ID_SOURCE, 2)];

    const envoi = await envoyer(app, ID_SOURCE, { evenements: envoyes }, alice.jeton);

    expect(envoi.statusCode).toBe(200);
    expect(envoi.headers['cache-control']).toBe('no-store');
    expect(envoi.json()).toStrictEqual({ acceptes: 2 });
    const lecture = await lire(app, ID_SOURCE, alice.jeton);
    expect(lecture.statusCode).toBe(200);
    expect(lecture.headers['cache-control']).toBe('no-store');
    const corps = lecture.json() as Page;
    expect(Object.keys(corps)).toEqual(['evenements', 'curseur', 'suite']);
    expect(corps.evenements).toStrictEqual(envoyes);
    expect(corps.suite).toBe(false);
    // Le curseur est le numéro du dernier événement rendu : le deuxième de cette personne.
    expect(corps.curseur).toBe(2);
    // Exactement les champs du message, dans l'ordre : ni `personne`, ni `recu_a`, ni `rang`, ni
    // `numero`.
    for (const evenement of corps.evenements) {
      expect(Object.keys(evenement)).toEqual([
        'id',
        'cours',
        'unite',
        'type',
        'resultat',
        'repondu_a',
        'appareil',
        'v',
      ]);
    }
    for (const interdit of ['"personne"', '"recu_a"', '"rang"', '"numero"', alice.id]) {
      expect(lecture.body).not.toContain(interdit);
    }
    // Le serveur a ajouté ce que le message ne porte pas : la personne de la session, et l'heure
    // de son horloge.
    const lignes = base.sqlite.prepare('select personne, recu_a from evenement').all();
    expect(lignes).toStrictEqual([
      { personne: alice.id, recu_a: T0.toISOString() },
      { personne: alice.id, recu_a: T0.toISOString() },
    ]);
  });

  it('lecture_par_head_sans_corps_et_sans_cache', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 1, 2) }, alice.jeton);

    const reponse = await lire(app, ID_SOURCE, alice.jeton, '', 'HEAD');

    expect(reponse.statusCode).toBe(200);
    expect(reponse.body).toBe('');
    expect(reponse.headers['cache-control']).toBe('no-store');
  });

  it('recu_a_suit_l_horloge_de_l_application', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');

    await envoyer(app, ID_SOURCE, { evenements: [reponseDeTest(ID_SOURCE, 1)] }, alice.jeton);
    horloge.maintenant = new Date('2026-10-17T09:30:00.123Z');
    await envoyer(app, ID_SOURCE, { evenements: [reponseDeTest(ID_SOURCE, 2)] }, alice.jeton);

    const recus = base.sqlite.prepare('select recu_a from evenement order by rang').all();
    expect(recus).toStrictEqual([
      { recu_a: '2026-10-17T08:00:00.000Z' },
      { recu_a: '2026-10-17T09:30:00.123Z' },
    ]);
  });

  it('renvoi_du_meme_lot_ignore', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const envoyes = lot(ID_SOURCE, 1, 3);
    await envoyer(app, ID_SOURCE, { evenements: envoyes }, alice.jeton);
    const avant = await lire(app, ID_SOURCE, alice.jeton);

    // La réponse a été perdue : le téléphone renvoie le même lot, puis un lot qui en recouvre un
    // morceau, avec une valeur différente pour un `id` déjà connu.
    const renvoi = await envoyer(app, ID_SOURCE, { evenements: envoyes }, alice.jeton);
    const recouvrement = await envoyer(
      app,
      ID_SOURCE,
      { evenements: [reponseDeTest(ID_SOURCE, 3, false), reponseDeTest(ID_SOURCE, 4)] },
      alice.jeton,
    );

    expect(renvoi.statusCode).toBe(200);
    expect(renvoi.json()).toStrictEqual({ acceptes: 0 });
    expect(recouvrement.json()).toStrictEqual({ acceptes: 1 });
    // Rien n'est compté deux fois, et le premier reçu fait foi.
    const apres = await page(app, ID_SOURCE, alice.jeton);
    expect(apres.evenements).toStrictEqual([...envoyes, reponseDeTest(ID_SOURCE, 4)]);
    expect(apres.evenements.slice(0, 3)).toStrictEqual((avant.json() as Page).evenements);
    expect(nombreDeLignes()).toBe(4);
  });

  it('une_personne_ne_lit_jamais_le_journal_d_une_autre', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const berthe = creerLectrice('Andere Lernende Test');
    const proprietaire = connecter(creerPersonne('Prüfer Test', true));
    const deAlice = lot(ID_SOURCE, 1, 3);
    await envoyer(app, ID_SOURCE, { evenements: deAlice }, alice.jeton);

    // Même cours, même droit : le journal d'Alice n'est lisible que sous la session d'Alice.
    for (const jeton of [berthe.jeton, proprietaire]) {
      expect(await page(app, ID_SOURCE, jeton)).toStrictEqual({
        evenements: [],
        curseur: 0,
        suite: false,
      });
      // Ni en désignant la personne, ni en reprenant le curseur d'Alice.
      for (const requete of [`?personne=${alice.id}`, '?depuis=0&personne=x', '?appareil=x']) {
        expect((await page(app, ID_SOURCE, jeton, requete)).evenements, requete).toStrictEqual([]);
      }
    }
    // Berthe envoie les mêmes `id` : acceptés, et chacune ne lit que les siens.
    const memeLot = await envoyer(app, ID_SOURCE, { evenements: deAlice }, berthe.jeton);
    expect(memeLot.json()).toStrictEqual({ acceptes: 3 });
    const deBerthe = [examenDeTest(ID_SOURCE, 10)];
    await envoyer(app, ID_SOURCE, { evenements: deBerthe }, berthe.jeton);
    const pageAlice = await page(app, ID_SOURCE, alice.jeton);
    const pageBerthe = await page(app, ID_SOURCE, berthe.jeton);
    expect(pageAlice.evenements).toStrictEqual(deAlice);
    expect(pageBerthe.evenements).toStrictEqual([...deAlice, ...deBerthe]);
    // Chacune a son propre curseur.
    expect([pageAlice.curseur, pageBerthe.curseur]).toEqual([3, 4]);
    expect(nombreDeLignes()).toBe(7);
  });

  it('journal_propre_a_chaque_cours', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 1, 2) }, alice.jeton);
    await envoyer(app, ID_A_VERIFIER, { evenements: lot(ID_A_VERIFIER, 3, 1) }, alice.jeton);

    expect((await page(app, ID_SOURCE, alice.jeton)).evenements).toStrictEqual(
      lot(ID_SOURCE, 1, 2),
    );
    expect((await page(app, ID_A_VERIFIER, alice.jeton)).evenements).toStrictEqual(
      lot(ID_A_VERIFIER, 3, 1),
    );
  });
});

describe('contrôle des droits', () => {
  /** Des personnes connectées qui n'ont aucun droit effectif sur le cours « à vérifier ». */
  function installerSansDroit() {
    const groupe = depot.creerGroupe('Klasse Test').id;
    const membre = creerPersonne('Mitglied Test');
    depot.ajouterMembre(groupe, membre);
    // Un droit de groupe sur un cours « à vérifier » sans dérogation est éteint (invariant 9).
    depot.autoriser({ cours: ID_A_VERIFIER, sujet: { type: 'groupe', id: groupe } });
    const seulementSource = creerPersonne('Nur Quelle Test');
    depot.autoriser({ cours: ID_SOURCE, sujet: { type: 'personne', id: seulementSource } });
    return {
      aucune: undefined,
      sans_aucun_droit: connecter(creerPersonne('Ohne Recht Test')),
      droit_de_groupe_seulement: connecter(membre),
      droit_sur_un_autre_cours: connecter(seulementSource),
    } satisfies Record<string, string | undefined>;
  }

  it('cours_sans_droit_404_identique_a_cours_inexistant', async () => {
    const app = creerAppDeTest();
    const profils = installerSansDroit();
    // Le même cours écrit autrement : en majuscules (un autre identifiant, donc inexistant), et
    // avec un caractère encodé (le routeur le décode : c'est le même cours).
    const ecritures = [
      ID_A_VERIFIER,
      ID_A_VERIFIER.toUpperCase(),
      `${ID_A_VERIFIER.slice(0, -1)}%${ID_A_VERIFIER.charCodeAt(ID_A_VERIFIER.length - 1).toString(16)}`,
    ];
    // Le corps n'y change rien : le refus passe avant sa lecture.
    const corps: [string, Corps][] = [
      ['lot valide', { evenements: [reponseDeTest(ID_A_VERIFIER, 1)] }],
      ['lot vide', { evenements: [] }],
      ['corps invalide', { autre: true }],
      ['événement d’un autre cours', { evenements: [reponseDeTest(ID_SOURCE, 1)] }],
      ['sans corps', undefined],
    ];

    for (const [nom, jeton] of Object.entries(profils)) {
      const [statutAttendu, corpsAttendu] =
        jeton === undefined ? [401, NON_CONNECTE] : [404, INTROUVABLE];
      for (const [nomCorps, contenu] of corps) {
        const inexistant = await envoyer(app, ID_INEXISTANT, contenu, jeton);
        expect(inexistant.statusCode, `${nom} POST ${nomCorps}`).toBe(statutAttendu);
        expect(inexistant.body, `${nom} POST ${nomCorps}`).toBe(corpsAttendu);
        for (const ecriture of ecritures) {
          const sansDroit = await envoyer(app, ecriture, contenu, jeton);

          expect(empreinteReponse(sansDroit), `${nom} POST ${nomCorps} ${ecriture}`).toStrictEqual(
            empreinteReponse(inexistant),
          );
        }
      }
      for (const requete of ['', '?depuis=0', '?depuis=abc', '?depuis=-1']) {
        for (const method of ['GET', 'HEAD'] as const) {
          const inexistant = await lire(app, ID_INEXISTANT, jeton, requete, method);
          expect(inexistant.statusCode, `${nom} ${method} ${requete}`).toBe(statutAttendu);
          expect(inexistant.body).toBe(method === 'GET' ? corpsAttendu : '');
          for (const ecriture of ecritures) {
            const sansDroit = await lire(app, ecriture, jeton, requete, method);

            expect(
              empreinteReponse(sansDroit),
              `${nom} ${method} ${requete} ${ecriture}`,
            ).toStrictEqual(empreinteReponse(inexistant));
          }
        }
      }
    }
    // Aucun refus n'a rien écrit.
    expect(nombreDeLignes()).toBe(0);
  });

  it('droit_de_groupe_suspendu_404', async () => {
    const app = creerAppDeTest();
    const groupe = depot.creerGroupe('Klasse Test').id;
    const id = creerPersonne('Mitglied Test');
    depot.ajouterMembre(groupe, id);
    depot.autoriser({ cours: ID_A_VERIFIER, sujet: { type: 'groupe', id: groupe } });
    const jeton = connecter(id);

    // Un droit qui ne vient que du groupe, sur un cours « à vérifier » sans dérogation.
    const sansDroit = await envoyer(
      app,
      ID_A_VERIFIER,
      { evenements: lot(ID_A_VERIFIER, 1, 1) },
      jeton,
    );
    const inexistant = await envoyer(
      app,
      ID_INEXISTANT,
      { evenements: lot(ID_A_VERIFIER, 1, 1) },
      jeton,
    );
    expect(sansDroit.statusCode).toBe(404);
    expect(sansDroit.body).toBe(INTROUVABLE);
    expect(empreinteReponse(sansDroit)).toStrictEqual(empreinteReponse(inexistant));
    expect(nombreDeLignes()).toBe(0);

    // Un droit nommé s'ajoute : la personne révise.
    const nomme = depot.autoriser({ cours: ID_A_VERIFIER, sujet: { type: 'personne', id } });
    const avant = lot(ID_A_VERIFIER, 1, 2);
    expect((await envoyer(app, ID_A_VERIFIER, { evenements: avant }, jeton)).json()).toStrictEqual({
      acceptes: 2,
    });

    // Le droit nommé est retiré : il ne reste que celui du groupe, éteint. Lecture et envoi
    // répondent comme pour un cours inexistant, et rien n'est écrit.
    expect(depot.retirerAutorisation(nomme.id)).toBe(true);
    const lectureSuspendue = await lire(app, ID_A_VERIFIER, jeton);
    expect(empreinteReponse(lectureSuspendue)).toStrictEqual(
      empreinteReponse(await lire(app, ID_INEXISTANT, jeton)),
    );
    expect(lectureSuspendue.statusCode).toBe(404);
    const envoiSuspendu = await envoyer(
      app,
      ID_A_VERIFIER,
      { evenements: lot(ID_A_VERIFIER, 3, 1) },
      jeton,
    );
    expect(envoiSuspendu.statusCode).toBe(404);
    expect(envoiSuspendu.body).toBe(INTROUVABLE);
    expect(nombreDeLignes()).toBe(2);

    // Le droit revient : la progression est conservée, et l'envoi en attente passe.
    depot.autoriser({ cours: ID_A_VERIFIER, sujet: { type: 'personne', id } });
    expect((await page(app, ID_A_VERIFIER, jeton)).evenements).toStrictEqual(avant);
    const enAttente = lot(ID_A_VERIFIER, 3, 1);
    expect(
      (await envoyer(app, ID_A_VERIFIER, { evenements: enAttente }, jeton)).json(),
    ).toStrictEqual({
      acceptes: 1,
    });
    expect((await page(app, ID_A_VERIFIER, jeton)).evenements).toStrictEqual([
      ...avant,
      ...enAttente,
    ]);
  });

  it('sans_session_401', async () => {
    const app = creerAppDeTest();
    creerLectrice('Lernende Test');

    // Avant toute recherche du cours : un cours existant et un cours inexistant répondent pareil.
    for (const cours of [ID_SOURCE, ID_A_VERIFIER, ID_INEXISTANT]) {
      for (const jeton of [undefined, nouveauJeton()]) {
        const envoi = await envoyer(app, cours, { evenements: lot(cours, 1, 1) }, jeton);
        const lecture = await lire(app, cours, jeton);

        expect(envoi.statusCode).toBe(401);
        expect(envoi.body).toBe(NON_CONNECTE);
        expect(lecture.statusCode).toBe(401);
        expect(lecture.body).toBe(NON_CONNECTE);
      }
    }
    expect(nombreDeLignes()).toBe(0);
  });

  it('envoi_sans_origine_403_rien_n_est_ecrit', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');

    const reponse = await envoyer(
      app,
      ID_SOURCE,
      { evenements: lot(ID_SOURCE, 1, 1) },
      alice.jeton,
      {
        sansOrigine: true,
      },
    );

    expect(reponse.statusCode).toBe(403);
    expect(nombreDeLignes()).toBe(0);
  });

  // Invariant 1 : l'en-tête de la personne attendue ne change rien au refus d'un cours sans droit,
  // qu'il manque, nomme la personne de la session ou une autre. Le contrôle des droits passe avant.
  it('sans_droit_404_identique_avec_ou_sans_en_tete_de_personne', async () => {
    const app = creerAppDeTest();
    const profils = installerSansDroit();
    const autre = creerLectrice('Lernende Test');
    const lotValide = { evenements: [reponseDeTest(ID_A_VERIFIER, 1)] };

    for (const [nom, jeton] of Object.entries(profils)) {
      const [statutAttendu, corpsAttendu] =
        jeton === undefined ? [401, NON_CONNECTE] : [404, INTROUVABLE];
      for (const personne of [undefined, null, autre.id, '']) {
        const cas = `${nom}, en-tête ${personne === undefined ? 'de la session' : personne}`;
        const inexistant = await envoyer(app, ID_INEXISTANT, lotValide, jeton, { personne });
        const sansDroit = await envoyer(app, ID_A_VERIFIER, lotValide, jeton, { personne });

        expect(inexistant.statusCode, cas).toBe(statutAttendu);
        expect(inexistant.body, cas).toBe(corpsAttendu);
        expect(empreinteReponse(sansDroit), cas).toStrictEqual(empreinteReponse(inexistant));

        // La lecture de même (R32).
        for (const method of ['GET', 'HEAD'] as const) {
          const lectureInexistant = await lire(app, ID_INEXISTANT, jeton, '', method, { personne });
          const lectureSansDroit = await lire(app, ID_A_VERIFIER, jeton, '', method, { personne });

          expect(lectureInexistant.statusCode, `${cas} ${method}`).toBe(statutAttendu);
          expect(empreinteReponse(lectureSansDroit), `${cas} ${method}`).toStrictEqual(
            empreinteReponse(lectureInexistant),
          );
        }
      }
    }
    expect(nombreDeLignes()).toBe(0);
  });
});

describe('personne attendue (en-tête x-ancrage-personne, R21 et R32)', () => {
  it('en_tete_personne_absent_400', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');

    // Absent ou vide : le téléphone n'a pas dit à qui est la file. Le lot n'est pas lu.
    for (const personne of [null, '']) {
      const reponse = await envoyer(
        app,
        ID_SOURCE,
        { evenements: lot(ID_SOURCE, 1, 2) },
        alice.jeton,
        { personne },
      );

      expect(reponse.statusCode, `en-tête « ${personne} »`).toBe(400);
      expect(reponse.body).toBe(REQUETE);
      expect(reponse.headers['cache-control']).toBe('no-store');
    }
    expect(nombreDeLignes()).toBe(0);
  });

  it('lecture_en_tete_personne_absent_400', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 1, 2) }, alice.jeton);

    // Absent ou vide : le téléphone n'a pas dit dans quelle partition il range ce qu'il lit.
    for (const personne of [null, '']) {
      for (const method of ['GET', 'HEAD'] as const) {
        const reponse = await lire(app, ID_SOURCE, alice.jeton, '?depuis=0', method, { personne });

        expect(reponse.statusCode, `${method} en-tête « ${personne} »`).toBe(400);
        expect(reponse.body).toBe(method === 'GET' ? REQUETE : '');
        expect(reponse.headers['cache-control']).toBe('no-store');
      }
    }
    // Avec l'en-tête de sa session, la lecture passe.
    expect((await page(app, ID_SOURCE, alice.jeton)).evenements).toHaveLength(2);
  });

  it('lecture_autre_personne_409', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const berthe = creerLectrice('Andere Lernende Test');
    const deAlice = lot(ID_SOURCE, 1, 2);
    const deBerthe = lot(ID_SOURCE, 10, 3);
    await envoyer(app, ID_SOURCE, { evenements: deAlice }, alice.jeton);
    await envoyer(app, ID_SOURCE, { evenements: deBerthe }, berthe.jeton);

    // Le téléphone range le journal d'Alice, mais la session est devenue celle de Berthe (un
    // autre onglet) : il ne reçoit rien, ni de l'une ni de l'autre.
    // Un en-tête répété, même deux fois la personne de la session, arrive joint : refusé aussi.
    for (const personne of [alice.id, 'personne-inconnue', [berthe.id, berthe.id]]) {
      const reponse = await lire(app, ID_SOURCE, berthe.jeton, '?depuis=0', 'GET', { personne });

      expect(reponse.statusCode, String(personne)).toBe(409);
      expect(reponse.body).toBe(AUTRE_PERSONNE);
      expect(reponse.headers['cache-control']).toBe('no-store');
    }
    // Sous la bonne session, chacune lit le sien.
    expect((await page(app, ID_SOURCE, alice.jeton)).evenements).toStrictEqual(deAlice);
    expect((await page(app, ID_SOURCE, berthe.jeton)).evenements).toStrictEqual(deBerthe);
  });

  it('autre_personne_409_sans_ecrire', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const berthe = creerLectrice('Andere Lernende Test');
    const deBerthe = { evenements: lot(ID_SOURCE, 1, 2) };

    // Le téléphone envoie la file de Berthe alors que la session est celle d'Alice (une autre
    // personne s'est connectée entre-temps) : rien n'est écrit, ni chez l'une ni chez l'autre, quel
    // que soit le corps.
    for (const corps of [deBerthe, { evenements: [] }, undefined]) {
      const reponse = await envoyer(app, ID_SOURCE, corps, alice.jeton, { personne: berthe.id });

      expect(reponse.statusCode).toBe(409);
      expect(reponse.body).toBe(AUTRE_PERSONNE);
      expect(reponse.headers['cache-control']).toBe('no-store');
    }
    // Une personne qui n'existe pas n'est pas mieux reçue, ni un en-tête répété, même deux fois la
    // personne de la session : Node joint les valeurs (« a, a »), qui ne nomment personne.
    for (const personne of ['personne-inconnue', [alice.id, alice.id], [alice.id, berthe.id]]) {
      const reponse = await envoyer(app, ID_SOURCE, deBerthe, alice.jeton, { personne });

      expect(reponse.statusCode, String(personne)).toBe(409);
      expect(reponse.body).toBe(AUTRE_PERSONNE);
    }
    expect(nombreDeLignes()).toBe(0);
    expect((await page(app, ID_SOURCE, alice.jeton)).evenements).toStrictEqual([]);
    expect((await page(app, ID_SOURCE, berthe.jeton)).evenements).toStrictEqual([]);

    // Sous sa propre session, la file de Berthe passe.
    const sienne = await envoyer(app, ID_SOURCE, deBerthe, berthe.jeton);
    expect(sienne.json()).toStrictEqual({ acceptes: 2 });
    expect(nombreDeLignes()).toBe(2);
  });
});

describe('validation du lot', () => {
  it('evenement_d_un_autre_cours_400', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');

    // Un événement d'un cours où Alice a pourtant le droit, puis d'un cours qui n'existe pas :
    // le lot entier est refusé, y compris ses événements valides.
    for (const autre of [ID_A_VERIFIER, ID_INEXISTANT]) {
      const reponse = await envoyer(
        app,
        ID_SOURCE,
        { evenements: [reponseDeTest(ID_SOURCE, 1), reponseDeTest(autre, 2)] },
        alice.jeton,
      );

      expect(reponse.statusCode).toBe(400);
      expect(reponse.body).toBe(REQUETE);
    }
    expect(nombreDeLignes()).toBe(0);
  });

  it('lot_de_501_refuse', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');

    const trop = await envoyer(
      app,
      ID_SOURCE,
      { evenements: lot(ID_SOURCE, 1, LOT_MAX + 1) },
      alice.jeton,
    );
    expect(trop.statusCode).toBe(400);
    expect(trop.body).toBe(REQUETE);
    expect(trop.headers['cache-control']).toBe('no-store');
    expect(nombreDeLignes()).toBe(0);

    // La limite elle-même passe.
    const plein = await envoyer(
      app,
      ID_SOURCE,
      { evenements: lot(ID_SOURCE, 1, LOT_MAX) },
      alice.jeton,
    );
    expect(plein.statusCode).toBe(200);
    expect(plein.json()).toStrictEqual({ acceptes: LOT_MAX });
    expect(nombreDeLignes()).toBe(LOT_MAX);
  });

  it('corps_mal_forme_400_rien_n_est_ecrit', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const valide = reponseDeTest(ID_SOURCE, 1);
    const cas: [string, Corps][] = [
      ['lot vide', { evenements: [] }],
      ['sans le champ evenements', {}],
      ['evenements n’est pas une liste', { evenements: valide }],
      ['evenements nul', { evenements: null }],
      ['champ en plus dans le corps', { evenements: [valide], personne: alice.id }],
      ['la liste elle-même', [valide]],
      ['un événement invalide dans le lot', { evenements: [valide, { ...valide, id: 'x' }] }],
      ['un événement nul', { evenements: [valide, null] }],
      ['version inconnue', { evenements: [{ ...valide, v: 2 }] }],
      ['résultat en trop', { evenements: [{ ...valide, resultat: { juste: true, saisie: 'x' } }] }],
      ['sans corps', undefined],
    ];

    for (const [nom, corps] of cas) {
      const reponse = await envoyer(app, ID_SOURCE, corps, alice.jeton);

      expect(reponse.statusCode, nom).toBe(400);
      expect(reponse.body, nom).toBe(REQUETE);
      expect(reponse.headers['cache-control'], nom).toBe('no-store');
    }
    expect(nombreDeLignes()).toBe(0);
  });

  it('champ_personne_dans_le_message_400', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const berthe = creerLectrice('Andere Lernende Test');
    const valide = reponseDeTest(ID_SOURCE, 1);

    // La personne vient de la session : un message qui en désigne une, la sienne ou une autre, est
    // refusé en entier. Il en va de même des champs que seul le serveur écrit.
    const champs: [string, unknown][] = [
      ['personne', alice.id],
      ['personne', berthe.id],
      ['recu_a', '2026-01-01T00:00:00.000Z'],
      ['rang', 1],
      ['numero', 1],
    ];
    for (const [champ, valeur] of champs) {
      const reponse = await envoyer(
        app,
        ID_SOURCE,
        { evenements: [valide, { ...reponseDeTest(ID_SOURCE, 2), [champ]: valeur }] },
        alice.jeton,
      );

      expect(reponse.statusCode, champ).toBe(400);
      expect(reponse.body, champ).toBe(REQUETE);
    }
    expect(nombreDeLignes()).toBe(0);
  });
});

describe('GET /api/cours/:id/journal', () => {
  it('pagination_par_curseur', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const tous = lot(ID_SOURCE, 1, 1500);
    for (let debut = 0; debut < tous.length; debut += LOT_MAX) {
      const envoi = await envoyer(
        app,
        ID_SOURCE,
        { evenements: tous.slice(debut, debut + LOT_MAX) },
        alice.jeton,
      );
      expect(envoi.json()).toStrictEqual({ acceptes: LOT_MAX });
    }

    const premiere = await page(app, ID_SOURCE, alice.jeton);
    const deuxieme = await page(app, ID_SOURCE, alice.jeton, `?depuis=${premiere.curseur}`);
    const derniere = await page(app, ID_SOURCE, alice.jeton, `?depuis=${deuxieme.curseur}`);

    expect(premiere.evenements).toHaveLength(PAGE_MAX);
    expect(premiere.suite).toBe(true);
    expect(premiere.evenements).toStrictEqual(tous.slice(0, PAGE_MAX));
    expect(deuxieme.evenements).toHaveLength(500);
    expect(deuxieme.suite).toBe(false);
    expect(deuxieme.evenements).toStrictEqual(tous.slice(PAGE_MAX));
    // Les curseurs sont les numéros des derniers événements rendus, de 1 à 1500.
    expect([premiere.curseur, deuxieme.curseur]).toEqual([PAGE_MAX, 1500]);
    // Une page vide garde le curseur reçu, et `depuis=0` vaut l'absence de `depuis`.
    expect(derniere).toStrictEqual({ evenements: [], curseur: 1500, suite: false });
    expect(await page(app, ID_SOURCE, alice.jeton, '?depuis=0')).toStrictEqual(premiere);
  });

  // L'écart entre deux curseurs d'une personne ne doit compter que ses propres événements dans ce
  // cours : pas ceux des autres personnes, ni les siens dans un autre cours (invariant 1).
  it('curseur_ne_revele_rien_des_autres', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const berthe = creerLectrice('Andere Lernende Test');
    const proprietaire = connecter(creerPersonne('Prüfer Test', true));
    const deAlice = (depuis: number, taille: number) => lot(ID_SOURCE, depuis, taille);

    // Alice lit après chaque série d'envois ; entre deux de ses lectures, d'autres écrivent.
    await envoyer(app, ID_SOURCE, { evenements: deAlice(1, 1) }, alice.jeton);
    const premiere = await page(app, ID_SOURCE, alice.jeton);

    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 100, 3) }, berthe.jeton);
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 200, 2) }, proprietaire);
    await envoyer(app, ID_A_VERIFIER, { evenements: lot(ID_A_VERIFIER, 300, 2) }, alice.jeton);
    await envoyer(app, ID_SOURCE, { evenements: deAlice(2, 1) }, alice.jeton);
    const deuxieme = await page(app, ID_SOURCE, alice.jeton, `?depuis=${premiere.curseur}`);

    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 400, 4) }, berthe.jeton);
    await envoyer(app, ID_A_VERIFIER, { evenements: lot(ID_A_VERIFIER, 500, 1) }, berthe.jeton);
    await envoyer(app, ID_SOURCE, { evenements: deAlice(3, 1) }, alice.jeton);
    const troisieme = await page(app, ID_SOURCE, alice.jeton, `?depuis=${deuxieme.curseur}`);

    // Les curseurs se suivent sans trou, et chaque lecture rend exactement ses événements.
    expect([premiere.curseur, deuxieme.curseur, troisieme.curseur]).toEqual([1, 2, 3]);
    expect(deuxieme.evenements).toStrictEqual(deAlice(2, 1));
    expect(troisieme.evenements).toStrictEqual(deAlice(3, 1));
    // Chaque cours a sa propre suite, et chaque personne la sienne.
    const autreCours = await page(app, ID_A_VERIFIER, alice.jeton);
    expect(autreCours.curseur).toBe(2);
    expect((await page(app, ID_SOURCE, berthe.jeton)).curseur).toBe(7);
    expect((await page(app, ID_SOURCE, proprietaire)).curseur).toBe(2);
  });

  it('depuis_au_dela_du_dernier_numero_rend_le_dernier', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const berthe = creerLectrice('Andere Lernende Test');
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 1, 3) }, alice.jeton);
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 10, 5) }, berthe.jeton);

    // Une base restaurée d'une sauvegarde plus ancienne : le téléphone d'Alice a un curseur plus
    // grand que tout ce qui existe. Le curseur rendu recule au dernier numéro, que le client lit.
    for (const depuis of [3, 4, 5, 1000000]) {
      const reponse = await page(app, ID_SOURCE, alice.jeton, `?depuis=${depuis}`);

      expect(reponse, `depuis ${depuis}`).toStrictEqual({
        evenements: [],
        curseur: 3,
        suite: false,
      });
    }
    // Aucun événement dans ce cours : 0, qu'on y ait lu ou non ailleurs.
    expect(await page(app, ID_A_VERIFIER, alice.jeton, '?depuis=7')).toStrictEqual({
      evenements: [],
      curseur: 0,
      suite: false,
    });
    // Et le curseur reculé permet de tout relire.
    expect((await page(app, ID_SOURCE, alice.jeton, '?depuis=0')).evenements).toStrictEqual(
      lot(ID_SOURCE, 1, 3),
    );
  });

  it('depuis_invalide_400', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 1, 2) }, alice.jeton);
    const invalides = [
      '?depuis=-1',
      '?depuis=abc',
      '?depuis=',
      '?depuis=1.5',
      '?depuis=1e3',
      '?depuis=0x10',
      '?depuis=01',
      '?depuis=%201',
      '?depuis=NaN',
      '?depuis=9007199254740993',
      '?depuis=1&depuis=2',
    ];

    for (const requete of invalides) {
      const reponse = await lire(app, ID_SOURCE, alice.jeton, requete);

      expect(reponse.statusCode, requete).toBe(400);
      expect(reponse.body, requete).toBe(REQUETE);
      expect(reponse.headers['cache-control'], requete).toBe('no-store');
    }
    // Les valeurs valides, elles, passent.
    for (const requete of ['', '?depuis=0', '?depuis=1', '?depuis=999999']) {
      expect((await lire(app, ID_SOURCE, alice.jeton, requete)).statusCode, requete).toBe(200);
    }
  });

  it('lot_et_page_pleins_sous_la_limite_du_corps', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    // L'événement le plus long que le schéma accepte : un examen aux nombres les plus grands, et
    // une unité lue à l'envers.
    const plusLong = (n: number): Evenement => ({
      id: idDeTest(n),
      cours: ID_SOURCE,
      unite: `${UNITE_DE_TEST}:inverse`,
      type: 'examen',
      resultat: {
        points: Number.MAX_SAFE_INTEGER,
        questions: Number.MAX_SAFE_INTEGER,
        note: 5.5,
        minutes: Number.MAX_SAFE_INTEGER,
        chapitres: Number.MAX_SAFE_INTEGER,
      },
      repondu_a: '2026-10-17T23:59:59.999-12:00',
      appareil: APPAREIL_DE_TEST,
      v: 1,
    });
    expect(schemaEvenement.safeParse(plusLong(1)).success).toBe(true);
    const premier = Array.from({ length: LOT_MAX }, (_, i) => plusLong(i + 1));
    const second = Array.from({ length: LOT_MAX }, (_, i) => plusLong(LOT_MAX + i + 1));

    // Un lot plein, tel que le téléphone l'envoie.
    const octetsDuLot = Buffer.byteLength(JSON.stringify({ evenements: premier }));
    expect(octetsDuLot).toBeLessThan(LIMITE_DU_CORPS);
    const envoi = await envoyer(app, ID_SOURCE, { evenements: premier }, alice.jeton);
    expect(envoi.statusCode).toBe(200);
    expect(envoi.json()).toStrictEqual({ acceptes: LOT_MAX });
    await envoyer(app, ID_SOURCE, { evenements: second }, alice.jeton);

    // Une page pleine, telle que le serveur la rend.
    const lecture = await lire(app, ID_SOURCE, alice.jeton);
    expect(lecture.statusCode).toBe(200);
    expect((lecture.json() as Page).evenements).toHaveLength(PAGE_MAX);
    expect(lecture.rawPayload.length).toBeLessThan(LIMITE_DU_CORPS);
  });
});

describe('inventaire et journal du serveur', () => {
  it('routes_du_journal_classees_cours', async () => {
    const app = creerAppDeTest();
    await app.ready();

    const inventaire = inventaireDesRoutes(app).filter((route) => route.url.includes('/journal'));

    expect(inventaire).toHaveLength(3);
    expect(inventaire).toEqual(
      expect.arrayContaining([
        { methode: 'POST', url: '/api/cours/:id/journal', acces: 'cours' },
        { methode: 'GET', url: '/api/cours/:id/journal', acces: 'cours' },
        { methode: 'HEAD', url: '/api/cours/:id/journal', acces: 'cours' },
      ]),
    );
  });

  // Le journal ne fait que grandir (invariant 5) : aucune route ne modifie ni ne supprime.
  it('aucune_route_ne_modifie_ni_ne_supprime_un_evenement', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    await envoyer(app, ID_SOURCE, { evenements: lot(ID_SOURCE, 1, 2) }, alice.jeton);
    const avant = base.sqlite.prepare('select * from evenement order by rang').all();

    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      for (const url of [
        `/api/cours/${ID_SOURCE}/journal`,
        `/api/cours/${ID_SOURCE}/journal/${idDeTest(1)}`,
      ]) {
        const reponse = await app.inject({
          method,
          url,
          headers: { origin: ORIGINE_DE_TEST },
          cookies: { ancrage_session: alice.jeton },
        });

        expect(reponse.statusCode, `${method} ${url}`).toBe(404);
        expect(reponse.body, `${method} ${url}`).toBe(INTROUVABLE);
      }
    }
    expect(base.sqlite.prepare('select * from evenement order by rang').all()).toStrictEqual(avant);
  });

  it('journal_du_serveur_sans_contenu_ni_identifiant_de_personne_ou_d_unite', async () => {
    const app = creerAppDeTest();
    const alice = creerLectrice('Lernende Test');
    const sansDroit = connecter(creerPersonne('Ohne Recht Test'));
    const evenement = reponseDeTest(ID_SOURCE, 1);

    await envoyer(app, ID_SOURCE, { evenements: [evenement] }, alice.jeton);
    await envoyer(
      app,
      ID_SOURCE,
      { evenements: [evenement, { ...evenement, personne: alice.id }] },
      alice.jeton,
    );
    await envoyer(app, ID_SOURCE, { evenements: [{ ...evenement, id: 'x' }] }, alice.jeton);
    await envoyer(app, ID_SOURCE, { evenements: [evenement] }, sansDroit);
    // Un corps qui n'est pas du JSON : l'analyse échoue avant la route, et l'erreur est journalisée.
    await app.inject({
      method: 'POST',
      url: `/api/cours/${ID_SOURCE}/journal`,
      headers: { origin: ORIGINE_DE_TEST, 'content-type': 'application/json' },
      cookies: { ancrage_session: alice.jeton },
      payload: '{"evenements":[{"unite":"unite-secrete","juste":',
    });
    await lire(app, ID_SOURCE, alice.jeton);
    await lire(app, ID_SOURCE, alice.jeton, '?depuis=abc');
    await lire(app, ID_A_VERIFIER, sansDroit);

    // Les requêtes sont journalisées (méthode et chemin) : il y a bien des lignes à contrôler.
    const journal = journalServeur.lignes.join('\n');
    expect(journalServeur.lignes.length).toBeGreaterThan(0);
    expect(journal).toContain('/api/cours/');
    for (const secret of [
      alice.id,
      evenement.id,
      evenement.appareil,
      evenement.unite,
      'unite-secrete',
      'juste',
    ]) {
      expect(journal, secret).not.toContain(secret);
    }
  });
});
