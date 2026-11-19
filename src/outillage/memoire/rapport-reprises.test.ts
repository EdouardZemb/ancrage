import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { type Cellule, CLES_DE_MODE } from './cellules.js';
import { coursDExemple } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import { caseAdmise, mesures } from './mesures.js';
import {
  construireRapport,
  couvrirLesModes,
  type DonneesDeCle,
  type LigneDeReprise,
  type TableDeReprises,
  tablesDesReprises,
} from './rapport.js';
import { type ElementDeMotif, journauxAuxReprises, journeeDeMotifs } from './reprises.fixture.js';
import {
  CLES_APRES_UNE_FAUTE,
  CLES_D_ESPACEMENT,
  CLES_DE_RANG,
  CLES_DE_REPARTITION,
  CLES_DE_VERDICT,
  type CleDeVerdict,
} from './reprises.js';

const cours = coursDExemple();
const ID_DU_COURS = cours.cours.id;
const AUJOURDHUI = '2026-01-10';
const JOUR_1 = Date.UTC(2026, 0, 5, 8);
const JOUR_2 = Date.UTC(2026, 0, 6, 8);
const NOM_DE_LA_SECTION = 'Les reprises du jour';

const ensemble = (journaux: readonly (readonly Evenement[])[]): string =>
  construireRapport({ cours, journaux, aujourdhui: AUJOURDHUI });
const dUnePersonne = (journal: readonly Evenement[]): string =>
  construireRapport({ cours, journaux: [journal], aujourdhui: AUJOURDHUI, accord: '25/01/2026' });

/** `n` éléments qui répondent selon `motif`, d'unités `<prefixe><i>`. */
function couples(motif: string, n: number, prefixe: string, mode?: ElementDeMotif['mode']) {
  return Array.from(
    { length: n },
    (_, i): ElementDeMotif => ({ unite: `${prefixe}${i}`, motif, mode }),
  );
}

/** Le jour 1 d'une personne : ses éléments l'un après l'autre. */
function premierJour(elements: readonly ElementDeMotif[], rangDepart = 1): Evenement[] {
  return journeeDeMotifs({ debut: JOUR_1, rangDepart, elements, cours: ID_DU_COURS });
}

/** Le jour 2 d'une personne : une réponse juste à chacune des `unites`. */
function lendemain(unites: readonly string[], rangDepart: number): Evenement[] {
  return journeeDeMotifs({
    debut: JOUR_2,
    rangDepart,
    prefixe: 'l',
    cours: ID_DU_COURS,
    elements: unites.map((unite) => ({ unite, motif: 'J' })),
  });
}

const mesuresDe = (journaux: readonly (readonly Evenement[])[]) =>
  journaux.map((journal) => mesures(journal, cours, AUJOURDHUI));

/** La section de la page, ou `''`. */
function section(html: string): string {
  const debut = html.indexOf(`<section><h2>${NOM_DE_LA_SECTION}</h2>`);
  if (debut < 0) return '';
  return html.slice(debut, html.indexOf('</section>', debut));
}

/** Les `<th scope="row">` exacts d'un sous-titre de la section. */
function lignesDuTableau(html: string, titre: string): string[] {
  const morceau =
    section(html)
      .split('<h3>')
      .find((m) => m.startsWith(`${titre}</h3>`)) ?? '';
  return [...morceau.matchAll(/<th scope="row">(.*?)<\/th>/g)].map((m) => m[1] ?? '');
}

const TITRES = {
  rangs: 'Selon le rang de la reprise',
  espacements: 'Selon les autres réponses entre les deux',
  modes: 'Selon le mode de la reprise',
  repartition: 'Combien de reprises par élément et par jour',
  apres: 'Après un jour de faute : la première réponse d’un autre jour',
} as const;

const noms = (lignes: readonly LigneDeReprise[]): string[] => lignes.map((l) => l.nom);

const nomsDeTable = (table: TableDeReprises | null): string[] =>
  table === null
    ? []
    : table.forme === 'reunies'
      ? noms(table.lignes)
      : [...noms(table.faute), ...noms(table.juste)];

