import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { ouvrirBase } from '../../serveur/base/base.js';
import {
  COURS_DE_TEST,
  copierParVacuum,
  ecrireJournal,
  installerDossierTemporaire,
  journalSimule,
  passerEnWal,
  reponseInventee,
} from './ecrire-journal.fixture.js';
import { BaseEnWal, lireJournalDe, lireJournaux } from './lire-journaux.js';

const dossierDuTest = installerDossierTemporaire();
const base = () => path.join(dossierDuTest(), 'copie.sqlite');

test('deux_personnes_donnent_deux_journaux_sans_rien_qui_les_nomme', () => {
  const a = journalSimule({ unites: 3, passages: 4, graine: 1 });
  const b = journalSimule({ unites: 2, passages: 5, graine: 2 });
  const personnes = ecrireJournal(base(), [a, b]);

  const { journaux } = lireJournaux(base(), COURS_DE_TEST);

  expect(journaux.map((journal) => journal.length).sort()).toEqual([10, 12]);
  const texte = JSON.stringify(journaux);
  for (const personne of personnes) {
    expect(texte).not.toContain(personne.id);
    expect(texte).not.toContain(personne.nom);
  }
  // L'appareil non plus : il désignerait la personne d'un téléphone à l'autre.
  expect(texte).not.toContain('4b3f0a52');
});

test('un_journal_est_dans_l_ordre_du_journal_de_sa_personne', () => {
  const journal = journalSimule({ unites: 2, passages: 4, graine: 3 });
  ecrireJournal(base(), [journal]);
  const { journaux } = lireJournaux(base(), COURS_DE_TEST);
  expect(journaux[0]?.map((e) => e.id)).toEqual(journal.map((e) => e.id));
  expect(journaux[0]?.map((e) => e.resultat)).toEqual(journal.map((e) => e.resultat));
});

test('une_base_sans_ce_cours_rend_une_liste_vide', () => {
  ecrireJournal(base(), [journalSimule({ unites: 2, passages: 3, graine: 4 })]);
  expect(lireJournaux(base(), 'z9999999').journaux).toEqual([]);
});

test('un_examen_est_ecarte_et_les_autres_cours_ne_sont_pas_lus', () => {
  const autre = reponseInventee(Date.UTC(2026, 0, 2), 900, 'm0000001', true, 'z9999999');
  ecrireJournal(base(), [[...journalSimule({ unites: 1, passages: 3, graine: 5 }), autre]]);
  const ouverte = ouvrirBase(base());
  ouverte.sqlite
    .prepare(
      `insert into evenement (id, personne, cours, numero, unite, type, resultat, repondu_a, appareil, v, recu_a)
       values ('01929f3a-5b3c-7000-8000-0000000000aa', 'personne-inventee-1', ?, 99, 'exam0001', 'examen',
       '{"points":18,"questions":24,"note":4.5,"minutes":12,"chapitres":3}', '2026-02-01T09:00:00.000+00:00', 'x', 1, 'x')`,
    )
    .run(COURS_DE_TEST);
  ouverte.sqlite.pragma('journal_mode = DELETE');
  ouverte.sqlite.close();

  const { journaux } = lireJournaux(base(), COURS_DE_TEST);
  expect(journaux).toHaveLength(1);
  expect(journaux[0]).toHaveLength(3);
  expect(journaux[0]?.every((e) => e.type === 'reponse' && e.cours === COURS_DE_TEST)).toBe(true);
});

test('plusieurs_reponses_d_un_meme_jour_font_autant_de_revues', () => {
  const matin = Date.UTC(2026, 0, 5, 10);
  const journal = [0, 1, 2].map((n) => reponseInventee(matin + n * 60_000, n, 'm0000001', n !== 1));
  ecrireJournal(base(), [journal]);
  const { journaux } = lireJournaux(base(), COURS_DE_TEST);
  expect(journaux[0]?.map((e) => e.resultat)).toEqual([
    { juste: true },
    { juste: false },
    { juste: true },
  ]);
});

test('la_base_n_est_pas_modifiee_et_rien_ne_parait_a_cote', () => {
  ecrireJournal(base(), [journalSimule({ unites: 2, passages: 3, graine: 6 })]);
  const avant = fs.readFileSync(base());
  expect(fs.readdirSync(dossierDuTest())).toEqual(['copie.sqlite']);

  lireJournaux(base(), COURS_DE_TEST);

  expect(fs.readdirSync(dossierDuTest())).toEqual(['copie.sqlite']);
  expect(fs.readFileSync(base()).equals(avant)).toBe(true);
});

