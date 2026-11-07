import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fermerLesBasesDeTest,
  ouvrirAutreConnexion,
  ouvrirBaseDeTest,
} from './stockage/base-locale.fixture.js';
import type { BaseLocale } from './stockage/base-locale.js';
import {
  ALICE,
  AUTRE_APPAREIL_DE_TEST,
  COURS_DE_TEST,
  idDeTest,
  reponseDeTest,
} from './stockage/evenements.fixture.js';
import {
  ajouterEvenement,
  curseurDuCours,
  evenementsDuCours,
  fileDuCours,
  noteDesEnvois,
  recevoirEvenements,
} from './stockage/journal-local.js';
import { apiDe, erreurReseau, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import { ids, idsDe, repondre } from './synchro.fixture.js';
import { envoyerFile, synchroniserCours } from './synchro.js';

afterEach(() => {
  fermerLesBasesDeTest();
  vi.restoreAllMocks();
});

describe('synchroniserCours', () => {
  it('un_curseur_qui_recule_relit_depuis_zero_sans_perdre_un_evenement_local', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 5);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(5);

    // Le serveur est restauré d'une sauvegarde plus ancienne : il n'a plus que trois événements,
    // et un autre appareil en a envoyé un nouveau depuis.
    serveur.restaurer(COURS_DE_TEST, 3);
    serveur.deposer(COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 6)]);
    serveur.lectures.length = 0;

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    // Lu depuis 5 (le curseur recule à 4), puis relu depuis 0.
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([4, 0]);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(4);
    // Les cinq événements locaux sont là, plus le nouveau : rien n'est perdu, rien n'est doublé.
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 6));
  });

  it('un_curseur_qui_recule_sur_un_serveur_vide_relit_depuis_zero', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    serveur.restaurer(COURS_DE_TEST, 0);
    serveur.lectures.length = 0;

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([2, 0]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(3);
  });

  it('restauration_du_serveur_les_evenements_perdus_repartent', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 5);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    // La sauvegarde ne connaît que les trois premiers ; un autre appareil en envoie un sixième.
    serveur.restaurer(COURS_DE_TEST, 3);
    serveur.deposer(COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 6)]);
    serveur.envois.length = 0;

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    // Seuls les deux événements que le serveur n'a pas rendus sont renvoyés.
    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([[idDeTest(4), idDeTest(5)]]);
    // Le serveur les a de nouveau tous, une seule fois chacun ; l'appareil aussi.
    expect(ids(serveur.evenements(COURS_DE_TEST)).sort()).toEqual(idsDe(1, 6));
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 6));
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);

    // La synchronisation suivante n'a plus rien à renvoyer, et ne compte rien deux fois. Le curseur
    // désigne l'événement qui le suit (le sixième) : plus de recul, une seule lecture.
    serveur.envois.length = 0;
    serveur.lectures.length = 0;
    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
      etat: 'a_jour',
      enAttente: 0,
    });
    expect(serveur.envois).toEqual([]);
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([3]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(6);
  });

  it('restauration_du_serveur_vide_tout_repart', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    serveur.restaurer(COURS_DE_TEST, 0);
    serveur.envois.length = 0;

    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([idsDe(1, 3)]);
    expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual(idsDe(1, 3));
  });

  it('restauration_du_serveur_ce_qui_vient_d_un_autre_appareil_et_manque_repart_aussi', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const autre = reponseDeTest(COURS_DE_TEST, 9, { appareil: AUTRE_APPAREIL_DE_TEST });
    serveur.deposer(COURS_DE_TEST, [autre]);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    serveur.restaurer(COURS_DE_TEST, 0);
    serveur.envois.length = 0;

    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(serveur.evenements(COURS_DE_TEST)).toEqual([autre]);
  });

  it('seance_hors_ligne_apres_restauration_rien_ne_se_perd', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 5);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    // Le serveur est restauré : il n'a plus que trois événements, et un autre appareil y envoie le
    // sien. L'appareil ne le sait pas : hors ligne, il donne deux réponses de plus.
    serveur.restaurer(COURS_DE_TEST, 3);
    const autre = reponseDeTest(COURS_DE_TEST, 20, { appareil: AUTRE_APPAREIL_DE_TEST });
    serveur.deposer(COURS_DE_TEST, [autre]);
    await repondre(base, ALICE, COURS_DE_TEST, 6, 7);
    serveur.envois.length = 0;

    // À l'envoi, le serveur numérote les deux réponses 5 et 6 : il rend ensuite un curseur (6) qui
    // n'est pas inférieur à celui de l'appareil (5). Seule l'identité de l'événement numéro 5 montre
    // le recul.
    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    // Les deux événements que la restauration a perdus (4 et 5) repartent.
    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([
      [idDeTest(6), idDeTest(7)],
      [idDeTest(4), idDeTest(5)],
    ]);
    // Le serveur a tout, une fois chacun : et l'appareil a lu l'événement de l'autre appareil.
    const attendus = [...idsDe(1, 7), idDeTest(20)];
    expect(ids(serveur.evenements(COURS_DE_TEST)).sort()).toEqual(attendus);
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(attendus);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
  });

  it('serveur_restaure_puis_depasse_par_un_autre_appareil_rien_ne_se_perd', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 5);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    // Restauré à trois événements, puis un autre appareil en envoie trois : le serveur en compte six,
    // plus que le curseur de l'appareil (5), et rend des événements que l'appareil n'a jamais vus.
    serveur.restaurer(COURS_DE_TEST, 3);
    const autres = [21, 22, 23].map((n) =>
      reponseDeTest(COURS_DE_TEST, n, { appareil: AUTRE_APPAREIL_DE_TEST }),
    );
    serveur.deposer(COURS_DE_TEST, autres);
    serveur.envois.length = 0;

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([[idDeTest(4), idDeTest(5)]]);
    const attendus = [...idsDe(1, 5), ...ids(autres)];
    expect(ids(serveur.evenements(COURS_DE_TEST)).sort()).toEqual(attendus);
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(attendus);
  });

  it('sans_recul_l_evenement_relu_est_ignore_et_rien_n_est_renvoye', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    serveur.envois.length = 0;
    serveur.lectures.length = 0;
    serveur.deposer(COURS_DE_TEST, [
      reponseDeTest(COURS_DE_TEST, 9, { appareil: AUTRE_APPAREIL_DE_TEST }),
    ]);

    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    // Une seule lecture, qui part de l'événement du curseur (le numéro 3) : il est déjà là.
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([2]);
    expect(serveur.envois).toEqual([]);
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual([
      ...idsDe(1, 3),
      idDeTest(9),
    ]);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(4);
  });

  it('un_curseur_sans_identite_connue_est_relu_depuis_zero', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    serveur.deposer(
      COURS_DE_TEST,
      [1, 2, 3].map((n) => reponseDeTest(COURS_DE_TEST, n)),
    );
    // Un curseur dont on ne sait plus quel événement il désigne ne prouve rien.
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [], 3);

    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(serveur.lectures.map((l) => l.depuis)).toEqual([2, 0]);
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 3));
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(3);
  });

  it('une_restauration_interrompue_est_reprise_depuis_le_debut', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 6);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    // Trois événements restent chez le serveur, lus deux par deux.
    serveur.restaurer(COURS_DE_TEST, 3);
    serveur.pageMax = 2;
    serveur.envois.length = 0;
    let lectures = 0;
    const api = apiDe(serveur, {
      lire: async (cours, depuis) => {
        lectures += 1;
        // Lecture 1 : le recul est vu. Lecture 2 : première page de la relecture. Lecture 3 : le
        // réseau tombe.
        if (lectures === 3) throw erreurReseau();
        return serveur.lire(cours, depuis);
      },
    });

    const coupee = await synchroniserCours(base, ALICE, COURS_DE_TEST, api);

    expect(coupee).toEqual({ etat: 'hors_ligne', enAttente: 0 });
    // Le curseur n'a pas avancé : la prochaine synchronisation voit encore le recul.
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(6);
    expect(serveur.envois).toEqual([]);

    const reprise = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    expect(reprise).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([idsDe(4, 6)]);
    expect(ids(serveur.evenements(COURS_DE_TEST)).sort()).toEqual(idsDe(1, 6));
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 6));
  });
});