const sommeDe = (liste: readonly number[]): number => liste.reduce((s, n) => s + n, 0);

type Genre = 'rangs' | 'espacements' | 'modes' | 'repartition';
const CLES_DU_GENRE: Record<Genre, readonly string[]> = {
  rangs: CLES_DE_RANG,
  espacements: CLES_D_ESPACEMENT,
  modes: CLES_DE_MODE,
  repartition: CLES_DE_REPARTITION,
};

/** Le compte de chaque personne dans `cles` du genre, pour les moitiés données, sans lire la ligne. */
function recompter(
  parPersonne: ReturnType<typeof mesuresDe>,
  genre: Genre,
  cles: readonly string[],
  moities: readonly CleDeVerdict[],
): number[] {
  return parPersonne.map((m) =>
    sommeDe(
      moities.flatMap((verdict) =>
        cles.map((cle) => {
          const r = m.reprises;
          if (genre === 'repartition') {
            return (r.repartition[verdict] as Record<string, number>)[cle] ?? 0;
          }
          return (r[genre][verdict] as Record<string, Cellule>)[cle]?.reponses ?? 0;
        }),
      ),
    ),
  );
}

/**
 * La structure d'un rapport d'ensemble (M7-D6, M7-D14), sans croire les comptes de `tablesDesReprises` :
 * chaque ligne passe la règle recalculée depuis les mesures, les plages se suivent sans trou, les
 * lignes de la page sont celles des tables, et la forme est commune au rang, à l'espacement et au mode.
 */
function verifierLaStructure(journaux: readonly (readonly Evenement[])[]): void {
  const parPersonne = mesuresDe(journaux);
  const tables = tablesDesReprises(parPersonne, false);
  const html = ensemble(journaux);
  for (const genre of ['rangs', 'espacements', 'modes', 'repartition'] as const) {
    const table = tables[genre];
    if (table === null) continue;
    const moities: [readonly LigneDeReprise[], readonly CleDeVerdict[]][] =
      table.forme === 'reunies'
        ? [[table.lignes, CLES_DE_VERDICT]]
        : [
            [table.faute, ['faute']],
            [table.juste, ['juste']],
          ];
    for (const [lignes, verdicts] of moities) {
      expect(lignes.length).toBeGreaterThan(0);
      for (const ligne of lignes) {
        expect(
          caseAdmise(recompter(parPersonne, genre, ligne.cles, verdicts)),
          `${genre} : ${ligne.nom}`,
        ).toBe(true);
      }
      const reunies = lignes.flatMap((l) => l.cles);
      if (genre === 'modes') {
        // Chaque mode qui a une réponse est dans une ligne, une seule fois.
        expect(new Set(reunies).size).toBe(reunies.length);
        for (const cle of CLES_DE_MODE) {
          const avecReponse = sommeDe(recompter(parPersonne, genre, [cle], verdicts)) > 0;
          if (avecReponse) expect(reunies, `${genre} : ${cle}`).toContain(cle);
        }
      } else {
        // Les plages se suivent sans trou, de la première clé à la dernière.
        expect(reunies).toEqual([...CLES_DU_GENRE[genre]]);
      }
    }
    expect(lignesDuTableau(html, TITRES[genre])).toEqual(nomsDeTable(table));
  }
  const apres = tables.apresUnJourDeFaute;
  if (apres !== null) {
    for (const ligne of apres) {
      const comptes = parPersonne.map((m) =>
        sommeDe(
          ligne.cles.map(
            (cle) =>
              m.reprises.apresUnJourDeFaute[cle as (typeof CLES_APRES_UNE_FAUTE)[number]].reponses,
          ),
        ),
      );
      expect(caseAdmise(comptes), `après : ${ligne.nom}`).toBe(true);
    }
    expect(apres.flatMap((l) => l.cles)).toEqual([...CLES_APRES_UNE_FAUTE]);
    expect(lignesDuTableau(html, TITRES.apres)).toEqual(noms(apres));
  } else {
    expect(lignesDuTableau(html, TITRES.apres)).toEqual([]);
  }
  // Le rang, l'espacement et le mode ont la même forme, ou sont tous trois omis.
  const formes = [tables.rangs, tables.espacements, tables.modes].map((t) => t?.forme ?? null);
  expect(new Set(formes).size).toBe(1);
  // Affichés, ils font de « Redonnée le jour même » leur réunion exacte, elle aussi affichée.
  if (tables.rangs !== null) expect(html).toContain('<th scope="row">Redonnée le jour même</th>');
}

