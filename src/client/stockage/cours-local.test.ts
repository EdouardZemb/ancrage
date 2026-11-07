import { afterEach, describe, expect, it } from 'vitest';
import { coursServiDeTest } from '../../domaine/cours/cours.fixture.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './base-locale.fixture.js';
import {
  coursLocal,
  enregistrerCours,
  enregistrerListe,
  listeLocale,
  oublierCours,
} from './cours-local.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  reponseDeTest,
} from './evenements.fixture.js';
import {
  ajouterEvenement,
  confirmerLEnvoi,
  curseurDuCours,
  evenementsDuCours,
  fileDuCours,
  noteDesEnvois,
  recevoirEvenements,
} from './journal-local.js';

afterEach(fermerLesBasesDeTest);

const LISTE = [
  { id: COURS_DE_TEST, titre: 'Übungskurs', langue: 'de' },
  { id: AUTRE_COURS_DE_TEST, titre: 'Zweiter Kurs', langue: 'de' },
];

describe('cours local', () => {
  it('un_cours_enregistre_est_relu_tel_quel', async () => {
    const base = await ouvrirBaseDeTest();
    const cours = coursServiDeTest();

    expect(await coursLocal(base, ALICE, cours.id)).toBeUndefined();
    await enregistrerCours(base, ALICE, cours);

    expect(await coursLocal(base, ALICE, cours.id)).toEqual(cours);
  });

  it('enregistrer_un_cours_remplace_le_precedent', async () => {
    const base = await ouvrirBaseDeTest();
    const cours = coursServiDeTest();
    await enregistrerCours(base, ALICE, cours);

    await enregistrerCours(base, ALICE, { ...cours, titre: 'Neuer Titel' });

    expect(await coursLocal(base, ALICE, cours.id)).toEqual({ ...cours, titre: 'Neuer Titel' });
  });

  it('la_liste_enregistree_est_relue_telle_quelle', async () => {
    const base = await ouvrirBaseDeTest();

    expect(await listeLocale(base, ALICE)).toBeUndefined();
    await enregistrerListe(base, ALICE, LISTE);

    expect(await listeLocale(base, ALICE)).toEqual(LISTE);
    // Une liste vide est une liste : la personne n'a plus aucun cours.
    await enregistrerListe(base, ALICE, []);
    expect(await listeLocale(base, ALICE)).toEqual([]);
  });

  it('oublier_un_cours_efface_contenu_evenements_et_curseur_mais_garde_la_file', async () => {
    const base = await ouvrirBaseDeTest();
    const cours = coursServiDeTest();
    const envoye = reponseDeTest(cours.id, 1);
    const enAttente = reponseDeTest(cours.id, 2);
    const note = reponseDeTest(cours.id, 3);
    await enregistrerCours(base, ALICE, cours);
    await recevoirEvenements(base, ALICE, cours.id, [envoye], 1);
    await ajouterEvenement(base, ALICE, enAttente);
    // Un envoi accepté, pas encore relu : il est dans la note des envois (2b-D4).
    await ajouterEvenement(base, ALICE, note);
    await confirmerLEnvoi(base, ALICE, [note.id]);
    expect(await noteDesEnvois(base, ALICE, cours.id)).toEqual([note.id]);

    await oublierCours(base, ALICE, cours.id);

    expect(await coursLocal(base, ALICE, cours.id)).toBeUndefined();
    expect(await evenementsDuCours(base, ALICE, cours.id)).toEqual([]);
    expect(await curseurDuCours(base, ALICE, cours.id)).toBe(0);
    expect(await noteDesEnvois(base, ALICE, cours.id)).toEqual([]);
    expect(await fileDuCours(base, ALICE, cours.id)).toEqual([enAttente]);
  });

  it('oublier_un_cours_ne_touche_ni_aux_autres_cours_ni_aux_autres_personnes', async () => {
    const base = await ouvrirBaseDeTest();
    const cours = coursServiDeTest();
    const autre = { ...cours, id: AUTRE_COURS_DE_TEST };
    for (const personne of [ALICE, BERTHE]) {
      await enregistrerCours(base, personne, cours);
      await enregistrerCours(base, personne, autre);
      await recevoirEvenements(base, personne, cours.id, [reponseDeTest(cours.id, 1)], 1);
      await recevoirEvenements(base, personne, autre.id, [reponseDeTest(autre.id, 2)], 1);
    }

    await oublierCours(base, ALICE, cours.id);

    expect(await coursLocal(base, ALICE, autre.id)).toEqual(autre);
    expect(await evenementsDuCours(base, ALICE, autre.id)).toHaveLength(1);
    expect(await curseurDuCours(base, ALICE, autre.id)).toBe(1);
    expect(await coursLocal(base, BERTHE, cours.id)).toEqual(cours);
    expect(await evenementsDuCours(base, BERTHE, cours.id)).toHaveLength(1);
    expect(await curseurDuCours(base, BERTHE, cours.id)).toBe(1);
  });

  it('oublier_un_cours_le_retire_de_la_liste_locale_de_cette_personne_seulement', async () => {
    const base = await ouvrirBaseDeTest();
    await enregistrerListe(base, ALICE, LISTE);
    await enregistrerListe(base, BERTHE, LISTE);

    await oublierCours(base, ALICE, COURS_DE_TEST);

    expect(await listeLocale(base, ALICE)).toEqual([LISTE[1]]);
    expect(await listeLocale(base, BERTHE)).toEqual(LISTE);
  });

  it('oublier_un_cours_sans_liste_locale_n_en_cree_pas', async () => {
    const base = await ouvrirBaseDeTest();

    await oublierCours(base, ALICE, COURS_DE_TEST);

    expect(await listeLocale(base, ALICE)).toBeUndefined();
  });
});
