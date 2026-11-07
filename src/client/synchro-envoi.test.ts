import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../domaine/cours/cours.fixture.js';
import { type CoursResume, ErreurApi } from './api.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import { coursLocal, enregistrerCours } from './stockage/cours-local.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  idDeTest,
} from './stockage/evenements.fixture.js';
import { evenementsDuCours, fileDuCours } from './stockage/journal-local.js';
import { apiDe, erreurReseau, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import { DELAI_LOURD, ids, repondre } from './synchro.fixture.js';
import {
  type ApiJournal,
  bloquerSynchronisations,
  envoyerFile,
  envoyerFileAvantDeconnexion,
} from './synchro.js';

afterEach(() => {
  fermerLesBasesDeTest();
  vi.restoreAllMocks();
});

describe('envoyerFile', () => {
  it(
    'envoie_la_file_de_chaque_cours_de_la_personne_et_rien_d_autre',
    async () => {
      const base = await ouvrirBaseDeTest();
      const serveur = new ServeurFactice();
      await repondre(base, ALICE, COURS_DE_TEST, 1, 700);
      await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 801, 802);
      await repondre(base, BERTHE, COURS_DE_TEST, 901, 901);

      const etat = await envoyerFile(base, ALICE, serveur);

      expect(etat).toBe('a_jour');
      expect(serveur.envois.map((e) => [e.cours, e.evenements.length])).toEqual([
        [COURS_DE_TEST, 500],
        [COURS_DE_TEST, 200],
        [AUTRE_COURS_DE_TEST, 2],
      ]);
      expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(700);
      // Un envoi seul : aucune lecture, et le journal local n'a pas bougé.
      expect(serveur.lectures).toEqual([]);
      expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
      expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
      expect(ids(await fileDuCours(base, BERTHE, COURS_DE_TEST))).toEqual([idDeTest(901)]);
    },
    DELAI_LOURD,
  );

  it('une_file_vide_est_a_jour', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();

    expect(await envoyerFile(base, ALICE, serveur)).toBe('a_jour');
    expect(serveur.envois).toEqual([]);
  });

  it('hors_ligne_ou_session_expiree_s_arrete_et_garde_toute_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 3, 3);

    for (const [erreur, attendu] of [
      [erreurReseau(), 'hors_ligne'],
      [new ErreurApi(401, 'non_connecte'), 'reconnexion'],
    ] as const) {
      const serveur = new ServeurFactice();
      serveur.panneEnvoi = erreur;

      expect(await envoyerFile(base, ALICE, serveur)).toBe(attendu);
      // Le premier cours échoue : on n'insiste pas sur les suivants.
      expect(serveur.envois).toHaveLength(1);
    }
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
  });

  it('un_cours_sans_droit_est_oublie_mais_les_autres_partent', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await enregistrerCours(base, ALICE, coursServiDeTest());
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 3, 3);
    const api = apiDe(serveur, {
      envoyer: (cours, evenements) =>
        cours === COURS_DE_TEST
          ? Promise.reject(new ErreurApi(404, 'introuvable'))
          : serveur.envoyer(cours, evenements),
    });

    const etat = await envoyerFile(base, ALICE, api);

    expect(etat).toBe('indisponible');
    expect(await coursLocal(base, ALICE, COURS_DE_TEST)).toBeUndefined();
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
    expect(ids(serveur.evenements(AUTRE_COURS_DE_TEST))).toEqual([idDeTest(3)]);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
  });

  it('un_cours_encore_dans_la_liste_n_est_pas_oublie_par_l_envoi_seul', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);
    await repondre(base, ALICE, cours.id, 1, 1);
    serveur.panneEnvoi = new ErreurApi(404, 'introuvable');
    serveur.liste = [{ id: cours.id, titre: cours.titre, langue: 'de' }];

    expect(await envoyerFile(base, ALICE, serveur)).toBe('en_attente');

    expect(await coursLocal(base, ALICE, cours.id)).toEqual(cours);
    expect(await evenementsDuCours(base, ALICE, cours.id)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, cours.id)).toHaveLength(1);
  });

  it('un_400_sur_un_cours_laisse_partir_les_autres_et_rend_en_attente', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 3, 3);
    const api = apiDe(serveur, {
      envoyer: (cours, evenements) =>
        cours === COURS_DE_TEST
          ? Promise.reject(new ErreurApi(400, 'inconnue'))
          : serveur.envoyer(cours, evenements),
    });

    expect(await envoyerFile(base, ALICE, api)).toBe('en_attente');

    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
    expect(serveur.evenements(AUTRE_COURS_DE_TEST)).toHaveLength(1);
  });

  it('en_attente_l_emporte_sur_indisponible', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 2, 2);
    for (const [premier, second] of [
      [new ErreurApi(404, 'introuvable'), new ErreurApi(400, 'inconnue')],
      [new ErreurApi(400, 'inconnue'), new ErreurApi(404, 'introuvable')],
    ] as const) {
      const api: ApiJournal = {
        envoyer: (cours) => Promise.reject(cours === COURS_DE_TEST ? premier : second),
        lire: async () => ({ evenements: [], curseur: 0, suite: false }),
        lister: async () => [],
      };

      expect(await envoyerFile(base, ALICE, api)).toBe('en_attente');
    }
  });

  it('une_erreur_qui_n_est_pas_celle_de_l_api_remonte', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const api: ApiJournal = {
      envoyer: () => Promise.reject(new Error('boum')),
      lire: async () => ({ evenements: [], curseur: 0, suite: false }),
      lister: async () => [],
    };

    await expect(envoyerFile(base, ALICE, api)).rejects.toThrow('boum');
  });
});

