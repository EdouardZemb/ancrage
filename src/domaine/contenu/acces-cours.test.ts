import { describe, expect, it } from 'vitest';
import { coursAVerifier, versCoursAcces } from './acces-cours.js';
import { analyserContenus } from './analyse.js';
import { exempleDeCours, modifier } from './exemple.fixture.js';
import type { Cours } from './modele.js';

const COURS = 'essai/cours.yaml';
const CARTES_1 = 'essai/cartes/01-grundbegriffe.yaml';
const CARTES_2 = 'essai/cartes/02-vorsilben.yaml';
const MORPHOLOGIE = 'essai/morphologie.yaml';
const SCHEMA = 'essai/schemas/muster.yaml';
const TEXTES = 'essai/textes.yaml';
const EXERCICES = 'essai/exercices.yaml';

/** Remplace chaque ligne `statut: "à vérifier"` de l'exemple, en gardant son indentation. */
function remplacerAVerifier(ecrire: (indentation: string) => string): Map<string, string> {
  const fichiers = exempleDeCours();
  for (const [chemin, texte] of fichiers) {
    fichiers.set(
      chemin,
      texte.replace(/^( *)statut: "à vérifier"$/gm, (_ligne, indentation: string) =>
        ecrire(indentation),
      ),
    );
  }
  return fichiers;
}

/** L'exemple dont plus aucun élément n'est « à vérifier » : tout est `source` ou `vérifié`. */
function toutSource(): Map<string, string> {
  return remplacerAVerifier((indentation) => `${indentation}statut: "source"`);
}

function avecDerogation(fichiers: Map<string, string>): Map<string, string> {
  return modifier(
    fichiers,
    COURS,
    'modules:\n',
    'derogation_diffusion:\n  motif: "Relecture en cours, diffusion limitée acceptée par écrit"\n  date: "2026-10-16"\nmodules:\n',
  );
}

function coursDe(fichiers: Map<string, string>): Cours {
  const { cours, erreurs } = analyserContenus(fichiers);
  expect(erreurs).toEqual([]);
  return cours[0];
}

/** `ligne` suivie d'un `statut: "à vérifier"`, pour un élément qui n'en avait pas. */
function avecStatutAVerifier(ligne: string): string {
  return `${ligne}\n    statut: "à vérifier"`;
}

/** `texte`, dont le `statut: "source"` devient « à vérifier ». */
function enAVerifier(texte: string): string {
  return texte.replace('statut: "source"', 'statut: "à vérifier"');
}

describe('coursAVerifier', () => {
  it('cours_d_exemple_a_verifier', () => {
    expect(coursAVerifier(coursDe(exempleDeCours()))).toBe(true);
  });

  it('cours_entierement_source_n_est_pas_a_verifier', () => {
    expect(coursAVerifier(coursDe(toutSource()))).toBe(false);
  });

  // Les réglages d'un cours ne sont pas un contenu à relire : le module `examen` n'a pas de statut.
  it('examen_ne_rend_pas_le_cours_a_verifier', () => {
    const cours = coursDe(toutSource());

    expect(cours.modules.map((module) => module.type)).toContain('examen');
    expect(coursAVerifier(cours)).toBe(false);
    expect(versCoursAcces(cours).aVerifier).toBe(false);
  });

  it('verifie_n_est_pas_a_verifier', () => {
    const verifie = remplacerAVerifier(
      (indentation) => `${indentation}statut: "vérifié"\n${indentation}verifie_le: "2026-10-01"`,
    );

    expect(coursAVerifier(coursDe(verifie))).toBe(false);
  });

  // Un seul élément « à vérifier », de chaque sorte, dans un cours qui n'a que des éléments
  // `source` ou `vérifié` : chaque type de module est regardé, jusqu'à ses éléments. Les points
  // d'un schéma, les jetons et les questions d'un texte n'ont pas de statut : ils prennent celui de
  // leur parent.
  const CARTE = '    verso: "Erfundenes Organ für Übungszwecke"';
  const MORPHEME = '    sens: "Vorlage"';
  const MOT = '    sens: "Entzündung der Vorlage"\n    statut: "source"';
  const COURS_VORSILBEN = 'titre: "Vorsilben"\nstatut: "source"';
  const SCHEMA_MUSTER = 'titre: "Das Musterorgan"\nstatut: "source"';
  const TEXTES_BERICHTE = 'titre: "Übungsberichte"\nstatut: "source"';
  const EXERCICE = '        reponse: "Probelae"\n        statut: "source"';
  it.each([
    ['carte_propre', CARTES_1, CARTE, avecStatutAVerifier(CARTE)],
    ['carte_heritee_du_module', CARTES_2, COURS_VORSILBEN, enAVerifier(COURS_VORSILBEN)],
    ['morpheme', MORPHOLOGIE, MORPHEME, avecStatutAVerifier(MORPHEME)],
    ['mot', MORPHOLOGIE, MOT, enAVerifier(MOT)],
    ['schema_et_ses_points', SCHEMA, SCHEMA_MUSTER, enAVerifier(SCHEMA_MUSTER)],
    ['texte_et_ses_questions', TEXTES, TEXTES_BERICHTE, enAVerifier(TEXTES_BERICHTE)],
    ['exercice', EXERCICES, EXERCICE, enAVerifier(EXERCICE)],
  ])('un_element_a_verifier_suffit_%s', (_nom, fichier, avant, apres) => {
    expect(coursAVerifier(coursDe(toutSource()))).toBe(false);
    expect(coursAVerifier(coursDe(modifier(toutSource(), fichier, avant, apres)))).toBe(true);
  });
});

describe('versCoursAcces', () => {
  it('versCoursAcces_reporte_la_derogation', () => {
    expect(versCoursAcces(coursDe(exempleDeCours()))).toStrictEqual({
      id: 'j5by5stz',
      aVerifier: true,
      derogation: false,
    });
    expect(versCoursAcces(coursDe(avecDerogation(exempleDeCours())))).toStrictEqual({
      id: 'j5by5stz',
      aVerifier: true,
      derogation: true,
    });
    expect(versCoursAcces(coursDe(toutSource()))).toStrictEqual({
      id: 'j5by5stz',
      aVerifier: false,
      derogation: false,
    });
    expect(versCoursAcces(coursDe(avecDerogation(toutSource())))).toStrictEqual({
      id: 'j5by5stz',
      aVerifier: false,
      derogation: true,
    });
  });
});