test('le_rapport_d_une_personne_donne_les_deux_moities_en_nombres_ligne_par_ligne', () => {
  const journal = premierJour([
    { unite: 'xyv4pn7g', motif: 'FJFJ' },
    { unite: 'xyv4pn7g:inverse', motif: 'JJ' },
  ]);
  const html = dUnePersonne(journal);
  const sec = section(html);
  expect(sec).toContain(`<h2>${NOM_DE_LA_SECTION}</h2>`);
  for (const titre of Object.values(TITRES)) expect(sec).toContain(`<h3>${titre}</h3>`);
  expect(sec).toContain('<h4>Après une faute</h4>');
  expect(sec).toContain('<h4>Après une réponse juste</h4>');
  expect(sec).toContain('<h4>La première réponse du jour est fausse</h4>');
  expect(sec).toContain('<h4>La première réponse du jour est juste</h4>');
  const tables = tablesDesReprises(mesuresDe([journal]), true);
  expect(tables.rangs).toMatchObject({ forme: 'moities' });
  const rangs = tables.rangs as Extract<TableDeReprises, { forme: 'moities' }>;
  expect(noms(rangs.faute)).toEqual(['1re reprise', '3e reprise']);
  expect(noms(rangs.juste)).toEqual(['1re reprise', '2e reprise']);
  // Ligne par ligne : la part de justes, puis le nombre de réponses.
  expect(sec).toContain('<th scope="row">3e reprise</th><td>100 %</td><td>1</td>');
  expect(sec).toContain('<th scope="row">2e reprise</th><td>0 %</td><td>1</td>');
  expect(sec).toContain(
    '<th scope="row">Aucune autre réponse entre les deux</th><td>100 %</td><td>2</td>',
  );
  // La répartition : les couples et leur part de la moitié.
  expect(sec).toContain('<th scope="row">3 reprises</th><td>100 %</td><td>1</td>');
  expect(sec).toContain('<th scope="row">1 reprise</th><td>100 %</td><td>1</td>');
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual(['3 reprises', '1 reprise']);
  // Une personne : des nombres, et le rapport dit le nombre de réponses.
  expect(sec).toContain('<th scope="col">Réponses</th>');
});

test('une_moitie_sans_reprise_le_dit_et_l_autre_s_affiche_et_un_jour_de_faute_isole_ne_compte_pas', () => {
  const sans = dUnePersonne(premierJour([{ unite: 'xyv4pn7g', motif: 'FJ' }]));
  expect(section(sans)).toContain('Aucune reprise après une réponse juste');
  expect(section(sans)).not.toContain('Aucune reprise après une faute');
  expect(section(sans)).toContain('<th scope="row">1re reprise</th>');
  expect(section(sans)).toContain('Aucun couple dont la première réponse est juste');
  expect(section(sans)).toContain('Aucun jour de faute suivi d’une réponse un autre jour.');
  expect(lignesDuTableau(sans, TITRES.apres)).toEqual([]);
  // Le lendemain, la première réponse d'un autre jour est mesurée.
  const suivi = dUnePersonne([
    ...premierJour([{ unite: 'xyv4pn7g', motif: 'FJ' }]),
    ...lendemain(['xyv4pn7g'], 1000),
  ]);
  expect(lignesDuTableau(suivi, TITRES.apres)).toEqual(['1 reprise après la faute']);
  expect(section(suivi)).toContain(
    '<th scope="row">1 reprise après la faute</th><td>100 %</td><td>1</td>',
  );
  expect(section(suivi)).not.toContain('Aucun jour de faute suivi');
});

