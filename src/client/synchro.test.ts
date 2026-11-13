import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../domaine/cours/cours.fixture.js';
import type { Evenement } from '../domaine/journal/evenement.js';
import { ErreurApi } from './api.js';
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
  ajouterEvenement,
  curseurDuCours,
  evenementsDuCours,
  fileDuCours,
} from './stockage/journal-local.js';
import { apiDe, erreurReseau, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import {
  DELAI_LOURD,
  ids,
  idsDe,
  repondre,
  verifierQueLaFileAttendPuisPart,
} from './synchro.fixture.js';
import { type ApiJournal, synchroniserCours } from './synchro.js';

afterEach(() => {
  fermerLesBasesDeTest();
  vi.restoreAllMocks();
});

describe('synchroniserCours', () => {
  it(
    'synchro_envoie_par_lots_de_500_puis_vide_la_file',
    async () => {
      const base = await ouvrirBaseDeTest();
      const serveur = new ServeurFactice();
      await repondre(base, ALICE, COURS_DE_TEST, 1, 1200);

      const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

      expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
      expect(serveur.envois.map((envoi) => envoi.evenements.length)).toEqual([500, 500, 200]);
      // Les lots suivent l'ordre du journal.
      expect(ids(serveur.envois[0]?.evenements ?? [])).toEqual(idsDe(1, 500));
      expect(ids(serveur.envois[2]?.evenements ?? [])).toEqual(idsDe(1001, 1200));
      expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
      expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(1200);
      // Ce qu'on a envoyé revient à la lecture : il n'y en a pas deux exemplaires pour autant.
      expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 1200));
    },
    DELAI_LOURD,
  );

  it('synchro_lit_depuis_le_curseur_jusqu_a_la_fin', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const autreAppareil = Array.from({ length: 2500 }, (_, i) =>
      reponseDeTest(COURS_DE_TEST, i + 1),
    );
    serveur.deposer(COURS_DE_TEST, autreAppareil);

    const premiere = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(premiere).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([0, 1000, 2000]);
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 2500));
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(2500);
    // Rien n'était en attente : rien n'est envoyé.
    expect(serveur.envois).toEqual([]);

    // La fois suivante, la lecture repart du curseur, et ne rend que le nouveau.
    serveur.lectures.length = 0;
    serveur.deposer(COURS_DE_TEST, [
      reponseDeTest(COURS_DE_TEST, 2501),
      reponseDeTest(COURS_DE_TEST, 2502),
    ]);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(serveur.lectures.map((l) => l.depuis)).toEqual([2499]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2502);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(2502);
  });

  it('rien_a_envoyer_rien_a_lire_est_a_jour', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();

    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
      etat: 'a_jour',
      enAttente: 0,
    });
    expect(serveur.envois).toEqual([]);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(0);
  });

  it('les_evenements_d_un_autre_appareil_sont_fusionnes_sans_perdre_les_locaux', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    serveur.deposer(COURS_DE_TEST, [
      reponseDeTest(COURS_DE_TEST, 2),
      reponseDeTest(COURS_DE_TEST, 10, { appareil: '9e2d7c41-3a58-4f06-b1d9-0c6a8e5f2b34' }),
    ]);

    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual([
      ...idsDe(1, 3),
      idDeTest(10),
    ]);
    expect(ids(serveur.evenements(COURS_DE_TEST)).sort()).toEqual([...idsDe(1, 3), idDeTest(10)]);
  });

  it('reponse_perdue_renvoi_sans_doublon', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    // Le serveur enregistre l'envoi, puis la réponse se perd : le client ne sait pas qu'il a réussi.
    serveur.perdreLaReponse = true;

    const perdue = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(perdue).toEqual({ etat: 'hors_ligne', enAttente: 3 });
    expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(3);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(3);

    // La fois suivante, le lot est renvoyé tel quel.
    const suivante = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(suivante).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.envois).toHaveLength(2);
    expect(ids(serveur.envois[1]?.evenements ?? [])).toEqual(
      ids(serveur.envois[0]?.evenements ?? []),
    );
    // Un exemplaire de chaque événement, chez le serveur comme sur l'appareil.
    expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual(idsDe(1, 3));
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 3));
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
  });

  it('hors_ligne_garde_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    serveur.panneEnvoi = erreurReseau();

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'hors_ligne', enAttente: 2 });
    await verifierQueLaFileAttendPuisPart(base, serveur);
  });

  it('hors_ligne_pendant_la_lecture_garde_la_progression', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    serveur.deposer(
      COURS_DE_TEST,
      Array.from({ length: 2500 }, (_, i) => reponseDeTest(COURS_DE_TEST, i + 1)),
    );
    let lectures = 0;
    const api = apiDe(serveur, {
      lire: async (cours, depuis) => {
        lectures += 1;
        if (lectures === 2) throw erreurReseau();
        return serveur.lire(cours, depuis);
      },
    });

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    expect(resultat).toEqual({ etat: 'hors_ligne', enAttente: 0 });
    // La première page est gardée, avec son curseur ; la lecture reprend là.
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1000);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(1000);
    serveur.lectures.length = 0;
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([999, 1999]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2500);
  });

  it('401_garde_la_file_et_demande_reconnexion', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    serveur.panneEnvoi = new ErreurApi(401, 'non_connecte');

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'reconnexion', enAttente: 2 });
    await verifierQueLaFileAttendPuisPart(base, serveur);
  });

  it('401_a_la_lecture_demande_aussi_la_reconnexion', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    serveur.panneLecture = new ErreurApi(401, 'non_connecte');

    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
      etat: 'reconnexion',
      enAttente: 0,
    });
  });

  it('404_efface_le_cours_mais_garde_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);
    await enregistrerListe(base, ALICE, [{ id: cours.id, titre: cours.titre, langue: 'de' }]);
    // Deux réponses déjà parties, relues ; puis une réponse donnée hors ligne.
    await repondre(base, ALICE, cours.id, 1, 2);
    await synchroniserCours(base, ALICE, cours.id, serveur);
    await repondre(base, ALICE, cours.id, 3, 3);
    // L'enseignante suspend le droit : le cours est introuvable, et la liste des cours ne l'a plus.
    serveur.panneEnvoi = new ErreurApi(404, 'introuvable');
    serveur.panneLecture = new ErreurApi(404, 'introuvable');
    serveur.liste = [{ id: AUTRE_COURS_DE_TEST, titre: 'Zweiter Kurs', langue: 'de' }];

    const resultat = await synchroniserCours(base, ALICE, cours.id, serveur);

    expect(resultat).toEqual({ etat: 'indisponible', enAttente: 1 });
    expect(serveur.listages).toBe(1);
    expect(await coursLocal(base, ALICE, cours.id)).toBeUndefined();
    expect(await evenementsDuCours(base, ALICE, cours.id)).toEqual([]);
    expect(await curseurDuCours(base, ALICE, cours.id)).toBe(0);
    expect(await listeLocale(base, ALICE)).toEqual([]);
    // La réponse en attente a survécu : la suspension ne perd aucune révision.
    expect(ids(await fileDuCours(base, ALICE, cours.id))).toEqual([idDeTest(3)]);

    // Elle est renvoyée tant que le droit manque, sans effet.
    expect((await synchroniserCours(base, ALICE, cours.id, serveur)).etat).toBe('indisponible');
    expect(ids(await fileDuCours(base, ALICE, cours.id))).toEqual([idDeTest(3)]);

    // Le droit revient : la file part, et le journal est relu en entier.
    serveur.panneEnvoi = undefined;
    serveur.panneLecture = undefined;
    serveur.liste = [{ id: cours.id, titre: cours.titre, langue: 'de' }];
    const retour = await synchroniserCours(base, ALICE, cours.id, serveur);

    expect(retour).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(ids(serveur.evenements(cours.id))).toEqual(idsDe(1, 3));
    expect(ids(await evenementsDuCours(base, ALICE, cours.id))).toEqual(idsDe(1, 3));
    expect(await curseurDuCours(base, ALICE, cours.id)).toBe(3);
    expect(await fileDuCours(base, ALICE, cours.id)).toEqual([]);
  });

  it('un_404_a_la_lecture_efface_aussi_le_cours', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await enregistrerCours(base, ALICE, coursServiDeTest());
    serveur.panneLecture = new ErreurApi(404, 'introuvable');

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'indisponible', enAttente: 0 });
    expect(await coursLocal(base, ALICE, COURS_DE_TEST)).toBeUndefined();
  });

  it('un_404_ne_touche_pas_aux_autres_cours', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const autre = { ...coursServiDeTest(), id: AUTRE_COURS_DE_TEST };
    await enregistrerCours(base, ALICE, autre);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 1, 1);
    await synchroniserCours(base, ALICE, AUTRE_COURS_DE_TEST, serveur);
    serveur.panneEnvoi = new ErreurApi(404, 'introuvable');
    serveur.panneLecture = new ErreurApi(404, 'introuvable');

    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(await coursLocal(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual(autre);
    expect(await evenementsDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
  });

  it('un_cours_encore_dans_la_liste_n_est_pas_oublie', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);
    await enregistrerListe(base, ALICE, [{ id: cours.id, titre: cours.titre, langue: 'de' }]);
    await repondre(base, ALICE, cours.id, 1, 2);
    serveur.panneEnvoi = new ErreurApi(404, 'introuvable');
    serveur.liste = [{ id: cours.id, titre: cours.titre, langue: 'de' }];

    const resultat = await synchroniserCours(base, ALICE, cours.id, serveur);

    expect(resultat).toEqual({ etat: 'en_attente', enAttente: 2 });
    expect(serveur.listages).toBe(1);
    expect(await coursLocal(base, ALICE, cours.id)).toEqual(cours);
    expect(await evenementsDuCours(base, ALICE, cours.id)).toHaveLength(2);
    expect(await listeLocale(base, ALICE)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, cours.id)).toHaveLength(2);
  });

  it('une_liste_injoignable_ou_inattendue_n_oublie_rien', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);
    await repondre(base, ALICE, cours.id, 1, 1);
    serveur.panneEnvoi = new ErreurApi(404, 'introuvable');

    for (const panne of [
      erreurReseau(),
      new ErreurApi(401, 'non_connecte'),
      new ErreurApi(500, 'inconnue'),
      new ErreurApi(200, 'inconnue'),
      new ErreurApi(404, 'introuvable'),
    ]) {
      serveur.panneListe = panne;

      const resultat = await synchroniserCours(base, ALICE, cours.id, serveur);

      expect(resultat, panne.message).toEqual({ etat: 'en_attente', enAttente: 1 });
      expect(await coursLocal(base, ALICE, cours.id), panne.message).toEqual(cours);
      expect(await evenementsDuCours(base, ALICE, cours.id), panne.message).toHaveLength(1);
      expect(await fileDuCours(base, ALICE, cours.id), panne.message).toHaveLength(1);
    }
  });

  it('un_cours_de_la_liste_n_est_pas_oublie_meme_apres_plusieurs_synchronisations', async () => {
    // L'oubli ne se fait pas « en boucle » quand le journal répond introuvable.
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);
    serveur.panneLecture = new ErreurApi(404, 'introuvable');
    serveur.liste = [{ id: cours.id, titre: cours.titre, langue: 'de' }];

    for (let i = 0; i < 3; i += 1) {
      expect((await synchroniserCours(base, ALICE, cours.id, serveur)).etat).toBe('en_attente');
    }

    expect(await coursLocal(base, ALICE, cours.id)).toEqual(cours);
  });

  it('un_404_sans_le_corps_du_serveur_n_efface_rien', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);
    await repondre(base, ALICE, cours.id, 1, 1);
    // Une page d'erreur d'un mandataire : un 404 sans le corps du serveur ne dit rien du droit.
    serveur.panneEnvoi = new ErreurApi(404, 'inconnue');

    const resultat = await synchroniserCours(base, ALICE, cours.id, serveur);

    expect(resultat).toEqual({ etat: 'en_attente', enAttente: 1 });
    // Ce n'est pas un « introuvable » du serveur : la liste n'est même pas demandée.
    expect(serveur.listages).toBe(0);
    expect(await coursLocal(base, ALICE, cours.id)).toEqual(cours);
    expect(await evenementsDuCours(base, ALICE, cours.id)).toHaveLength(1);
  });

  it('un_400_n_est_pas_renvoye_en_boucle_et_la_file_est_gardee', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    // Le code `requete` du serveur, puis le corps d'erreur par défaut de Fastify (code inconnu).
    for (const code of ['requete', 'inconnue'] as const) {
      serveur.envois.length = 0;
      serveur.panneEnvoi = new ErreurApi(400, code);

      const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

      expect(resultat, code).toEqual({ etat: 'en_attente', enAttente: 3 });
      expect(serveur.envois, code).toHaveLength(1);
      expect(serveur.lectures, code).toEqual([]);
      expect(serveur.listages, code).toBe(0);
      expect(await fileDuCours(base, ALICE, COURS_DE_TEST), code).toHaveLength(3);
    }
  });

  it('un_serveur_qui_refuse_le_mode_garde_la_file_entiere_puis_la_recoit_quand_il_l_accepte', async () => {
    // Un retour arrière sous la version qui connaît le mode (ADR-0013) : son schéma strict refuse
    // tout lot dont une réponse porte `resultat.mode`.
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    for (const [n, mode] of [
      [1, 'retournee'],
      [2, 'saisie'],
      [3, 'choix'],
    ] as const) {
      const reponse = reponseDeTest(COURS_DE_TEST, n);
      await ajouterEvenement(base, ALICE, {
        ...reponse,
        resultat: { juste: n !== 2, mode },
      } as Evenement);
    }
    const ancien = apiDe(serveur, {
      envoyer: async (cours, evenements) => {
        if (evenements.some((e) => e.type === 'reponse' && e.resultat.mode !== undefined)) {
          serveur.envois.push({ cours, evenements });
          throw new ErreurApi(400, 'requete');
        }
        await serveur.envoyer(cours, evenements);
      },
    });

    for (let essai = 0; essai < 2; essai += 1) {
      expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, ancien)).toEqual({
        etat: 'en_attente',
        enAttente: 3,
      });
      // Rien n'est perdu, ni modifié : le mode part avec la réponse, tel qu'il a été noté.
      expect(ids(await fileDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 3));
      expect(serveur.evenements(COURS_DE_TEST)).toEqual([]);
    }

    // Un serveur qui accepte le mode revient : la file repart d'un coup, modes compris.
    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
      etat: 'a_jour',
      enAttente: 0,
    });
    expect(serveur.evenements(COURS_DE_TEST).map((e) => e.resultat)).toEqual([
      { juste: true, mode: 'retournee' },
      { juste: false, mode: 'saisie' },
      { juste: true, mode: 'choix' },
    ]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
  });

  it('un_400_a_la_lecture_est_aussi_une_erreur_de_requete', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    serveur.panneLecture = new ErreurApi(400, 'inconnue');

    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
      etat: 'en_attente',
      enAttente: 0,
    });
    expect(serveur.lectures).toHaveLength(1);
  });

  it('un_serveur_en_panne_ou_trop_sollicite_laisse_la_file_en_attente', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);

    for (const [statut, code] of [
      [429, 'trop_de_requetes'],
      [500, 'inconnue'],
      [502, 'inconnue'],
    ] as const) {
      serveur.panneEnvoi = new ErreurApi(statut, code);
      expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur), `${statut}`).toEqual({
        etat: 'en_attente',
        enAttente: 2,
      });
    }
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
  });

  it('une_erreur_qui_n_est_pas_celle_de_l_api_remonte_et_la_file_est_gardee', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    const api: ApiJournal = {
      envoyer: async () => {
        throw new Error('boum');
      },
      lire: async () => ({ evenements: [], curseur: 0, suite: false }),
      lister: async () => [],
    };

    await expect(synchroniserCours(base, ALICE, COURS_DE_TEST, api)).rejects.toThrow('boum');

    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);
  });

  it('une_lecture_qui_n_avance_pas_ne_boucle_pas', async () => {
    const base = await ouvrirBaseDeTest();
    const lire = vi.fn(async () => ({ evenements: [], curseur: 0, suite: true }));
    const api: ApiJournal = { envoyer: async () => {}, lire, lister: async () => [] };

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it('un_evenement_ajoute_pendant_l_envoi_part_dans_la_meme_synchro', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    let premier = true;
    const api = apiDe(serveur, {
      envoyer: async (cours, evenements) => {
        await serveur.envoyer(cours, evenements);
        if (premier) {
          premier = false;
          await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 2));
        }
      },
    });

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual(idsDe(1, 2));
  });

  it('un_evenement_ajoute_pendant_la_lecture_reste_en_attente', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const api = apiDe(serveur, {
      lire: async (cours, depuis) => {
        await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 7));
        return serveur.lire(cours, depuis);
      },
    });

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    expect(resultat).toEqual({ etat: 'en_attente', enAttente: 1 });
    expect(ids(await fileDuCours(base, ALICE, COURS_DE_TEST))).toEqual([idDeTest(7)]);
  });

  it('la_file_d_une_autre_personne_n_est_jamais_envoyee', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    await repondre(base, BERTHE, COURS_DE_TEST, 3, 3);

    await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur);

    expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual([idDeTest(3)]);
    expect(ids(await fileDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 2));
    expect(await evenementsDuCours(base, BERTHE, COURS_DE_TEST)).toHaveLength(1);
  });
});
