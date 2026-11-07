import { expect, it } from 'vitest';
import type { Morpheme, Mot } from '../contenu/modele.js';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { poidsObserves } from '../hasard.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { EtatUnite } from '../progression/etat.js';
import { choisirMot, motBienForme, optionsDeSens, tuilesDuMot } from './mots.js';

/* Données factices, écrites à la main (invariant 7). */

const morphologie = preparerCours(coursServiDeTest()).morphologie;
if (morphologie === undefined) throw new Error('la fixture a un module de morphologie');
const { morphemes, mots } = morphologie;

const morpheme = (id: string): Morpheme => {
  const trouve = morphemes.find((m) => m.id === id);
  if (trouve === undefined) throw new Error(`morphème ${id} inconnu`);
  return trouve;
};
const mot = (id: string): Mot => {
  const trouve = mots.find((m) => m.id === id);
  if (trouve === undefined) throw new Error(`mot ${id} inconnu`);
  return trouve;
};
const categorie = (id: string): string => morpheme(id).categorie;
const etat = (justes: number, fausses: number): EtatUnite => ({
  boite: 1,
  echeance: '2026-10-17',
  justes,
  fausses,
});

it('choisir_mot_pondere_par_les_reponses_justes', () => {
  const etats = new Map<string, EtatUnite>([
    // Plus de justes que de fausses : poids 1.
    ['w0000001', etat(2, 1)],
    // Autant de justes que de fausses : poids 3. Un mot neuf aussi.
    ['w0000002', etat(1, 1)],
  ]);

  // La liste pondérée est w1 w2 w2 w2 w3 w3 w3 : sept cases.
  const poids = poidsObserves(
    7,
    (hasard) => choisirMot(mots, etats, hasard),
    (m) => m.id,
  );

  expect(Object.fromEntries(poids)).toEqual({ w0000001: 1, w0000002: 3, w0000003: 3 });
});

it('choisir_mot_sans_mot_leve_une_erreur_claire', () => {
  expect(() => choisirMot([], new Map(), hasardDeterministe(1))).toThrow(RangeError);
});

it('options_de_sens_quatre_options_de_la_meme_categorie', () => {
  for (const id of ['p0000001', 's0000002', 'x0000001']) {
    const cible = morpheme(id);
    for (let graine = 1; graine <= 20; graine++) {
      const options = optionsDeSens(cible, morphemes, hasardDeterministe(graine));

      expect(options, id).toHaveLength(4);
      expect(options.filter((o) => o === cible.sens)).toHaveLength(1);
      expect(new Set(options).size).toBe(4);
      // Tous les sens viennent de morphèmes de la même catégorie.
      for (const sens of options) {
        expect(
          morphemes.some((m) => m.categorie === cible.categorie && m.sens === sens),
          sens,
        ).toBe(true);
      }
    }
  }
});

it('options_de_sens_ne_repete_pas_un_sens_et_ecarte_celui_de_la_reponse', () => {
  const faits = (
    id: string,
    sens: string,
    categorieDuMorpheme: 'p' | 's' | 'x' = 'p',
  ): Morpheme => ({
    id,
    categorie: categorieDuMorpheme,
    forme: id,
    sens,
    statut: 'source',
  });
  const cible = faits('aaaaaaa1', 'schnell');
  const tous = [
    cible,
    // Même sens que la réponse : jamais proposé comme distracteur.
    faits('aaaaaaa2', 'schnell'),
    // Deux morphèmes pour un même sens : un seul distracteur.
    faits('aaaaaaa3', 'langsam'),
    faits('aaaaaaa4', 'langsam'),
    faits('aaaaaaa5', 'innen'),
    faits('aaaaaaa6', 'halb'),
    // Une autre catégorie : jamais proposée.
    faits('bbbbbbb1', 'viel', 's'),
  ];

  for (let graine = 1; graine <= 30; graine++) {
    const options = optionsDeSens(cible, tous, hasardDeterministe(graine));

    expect(options).toHaveLength(4);
    expect(options.filter((o) => o === 'schnell')).toHaveLength(1);
    expect(options.filter((o) => o === 'langsam').length).toBeLessThanOrEqual(1);
    expect(options).not.toContain('viel');
  }
});

it('options_de_sens_avec_peu_de_morphemes_rend_moins_de_quatre_options', () => {
  const peu = morphemes.filter((m) => ['p0000001', 'p0000002', 's0000001'].includes(m.id));

  const options = optionsDeSens(morpheme('p0000001'), peu, hasardDeterministe(1));

  expect([...options].sort()).toEqual(['langsam', 'schnell']);
});

