import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { versCoursAcces } from '../domaine/contenu/acces-cours.js';
import type { Cours, Module } from '../domaine/contenu/modele.js';
import type { Base } from './base/base.js';
import type { Depot } from './comptes/depot.js';
import { nouveauJeton } from './comptes/jetons.js';
import {
  CATALOGUE,
  COURS_A_VERIFIER,
  COURS_DEROGE,
  COURS_SOURCE,
  ID_A_VERIFIER,
  ID_DEROGE,
  ID_INEXISTANT,
  ID_SOURCE,
} from './cours-factices.fixture.js';
import { installerEnvironnement, ouvrirSessionDeTest, T0 } from './environnement.fixture.js';
import { demander, empreinteReponse } from './reponses.fixture.js';

const UN_JOUR = 24 * 60 * 60 * 1000;
const NON_CONNECTE = '{"erreur":"non_connecte"}';
const INTROUVABLE = '{"erreur":"introuvable"}';
const AUTRE_PERSONNE = '{"erreur":"autre_personne"}';
const ENTETE_PERSONNE = 'x-ancrage-personne';

const RESUME_A_VERIFIER = { id: ID_A_VERIFIER, titre: 'Übungskurs', langue: 'de' };
const RESUME_SOURCE = { id: ID_SOURCE, titre: 'Quellenkurs', langue: 'de' };
const RESUME_DEROGE = { id: ID_DEROGE, titre: 'Ausnahmekurs', langue: 'de' };

// --- L'application et les profils ---

let base: Base;
let depot: Depot;
const { creerApp: creerAppDeTest } = installerEnvironnement(
  (environnement) => {
    ({ base, depot } = environnement);
  },
  { cours: CATALOGUE },
);

/** Une session valide pour la personne, et le jeton de son cookie. */
function connecter(personne: string): string {
  return ouvrirSessionDeTest(depot, personne, new Date(T0.getTime() + UN_JOUR)).jeton;
}

function creerPersonne(nomAffiche: string, proprietaire = false): string {
  return depot.creerPersonne({ nomAffiche, langue: 'de', proprietaire }).id;
}

/*
 * Les profils de la tâche 1 (`src/domaine/acces.test.ts`), en base :
 * - la personne autorisée nommément l'est sur le cours « à vérifier » et sur le cours `source` ;
 * - le groupe autorisé l'est sur les trois cours. Son droit sur le cours « à vérifier » est éteint
 *   (invariant 9), pas celui sur le cours dérogé ;
 * - l'autre groupe ne l'est que sur un cours qui n'est pas chargé.
 */
function installerProfils() {
  const groupeAutorise = depot.creerGroupe('Klasse Test').id;
  const autreGroupe = depot.creerGroupe('Andere Klasse Test').id;
  const nommee = creerPersonne('Lernende Test');
  const membre = creerPersonne('Mitglied Test');
  const membreAutre = creerPersonne('Andere Test');
  depot.ajouterMembre(groupeAutorise, membre);
  depot.ajouterMembre(autreGroupe, membreAutre);
  for (const cours of [ID_A_VERIFIER, ID_SOURCE]) {
    depot.autoriser({ cours, sujet: { type: 'personne', id: nommee } });
  }
  for (const cours of [ID_A_VERIFIER, ID_SOURCE, ID_DEROGE]) {
    depot.autoriser({ cours, sujet: { type: 'groupe', id: groupeAutorise } });
  }
  depot.autoriser({ cours: ID_INEXISTANT, sujet: { type: 'groupe', id: autreGroupe } });
  return {
    aucune: undefined,
    proprietaire: connecter(creerPersonne('Prüfer Test', true)),
    autorisee_nommement: connecter(nommee),
    membre_d_un_groupe_autorise: connecter(membre),
    membre_d_un_autre_groupe: connecter(membreAutre),
    sans_aucun_droit: connecter(creerPersonne('Ohne Recht Test')),
  } satisfies Record<string, string | undefined>;
}

type Profils = ReturnType<typeof installerProfils>;
type NomProfil = keyof Profils;

/**
 * Une lecture dont l'en-tête `x-ancrage-personne` nomme `personne` (une valeur, ou plusieurs pour
 * un en-tête répété) ; sans `personne`, pas d'en-tête.
 */