// ------------------------------------------------------------------------------------------------
// La note des envois (2b-D4) : les limites (a) et (b) de R17

const note = (base: BaseLocale) => noteDesEnvois(base, ALICE, COURS_DE_TEST);

/**
 * Alice répond de 1 à 3 et synchronise (curseur 3) ; puis elle répond de 4 à `fin`, et le service
 * worker envoie ces réponses sans rien lire (`envoyerFile`). Les traces du serveur repartent de
 * zéro.
 */
async function envoyerSansLire(fin: number) {
  const base = await ouvrirBaseDeTest();
  const serveur = new ServeurFactice();
  await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
  await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
  await repondre(base, ALICE, COURS_DE_TEST, 4, fin);
  expect(await envoyerFile(base, ALICE, serveur)).toBe('a_jour');
  serveur.envois.length = 0;
  serveur.lectures.length = 0;
  return { base, serveur };
}

/**
 * Une synchronisation dont la lecture est coupée (le réseau tombe) après `pages` pages d'un
 * événement chacune, rangées avec leur curseur.
 */
async function synchroniserEnCoupant(base: BaseLocale, serveur: ServeurFactice, pages: number) {
  serveur.pageMax = 1;
  let lectures = 0;
  const api = apiDe(serveur, {
    lire: async (cours, depuis) => {
      lectures += 1;
      if (lectures > pages) throw erreurReseau();
      return serveur.lire(cours, depuis);
    },
  });
  expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, api)).toEqual({
    etat: 'hors_ligne',
    enAttente: 0,
  });
  serveur.pageMax = 1000;
  serveur.lectures.length = 0;
}

