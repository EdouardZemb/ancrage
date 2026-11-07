import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { appliquerMigrations, type Base, fermerBase, ouvrirBase } from '../base/base.js';
import { espionnerLesTransactions } from '../base/wal.fixture.js';
import { creerDepot, estViolationUnicite } from '../comptes/depot.js';
import { creerDepotJournal, LOT_MAX, PAGE_MAX } from './depot-journal.js';
import { examenDeTest, insererEvenementBrut, reponseDeTest } from './evenements.fixture.js';

const T0 = new Date('2026-10-17T08:00:00.000Z');
const RECU_A = '2026-10-17T08:00:05.000Z';
const COURS = 'cm5r8t23';
const AUTRE_COURS = 'q3m8vx2k';

let dossier: string;
let base: Base;

beforeEach(() => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-'));
  base = ouvrirBase(path.join(dossier, 'x.sqlite'));
  appliquerMigrations(base);
});

afterEach(() => {
  // Windows verrouille les fichiers ouverts : on ferme avant de supprimer.
  fermerBase(base);
  fs.rmSync(dossier, { recursive: true, force: true });
});

function creerPersonne(nomAffiche: string): string {
  return creerDepot(base, () => T0).creerPersonne({ nomAffiche, langue: 'de' }).id;
}

function nombreDeLignes(personne?: string): number {
  const ligne =
    personne === undefined
      ? base.sqlite.prepare('select count(*) as n from evenement').get()
      : base.sqlite.prepare('select count(*) as n from evenement where personne = ?').get(personne);
  return (ligne as { n: number }).n;
}

/** Les numéros de la personne dans ce cours, dans l'ordre d'arrivée des événements. */
function numeros(personne: string, cours: string): number[] {
  const lignes = base.sqlite
    .prepare('select numero from evenement where personne = ? and cours = ? order by rang')
    .all(personne, cours) as { numero: number }[];
  return lignes.map((ligne) => ligne.numero);
}