async function demanderPour(
  app: FastifyInstance,
  url: string,
  jeton: string | undefined,
  personne: string | string[] | undefined,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    ...(personne === undefined ? {} : { headers: { [ENTETE_PERSONNE]: personne } }),
    ...(jeton === undefined ? {} : { cookies: { ancrage_session: jeton } }),
  });
}

async function liste(app: FastifyInstance, jeton?: string): Promise<unknown> {
  const reponse = await demander(app, '/api/cours', jeton);
  expect(reponse.statusCode).toBe(200);
  return reponse.json();
}

/**
 * Ce que l'API doit servir d'un cours, écrit indépendamment de `routes-cours.ts` et passé par JSON
 * comme la réponse.
 */
function contenuAttendu(cours: Cours): unknown {
  const { dossier: _dossier, derogationDiffusion: _derogation, ...reste } = cours;
  const modules = cours.modules.map(({ fichier: _fichier, ...module }) => module);
  return JSON.parse(JSON.stringify({ ...reste, modules }));
}

/**
 * Les chemins de clés d'un contenu servi, imbriqués compris : `cle`, `cle.sous`, `cle[].sous`.
 */
function collecterChemins(valeur: unknown, chemin: string, chemins: Set<string>): void {
  if (Array.isArray(valeur)) {
    for (const element of valeur) collecterChemins(element, `${chemin}[]`, chemins);
  } else if (typeof valeur === 'object' && valeur !== null) {
    for (const [cle, sous] of Object.entries(valeur)) {
      const sousChemin = chemin === '' ? cle : `${chemin}.${cle}`;
      chemins.add(sousChemin);
      collecterChemins(sous, sousChemin, chemins);
    }
  }
}

// --- Les tests ---

describe('cours factices', () => {
  it('cours_factices_un_a_verifier_un_source_un_deroge', () => {
    expect(versCoursAcces(COURS_A_VERIFIER)).toEqual({
      id: ID_A_VERIFIER,
      aVerifier: true,
      derogation: false,
    });
    expect(versCoursAcces(COURS_SOURCE)).toEqual({
      id: ID_SOURCE,
      aVerifier: false,
      derogation: false,
    });
    expect(versCoursAcces(COURS_DEROGE)).toEqual({
      id: ID_DEROGE,
      aVerifier: true,
      derogation: true,
    });
  });
});

describe('GET /api/cours', () => {
  it('liste_vide_sans_droit', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    expect(await liste(app, profils.sans_aucun_droit)).toStrictEqual([]);
    expect(await liste(app, profils.membre_d_un_autre_groupe)).toStrictEqual([]);
  });

  it('liste_par_droit_nommement', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    expect(await liste(app, profils.autorisee_nommement)).toStrictEqual([
      RESUME_A_VERIFIER,
      RESUME_SOURCE,
    ]);
  });

  it('liste_par_groupe', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    // Le cours « à vérifier » sans dérogation n'est pas ouvert au groupe (invariant 9).
    expect(await liste(app, profils.membre_d_un_groupe_autorise)).toStrictEqual([
      RESUME_SOURCE,
      RESUME_DEROGE,
    ]);
  });

  it('proprietaire_voit_tout', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    expect(await liste(app, profils.proprietaire)).toStrictEqual([
      RESUME_A_VERIFIER,
      RESUME_SOURCE,
      RESUME_DEROGE,
    ]);
  });

  it('liste_non_connecte_401', async () => {
    const app = creerAppDeTest();
    installerProfils();

    for (const jeton of [undefined, nouveauJeton()]) {
      const reponse = await demander(app, '/api/cours', jeton);

      expect(reponse.statusCode).toBe(401);
      expect(reponse.body).toBe(NON_CONNECTE);
    }
  });
});

