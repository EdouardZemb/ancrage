import { expect, test } from 'vitest';
import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { modulesDesPosables } from '../../domaine/seances/semestre.js';
import { coursDExemple, idsDesPosables } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import { echapper, pourcent } from './graphiques.js';
import { mesures } from './mesures.js';
import { construireRapport } from './rapport.js';

/*
 * La section « Les éléments rebelles » du rapport (M6, T1-D9). Le cours d'exemple écrit un seuil de
 * 3 fautes. Les journaux sont écrits à la main : aucun hasard, donc aucune faute en trop.
 */

const cours = coursDExemple();
const AUJOURDHUI = '2026-03-02';
const GERAETE = 'n0sq3hfm';
const ZUTATEN = '7dty0tg7';
const ZUBEREITUNG = 'cntctqb2';

const modules = modulesDesPosables(cours);
const idsDuModule = (module: string): string[] =>
  idsDesPosables(cours).filter((id) => modules.get(id) === module);

let rang = 0;
const reponse = (jour: number, unite: string, juste: boolean, personne: number): Evenement => {
  rang += 1;
  return reponseInventee(
    Date.UTC(2026, 1, jour, 9, 0, 0),
    personne * 1_000_000 + rang,
    unite,
    juste,
    cours.cours.id,
  );
};

/** Chaque unité du module : un succès le 10 février, puis une faute les 11, 12 et 13 : rebelle à 3. */
function rebellesDuModule(module: string, personne: number): Evenement[] {
  return idsDuModule(module).flatMap((id) => [
    reponse(10, id, true, personne),
    reponse(11, id, false, personne),
    reponse(12, id, false, personne),
    reponse(13, id, false, personne),
  ]);
}

/** Vingt-cinq réponses justes d'une unité : de quoi être actif, sans rien de rebelle. */
const rienDeRebelle = (personne: number): Evenement[] =>
  Array.from({ length: 25 }, (_, k) =>
    reponse(14 + (k % 10), idsDuModule(ZUBEREITUNG)[0] ?? '', true, personne),
  );

const ensemble = (journaux: readonly (readonly Evenement[])[], leCours: CoursPrepare = cours) =>
  construireRapport({ cours: leCours, journaux, aujourdhui: AUJOURDHUI });
const rapportDePersonne = (journal: readonly Evenement[], leCours: CoursPrepare = cours) =>
  construireRapport({
    cours: leCours,
    journaux: [journal],
    aujourdhui: AUJOURDHUI,
    accord: '25/02/2026',
  });

const avecSeuil = (fautes: number): CoursPrepare => ({
  ...cours,
  cours: { ...cours.cours, rebelles: { fautes } },
});
const avecTitre = (module: string, titre: string): CoursPrepare => ({
  ...cours,
  cours: {
    ...cours.cours,
    modules: cours.cours.modules.map((m) => (m.id === module ? { ...m, titre } : m)),
  },
});

