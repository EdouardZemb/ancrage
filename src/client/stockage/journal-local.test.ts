import { afterEach, describe, expect, it } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import {
  fermerLesBasesDeTest,
  ouvrirAutreConnexion,
  ouvrirBaseDeTest,
} from './base-locale.fixture.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  examenDeTest,
  reponseDeTest,
} from './evenements.fixture.js';
import {
  abandonnerLaFile,
  ajouterEvenement,
  ajouterEvenements,
  confirmerLEnvoi,
  coursEnAttente,
  curseurDuCours,
  evenementsDuCours,
  fileDuCours,
  nombreEnAttente,
  noteDesEnvois,
  positionDuCours,
  recevoirEvenements,
  solderLaNote,
} from './journal-local.js';

afterEach(fermerLesBasesDeTest);

const ids = (evenements: readonly Evenement[]): string[] => evenements.map((e) => e.id);

describe('journal local', () => {
  it('evenement_ajoute_va_au_journal_et_a_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    const evenement = reponseDeTest(COURS_DE_TEST, 1);

    await ajouterEvenement(base, ALICE, evenement);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([evenement]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([evenement]);
    expect(await coursEnAttente(base, ALICE)).toEqual([COURS_DE_TEST]);
  });

  it('evenement_avec_mode_va_au_journal_et_a_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    const evenement = {
      ...reponseDeTest(COURS_DE_TEST, 1),
      resultat: { juste: true, mode: 'choix' },
    } as Evenement;

    await ajouterEvenement(base, ALICE, evenement);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([evenement]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([evenement]);
  });

  it('evenement_invalide_refuse_sans_rien_ecrire', async () => {
    const base = await ouvrirBaseDeTest();
    const valide = reponseDeTest(COURS_DE_TEST, 1);
    const invalides: [string, unknown][] = [
      ['id qui n est pas un UUIDv7', { ...valide, id: 'pas-un-uuid' }],
      ['cours mal formé', { ...valide, cours: 'Cours 1' }],
      ['unité mal formée', { ...valide, unite: 'X' }],
      ['date impossible', { ...valide, repondu_a: '2026-02-30T08:00:00.000+02:00' }],
      ['appareil qui n est pas un UUID', { ...valide, appareil: 'mon-telephone' }],
      ['version inconnue', { ...valide, v: 2 }],
      ['résultat qui n est pas celui du type', { ...valide, resultat: { juste: 'oui' } }],
      ['champ en plus', { ...valide, personne: BERTHE }],
      [
        'texte saisi en plus dans le résultat',
        { ...valide, resultat: { juste: true, saisie: 'x' } },
      ],
      ['mode inconnu', { ...valide, resultat: { juste: true, mode: 'devinee' } }],
      ['champ manquant', { ...valide, appareil: undefined }],
    ];

    for (const [nom, invalide] of invalides) {
      await expect(ajouterEvenement(base, ALICE, invalide as Evenement), nom).rejects.toThrow();
    }

    expect(await base.count('evenements')).toBe(0);
    expect(await base.count('file')).toBe(0);
    // Un événement valide passe ensuite sans difficulté.
    await ajouterEvenement(base, ALICE, valide);
    expect(await base.count('file')).toBe(1);
  });

  it('le_message_de_l_erreur_ne_cite_pas_l_evenement', async () => {
    const base = await ouvrirBaseDeTest();
    const invalide = { ...reponseDeTest(COURS_DE_TEST, 1), unite: 'MOT-SECRET' } as Evenement;

    const erreur = await ajouterEvenement(base, ALICE, invalide).catch((e) => e);

    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).not.toContain('MOT-SECRET');
  });

  // F10 : un examen remis (ses réponses, puis l'examen) se range d'un seul tenant.
  it('ajouter_evenements_range_tout_dans_l_ordre_le_premier_fait_foi', async () => {
    const base = await ouvrirBaseDeTest();
    const reponse = reponseDeTest(COURS_DE_TEST, 1, { juste: true });
    const autre = reponseDeTest(COURS_DE_TEST, 2);
    const examen = examenDeTest(COURS_DE_TEST, 3);
    const memeId = reponseDeTest(COURS_DE_TEST, 1, { juste: false });

    await ajouterEvenements(base, ALICE, [reponse, autre, memeId, examen]);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([reponse, autre, examen]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([reponse, autre, examen]);
  });

  it('ajouter_evenements_un_echec_au_milieu_ne_range_rien', async () => {
    const base = await ouvrirBaseDeTest();
    const invalide = { ...reponseDeTest(COURS_DE_TEST, 2), resultat: { juste: 'oui' } };

    const erreur = await ajouterEvenements(base, ALICE, [
      reponseDeTest(COURS_DE_TEST, 1),
      invalide as unknown as Evenement,
      examenDeTest(COURS_DE_TEST, 3),
    ]).catch((e) => e);

    expect(erreur).toBeInstanceOf(Error);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
  });

  it('un_examen_est_un_evenement_comme_les_autres', async () => {
    const base = await ouvrirBaseDeTest();
    const examen = examenDeTest(COURS_DE_TEST, 2);

    await ajouterEvenement(base, ALICE, examen);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([examen]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([examen]);
  });

  it('un_meme_id_n_est_jamais_stocke_deux_fois_le_premier_fait_foi', async () => {
    const base = await ouvrirBaseDeTest();
    const premier = reponseDeTest(COURS_DE_TEST, 1, { juste: true });
    const memeId = reponseDeTest(COURS_DE_TEST, 1, { juste: false });

    await ajouterEvenement(base, ALICE, premier);
    await ajouterEvenement(base, ALICE, memeId);
    await ajouterEvenement(base, ALICE, premier);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([premier]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([premier]);
  });

  it('evenements_du_cours_tries_dans_l_ordre_du_journal', async () => {
    const base = await ouvrirBaseDeTest();
    // Ajoutés dans le désordre : le journal les rend par instant, puis par `id`.
    for (const n of [30, 5, 61, 12]) {
      await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, n));
    }

    const attendus = [5, 12, 30, 61].map((n) => reponseDeTest(COURS_DE_TEST, n).id);
    const journal = await evenementsDuCours(base, ALICE, COURS_DE_TEST);
    expect(journal.map((e) => e.id)).toEqual(attendus);
    const file = await fileDuCours(base, ALICE, COURS_DE_TEST);
    expect(file.map((e) => e.id)).toEqual(attendus);
  });

  it('chaque_cours_a_son_journal_et_sa_file', async () => {
    const base = await ouvrirBaseDeTest();
    const premier = reponseDeTest(COURS_DE_TEST, 1);
    const second = reponseDeTest(AUTRE_COURS_DE_TEST, 2);
    await ajouterEvenement(base, ALICE, premier);
    await ajouterEvenement(base, ALICE, second);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([premier]);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([second]);
    expect(await coursEnAttente(base, ALICE)).toEqual([COURS_DE_TEST, AUTRE_COURS_DE_TEST]);
  });

  it('confirmer_l_envoi_retire_de_la_file_pour_la_note_sans_toucher_au_journal', async () => {
    const base = await ouvrirBaseDeTest();
    const a = reponseDeTest(COURS_DE_TEST, 1);
    const b = reponseDeTest(COURS_DE_TEST, 2);
    const c = reponseDeTest(AUTRE_COURS_DE_TEST, 3);
    await ajouterEvenement(base, ALICE, a);
    await ajouterEvenement(base, ALICE, b);
    await ajouterEvenement(base, ALICE, c);

    await confirmerLEnvoi(base, ALICE, [a.id, c.id, 'inconnu']);

    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([b]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([a, b]);
    // Chaque envoi est noté pour son cours ; un `id` qui n'était pas dans la file ne l'est pas.
    expect(await noteDesEnvois(base, ALICE, COURS_DE_TEST)).toEqual([a.id]);
    expect(await noteDesEnvois(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([c.id]);
    await confirmerLEnvoi(base, ALICE, [b.id]);
    expect(await coursEnAttente(base, ALICE)).toEqual([]);
    expect(await noteDesEnvois(base, ALICE, COURS_DE_TEST)).toEqual([a.id, b.id]);
    // La note est rangée avec le curseur, que la confirmation ne fait pas avancer.
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(0);
  });

  // 2b-D4 : la page et le service worker écrivent la note des envois, chacun sur sa connexion.
  it('note_ecrite_par_deux_ecrivains', async () => {
    const page = await ouvrirBaseDeTest();
    const serviceWorker = await ouvrirAutreConnexion(page);
    const id = (n: number) => reponseDeTest(COURS_DE_TEST, n).id;
    const note = async () => [...(await noteDesEnvois(page, ALICE, COURS_DE_TEST))].sort();
    for (let n = 1; n <= 6; n += 1)
      await ajouterEvenement(page, ALICE, reponseDeTest(COURS_DE_TEST, n));
    await confirmerLEnvoi(page, ALICE, [id(1)]);
    expect(await noteDesEnvois(serviceWorker, ALICE, COURS_DE_TEST)).toEqual([id(1)]);

    // Tout à la fois : chacun confirme ses envois, la page retire de la note ce qu'une lecture a
    // rendu, et les deux confirment le même envoi (ils ont envoyé la même file).
    await Promise.all([
      confirmerLEnvoi(page, ALICE, [id(2), id(3)]),
      confirmerLEnvoi(serviceWorker, ALICE, [id(4), id(5)]),
      solderLaNote(page, ALICE, COURS_DE_TEST, new Set([id(1)])),
      confirmerLEnvoi(page, ALICE, [id(6)]),
      confirmerLEnvoi(serviceWorker, ALICE, [id(6)]),
    ]);

    // Rien ne s'est écrasé : chaque envoi est noté, une fois, et la file est vide.
    expect(await note()).toEqual([2, 3, 4, 5, 6].map(id).sort());
    expect(await fileDuCours(page, ALICE, COURS_DE_TEST)).toEqual([]);
    // Un envoi relu sort de la note ; la confirmation tardive de l'autre écrivain ne l'y remet pas :
    // il n'est plus dans la file, celui qui l'en a retiré l'a noté.
    await solderLaNote(page, ALICE, COURS_DE_TEST, new Set([id(6)]));
    await confirmerLEnvoi(serviceWorker, ALICE, [id(6)]);
    expect(await note()).toEqual([2, 3, 4, 5].map(id).sort());
  });

  it('nombre_en_attente_compte_la_file_de_la_personne_seulement', async () => {
    const base = await ouvrirBaseDeTest();
    expect(await nombreEnAttente(base, ALICE)).toBe(0);
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 2));
    await ajouterEvenement(base, ALICE, reponseDeTest(AUTRE_COURS_DE_TEST, 3));
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 4));

    // Des événements, pas des cours : c'est le nombre de réponses qui attendent.
    expect(await nombreEnAttente(base, ALICE)).toBe(3);
    expect(await nombreEnAttente(base, BERTHE)).toBe(1);
    // Ce que le journal a reçu du serveur n'attend rien.
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 5)], 1);
    expect(await nombreEnAttente(base, ALICE)).toBe(3);
  });

  it('abandonner_la_file_vide_celle_de_la_personne_et_rend_le_nombre', async () => {
    const base = await ouvrirBaseDeTest();
    const a = reponseDeTest(COURS_DE_TEST, 1);
    const b = reponseDeTest(AUTRE_COURS_DE_TEST, 2);
    const c = reponseDeTest(COURS_DE_TEST, 3);
    await ajouterEvenement(base, ALICE, a);
    await ajouterEvenement(base, ALICE, b);
    await ajouterEvenement(base, BERTHE, c);

    expect(await abandonnerLaFile(base, ALICE)).toBe(2);

    expect(await coursEnAttente(base, ALICE)).toEqual([]);
    expect(await nombreEnAttente(base, ALICE)).toBe(0);
    // La file de Berthe reste, et le journal local d'Alice : seule la file est abandonnée.
    expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toEqual([c]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([a]);
    // Une file déjà vide : rien à abandonner.
    expect(await abandonnerLaFile(base, ALICE)).toBe(0);
  });

  it('un_evenement_recu_va_au_journal_pas_a_la_file_et_fait_avancer_le_curseur', async () => {
    const base = await ouvrirBaseDeTest();
    const recus = [reponseDeTest(COURS_DE_TEST, 1), reponseDeTest(COURS_DE_TEST, 2)];

    await recevoirEvenements(base, ALICE, COURS_DE_TEST, recus, 2);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual(recus);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(2);
    expect(await curseurDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toBe(0);
  });

  it('la_position_garde_l_id_de_l_evenement_du_curseur', async () => {
    const base = await ouvrirBaseDeTest();
    expect(await positionDuCours(base, ALICE, COURS_DE_TEST)).toEqual({
      curseur: 0,
      dernier: undefined,
    });

    await recevoirEvenements(
      base,
      ALICE,
      COURS_DE_TEST,
      [reponseDeTest(COURS_DE_TEST, 1), reponseDeTest(COURS_DE_TEST, 2)],
      2,
    );
    expect(await positionDuCours(base, ALICE, COURS_DE_TEST)).toEqual({
      curseur: 2,
      dernier: reponseDeTest(COURS_DE_TEST, 2).id,
    });

    // Une page vide au même curseur ne change rien à l'identité de l'événement du curseur.
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [], 2);
    expect((await positionDuCours(base, ALICE, COURS_DE_TEST)).dernier).toBe(
      reponseDeTest(COURS_DE_TEST, 2).id,
    );

    // Un autre curseur, sans événement : on ne sait plus lequel le désigne.
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [], 5);
    expect(await positionDuCours(base, ALICE, COURS_DE_TEST)).toEqual({
      curseur: 5,
      dernier: undefined,
    });
  });

  it('sans_curseur_les_evenements_sont_ranges_et_la_position_ne_bouge_pas', async () => {
    const base = await ouvrirBaseDeTest();
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 1)], 1);

    await recevoirEvenements(
      base,
      ALICE,
      COURS_DE_TEST,
      [reponseDeTest(COURS_DE_TEST, 2), reponseDeTest(COURS_DE_TEST, 3)],
      undefined,
    );

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(3);
    expect(await positionDuCours(base, ALICE, COURS_DE_TEST)).toEqual({
      curseur: 1,
      dernier: reponseDeTest(COURS_DE_TEST, 1).id,
    });
  });

  it('solder_la_note_remet_en_file_sans_toucher_au_journal_ni_rien_doubler', async () => {
    const base = await ouvrirBaseDeTest();
    const a = reponseDeTest(COURS_DE_TEST, 1);
    const b = reponseDeTest(COURS_DE_TEST, 2);
    const c = reponseDeTest(COURS_DE_TEST, 3);
    const d = reponseDeTest(COURS_DE_TEST, 4);
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [a, b], 2);
    await ajouterEvenement(base, ALICE, c);
    // `d` est parti, et la note l'attend.
    await ajouterEvenement(base, ALICE, d);
    await confirmerLEnvoi(base, ALICE, [d.id]);

    // Une relecture complète : le serveur a perdu les quatre ; `d` sort de la note.
    await solderLaNote(base, ALICE, COURS_DE_TEST, new Set([d.id]), [a, b, c, d]);
    await solderLaNote(base, ALICE, COURS_DE_TEST, new Set(), [a]);

    expect(ids(await fileDuCours(base, ALICE, COURS_DE_TEST))).toEqual([a.id, b.id, c.id, d.id]);
    expect(await noteDesEnvois(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(4);
    // Le curseur ne bouge pas : il est rangé ensuite, par la lecture.
    expect(await positionDuCours(base, ALICE, COURS_DE_TEST)).toEqual({
      curseur: 2,
      dernier: b.id,
    });
    // Rien n'est remis en file pour une autre personne.
    expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toEqual([]);
  });

  it('recevoir_deux_fois_le_meme_evenement_n_en_garde_qu_un_et_le_premier_fait_foi', async () => {
    const base = await ouvrirBaseDeTest();
    const local = reponseDeTest(COURS_DE_TEST, 1, { juste: true });
    await ajouterEvenement(base, ALICE, local);

    await recevoirEvenements(
      base,
      ALICE,
      COURS_DE_TEST,
      [reponseDeTest(COURS_DE_TEST, 1, { juste: false }), reponseDeTest(COURS_DE_TEST, 2)],
      2,
    );
    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 2)], 2);

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([
      local,
      reponseDeTest(COURS_DE_TEST, 2),
    ]);
    // L'événement local est toujours dans la file : il n'est pas encore parti.
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([local]);
  });

  it('un_evenement_recu_d_un_autre_cours_est_ignore', async () => {
    const base = await ouvrirBaseDeTest();

    await recevoirEvenements(
      base,
      ALICE,
      COURS_DE_TEST,
      [reponseDeTest(COURS_DE_TEST, 1), reponseDeTest(AUTRE_COURS_DE_TEST, 2)],
      2,
    );

    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
    expect(await evenementsDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
  });

  it('un_champ_personne_venu_du_serveur_ne_range_rien_chez_cette_personne', async () => {
    const base = await ouvrirBaseDeTest();
    const piege = { ...reponseDeTest(COURS_DE_TEST, 1), personne: BERTHE };

    await recevoirEvenements(base, ALICE, COURS_DE_TEST, [piege], 1);

    expect(await evenementsDuCours(base, BERTHE, COURS_DE_TEST)).toEqual([]);
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });
});