/**
 * La synchronisation suivante lit le serveur depuis chacun de `lectures`, n'envoie rien, et laisse
 * la note vide : tout ce qui y était a été relu.
 */
async function verifierLaSuivante(base: BaseLocale, serveur: ServeurFactice, lectures: number[]) {
  serveur.envois.length = 0;
  serveur.lectures.length = 0;
  expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
    etat: 'a_jour',
    enAttente: 0,
  });
  expect(serveur.lectures.map((l) => l.depuis)).toEqual(lectures);
  expect(serveur.envois).toEqual([]);
  expect(await note(base)).toEqual([]);
}

/**
 * Le serveur a perdu 4 et 5, sans que le curseur (3) le montre. La lecture depuis le curseur ne
 * rend pas ce que la note attend : relecture complète, depuis 0. Seules les deux réponses perdues
 * repartent, et la synchronisation suivante n'a plus rien à renvoyer.
 */
async function verifierQue4Et5Repartent(base: BaseLocale, serveur: ServeurFactice) {
  serveur.envois.length = 0;
  serveur.lectures.length = 0;

  const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

  expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
  expect(serveur.lectures.map((l) => l.depuis)).toEqual([2, 0]);
  expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([idsDe(4, 5)]);
  expect(ids(serveur.evenements(COURS_DE_TEST))).toEqual(idsDe(1, 5));
  expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 5));
  await verifierLaSuivante(base, serveur, [2]);
}