describe('GET /api/cours/:id', () => {
  it('cours_non_connecte_401', async () => {
    const app = creerAppDeTest();
    installerProfils();

    // Avant toute recherche du cours : un cours existant et un cours inexistant répondent pareil.
    for (const id of [ID_SOURCE, ID_A_VERIFIER, ID_INEXISTANT]) {
      for (const jeton of [undefined, nouveauJeton()]) {
        const reponse = await demander(app, `/api/cours/${id}`, jeton);

        expect(reponse.statusCode).toBe(401);
        expect(reponse.body).toBe(NON_CONNECTE);
      }
    }
  });

  it('cours_sans_droit_identique_a_cours_inexistant', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();
    // Le même cours écrit autrement : en majuscules (un autre identifiant, donc inexistant), et
    // avec un caractère encodé (le routeur le décode : c'est le même cours).
    const ecritures = [
      ID_SOURCE,
      ID_A_VERIFIER,
      ID_DEROGE,
      ID_SOURCE.toUpperCase(),
      `${ID_SOURCE.slice(0, -1)}%${ID_SOURCE.charCodeAt(ID_SOURCE.length - 1).toString(16)}`,
    ];

    for (const nom of ['aucune', 'sans_aucun_droit', 'membre_d_un_autre_groupe'] as const) {
      const jeton = profils[nom];
      const [statutAttendu, corpsAttendu] =
        nom === 'aucune' ? [401, NON_CONNECTE] : [404, INTROUVABLE];
      for (const method of ['GET', 'HEAD'] as const) {
        const inexistant = await demander(app, `/api/cours/${ID_INEXISTANT}`, jeton, method);
        // La réponse de référence elle-même est figée, pour GET comme pour HEAD (sans corps).
        expect(inexistant.statusCode, `${nom} ${method}`).toBe(statutAttendu);
        expect(inexistant.body, `${nom} ${method}`).toBe(method === 'GET' ? corpsAttendu : '');
        for (const ecriture of ecritures) {
          const sansDroit = await demander(app, `/api/cours/${ecriture}`, jeton, method);

          expect(empreinteReponse(sansDroit), `${nom} ${method} ${ecriture}`).toStrictEqual(
            empreinteReponse(inexistant),
          );
        }
      }
      if (nom !== 'aucune') {
        // Et c'est la réponse d'une route qui n'existe pas.
        const reponse = await demander(app, `/api/cours/${ID_INEXISTANT}`, jeton);
        const routeInexistante = await demander(app, '/api/inexistante', jeton);
        expect(empreinteReponse(reponse)).toStrictEqual(empreinteReponse(routeInexistante));
      }
    }
  });

  // Les autorisations sont lues avant de chercher le cours : une base en panne répond pareil pour
  // un cours existant et pour un cours inexistant, et la lecture ne trahit pas son existence.
  it('autorisations_illisibles_meme_reponse_cours_existant_ou_inexistant', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();
    base.sqlite.exec('ALTER TABLE autorisation RENAME TO autorisation_cachee');

    for (const nom of ['sans_aucun_droit', 'membre_d_un_autre_groupe', 'proprietaire'] as const) {
      const inexistant = await demander(app, `/api/cours/${ID_INEXISTANT}`, profils[nom]);
      expect(inexistant.statusCode, nom).toBe(500);
      for (const id of [ID_SOURCE, ID_A_VERIFIER]) {
        const existant = await demander(app, `/api/cours/${id}`, profils[nom]);

        expect(empreinteReponse(existant), `${nom} ${id}`).toStrictEqual(
          empreinteReponse(inexistant),
        );
      }
    }
  });

  it('contenu_servi_avec_droit', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    for (const [jeton, cours] of [
      [profils.autorisee_nommement, COURS_A_VERIFIER],
      [profils.autorisee_nommement, COURS_SOURCE],
      [profils.membre_d_un_groupe_autorise, COURS_DEROGE],
    ] as const) {
      const reponse = await demander(app, `/api/cours/${cours.id}`, jeton);

      expect(reponse.statusCode).toBe(200);
      expect(reponse.headers['cache-control']).toBe('no-store');
      const corps = reponse.json() as Record<string, unknown> & { modules: object[] };
      expect(Object.keys(corps).sort()).toEqual([
        'id',
        'langue',
        'leitner',
        'modules',
        'titre',
        'typesDeCarte',
      ]);
      expect(corps.leitner).toStrictEqual({
        intervalles: [0, 1, 2, 4, 8, 16],
        nouvellesParSeance: 15,
      });
      expect(corps).toStrictEqual(contenuAttendu(cours));
      // Ce qui ne regarde que le serveur ou l'administration n'est servi à aucun niveau.
      expect(corps).not.toHaveProperty('dossier');
      expect(corps).not.toHaveProperty('derogationDiffusion');
      expect(corps.modules.length).toBe(cours.modules.length);
      for (const module of corps.modules) {
        expect(module).not.toHaveProperty('fichier');
      }
      expect(reponse.body).not.toContain('"fichier"');
      expect(reponse.body).not.toContain('"dossier"');
      expect(reponse.body).not.toContain('derogation');
    }
  });

  // Les modules sont servis par la liste blanche de `moduleServi` : un champ ajouté au modèle d'un
  // module, même imbriqué ou facultatif, fait échouer ce test, et on décide alors s'il doit sortir.
  it('cles_servies_de_chaque_type_de_module', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();
    // Les chemins de clés servis par type de module, imbriqués et facultatifs compris.
    const CLES_ATTENDUES = {
      cartes: [
        'cartes',
        'cartes[].id',
        'cartes[].recto',
        'cartes[].reponses',
        'cartes[].statut',
        'cartes[].type',
        'cartes[].verifieLe',
        'cartes[].verso',
        'id',
        'numero',
        'titre',
        'type',
      ],
      morphologie: [
        'chapitres',
        'description',
        'id',
        'morphemes',
        'morphemes[].categorie',
        'morphemes[].forme',
        'morphemes[].id',
        'morphemes[].sens',
        'morphemes[].statut',
        'morphemes[].verifieLe',
        'mots',
        'mots[].id',
        'mots[].mot',
        'mots[].segments',
        'mots[].segments[].morpheme',
        'mots[].segments[].texte',
        'mots[].sens',
        'mots[].statut',
        'mots[].verifieLe',
        'titre',
        'type',
      ],
      schema: [
        'description',
        'dessin',
        'id',
        'note',
        'points',
        'points[].id',
        'points[].sens',
        'points[].terme',
        'points[].x',
        'points[].y',
        'statut',
        'titre',
        'type',
        'verifieLe',
        'viewbox',
      ],
      'texte-annote': [
        'consigne',
        'description',
        'id',
        'reussite',
        'textes',
        'textes[].id',
        'textes[].questions',
        'textes[].questions[].distracteurs',
        'textes[].questions[].id',
        'textes[].questions[].question',
        'textes[].questions[].reponse',
        'textes[].segments',
        'textes[].segments[].jeton',
        'textes[].segments[].jeton.forme',
        'textes[].segments[].jeton.id',
        'textes[].segments[].jeton.sens',
        'textes[].segments[].texte',
        'textes[].statut',
        'textes[].texte',
        'textes[].titre',
        'textes[].verifieLe',
        'titre',
        'type',
      ],
      exercices: [
        'description',
        'familles',
        'familles[].code',
        'familles[].exercices',
        'familles[].exercices[].id',
        'familles[].exercices[].invite',
        'familles[].exercices[].options',
        'familles[].exercices[].regle',
        'familles[].exercices[].reponse',
        'familles[].exercices[].statut',
        'familles[].exercices[].verifieLe',
        'familles[].libelle',
        'id',
        'titre',
        'type',
      ],
      feuille: [
        'id',
        'numero',
        'parties',
        'parties[].taches',
        'parties[].taches[].affirmations',
        'parties[].taches[].affirmations[].affirmation',
        'parties[].taches[].affirmations[].correction',
        'parties[].taches[].affirmations[].id',
        'parties[].taches[].affirmations[].statut',
        'parties[].taches[].affirmations[].vrai',
        'parties[].taches[].categories',
        'parties[].taches[].consigne',
        'parties[].taches[].elements',
        'parties[].taches[].elements[].categorie',
        'parties[].taches[].elements[].id',
        'parties[].taches[].elements[].statut',
        'parties[].taches[].elements[].terme',
        'parties[].taches[].genre',
        'parties[].taches[].id',
        'parties[].taches[].liste',
        'parties[].taches[].mots',
        'parties[].taches[].mots[].fautif',
        'parties[].taches[].mots[].id',
        'parties[].taches[].mots[].reponse',
        'parties[].taches[].mots[].statut',
        'parties[].taches[].paires',
        'parties[].taches[].paires[].cible',
        'parties[].taches[].paires[].id',
        'parties[].taches[].paires[].statut',
        'parties[].taches[].paires[].terme',
        'parties[].taches[].paires[].verifieLe',
        'parties[].taches[].phrases',
        'parties[].taches[].phrases[].id',
        'parties[].taches[].phrases[].reponses',
        'parties[].taches[].phrases[].statut',
        'parties[].taches[].phrases[].texte',
        'parties[].taches[].questions',
        'parties[].taches[].questions[].distracteurs',
        'parties[].taches[].questions[].id',
        'parties[].taches[].questions[].question',
        'parties[].taches[].questions[].reponse',
        'parties[].taches[].questions[].statut',
        'parties[].titre',
        'titre',
        'type',
      ],
      examen: [
        'id',
        'minutesMinimum',
        'noteSuffisante',
        'secondesParQuestion',
        'seuilChapitre',
        'tailleParDefaut',
        'tailles',
        'tirage',
        'tirage.aTaper',
        'tirage.direct',
        'tirage.exercice',
        'tirage.feuille',
        'tirage.mot',
        'tirage.schema',
        'tirage.texte',
        'titre',
        'type',
      ],
    } satisfies Record<Module['type'], string[]>;

    const reponse = await demander(app, `/api/cours/${ID_SOURCE}`, profils.proprietaire);

    const modules = (reponse.json() as { modules: (Record<string, unknown> & Module)[] }).modules;
    const cheminsParType = new Map<string, Set<string>>();
    for (const module of modules) {
      const chemins = cheminsParType.get(module.type) ?? new Set<string>();
      collecterChemins(module, '', chemins);
      cheminsParType.set(module.type, chemins);
    }
    // Le cours d'exemple a chaque type de module.
    expect([...cheminsParType.keys()].sort()).toEqual(Object.keys(CLES_ATTENDUES).sort());
    // Et il montre chaque clé facultative au moins une fois : l'union des chemins est exacte.
    for (const [type, cles] of Object.entries(CLES_ATTENDUES)) {
      expect([...(cheminsParType.get(type) ?? [])].sort(), type).toEqual([...cles].sort());
    }
    // Les seuils du tirage partent tels que le modèle les nomme.
    const examen = modules.find((module) => module.type === 'examen');
    expect(Object.keys((examen as Record<string, object>).tirage).sort()).toEqual([
      'aTaper',
      'direct',
      'exercice',
      'feuille',
      'mot',
      'schema',
      'texte',
    ]);
  });

  it('cours_encode_servi_avec_droit_mais_pas_en_majuscules', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    const encode = await demander(app, '/api/cours/q3m8vx2%6B', profils.autorisee_nommement);
    const majuscules = await demander(app, '/api/cours/Q3M8VX2K', profils.autorisee_nommement);

    expect(encode.statusCode).toBe(200);
    expect((encode.json() as Cours).id).toBe(ID_SOURCE);
    expect(majuscules.statusCode).toBe(404);
    expect(majuscules.body).toBe(INTROUVABLE);
  });

  it('droit_retire_le_cours_disparait', async () => {
    const app = creerAppDeTest();
    const lectrice = creerPersonne('Lernende Test');
    const droit = depot.autoriser({ cours: ID_SOURCE, sujet: { type: 'personne', id: lectrice } });
    const jeton = connecter(lectrice);

    expect(await liste(app, jeton)).toStrictEqual([RESUME_SOURCE]);
    expect((await demander(app, `/api/cours/${ID_SOURCE}`, jeton)).statusCode).toBe(200);

    expect(depot.retirerAutorisation(droit.id)).toBe(true);

    // Même session : les autorisations sont relues à chaque requête.
    expect(await liste(app, jeton)).toStrictEqual([]);
    expect(empreinteReponse(await demander(app, `/api/cours/${ID_SOURCE}`, jeton))).toStrictEqual(
      empreinteReponse(await demander(app, `/api/cours/${ID_INEXISTANT}`, jeton)),
    );
  });

  it('groupe_voit_un_cours_a_verifier_avec_derogation', async () => {
    const app = creerAppDeTest();
    const profils = installerProfils();

    const deroge = await demander(
      app,
      `/api/cours/${ID_DEROGE}`,
      profils.membre_d_un_groupe_autorise,
    );
    const sansDerogation = await demander(
      app,
      `/api/cours/${ID_A_VERIFIER}`,
      profils.membre_d_un_groupe_autorise,
    );

    expect(deroge.statusCode).toBe(200);
    expect(sansDerogation.statusCode).toBe(404);
    expect(sansDerogation.body).toBe(INTROUVABLE);
  });
});

