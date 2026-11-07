import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { valeursDeNoticeDExemple } from '../../domaine/contenu/exemple.fixture.js';
import { coursServiDeTest } from '../../domaine/cours/cours.fixture.js';
import type { Moi } from '../api.js';
import { lireNoticeLocale } from '../notice-locale.js';
import { envoyerFile } from '../synchro.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './base-locale.fixture.js';
import { type BaseLocale, ouvrirBaseLocale, reserverA, viderSaufLesFiles } from './base-locale.js';
import { coursLocal, enregistrerCours, enregistrerListe, listeLocale } from './cours-local.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  reponseDeTest,
} from './evenements.fixture.js';
import {
  ajouterEvenement,
  coursEnAttente,
  curseurDuCours,
  evenementsDuCours,
  fileDuCours,
  recevoirEvenements,
} from './journal-local.js';
import { ServeurFactice } from './serveur-factice.fixture.js';

afterEach(fermerLesBasesDeTest);

const LISTE = [{ id: COURS_DE_TEST, titre: 'Übungskurs', langue: 'de' }];

function moi(id: string, nomAffiche: string): Moi {
  return { id, nomAffiche, langue: 'de', proprietaire: false };
}

/**
 * Tout ce qu'une personne laisse sur l'appareil : le contenu et la liste de ses cours, un événement
 * envoyé (relu du serveur), un autre en attente, le curseur, et ce que l'application sait d'elle.
 */
async function remplirPour(base: BaseLocale, personne: string, nom: string) {
  await enregistrerCours(base, personne, coursServiDeTest());
  await enregistrerListe(base, personne, LISTE);
  await recevoirEvenements(base, personne, COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 1)], 1);
  await ajouterEvenement(base, personne, reponseDeTest(COURS_DE_TEST, 2));
  await base.put('etat', { cle: 'moi', valeur: moi(personne, nom) });
}