/** Les cellules de la ligne d'un tableau de la page, d'après sa première cellule (déjà échappée). */
function ligne(html: string, premiere: string): string[] {
  const motif = premiere.replace(/[()]/g, '\\$&');
  const trouvee = new RegExp(`<tr><th scope="row">${motif}</th>((?:<td>[^<]*</td>)*)</tr>`).exec(
    html,
  );
  expect(trouvee, premiere).not.toBeNull();
  return [...(trouvee?.[1] ?? '').matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
}

/** La section « Les éléments rebelles par chapitre » d'un rapport d'ensemble, et rien d'autre. */
function sectionDEnsemble(html: string): string {
  const trouvee = /<section><h2>Les éléments rebelles par chapitre<\/h2>[\s\S]*?<\/section>/.exec(
    html,
  );
  expect(trouvee).not.toBeNull();
  return trouvee?.[0] ?? '';
}
const enTetes = (html: string, sorte: 'row' | 'col'): string[] =>
  [...html.matchAll(new RegExp(`<th scope="${sorte}">([^<]*)</th>`, 'g'))].map((m) => m[1] ?? '');

test('une_personne_a_ses_rebelles_par_chapitre_en_nombres_et_une_ligne_sans_rebelle', () => {
  const journal = rebellesDuModule(GERAETE, 1);
  const html = rapportDePersonne(journal);
  expect(html).toContain('Les éléments rebelles');
  const m = mesures(journal, cours, AUJOURDHUI);
  const elementsGeraete = (m.fautesParModule[GERAETE] ?? []).reduce((s, n) => s + n, 0);
  const elementsZutaten = (m.fautesParModule[ZUTATEN] ?? []).reduce((s, n) => s + n, 0);
  expect(ligne(html, 'Küchengeräte')).toEqual([String(elementsGeraete), String(elementsGeraete)]);
  // Un chapitre sans rebelle garde sa ligne.
  expect(ligne(html, 'Zutaten')).toEqual([String(elementsZutaten), '0']);
  expect(html).toMatch(/<th scope="col">Rebelles<\/th>/);
});

test('un_module_sans_element_posable_n_a_pas_de_ligne', () => {
  const html = rapportDePersonne(rebellesDuModule(GERAETE, 1));
  const m = mesures([], cours, AUJOURDHUI);
  const sansPosable = cours.cours.modules.filter((module) => !(module.id in m.fautesParModule));
  expect(sansPosable.length).toBeGreaterThan(0);
  for (const module of sansPosable) {
    expect(html).not.toContain(`<th scope="row">${echapper(module.titre)}</th>`);
  }
});

test('le_tableau_selon_le_seuil_marque_le_seuil_du_cours', () => {
  // Trois fautes de trois jours sur une seule unité : rebelle à 2 et à 3, plus à 4.
  const un = idsDuModule(GERAETE)[0] ?? '';
  const trois = [10, 11, 12, 13].map((jour) => reponse(jour, un, jour === 10, 1));
  const html = rapportDePersonne(trois);
  expect(ligne(html, '2 fautes')).toEqual(['1']);
  expect(ligne(html, '3 fautes (seuil du cours)')).toEqual(['1']);
  expect(ligne(html, '4 fautes')).toEqual(['0']);
  expect(ligne(html, '8 fautes')).toEqual(['0']);
  expect(html).not.toContain('9 fautes');
  expect(html).not.toContain('2 fautes (seuil du cours)');
});

test('un_seuil_au_dela_de_huit_a_sa_ligne_marquee', () => {
  const html = rapportDePersonne(rebellesDuModule(GERAETE, 1), avecSeuil(12));
  expect(ligne(html, '12 fautes (seuil du cours)')).toEqual(['0']);
  expect(ligne(html, '8 fautes')).toEqual(['0']);
  expect(html).not.toContain('9 fautes');
  expect(html.match(/\(seuil du cours\)/g)).toHaveLength(1);
});

test('le_seuil_par_defaut_est_cinq_sans_la_cle', () => {
  const { rebelles: _ignore, ...sansCle } = cours.cours;
  const html = rapportDePersonne(rebellesDuModule(GERAETE, 1), { ...cours, cours: sansCle });
  expect(ligne(html, '5 fautes (seuil du cours)')).toHaveLength(1);
  expect(html).not.toContain('4 fautes (seuil du cours)');
  // Le texte de la définition dit le même défaut : il lit la constante, pas un 4 écrit en dur.
  expect(html).toContain('5 par défaut');
});

test('un_titre_de_module_est_echappe', () => {
  const html = rapportDePersonne(
    rebellesDuModule(GERAETE, 1),
    avecTitre(GERAETE, 'Geräte <b> & Co'),
  );
  expect(html).toContain('<th scope="row">Geräte &lt;b&gt; &amp; Co</th>');
  expect(html).not.toContain('Geräte <b>');
});

test('un_rapport_d_ensemble_donne_un_pourcentage_entier_par_chapitre_admis', () => {
  const html = ensemble([1, 2, 3].map((p) => rebellesDuModule(GERAETE, p)));
  expect(html).toContain('Les éléments rebelles');
  // Tous les éléments du chapitre sont rebelles, pour chacune des trois personnes.
  expect(ligne(html, 'Küchengeräte')).toEqual([pourcent(1)]);
  // Un chapitre sans rebelle n'a pas de ligne.
  expect(html).not.toContain('<th scope="row">Zutaten</th>');
});

test('un_rapport_d_ensemble_n_a_ni_tableau_selon_le_seuil_ni_total', () => {
  const html = ensemble([1, 2, 3].map((p) => rebellesDuModule(GERAETE, p)));
  expect(html).not.toMatch(/selon le seuil/i);
  expect(html).not.toContain('(seuil du cours)');
  expect(html).not.toMatch(/<th scope="col">(Éléments|Rebelles)<\/th>/);
  expect(html).not.toMatch(/<th scope="row">\d+ fautes/);
  // Le tableau d'ensemble : un chapitre par ligne, une seule colonne de valeurs, un pourcentage.
  const section = sectionDEnsemble(html);
  expect(enTetes(section, 'row')).toEqual(['Küchengeräte']);
  expect(enTetes(section, 'col')).toEqual(['Chapitre', 'Part d’éléments rebelles']);
  expect(section.match(/<td>/g)).toHaveLength(1);
});

test('un_titre_de_module_d_un_rapport_d_ensemble_est_echappe', () => {
  const html = ensemble(
    [1, 2, 3].map((p) => rebellesDuModule(GERAETE, p)),
    avecTitre(GERAETE, 'Geräte <b> & Co'),
  );
  expect(enTetes(sectionDEnsemble(html), 'row')).toEqual(['Geräte &lt;b&gt; &amp; Co']);
  expect(html).not.toContain('Geräte <b>');
});

test('un_chapitre_ou_deux_personnes_seulement_ont_un_rebelle_n_est_pas_affiche', () => {
  // Quatre personnes actives, mais deux seulement ont des rebelles : même en « autres chapitres ».
  const html = ensemble([
    [...rebellesDuModule(GERAETE, 1), ...rienDeRebelle(1)],
    [...rebellesDuModule(GERAETE, 2), ...rienDeRebelle(2)],
    rienDeRebelle(3),
    rienDeRebelle(4),
  ]);
  expect(html).not.toContain('Küchengeräte');
  expect(html).not.toContain('Autres chapitres');
  const section = sectionDEnsemble(html);
  expect(section).toContain('sont omis');
  expect(section).not.toMatch(/aucun/i);
  expect(section).not.toContain('<table');
});

test('les_chapitres_refuses_se_fondent_dans_autres_chapitres', () => {
  const html = ensemble([
    [...rebellesDuModule(GERAETE, 1), ...rebellesDuModule(ZUTATEN, 1)],
    [
      ...rebellesDuModule(GERAETE, 2),
      ...rebellesDuModule(ZUTATEN, 2),
      ...rebellesDuModule(ZUBEREITUNG, 2),
    ],
    [...rebellesDuModule(GERAETE, 3), ...rebellesDuModule(ZUBEREITUNG, 3)],
  ]);
  expect(ligne(html, 'Küchengeräte')).toEqual([pourcent(1)]);
  // Zutaten : deux personnes ; Zubereitung : deux personnes ; réunis : trois personnes.
  expect(html).not.toContain('<th scope="row">Zutaten</th>');
  expect(html).not.toContain('<th scope="row">Zubereitung</th>');
  expect(ligne(html, 'Autres chapitres')).toHaveLength(1);
  // À la main : Zutaten (deux personnes) et Zubereitung (deux personnes) ont n2 et n3 éléments. Les
  // rebelles réunis sont 2 × (n2 + n3), sur 3 personnes × (n2 + n3) éléments : deux tiers.
  expect(ligne(html, 'Autres chapitres')).toEqual([pourcent(2 / 3)]);
});

test('sous_trois_personnes_actives_le_rapport_limite_ne_dit_rien_des_rebelles', () => {
  const html = ensemble([
    rebellesDuModule(GERAETE, 1),
    rebellesDuModule(GERAETE, 2),
    rebellesDuModule(GERAETE, 3).slice(0, 5),
  ]);
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toMatch(/rebelle/i);
});