/*
 * La personne attendue (R36) : le téléphone nomme, par l'en-tête `x-ancrage-personne`, la personne
 * sous laquelle il rangera la liste ou le contenu. S'il en nomme une autre que celle de la session
 * (un autre onglet s'est connecté), rien n'est rendu : 409, après le contrôle des droits. Sans
 * en-tête, aucun contrôle : un client précaché d'une version précédente ne l'envoie pas.
 */
describe('personne attendue (en-tête x-ancrage-personne, R36)', () => {
  /** Une lectrice du cours `source`, et une autre personne, sans droit. */
  function deuxPersonnes() {
    const lectrice = creerPersonne('Lernende Test');
    depot.autoriser({ cours: ID_SOURCE, sujet: { type: 'personne', id: lectrice } });
    const autre = creerPersonne('Andere Lernende Test');
    return { lectrice, autre, jeton: connecter(lectrice), jetonAutre: connecter(autre) };
  }

  it('lecture_de_cours_autre_personne_409', async () => {
    const app = creerAppDeTest();
    const { lectrice, autre, jeton } = deuxPersonnes();

    // Une autre personne, une personne inconnue, un en-tête vide ou répété (Node joint les
    // valeurs, même deux fois la personne de la session : elles ne nomment personne).
    for (const personne of [autre, 'personne-inconnue', '', [lectrice, lectrice]]) {
      for (const url of ['/api/cours', `/api/cours/${ID_SOURCE}`]) {
        const reponse = await demanderPour(app, url, jeton, personne);

        expect(reponse.statusCode, `${url} ${String(personne)}`).toBe(409);
        expect(reponse.body, `${url} ${String(personne)}`).toBe(AUTRE_PERSONNE);
        expect(reponse.headers['cache-control']).toBe('no-store');
      }
    }
  });

  it('en_tete_de_la_personne_de_la_session_sert', async () => {
    const app = creerAppDeTest();
    const { lectrice, jeton } = deuxPersonnes();

    const listeLue = await demanderPour(app, '/api/cours', jeton, lectrice);
    expect(listeLue.statusCode).toBe(200);
    expect(listeLue.json()).toStrictEqual([RESUME_SOURCE]);
    const contenu = await demanderPour(app, `/api/cours/${ID_SOURCE}`, jeton, lectrice);
    expect(contenu.statusCode).toBe(200);
    expect(contenu.json()).toStrictEqual(contenuAttendu(COURS_SOURCE));
  });

  it('en_tete_absent_aucun_controle', async () => {
    const app = creerAppDeTest();
    const { jeton } = deuxPersonnes();

    expect(await liste(app, jeton)).toStrictEqual([RESUME_SOURCE]);
    const contenu = await demander(app, `/api/cours/${ID_SOURCE}`, jeton);
    expect(contenu.statusCode).toBe(200);
    expect(contenu.json()).toStrictEqual(contenuAttendu(COURS_SOURCE));
  });

  it('invariant_1_inchange_avec_ou_sans_en_tete', async () => {
    const app = creerAppDeTest();
    const { lectrice, autre, jetonAutre } = deuxPersonnes();

    // Sans droit, la réponse reste celle d'un cours inexistant, quel que soit l'en-tête : le
    // contrôle de la personne vient après celui des droits, et ne dit rien du cours.
    const reference = await demander(app, `/api/cours/${ID_INEXISTANT}`, jetonAutre);
    expect(reference.statusCode).toBe(404);
    expect(reference.body).toBe(INTROUVABLE);
    for (const personne of [undefined, autre, lectrice, 'personne-inconnue']) {
      for (const id of [ID_SOURCE, ID_A_VERIFIER, ID_INEXISTANT]) {
        for (const method of ['GET', 'HEAD'] as const) {
          const reponse = await demanderPour(app, `/api/cours/${id}`, jetonAutre, personne, method);
          const attendue = await demander(app, `/api/cours/${ID_INEXISTANT}`, jetonAutre, method);

          expect(empreinteReponse(reponse), `${id} ${method} ${personne}`).toStrictEqual(
            empreinteReponse(attendue),
          );
        }
      }
    }
    // Sans session, 401 avant tout, avec ou sans en-tête.
    for (const url of ['/api/cours', `/api/cours/${ID_SOURCE}`]) {
      for (const personne of [undefined, lectrice]) {
        const reponse = await demanderPour(app, url, undefined, personne);

        expect(reponse.statusCode).toBe(401);
        expect(reponse.body).toBe(NON_CONNECTE);
      }
    }
  });
});

