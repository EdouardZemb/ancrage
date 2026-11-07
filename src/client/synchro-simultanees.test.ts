import { afterEach, describe, expect, it, vi } from 'vitest';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  idDeTest,
  reponseDeTest,
} from './stockage/evenements.fixture.js';
import { ajouterEvenement, fileDuCours } from './stockage/journal-local.js';
import { apiDe, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import { ids, idsDe, repondre, serveurRetenu } from './synchro.fixture.js';
import { type ApiJournal, type ResultatSynchro, synchroniserCours } from './synchro.js';

afterEach(() => {
  fermerLesBasesDeTest();
  vi.restoreAllMocks();
});

describe('synchroniserCours simultanées', () => {
  it('synchronisations_simultanees_un_seul_envoi', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    const { serveur, api, liberer } = serveurRetenu();

    const premiere = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const seconde = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const troisieme = synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    // Les appels lancés pendant une synchronisation programment une seule relance, qu'ils partagent.
    expect(seconde).not.toBe(premiere);
    expect(troisieme).toBe(seconde);
    liberer();
    expect(await premiere).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(await seconde).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(await troisieme).toEqual({ etat: 'a_jour', enAttente: 0 });
    // Un seul envoi : la relance trouve la file vide. Une lecture par synchronisation.
    expect(serveur.envois).toHaveLength(1);
    expect(ids(serveur.envois[0]?.evenements ?? [])).toEqual(idsDe(1, 3));
    expect(serveur.lectures).toHaveLength(2);
  });

  it('reponse_pendant_la_lecture_part_a_la_relance', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const relances: Promise<ResultatSynchro>[] = [];
    let premiereLecture = true;
    const api = apiDe(serveur, {
      lire: async (cours, depuis) => {
        if (premiereLecture) {
          premiereLecture = false;
          // Une réponse donnée pendant la lecture, et la synchronisation qu'on demande aussitôt.
          await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 2));
          relances.push(synchroniserCours(base, ALICE, COURS_DE_TEST, api));
        }
        return serveur.lire(cours, depuis);
      },
    });

    const premiere = await synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    // La synchronisation en cours n'avait pas pu envoyer la réponse : elle reste en attente…
    expect(premiere).toEqual({ etat: 'en_attente', enAttente: 1 });
    // …et la relance, qui démarre à sa fin, l'envoie aussitôt.
    expect(await relances[0]).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual(idsDe(1, 2));
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
  });

  it('un_appel_apres_la_fin_demarre_une_nouvelle_synchronisation', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);

    const premiere = synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    await premiere;
    await repondre(base, ALICE, COURS_DE_TEST, 2, 2);
    const seconde = synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(seconde).not.toBe(premiere);
    expect(await seconde).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([[idDeTest(1)], [idDeTest(2)]]);
  });

  it('une_synchronisation_en_echec_libere_la_place', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const cassee: ApiJournal = {
      envoyer: () => Promise.reject(new Error('boum')),
      lire: async () => ({ evenements: [], curseur: 0, suite: false }),
      lister: async () => [],
    };
    const serveur = new ServeurFactice();

    const echec = synchroniserCours(base, ALICE, COURS_DE_TEST, cassee);
    await expect(echec).rejects.toThrow('boum');
    const suivante = synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(suivante).not.toBe(echec);
    expect(await suivante).toEqual({ etat: 'a_jour', enAttente: 0 });
  });

  it('des_synchronisations_de_cours_ou_de_personnes_differents_ne_fusionnent_pas', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 2, 2);
    await repondre(base, BERTHE, COURS_DE_TEST, 3, 3);
    const { serveur, api, liberer } = serveurRetenu();

    const a = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const b = synchroniserCours(base, ALICE, AUTRE_COURS_DE_TEST, api);
    const c = synchroniserCours(base, BERTHE, COURS_DE_TEST, api);

    expect(new Set([a, b, c]).size).toBe(3);
    liberer();
    await Promise.all([a, b, c]);
    expect(serveur.envois).toHaveLength(3);
  });

  it('deux_bases_differentes_ne_fusionnent_pas', async () => {
    const base = await ouvrirBaseDeTest();
    const autreBase = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();

    const a = synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    const b = synchroniserCours(autreBase, ALICE, COURS_DE_TEST, serveur);

    expect(b).not.toBe(a);
    await Promise.all([a, b]);
  });
});