describe('creerDepotJournal', () => {
  it('limites_du_lot_et_de_la_page', () => {
    expect(LOT_MAX).toBe(500);
    expect(PAGE_MAX).toBe(1000);
  });

  it('ajout_puis_lecture_dans_l_ordre_des_numeros', () => {
    const depot = creerDepotJournal(base);
    const personne = creerPersonne('Lernende Test');
    // Ni l'ordre des `id` ni celui de `repondu_a` : l'ordre d'arrivée fait le numéro.
    const premier = reponseDeTest(COURS, 30);
    const deuxieme = examenDeTest(COURS, 10);
    const troisieme = reponseDeTest(COURS, 20, false);
    const autreCours = reponseDeTest(AUTRE_COURS, 40);

    expect(depot.ajouter(personne, [premier, autreCours, deuxieme], RECU_A)).toBe(3);
    expect(depot.ajouter(personne, [troisieme], RECU_A)).toBe(1);

    const page = depot.lire(personne, COURS, 0, PAGE_MAX);
    expect(page.evenements).toStrictEqual([premier, deuxieme, troisieme]);
    expect(page.suite).toBe(false);
    // Les numéros vont de 1 à 3 dans ce cours, et le curseur est celui du dernier événement rendu.
    expect(numeros(personne, COURS)).toEqual([1, 2, 3]);
    expect(page.curseur).toBe(3);
    // L'autre cours a son propre journal, et sa propre numérotation.
    expect(numeros(personne, AUTRE_COURS)).toEqual([1]);
    expect(depot.lire(personne, AUTRE_COURS, 0, PAGE_MAX)).toStrictEqual({
      evenements: [autreCours],
      curseur: 1,
      suite: false,
    });
  });

  it('lecture_rend_les_champs_tels_qu_envoyes_et_recu_a_vient_de_l_appelant', () => {
    const depot = creerDepotJournal(base);
    const personne = creerPersonne('Lernende Test');
    const examen = examenDeTest(COURS, 1);

    depot.ajouter(personne, [examen], RECU_A);

    const [rendu] = depot.lire(personne, COURS, 0, PAGE_MAX).evenements;
    // `resultat` est rangé en JSON et relu tel quel ; aucun champ du serveur ne ressort.
    expect(rendu).toStrictEqual(examen);
    expect(Object.keys(rendu ?? {})).toEqual([
      'id',
      'cours',
      'unite',
      'type',
      'resultat',
      'repondu_a',
      'appareil',
      'v',
    ]);
    const ligne = base.sqlite.prepare('select personne, recu_a, resultat from evenement').get();
    expect(ligne).toStrictEqual({
      personne,
      recu_a: RECU_A,
      resultat: '{"points":18,"questions":24,"note":4.5,"minutes":12,"chapitres":3}',
    });
  });

  it('id_deja_recu_ignore_le_premier_fait_foi', () => {
    const depot = creerDepotJournal(base);
    const personne = creerPersonne('Lernende Test');
    const premier = reponseDeTest(COURS, 1, true);
    const memeIdAutreResultat = { ...reponseDeTest(COURS, 1, false), unite: 'zzzzzzzz' };
    const neuf = reponseDeTest(COURS, 2);

    expect(depot.ajouter(personne, [premier], RECU_A)).toBe(1);
    // Renvoyé seul, renvoyé avec un autre contenu, renvoyé dans un lot qui en a un neuf.
    expect(depot.ajouter(personne, [premier], '2026-10-17T09:00:00.000Z')).toBe(0);
    expect(depot.ajouter(personne, [memeIdAutreResultat], RECU_A)).toBe(0);
    expect(depot.ajouter(personne, [premier, neuf, memeIdAutreResultat], RECU_A)).toBe(1);
    // Deux fois le même `id` dans un même lot : le premier fait foi.
    expect(
      depot.ajouter(personne, [reponseDeTest(COURS, 3), reponseDeTest(COURS, 3, false)], RECU_A),
    ).toBe(1);

    const { evenements } = depot.lire(personne, COURS, 0, PAGE_MAX);
    expect(evenements).toStrictEqual([premier, neuf, reponseDeTest(COURS, 3)]);
    // Le `recu_a` du premier envoi n'a pas bougé.
    const recus = base.sqlite.prepare('select distinct recu_a from evenement').all();
    expect(recus).toStrictEqual([{ recu_a: RECU_A }]);
  });

  it('meme_id_chez_deux_personnes_independants', () => {
    const depot = creerDepotJournal(base);
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    const evenement = reponseDeTest(COURS, 1);

    expect(depot.ajouter(alice, [evenement], RECU_A)).toBe(1);
    expect(depot.ajouter(berthe, [evenement], RECU_A)).toBe(1);

    expect(depot.lire(alice, COURS, 0, PAGE_MAX).evenements).toStrictEqual([evenement]);
    expect(depot.lire(berthe, COURS, 0, PAGE_MAX).evenements).toStrictEqual([evenement]);
    expect(nombreDeLignes()).toBe(2);
  });

  it('lecture_ne_rend_jamais_le_journal_d_une_autre_personne', () => {
    const depot = creerDepotJournal(base);
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    depot.ajouter(alice, [reponseDeTest(COURS, 1), reponseDeTest(COURS, 2)], RECU_A);

    const page = depot.lire(berthe, COURS, 0, PAGE_MAX);

    expect(page).toStrictEqual({ evenements: [], curseur: 0, suite: false });
  });

  it('lecture_par_pages_curseur_et_suite', () => {
    const depot = creerDepotJournal(base);
    const personne = creerPersonne('Lernende Test');
    const autre = creerPersonne('Andere Test');
    const evenements = [1, 2, 3, 4, 5].map((n) => reponseDeTest(COURS, n));
    // Les événements d'une autre personne, et ceux de la même personne dans un autre cours,
    // s'intercalent : les curseurs de ce journal se suivent sans trou.
    depot.ajouter(personne, evenements.slice(0, 2), RECU_A);
    depot.ajouter(autre, [reponseDeTest(COURS, 9), reponseDeTest(COURS, 10)], RECU_A);
    depot.ajouter(personne, [reponseDeTest(AUTRE_COURS, 11)], RECU_A);
    depot.ajouter(personne, evenements.slice(2), RECU_A);

    const premiere = depot.lire(personne, COURS, 0, 2);
    const deuxieme = depot.lire(personne, COURS, premiere.curseur, 2);
    const derniere = depot.lire(personne, COURS, deuxieme.curseur, 2);
    const vide = depot.lire(personne, COURS, derniere.curseur, 2);

    expect(premiere.evenements).toStrictEqual(evenements.slice(0, 2));
    expect(premiere.suite).toBe(true);
    expect(deuxieme.evenements).toStrictEqual(evenements.slice(2, 4));
    expect(deuxieme.suite).toBe(true);
    expect(derniere.evenements).toStrictEqual(evenements.slice(4));
    expect(derniere.suite).toBe(false);
    expect([premiere.curseur, deuxieme.curseur, derniere.curseur]).toEqual([2, 4, 5]);
    // Une page vide garde le curseur reçu.
    expect(vide).toStrictEqual({ evenements: [], curseur: 5, suite: false });
    // Exactement une page pleine : pas de suite.
    expect(depot.lire(personne, COURS, 0, 5).suite).toBe(false);
    expect(depot.lire(personne, COURS, 0, 4).suite).toBe(true);
  });

  it('doublon_ne_consomme_pas_de_numero', () => {
    const depot = creerDepotJournal(base);
    const personne = creerPersonne('Lernende Test');
    const premier = reponseDeTest(COURS, 1);

    expect(depot.ajouter(personne, [premier], RECU_A)).toBe(1);
    // Renvoyé seul, renvoyé avec un événement neuf, répété dans un même lot.
    expect(depot.ajouter(personne, [premier], RECU_A)).toBe(0);
    expect(depot.ajouter(personne, [premier, reponseDeTest(COURS, 2)], RECU_A)).toBe(1);
    expect(
      depot.ajouter(
        personne,
        [reponseDeTest(COURS, 3), reponseDeTest(COURS, 3, false), reponseDeTest(COURS, 4)],
        RECU_A,
      ),
    ).toBe(2);
    // Le même `id` dans un autre cours est aussi un doublon : un `id` est unique par personne.
    expect(depot.ajouter(personne, [reponseDeTest(AUTRE_COURS, 1)], RECU_A)).toBe(0);
    expect(depot.ajouter(personne, [reponseDeTest(COURS, 5)], RECU_A)).toBe(1);

    // Aucun trou : les doublons n'ont pris aucun numéro.
    expect(numeros(personne, COURS)).toEqual([1, 2, 3, 4, 5]);
    expect(numeros(personne, AUTRE_COURS)).toEqual([]);
    expect(depot.lire(personne, COURS, 0, PAGE_MAX).curseur).toBe(5);
  });

  it('numerotation_propre_a_la_personne_et_au_cours', () => {
    const depot = creerDepotJournal(base);
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');

    depot.ajouter(alice, [reponseDeTest(COURS, 1), reponseDeTest(COURS, 2)], RECU_A);
    depot.ajouter(
      berthe,
      [1, 2, 3].map((n) => reponseDeTest(COURS, n)),
      RECU_A,
    );
    depot.ajouter(alice, [reponseDeTest(AUTRE_COURS, 3)], RECU_A);
    depot.ajouter(berthe, [reponseDeTest(AUTRE_COURS, 4), reponseDeTest(AUTRE_COURS, 5)], RECU_A);

    // Chaque couple (personne, cours) repart de 1.
    expect(numeros(alice, COURS)).toEqual([1, 2]);
    expect(numeros(berthe, COURS)).toEqual([1, 2, 3]);
    expect(numeros(alice, AUTRE_COURS)).toEqual([1]);
    expect(numeros(berthe, AUTRE_COURS)).toEqual([1, 2]);
    // Un lot qui mêle deux cours : chacun poursuit sa suite.
    depot.ajouter(
      alice,
      [reponseDeTest(COURS, 6), reponseDeTest(AUTRE_COURS, 7), reponseDeTest(COURS, 8)],
      RECU_A,
    );
    expect(numeros(alice, COURS)).toEqual([1, 2, 3, 4]);
    expect(numeros(alice, AUTRE_COURS)).toEqual([1, 2]);
    expect(numeros(berthe, COURS)).toEqual([1, 2, 3]);
    expect(depot.lire(alice, COURS, 0, PAGE_MAX).curseur).toBe(4);
    expect(depot.lire(alice, AUTRE_COURS, 0, PAGE_MAX).curseur).toBe(2);
    expect(depot.lire(berthe, COURS, 0, PAGE_MAX).curseur).toBe(3);
  });

  it('depuis_au_dela_du_dernier_numero_rend_le_dernier', () => {
    const depot = creerDepotJournal(base);
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    depot.ajouter(
      alice,
      [1, 2, 3].map((n) => reponseDeTest(COURS, n)),
      RECU_A,
    );
    depot.ajouter(berthe, [reponseDeTest(COURS, 9)], RECU_A);

    // Un téléphone a lu jusqu'au numéro 50, puis la base a été restaurée d'une sauvegarde plus
    // ancienne : le curseur recule, et le client le voit.
    const pageVide = { evenements: [], suite: false };
    expect(depot.lire(alice, COURS, 3, 10)).toStrictEqual({ ...pageVide, curseur: 3 });
    expect(depot.lire(alice, COURS, 4, 10)).toStrictEqual({ ...pageVide, curseur: 3 });
    expect(depot.lire(alice, COURS, 50, 10)).toStrictEqual({ ...pageVide, curseur: 3 });
    // Dans un cours où elle n'a rien, ou sans aucun événement : 0.
    expect(depot.lire(alice, AUTRE_COURS, 7, 10)).toStrictEqual({ ...pageVide, curseur: 0 });
    expect(depot.lire(creerPersonne('Dritte Test'), COURS, 7, 10)).toStrictEqual({
      ...pageVide,
      curseur: 0,
    });
    // En deçà du dernier numéro, on lit la suite.
    expect(depot.lire(alice, COURS, 2, 10).curseur).toBe(3);
    expect(depot.lire(alice, COURS, 2, 10).evenements).toStrictEqual([reponseDeTest(COURS, 3)]);
  });

  it('numero_unique_par_personne_et_cours', () => {
    const depot = creerDepotJournal(base);
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    depot.ajouter(alice, [reponseDeTest(COURS, 1)], RECU_A);

    // Le numéro 1 de (Alice, COURS) est pris ; celui d'un autre cours ou d'une autre personne non.
    let erreur: unknown;
    try {
      insererEvenementBrut(base.sqlite, { id: 'autre-id', personne: alice, cours: COURS });
    } catch (e) {
      erreur = e;
    }
    expect(estViolationUnicite(erreur)).toBe(true);
    expect(nombreDeLignes()).toBe(1);
    insererEvenementBrut(base.sqlite, { id: 'autre-id', personne: alice, cours: AUTRE_COURS });
    insererEvenementBrut(base.sqlite, { id: 'autre-id', personne: berthe, cours: COURS });
    expect(nombreDeLignes()).toBe(3);
  });

  it('lot_atomique_un_echec_n_ecrit_rien', () => {
    const depot = creerDepotJournal(base);
    const personne = creerPersonne('Lernende Test');
    const casse = { ...reponseDeTest(COURS, 2), id: undefined } as unknown as Evenement;

    expect(() => depot.ajouter(personne, [reponseDeTest(COURS, 1), casse], RECU_A)).toThrow();

    expect(nombreDeLignes()).toBe(0);
    // Le lot raté n'a pris aucun numéro.
    expect(depot.ajouter(personne, [reponseDeTest(COURS, 1)], RECU_A)).toBe(1);
    expect(numeros(personne, COURS)).toEqual([1]);
  });

  it('ajout_ecrit_en_transaction_immediate', () => {
    const personne = creerPersonne('Lernende Test');
    // L'espion se pose avant `creerDepotJournal`, qui construit la transaction une seule fois.
    const espion = espionnerLesTransactions(base.sqlite);
    const depot = creerDepotJournal(base);

    depot.ajouter(personne, [reponseDeTest(COURS, 1)], RECU_A);

    // `immediate` prend le verrou d'écriture avant la lecture du dernier numéro : sans lui, deux
    // écritures simultanées pourraient lire le même numéro.
    expect(espion.manieres).toEqual(['immediate']);
  });

  it('personne_inconnue_refusee_par_la_cle_etrangere', () => {
    const depot = creerDepotJournal(base);

    expect(() => depot.ajouter('personne-inconnue', [reponseDeTest(COURS, 1)], RECU_A)).toThrow();

    expect(nombreDeLignes()).toBe(0);
  });

  it('suppression_de_la_personne_supprime_son_journal', () => {
    const depot = creerDepotJournal(base);
    const alice = creerPersonne('Lernende Test');
    const berthe = creerPersonne('Andere Test');
    depot.ajouter(alice, [reponseDeTest(COURS, 1), reponseDeTest(COURS, 2)], RECU_A);
    depot.ajouter(berthe, [reponseDeTest(COURS, 3)], RECU_A);

    base.sqlite.prepare('delete from personne where id = ?').run(alice);

    expect(nombreDeLignes(alice)).toBe(0);
    expect(depot.lire(alice, COURS, 0, PAGE_MAX).evenements).toStrictEqual([]);
    expect(depot.lire(berthe, COURS, 0, PAGE_MAX).evenements).toStrictEqual([
      reponseDeTest(COURS, 3),
    ]);
  });
});