test.skipIf(process.platform === 'win32')(
  'une_copie_faite_par_vacuum_into_se_lit_dans_un_dossier_en_lecture_seule_sans_fichier_cree',
  () => {
    // La base vit en mode WAL, comme celle du serveur ; la copie, que `VACUUM INTO` écrit en un
    // seul fichier, se lit dans un dossier où rien ne peut être créé.
    const source = path.join(dossierDuTest(), 'source.sqlite');
    ecrireJournal(source, [journalSimule({ unites: 2, passages: 3, graine: 7 })]);
    const enService = ouvrirBase(source);
    const lecture = path.join(dossierDuTest(), 'lecture');
    fs.mkdirSync(lecture);
    const copie = path.join(lecture, 'copie.sqlite');
    enService.sqlite.prepare('vacuum into ?').run(copie);
    enService.sqlite.close();
    fs.chmodSync(lecture, 0o555);

    const { journaux } = lireJournaux(copie, COURS_DE_TEST);

    expect(journaux).toHaveLength(1);
    expect(fs.readdirSync(lecture)).toEqual(['copie.sqlite']);
    fs.chmodSync(lecture, 0o755);
  },
);

test('une_base_absente_leve_une_erreur_et_n_en_cree_pas', () => {
  expect(() => lireJournaux(path.join(dossierDuTest(), 'absente.sqlite'), COURS_DE_TEST)).toThrow();
  expect(fs.readdirSync(dossierDuTest())).toEqual([]);
});

test('le_journal_d_une_personne_se_lit_seul_par_son_identifiant_opaque', () => {
  const a = journalSimule({ unites: 3, passages: 4, graine: 11 });
  const b = journalSimule({ unites: 2, passages: 5, graine: 12 });
  const personnes = ecrireJournal(base(), [a, b]);
  const journal = lireJournalDe(base(), COURS_DE_TEST, personnes[1]?.id ?? '');
  expect(journal.map((e) => e.id)).toEqual(b.map((e) => e.id));
  const texte = JSON.stringify(journal);
  for (const personne of personnes) {
    expect(texte).not.toContain(personne.id);
    expect(texte).not.toContain(personne.nom);
  }
  expect(texte).not.toContain('4b3f0a52');
});

test('un_identifiant_inconnu_ou_un_autre_cours_donne_un_journal_vide', () => {
  const personnes = ecrireJournal(base(), [journalSimule({ unites: 2, passages: 3, graine: 13 })]);
  expect(lireJournalDe(base(), COURS_DE_TEST, 'personne-inconnue')).toEqual([]);
  expect(lireJournalDe(base(), 'z9999999', personnes[0]?.id ?? '')).toEqual([]);
});

test('une_copie_brute_d_une_base_en_wal_est_refusee_sans_rien_creer_a_cote', () => {
  ecrireJournal(base(), [journalSimule({ unites: 2, passages: 3, graine: 6 })]);
  passerEnWal(base());
  // L'en-tête dit le mode : octets 18 et 19 à 2. Rien de plus que le fichier ne doit rester à côté.
  const entete = fs.readFileSync(base()).subarray(18, 20);
  expect([...entete]).toEqual([2, 2]);
  const avant = fs.readdirSync(dossierDuTest()).sort();

  expect(() => lireJournaux(base(), COURS_DE_TEST)).toThrow(BaseEnWal);
  expect(() => lireJournalDe(base(), COURS_DE_TEST, 'personne-inventee-1')).toThrow(BaseEnWal);

  expect(fs.readdirSync(dossierDuTest()).sort()).toEqual(avant);
  expect(avant.some((nom) => nom.endsWith('-shm') || nom.endsWith('-wal'))).toBe(false);
});

test('une_copie_par_vacuum_into_d_une_base_en_wal_se_lit', () => {
  const source = path.join(dossierDuTest(), 'source.sqlite');
  const copie = path.join(dossierDuTest(), 'copie-vacuum.sqlite');
  ecrireJournal(source, [journalSimule({ unites: 2, passages: 3, graine: 7 })]);
  passerEnWal(source);
  copierParVacuum(source, copie);
  expect([...fs.readFileSync(copie).subarray(18, 20)]).toEqual([1, 1]);
  expect(lireJournaux(copie, COURS_DE_TEST).journaux).toHaveLength(1);
});