test('un_rapport_d_ensemble_aux_deux_moities_a_chaque_cle_seule_en_pourcentages_entiers', () => {
  const journaux = journauxAuxReprises(3, ID_DU_COURS);
  const html = ensemble(journaux);
  const sec = section(html);
  const rang = [...CLES_DE_RANG.keys()].map(
    (i) => ['1re reprise', '2e reprise', '3e reprise', '4e reprise et au-delà'][i],
  );
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  for (const genre of ['rangs', 'espacements', 'modes', 'repartition'] as const) {
    expect(tables[genre]?.forme).toBe('moities');
  }
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual([...rang, ...rang]);
  const espacement = [
    'Aucune autre réponse entre les deux',
    '1 ou 2 autres réponses',
    '3 à 5 autres réponses',
    '6 à 10 autres réponses',
    '11 autres réponses ou plus',
  ];
  expect(lignesDuTableau(html, TITRES.espacements)).toEqual([...espacement, ...espacement]);
  const modes = ['Carte retournée', 'Réponse tapée'];
  expect(lignesDuTableau(html, TITRES.modes)).toEqual([...modes, ...modes]);
  const repartition = ['0 reprise', '1 reprise', '2 reprises', '3 reprises', '4 reprises ou plus'];
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual([...repartition, ...repartition]);
  expect(lignesDuTableau(html, TITRES.apres)).toEqual([
    '0 reprise après la faute',
    '1 reprise après la faute',
    '2 reprises après la faute',
    '3 reprises ou plus après la faute',
  ]);
  // Des pourcentages entiers, ni compte, ni total.
  expect(sec).not.toContain('<th scope="col">Réponses</th>');
  expect(sec).not.toMatch(/sur [\d  ]+ réponses/);
  expect(sec).not.toMatch(/ · \d/);
  expect(sec).not.toContain('Couples</th>');
  for (const cellule of sec.matchAll(/<td>([^<]*)<\/td>/g)) {
    expect(cellule[1]).toMatch(/^\d+\s%$/);
  }
  // Chaque barre : 4 de large par point, et une infobulle « N % de justes ».
  const barres = [...sec.matchAll(/<rect class="s\d" x="200" y="[\d.]+" width="([\d.]+)"/g)];
  expect(barres.length).toBeGreaterThan(20);
  for (const barre of barres) expect(Number(barre[1]) % 4).toBe(0);
  const infobulles = [...sec.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] ?? '');
  expect(infobulles.length).toBe(barres.length);
  for (const infobulle of infobulles) expect(infobulle).toMatch(/ : \d+\s% de justes$/);
  verifierLaStructure(journaux);
});

/** Les éléments d'une personne : `n` couples de chaque motif, d'unités à eux. */
function demande(personne: string, motifs: Record<string, number>): ElementDeMotif[] {
  return Object.entries(motifs).flatMap(([motif, n]) => couples(motif, n, `${personne}${motif}`));
}

test('un_rang_refuse_se_fond_deux_fois_de_suite_et_donne_la_2e_reprise_et_au_dela', () => {
  // Après une faute : rang 1 [10,10,10], rang 2 [10,10,10], rang 3 [7,7,7], rang 4 et au-delà [26,0,0].
  const sept = { FJ: 10, JFJ: 10, JJFJ: 7 };
  const journaux = [
    premierJour(demande('a', { ...sept, JJJFJ: 26 })),
    premierJour(demande('b', sept)),
    premierJour(demande('c', sept)),
  ];
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  expect(tables.rangs).toMatchObject({ forme: 'moities' });
  const rangs = tables.rangs as Extract<TableDeReprises, { forme: 'moities' }>;
  expect(noms(rangs.faute)).toEqual(['1re reprise', '2e reprise et au-delà']);
  expect(lignesDuTableau(ensemble(journaux), TITRES.rangs).slice(0, 2)).toEqual([
    '1re reprise',
    '2e reprise et au-delà',
  ]);
  verifierLaStructure(journaux);
});