describe('la note des envois (2b-D4)', () => {
  it('limite_a_envoi_sans_lecture_puis_restauration', async () => {
    // Le service worker envoie 4 et 5 sans lire ; puis le serveur est restauré d'une sauvegarde qui
    // a encore l'événement du curseur (3), mais plus 4 ni 5.
    const { base, serveur } = await envoyerSansLire(5);
    serveur.restaurer(COURS_DE_TEST, 3);

    await verifierQue4Et5Repartent(base, serveur);
  });

  it('limite_b_evenement_du_curseur_revenu_par_un_autre_appareil', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 3);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    // Alice répond 4 et 5 ; ils partent, mais la lecture qui suit échoue : le curseur reste à 3.
    await repondre(base, ALICE, COURS_DE_TEST, 4, 5);
    serveur.panneLecture = erreurReseau();
    expect((await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).etat).toBe('hors_ligne');
    serveur.panneLecture = undefined;
    // La sauvegarde s'arrête à 2. Un autre appareil, qui a vu la restauration, renvoie le premier
    // l'événement du curseur : il reprend le numéro 3, et l'identité ne montre plus rien.
    serveur.restaurer(COURS_DE_TEST, 2);
    serveur.deposer(COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 3)]);

    await verifierQue4Et5Repartent(base, serveur);
  });

  it('relu_retire_de_la_note', async () => {
    const { base, serveur } = await envoyerSansLire(5);
    expect(await note(base)).toEqual(idsDe(4, 5));

    // Une seule lecture, depuis le curseur, rend 3, 4 et 5 : la note se vide, rien ne repart.
    await verifierLaSuivante(base, serveur, [2]);
  });

  it('lecture_coupee_garde_la_note', async () => {
    const { base, serveur } = await envoyerSansLire(5);

    // Les pages de 3, puis de 4, sont rangées avec leur curseur, puis le réseau tombe.
    await synchroniserEnCoupant(base, serveur, 2);

    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(4);
    // La note n'a pas bougé, 4 compris, que la lecture coupée a pourtant rendu.
    expect(await note(base)).toEqual(idsDe(4, 5));
    // La lecture suivante va au bout, depuis l'événement du curseur : elle rend 4 et 5.
    await verifierLaSuivante(base, serveur, [3]);
  });

  it('entree_perimee_de_la_note_ne_boucle_pas', async () => {
    const { base, serveur } = await envoyerSansLire(6);
    // La lecture coupée a rangé 3, 4 et 5 : le curseur est à 5. La note garde 4, que le serveur a,
    // au numéro 4, sous la fenêtre de la lecture suivante (depuis 4).
    await synchroniserEnCoupant(base, serveur, 3);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(5);

    const resultat = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);

    // Une relecture complète, une seule : le serveur a tout, rien ne repart, la note se vide.
    expect(resultat).toEqual({ etat: 'a_jour', enAttente: 0 });
    expect(serveur.lectures.map((l) => l.depuis)).toEqual([4, 0]);
    expect(serveur.envois).toEqual([]);
    expect(await note(base)).toEqual([]);
    // La suivante lit depuis le curseur (6), et n'envoie toujours rien.
    await verifierLaSuivante(base, serveur, [5]);
  });

  it('enregistrement_sans_note', async () => {
    const { base, serveur } = await envoyerSansLire(5);
    expect(await note(base)).toEqual(idsDe(4, 5));

    // Le client de la version précédente lit le journal, et réécrit l'enregistrement du curseur à sa
    // façon : sans la note, qu'il ne connaît pas.
    await base.put('curseurs', {
      personne: ALICE,
      cours: COURS_DE_TEST,
      curseur: 5,
      dernier: idDeTest(5),
    });

    // Il se lit comme une note vide : on retombe sur le comportement d'avant, sans relecture.
    expect(await note(base)).toEqual([]);
    await verifierLaSuivante(base, serveur, [4]);
  });

  it('aucun_doublon_au_serveur', async () => {
    const { base, serveur } = await envoyerSansLire(5);
    serveur.restaurer(COURS_DE_TEST, 3);
    const serviceWorker = await ouvrirAutreConnexion(base);
    // Pendant la relecture complète, Alice répond 6, et le service worker l'envoie après que le
    // serveur a rendu sa page : la relecture ne l'a pas vu, le croit perdu et le renvoie.
    const api = apiDe(serveur, {
      lire: async (cours, depuis) => {
        const page = await serveur.lire(cours, depuis);
        if (depuis === 0) {
          await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 6));
          await envoyerFile(serviceWorker, ALICE, serveur);
        }
        return page;
      },
    });

    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, api)).toEqual({
      etat: 'a_jour',
      enAttente: 0,
    });

    // 6 part deux fois : par le service worker, puis avec 4 et 5. Le serveur ignore le second.
    expect(serveur.envois.map((e) => ids(e.evenements))).toEqual([[idDeTest(6)], idsDe(4, 6)]);
    // Le serveur et l'appareil ont chaque réponse une seule fois, et la file est vide.
    expect(ids(serveur.evenements(COURS_DE_TEST)).sort()).toEqual(idsDe(1, 6));
    expect(ids(await evenementsDuCours(base, ALICE, COURS_DE_TEST))).toEqual(idsDe(1, 6));
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    // Rien ne repart ensuite : la lecture suivante rend 6 avec les autres.
    await verifierLaSuivante(base, serveur, [2]);
  });
});