describe('envoyerFileAvantDeconnexion', () => {
  /** Une file sur deux cours, envoyée à un serveur dont chaque cours échoue comme on le dit. */
  async function causeQuand(
    echecs: Partial<Record<string, Error>>,
    liste: CoursResume[] = [],
  ): Promise<string | undefined> {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 2, 2);
    const serveur = new ServeurFactice();
    serveur.liste = liste;
    const api = apiDe(serveur, {
      envoyer: async (cours, evenements) => {
        const echec = echecs[cours];
        if (echec !== undefined) throw echec;
        await serveur.envoyer(cours, evenements);
      },
    });
    return envoyerFileAvantDeconnexion(base, ALICE, api);
  }

  it('cause_de_l_attente_apres_l_envoi', async () => {
    const introuvable = new ErreurApi(404, 'introuvable');
    const refuse = new ErreurApi(400, 'requete');
    const panne = new ErreurApi(503, 'inconnue');

    // Tout est parti.
    expect(await causeQuand({})).toBeUndefined();
    // Passagères : le réseau, la session (401 ou autre personne), le serveur (429, 5xx).
    expect(await causeQuand({ [COURS_DE_TEST]: erreurReseau() })).toBe('reseau');
    expect(await causeQuand({ [COURS_DE_TEST]: new ErreurApi(401, 'non_connecte') })).toBe(
      'session',
    );
    expect(await causeQuand({ [COURS_DE_TEST]: new ErreurApi(409, 'autre_personne') })).toBe(
      'session',
    );
    expect(await causeQuand({ [COURS_DE_TEST]: new ErreurApi(429, 'trop_de_requetes') })).toBe(
      'serveur',
    );
    expect(await causeQuand({ [COURS_DE_TEST]: panne })).toBe('serveur');
    // Durables : le droit retiré (le cours n'est plus dans la liste), le lot refusé (400).
    expect(await causeQuand({ [COURS_DE_TEST]: introuvable })).toBe('durable');
    expect(await causeQuand({ [COURS_DE_TEST]: refuse, [AUTRE_COURS_DE_TEST]: introuvable })).toBe(
      'durable',
    );
    // Un « introuvable » que la liste ne confirme pas n'est pas un droit retiré : passagère.
    expect(
      await causeQuand({ [COURS_DE_TEST]: introuvable }, [
        { id: COURS_DE_TEST, titre: 'Übungskurs', langue: 'de' },
      ]),
    ).toBe('serveur');
    // Une cause passagère l'emporte sur une durable.
    expect(await causeQuand({ [COURS_DE_TEST]: refuse, [AUTRE_COURS_DE_TEST]: panne })).toBe(
      'serveur',
    );
  });

  it('bloque_la_cause_est_passagere', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const serveur = new ServeurFactice();
    const debloquer = bloquerSynchronisations(base);

    expect(await envoyerFileAvantDeconnexion(base, ALICE, serveur)).toBe('serveur');
    expect(serveur.envois).toEqual([]);
    debloquer();
  });
});