test('deux_modes_admis_rejoignent_l_un_apres_l_autre_les_autres_modes', () => {
  const parMode: Record<string, number[]> = {
    pointage: [30, 0, 0],
    retournee: [7, 7, 7],
    saisie: [8, 8, 8],
    choix: [9, 9, 9],
  };
  const donnees: DonneesDeCle[] = CLES_DE_MODE.map((cle) => {
    const comptes = parMode[cle] ?? [0, 0, 0];
    return { cellule: { reponses: sommeDe(comptes), justes: 0 }, comptes };
  });
  const lignes = couvrirLesModes(donnees, caseAdmise, false) ?? [];
  expect(noms(lignes)).toEqual(['Choix parmi des propositions', 'Autres modes']);
  // Le mode refusé, puis les deux admis les moins fournis : [30,0,0] + [7,7,7] reste refusé.
  expect(lignes[1]?.cles).toEqual(['retournee', 'saisie', 'pointage']);
  expect(lignes[1]?.comptes).toEqual([45, 15, 15]);
  expect(caseAdmise(lignes[1]?.comptes ?? [])).toBe(true);
  // Deux modes refusés, réunis, passent : « Toutes les reprises ». Un mode refusé seul : rien.
  const seul: DonneesDeCle[] = CLES_DE_MODE.map((cle) => {
    const comptes = cle === 'pointage' ? [10, 0, 0] : cle === 'saisie' ? [5, 5, 5] : [0, 0, 0];
    return { cellule: { reponses: sommeDe(comptes), justes: 0 }, comptes };
  });
  expect(noms(couvrirLesModes(seul, caseAdmise, false) ?? [])).toEqual(['Toutes les reprises']);
  const refuse: DonneesDeCle[] = CLES_DE_MODE.map((cle) => {
    const comptes = cle === 'pointage' ? [30, 0, 0] : [0, 0, 0];
    return { cellule: { reponses: sommeDe(comptes), justes: 0 }, comptes };
  });
  expect(couvrirLesModes(refuse, caseAdmise, false)).toBeNull();
});

test('si_seule_la_moitie_apres_une_faute_passe_le_rang_l_espacement_et_le_mode_sont_reunis', () => {
  // Trois personnes ont des reprises après une faute ; deux seulement, après une réponse juste.
  // En répartition, les trois personnes ont des couples dans chaque moitié.
  const journaux = [
    premierJour([...couples('FJ', 8, 'f'), ...couples('JJ', 15, 'j')]),
    premierJour([...couples('FJ', 8, 'f'), ...couples('JJ', 15, 'j')]),
    premierJour([...couples('FJ', 8, 'f'), ...couples('J', 15, 'j')]),
  ];
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  expect(tables.rangs).toMatchObject({ forme: 'reunies' });
  expect(tables.espacements).toMatchObject({ forme: 'reunies' });
  expect(tables.modes).toMatchObject({ forme: 'reunies' });
  expect(tables.repartition).toMatchObject({ forme: 'moities' });
  const html = ensemble(journaux);
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual(['Toutes les reprises']);
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual([
    'Tous les couples',
    'Tous les couples',
  ]);
  expect(section(html)).not.toContain('<h4>Après une faute</h4>');
  expect(html).toContain('<th scope="row">Redonnée le jour même</th>');
  verifierLaStructure(journaux);
});