/*
 * La matrice par l'API : les profils de la tâche 1 × un cours « à vérifier » et un cours
 * `source` × la liste et le contenu, avec la réponse attendue écrite à la main.
 */
type NomCours = 'a_verifier' | 'source';
type Route = 'liste' | 'contenu';
type Attendu = 'servi' | 'introuvable' | 'non_connecte';

const COURS_DE_LA_MATRICE: Record<NomCours, Cours> = {
  a_verifier: COURS_A_VERIFIER,
  source: COURS_SOURCE,
};

const MATRICE: readonly [NomProfil, NomCours, Route, Attendu][] = [
  ['aucune', 'a_verifier', 'liste', 'non_connecte'],
  ['aucune', 'a_verifier', 'contenu', 'non_connecte'],
  ['aucune', 'source', 'liste', 'non_connecte'],
  ['aucune', 'source', 'contenu', 'non_connecte'],

  ['proprietaire', 'a_verifier', 'liste', 'servi'],
  ['proprietaire', 'a_verifier', 'contenu', 'servi'],
  ['proprietaire', 'source', 'liste', 'servi'],
  ['proprietaire', 'source', 'contenu', 'servi'],

  ['autorisee_nommement', 'a_verifier', 'liste', 'servi'],
  ['autorisee_nommement', 'a_verifier', 'contenu', 'servi'],
  ['autorisee_nommement', 'source', 'liste', 'servi'],
  ['autorisee_nommement', 'source', 'contenu', 'servi'],

  ['membre_d_un_groupe_autorise', 'a_verifier', 'liste', 'introuvable'],
  ['membre_d_un_groupe_autorise', 'a_verifier', 'contenu', 'introuvable'],
  ['membre_d_un_groupe_autorise', 'source', 'liste', 'servi'],
  ['membre_d_un_groupe_autorise', 'source', 'contenu', 'servi'],

  ['membre_d_un_autre_groupe', 'a_verifier', 'liste', 'introuvable'],
  ['membre_d_un_autre_groupe', 'a_verifier', 'contenu', 'introuvable'],
  ['membre_d_un_autre_groupe', 'source', 'liste', 'introuvable'],
  ['membre_d_un_autre_groupe', 'source', 'contenu', 'introuvable'],

  ['sans_aucun_droit', 'a_verifier', 'liste', 'introuvable'],
  ['sans_aucun_droit', 'a_verifier', 'contenu', 'introuvable'],
  ['sans_aucun_droit', 'source', 'liste', 'introuvable'],
  ['sans_aucun_droit', 'source', 'contenu', 'introuvable'],
];