describe('base locale', () => {
  it('ouvrir_cree_les_stores_de_la_version_1', async () => {
    const base = await ouvrirBaseDeTest();

    expect(base.version).toBe(1);
    expect([...base.objectStoreNames].sort()).toEqual([
      'cours',
      'curseurs',
      'etat',
      'evenements',
      'file',
      'listes',
    ]);
    const tx = base.transaction(['evenements', 'file']);
    expect([...tx.objectStore('evenements').indexNames]).toEqual(['par_cours']);
    expect([...tx.objectStore('file').indexNames]).toEqual(['par_cours']);
    await tx.done;
  });

  it('vider_sauf_les_files_garde_celles_de_toutes_les_personnes', async () => {
    const base = await ouvrirBaseDeTest();
    await remplirPour(base, ALICE, 'Alice');
    await remplirPour(base, BERTHE, 'Berthe');

    await viderSaufLesFiles(base);

    // Tout est vidé (journal local, contenus, listes, curseurs, identité)…
    for (const nom of [...base.objectStoreNames].filter((nom) => nom !== 'file')) {
      expect(await base.count(nom), nom).toBe(0);
    }
    // … sauf les réponses pas encore parties, de chaque personne (R33).
    expect(await coursEnAttente(base, ALICE)).toEqual([COURS_DE_TEST]);
    expect(await coursEnAttente(base, BERTHE)).toEqual([COURS_DE_TEST]);
    expect(await base.count('file')).toBe(2);
  });

  it('vider_sauf_les_files_efface_la_copie_de_la_notice', async () => {
    // La déconnexion efface la copie de la notice avec le reste (S1-D8). Réserver l'appareil à une
    // autre personne la garde : elle est publique, et n'est à personne.
    const base = await ouvrirBaseDeTest();
    await remplirPour(base, ALICE, 'Alice');
    await base.put('etat', { cle: 'notice', valeur: valeursDeNoticeDExemple() });

    await reserverA(base, BERTHE);
    expect(await lireNoticeLocale(base)).toEqual(valeursDeNoticeDExemple());
    expect(await base.get('etat', 'moi')).toBeUndefined();

    await viderSaufLesFiles(base);
    expect(await lireNoticeLocale(base)).toBeUndefined();
    expect(await base.count('etat')).toBe(0);
  });

  it('donnees_d_une_personne_invisibles_pour_une_autre', async () => {
    const base = await ouvrirBaseDeTest();
    await remplirPour(base, ALICE, 'Alice');

    expect(await coursLocal(base, BERTHE, COURS_DE_TEST)).toBeUndefined();
    expect(await listeLocale(base, BERTHE)).toBeUndefined();
    expect(await evenementsDuCours(base, BERTHE, COURS_DE_TEST)).toEqual([]);
    expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toEqual([]);
    expect(await coursEnAttente(base, BERTHE)).toEqual([]);
    expect(await curseurDuCours(base, BERTHE, COURS_DE_TEST)).toBe(0);
    // Un même `id` d'événement chez deux personnes : deux événements, qui ne se voient pas.
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 2, { juste: false }));
    expect((await evenementsDuCours(base, ALICE, COURS_DE_TEST)).map((e) => e.resultat)).toEqual([
      { juste: true },
      { juste: true },
    ]);
    expect((await evenementsDuCours(base, BERTHE, COURS_DE_TEST)).map((e) => e.resultat)).toEqual([
      { juste: false },
    ]);
  });

  it('autre_personne_efface_les_donnees_de_la_precedente_sauf_sa_file', async () => {
    const base = await ouvrirBaseDeTest();
    await remplirPour(base, ALICE, 'Alice');
    await ajouterEvenement(base, ALICE, reponseDeTest(AUTRE_COURS_DE_TEST, 3));

    await reserverA(base, BERTHE);

    // Rien d'Alice ne reste : ni cours, ni contenu, ni événement, ni curseur, ni qui elle est.
    expect(await coursLocal(base, ALICE, COURS_DE_TEST)).toBeUndefined();
    expect(await listeLocale(base, ALICE)).toBeUndefined();
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(await evenementsDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
    expect(await curseurDuCours(base, ALICE, COURS_DE_TEST)).toBe(0);
    expect(await base.getAll('etat')).toEqual([]);
    for (const nom of ['evenements', 'cours', 'listes', 'curseurs'] as const) {
      expect(await base.count(nom), nom).toBe(0);
    }
    // Sa file reste, pour être envoyée sous sa session, et seulement sous la sienne.
    expect((await fileDuCours(base, ALICE, COURS_DE_TEST)).map((e) => e.id)).toEqual([
      reponseDeTest(COURS_DE_TEST, 2).id,
    ]);
    expect(await coursEnAttente(base, ALICE)).toEqual([COURS_DE_TEST, AUTRE_COURS_DE_TEST]);
    expect(await coursEnAttente(base, BERTHE)).toEqual([]);
    const serveur = new ServeurFactice();
    expect(await envoyerFile(base, BERTHE, serveur)).toBe('a_jour');
    expect(serveur.envois).toEqual([]);
  });

  it('reserver_a_garde_tout_ce_qui_est_a_la_personne', async () => {
    const base = await ouvrirBaseDeTest();
    await remplirPour(base, ALICE, 'Alice');
    await remplirPour(base, BERTHE, 'Berthe');

    await reserverA(base, BERTHE);

    expect(await coursLocal(base, BERTHE, COURS_DE_TEST)).toEqual(coursServiDeTest());
    expect(await listeLocale(base, BERTHE)).toEqual(LISTE);
    expect(await evenementsDuCours(base, BERTHE, COURS_DE_TEST)).toHaveLength(2);
    expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toHaveLength(1);
    expect(await curseurDuCours(base, BERTHE, COURS_DE_TEST)).toBe(1);
    expect(await base.getAll('etat')).toEqual([{ cle: 'moi', valeur: moi(BERTHE, 'Berthe') }]);
  });

  it('une_version_superieure_n_est_pas_bloquee_par_la_connexion_ouverte', async () => {
    const nom = `ancrage-test-${crypto.randomUUID()}`;
    const v1 = await ouvrirBaseLocale(nom);
    try {
      // Sans gestionnaire `blocking`, cette ouverture attendrait indéfiniment que la connexion de
      // la version 1 (un onglet, le service worker) se ferme.
      const v2 = await Promise.race([
        openDB(nom, 2),
        new Promise<never>((_, rejeter) =>
          setTimeout(() => rejeter(new Error("l'ouverture en version 2 est restée bloquée")), 1000),
        ),
      ]);

      expect(v2.version).toBe(2);
      v2.close();
      // La connexion de la version 1 a été fermée.
      expect(() => v1.transaction('etat')).toThrow();
    } finally {
      v1.close();
    }
  });

  it('reserver_a_sur_une_base_vide_ne_fait_rien', async () => {
    const base = await ouvrirBaseDeTest();

    await reserverA(base, ALICE);

    for (const nom of [...base.objectStoreNames]) {
      expect(await base.count(nom), nom).toBe(0);
    }
  });
});