test('une_personne_qui_fait_plus_de_70_pour_cent_des_reprises_les_fait_omettre', () => {
  // Trois personnes sans reprise, 12 couples de chaque première réponse ; la quatrième fait toutes
  // les reprises, en trois couples, qu'elle reprend un autre jour.
  const sansReprise = (n: string) =>
    premierJour([...couples('F', 12, `${n}f`), ...couples('J', 12, `${n}j`)]);
  const quatrieme = premierJour(couples('FJFJFJ', 3, 'q'));
  const journaux = [
    sansReprise('a'),
    sansReprise('b'),
    sansReprise('c'),
    [...quatrieme, ...lendemain(['q0', 'q1', 'q2'], 5000)],
  ];
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  expect(tables.rangs).toBeNull();
  expect(tables.espacements).toBeNull();
  expect(tables.modes).toBeNull();
  // La répartition passe en deux moitiés, et le dernier tableau (à la seule quatrième) est omis.
  expect(tables.repartition).toMatchObject({ forme: 'moities' });
  expect(tables.apresUnJourDeFaute).toBeNull();
  const html = ensemble(journaux);
  expect(html).not.toContain('<th scope="row">Redonnée le jour même</th>');
  expect(section(html)).toContain('Ce tableau est omis');
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual([]);
  expect(lignesDuTableau(html, TITRES.apres)).toEqual([]);
  verifierLaStructure(journaux);
});

test('vingt_cinq_reponses_d_une_seule_personne_a_un_element_ne_disent_rien_d_un_couple', () => {
  const troisSansReprise = [1, 2, 3].map((n) =>
    premierJour(couples('F', 24, `p${n}`), n * 100_000),
  );
  // Seule, la quatrième personne répond 25 fois au même élément le même jour.
  const seule = premierJour([{ unite: 'xyv4pn7g', motif: 'J'.repeat(25), mode: 'pointage' }]);
  const html = ensemble([...troisSansReprise, seule]);
  expect(section(html)).toContain('Ce tableau est omis');
  for (const titre of [TITRES.rangs, TITRES.espacements, TITRES.modes, TITRES.apres]) {
    expect(lignesDuTableau(html, titre)).toEqual([]);
  }
  // La répartition, si elle s'affiche, ne dit que « Tous les couples » : jamais un couple à 24 reprises.
  for (const ligne of lignesDuTableau(html, TITRES.repartition)) {
    expect(ligne).toBe('Tous les couples');
  }
  expect(html).not.toContain('4 reprises ou plus');
  expect(html).not.toContain('Point touché');
  // Avec trois personnes qui ont des reprises, la quatrième est fondue : rien ne nomme une case.
  const avecReprises = [1, 2, 3].map((n) => premierJour(couples('JJ', 12, `r${n}`), n * 100_000));
  const fondu = ensemble([...avecReprises, seule]);
  verifierLaStructure([...avecReprises, seule]);
  expect(lignesDuTableau(fondu, TITRES.repartition)).toEqual(['Tous les couples']);
  expect(lignesDuTableau(fondu, TITRES.modes)).toEqual(['Toutes les reprises']);
  expect(lignesDuTableau(fondu, TITRES.rangs)).toEqual(['Toutes les reprises']);
  expect(section(fondu)).not.toContain('4 reprises ou plus');
  expect(section(fondu)).not.toMatch(/ \+ /);
});

test('sous_trois_personnes_actives_le_rapport_limite_ne_dit_rien_des_reprises', () => {
  const html = ensemble(journauxAuxReprises(2, ID_DU_COURS));
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toContain(NOM_DE_LA_SECTION);
  expect(html).not.toContain('reprise');
});

test('des_pretests_entre_deux_reponses_d_un_element_ne_changent_pas_la_page', () => {
  const sans = journauxAuxReprises(3, ID_DU_COURS);
  const avec = sans.map((journal, personne) => [
    ...journal,
    ...Array.from({ length: 40 }, (_, k) =>
      reponseInventee(
        JOUR_1 + k * 1000 + 500,
        9_000_000 + personne * 100 + k,
        `u${k % 10}x${k % 7}`,
        k % 2 === 0,
        ID_DU_COURS,
        'pretest',
      ),
    ),
  ]);
  expect(ensemble(avec)).toBe(ensemble(sans));
  expect(tablesDesReprises(mesuresDe(avec), false)).toEqual(
    tablesDesReprises(mesuresDe(sans), false),
  );
});