describe('matrice par l API', () => {
  it.each(MATRICE)(
    'matrice_api_%s_sur_cours_%s_route_%s_attendu_%s',
    async (profil, nomCours, route, attendu) => {
      const app = creerAppDeTest();
      const jeton = installerProfils()[profil];
      const cours = COURS_DE_LA_MATRICE[nomCours];

      const reponse = await demander(
        app,
        route === 'liste' ? '/api/cours' : `/api/cours/${cours.id}`,
        jeton,
      );

      if (attendu === 'non_connecte') {
        expect(reponse.statusCode).toBe(401);
        expect(reponse.body).toBe(NON_CONNECTE);
      } else if (route === 'liste') {
        expect(reponse.statusCode).toBe(200);
        const ids = (reponse.json() as { id: string }[]).map((entree) => entree.id);
        expect(ids.includes(cours.id)).toBe(attendu === 'servi');
      } else if (attendu === 'servi') {
        expect(reponse.statusCode).toBe(200);
        expect(reponse.json()).toStrictEqual(contenuAttendu(cours));
      } else {
        expect(reponse.statusCode).toBe(404);
        expect(reponse.body).toBe(INTROUVABLE);
      }
    },
  );

  it('matrice_api_couvre_chaque_profil_cours_et_route_une_seule_fois', () => {
    const profils: NomProfil[] = [
      'aucune',
      'proprietaire',
      'autorisee_nommement',
      'membre_d_un_groupe_autorise',
      'membre_d_un_autre_groupe',
      'sans_aucun_droit',
    ];
    const attendues = profils.flatMap((profil) =>
      Object.keys(COURS_DE_LA_MATRICE).flatMap((cours) =>
        ['liste', 'contenu'].map((route) => `${profil}|${cours}|${route}`),
      ),
    );
    const lignes = MATRICE.map(([profil, cours, route]) => `${profil}|${cours}|${route}`);

    expect(new Set(lignes).size).toBe(lignes.length);
    expect([...lignes].sort()).toEqual([...attendues].sort());
  });
});