it('tuiles_du_mot_plus_deux_par_categorie', () => {
  // « Tachykardie » = préfixe + radical + suffixe : chaque catégorie reçoit deux tuiles de plus.
  const tachykardie = mot('w0000002');
  const siens = tachykardie.segments.map((s) => s.morpheme);

  for (let graine = 1; graine <= 30; graine++) {
    const tuiles = tuilesDuMot(tachykardie, morphemes, hasardDeterministe(graine));

    expect(new Set(tuiles).size).toBe(tuiles.length);
    for (const id of siens) expect(tuiles).toContain(id);
    expect(tuiles).toHaveLength(3 + 2 * 3);
    for (const c of ['p', 's', 'x']) {
      expect(tuiles.filter((id) => categorie(id) === c)).toHaveLength(1 + 2);
    }
    // Les tuiles en plus ne sont pas celles du mot, et existent toutes.
    expect(tuiles.every((id) => morphemes.some((m) => m.id === id))).toBe(true);
  }
});

it('tuiles_du_mot_sans_prefixe_ajoutent_deux_prefixes', () => {
  // « Gastritis » = radical + suffixe : aucun préfixe, mais deux tuiles de préfixe quand même.
  const gastritis = mot('w0000001');

  const tuiles = tuilesDuMot(gastritis, morphemes, hasardDeterministe(5));

  expect(tuiles.filter((id) => categorie(id) === 'p')).toHaveLength(2);
  expect(tuiles.filter((id) => categorie(id) === 's')).toHaveLength(1 + 2);
  expect(tuiles.filter((id) => categorie(id) === 'x')).toHaveLength(1 + 2);
});

it('tuiles_du_mot_melangent_et_ne_modifient_ni_le_mot_ni_les_morphemes', () => {
  const tachykardie = mot('w0000002');
  const segmentsAvant = JSON.stringify(tachykardie);
  const morphemesAvant = JSON.stringify(morphemes);

  const a = tuilesDuMot(tachykardie, morphemes, hasardDeterministe(1));
  const b = tuilesDuMot(tachykardie, morphemes, hasardDeterministe(2));

  expect(a).not.toEqual(b);
  expect([...a].sort()).not.toEqual(a);
  expect(JSON.stringify(tachykardie)).toBe(segmentsAvant);
  expect(JSON.stringify(morphemes)).toBe(morphemesAvant);
});

it('tuiles_du_mot_avec_peu_de_morphemes_en_ajoutent_moins', () => {
  const peu = morphemes.filter((m) =>
    ['p0000001', 's0000002', 'x0000004', 'p0000002', 's0000001'].includes(m.id),
  );

  const tuiles = tuilesDuMot(mot('w0000002'), peu, hasardDeterministe(1));

  // Un seul préfixe de plus, un seul radical de plus, aucun suffixe de plus.
  expect(tuiles.sort()).toEqual(['p0000001', 'p0000002', 's0000001', 's0000002', 'x0000004']);
});

it('mot_bien_forme_dans_l_ordre_seulement', () => {
  const tachykardie = mot('w0000002');

  expect(motBienForme(tachykardie, ['p0000001', 's0000002', 'x0000004'])).toBe(true);
  // Les bonnes tuiles dans le mauvais ordre : mal formé.
  expect(motBienForme(tachykardie, ['s0000002', 'p0000001', 'x0000004'])).toBe(false);
  expect(motBienForme(tachykardie, ['x0000004', 's0000002', 'p0000001'])).toBe(false);
  // Incomplet, ou trop long : mal formé.
  expect(motBienForme(tachykardie, ['p0000001', 's0000002'])).toBe(false);
  expect(motBienForme(tachykardie, ['p0000001', 's0000002', 'x0000004', 'x0000001'])).toBe(false);
  expect(motBienForme(tachykardie, [])).toBe(false);
  // Une autre tuile à la place d'une bonne.
  expect(motBienForme(tachykardie, ['p0000001', 's0000002', 'x0000001'])).toBe(false);
});

it('mot_bien_forme_ne_confond_pas_les_identifiants_voisins', () => {
  const gastritis = mot('w0000001');

  expect(motBienForme(gastritis, ['s0000001', 'x0000001'])).toBe(true);
  // Le prototype comparait des chaînes jointes par « | » : deux identifiants collés ne passent pas.
  expect(motBienForme(gastritis, ['s0000001|x0000001'])).toBe(false);
});
