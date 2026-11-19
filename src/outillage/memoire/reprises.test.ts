import { expect, test } from 'vitest';
import type { Evenement, ModeDeReponse } from '../../domaine/journal/evenement.js';
import { CLES_DE_MODE } from './cellules.js';
import { coursDExemple } from './cours-exemple.fixture.js';
import { journalSimule, reponseInventee } from './ecrire-journal.fixture.js';
import { mesures, sommerMesures } from './mesures.js';
import { journauxAuxReprises, journeeDeMotifs, reponseDecalee } from './reprises.fixture.js';
import {
  CLES_APRES_UNE_FAUTE,
  CLES_D_ESPACEMENT,
  CLES_DE_RANG,
  CLES_DE_REPARTITION,
  CLES_DE_VERDICT,
  type MesuresDeReprises,
  reprisesVides,
} from './reprises.js';

const cours = coursDExemple();
const ID_DU_COURS = cours.cours.id;
const A = 'xyv4pn7g';
const B = 'xyv4pn7g:inverse';
const AUJOURDHUI = '2026-01-30';

let rangCourant = 0;
/** Une réponse du jour `jour` de janvier 2026, à `heure` h et `seconde` s. */
function r(
  jour: number,
  heure: number,
  seconde: number,
  unite: string,
  juste: boolean,
  mode?: ModeDeReponse,
): Evenement {
  rangCourant += 1;
  const instant = Date.UTC(2026, 0, jour, heure, 0, seconde);
  return reponseInventee(instant, rangCourant, unite, juste, ID_DU_COURS, mode);
}

const reprisesDe = (journal: readonly Evenement[]): MesuresDeReprises =>
  mesures(journal, cours, AUJOURDHUI).reprises;

const cellule = (reponses: number, justes: number) => ({ reponses, justes });

const sommeDes = <T extends string>(
  table: Record<'faute' | 'juste', Record<T, { reponses: number; justes: number }>>,
) => {
  const somme = { reponses: 0, justes: 0 };
  for (const verdict of CLES_DE_VERDICT) {
    for (const c of Object.values<{ reponses: number; justes: number }>(table[verdict])) {
      somme.reponses += c.reponses;
      somme.justes += c.justes;
    }
  }
  return somme;
};

/** Les reprises d'un journal sur une unité, aux motifs donnés, avec `intercales` autres réponses. */
function avecEcart(intercales: number): MesuresDeReprises {
  return reprisesDe(
    journeeDeMotifs({
      debut: Date.UTC(2026, 0, 5, 10),
      rangDepart: 1,
      elements: [{ unite: A, motif: 'JJ', intercales }],
    }),
  );
}

test('un_jour_de_reponses_se_range_selon_le_rang_l_espacement_le_mode_et_la_repartition', () => {
  const journal = [
    r(5, 10, 0, A, false, 'retournee'),
    r(5, 10, 1, B, true),
    r(5, 10, 2, A, true, 'saisie'),
    r(5, 10, 3, A, false, 'choix'),
    r(5, 10, 4, A, true, 'retournee'),
  ];
  const m = reprisesDe(journal);
  // A : faux, juste (après une faute), faux (après une juste), juste (après une faute).
  expect(m.rangs.faute['rang-1']).toEqual(cellule(1, 1));
  expect(m.rangs.juste['rang-2']).toEqual(cellule(1, 0));
  expect(m.rangs.faute['rang-3']).toEqual(cellule(1, 1));
  expect(sommeDes(m.rangs)).toEqual(cellule(3, 2));
  // B est entre le premier et le deuxième passage de A ; les deux suivants se touchent.
  expect(m.espacements.faute['ecart-1-2']).toEqual(cellule(1, 1));
  expect(m.espacements.juste['ecart-0']).toEqual(cellule(1, 0));
  expect(m.espacements.faute['ecart-0']).toEqual(cellule(1, 1));
  expect(sommeDes(m.espacements)).toEqual(cellule(3, 2));
  // Le mode est celui de la reprise, le verdict celui de la réponse d'avant.
  expect(m.modes.faute.saisie).toEqual(cellule(1, 1));
  expect(m.modes.juste.choix).toEqual(cellule(1, 0));
  expect(m.modes.faute.retournee).toEqual(cellule(1, 1));
  expect(sommeDes(m.modes)).toEqual(cellule(3, 2));
  // A ouvre un couple à trois reprises par une faute, B un couple sans reprise par une juste.
  expect(m.repartition.faute['reprises-3']).toBe(1);
  expect(m.repartition.juste['reprises-0']).toBe(1);
  expect(Object.values(m.repartition.faute).reduce((s, n) => s + n, 0)).toBe(1);
  expect(Object.values(m.repartition.juste).reduce((s, n) => s + n, 0)).toBe(1);
  // Aucun jour de faute suivi d'une réponse un autre jour.
  expect(m.apresUnJourDeFaute).toEqual(reprisesVides().apresUnJourDeFaute);
});

test('la_classe_du_rang_et_celle_de_la_repartition_finissent_a_quatre', () => {
  const six = Array.from({ length: 6 }, (_, i) => r(5, 10, i, A, true));
  const cinq = Array.from({ length: 5 }, (_, i) => r(5, 11, i, B, true));
  const m = reprisesDe([...six, ...cinq]);
  // Six réponses : les rangs 1 à 5 ; cinq réponses : les rangs 1 à 4.
  expect(m.rangs.juste['rang-1']).toEqual(cellule(2, 2));
  expect(m.rangs.juste['rang-2']).toEqual(cellule(2, 2));
  expect(m.rangs.juste['rang-3']).toEqual(cellule(2, 2));
  expect(m.rangs.juste['rang-4-et-plus']).toEqual(cellule(3, 3));
  // Cinq et quatre reprises : la même case, « 4 reprises ou plus ».
  expect(m.repartition.juste['reprises-4-et-plus']).toBe(2);
  expect(m.repartition.juste['reprises-3']).toBe(0);
  // Trois reprises seulement : la case d'avant.
  const quatre = Array.from({ length: 4 }, (_, i) => r(6, 10, i, A, true));
  expect(reprisesDe(quatre).repartition.juste['reprises-3']).toBe(1);
  expect(reprisesDe(quatre).repartition.juste['reprises-4-et-plus']).toBe(0);
});

test('l_espacement_compte_les_autres_reponses_entre_les_deux_et_chaque_borne_a_ses_deux_cotes', () => {
  const attendu: [number, (typeof CLES_D_ESPACEMENT)[number]][] = [
    [0, 'ecart-0'],
    [1, 'ecart-1-2'],
    [2, 'ecart-1-2'],
    [3, 'ecart-3-5'],
    [5, 'ecart-3-5'],
    [6, 'ecart-6-10'],
    [10, 'ecart-6-10'],
    [11, 'ecart-11-et-plus'],
  ];
  for (const [autres, cle] of attendu) {
    const m = avecEcart(autres);
    for (const autre of CLES_D_ESPACEMENT) {
      expect(m.espacements.juste[autre], `${autres} autres : ${autre}`).toEqual(
        cellule(autre === cle ? 1 : 0, autre === cle ? 1 : 0),
      );
    }
  }
});

test('un_jour_qui_recule_ouvre_un_couple_et_les_cases_de_rang_font_la_case_meme_jour', () => {
  const instant = (jour: number, heure: number) => Date.UTC(2026, 0, jour, heure);
  // Les jours locaux de A : 04, 05, 04 puis 04.
  const journal = [
    reponseDecalee(instant(4, 12), 1, A, true, 0, ID_DU_COURS),
    reponseDecalee(instant(5, 12), 2, A, true, 0, ID_DU_COURS),
    reponseDecalee(instant(5, 13), 3, A, false, -1000, ID_DU_COURS),
    reponseDecalee(instant(5, 14), 4, A, true, -1000, ID_DU_COURS),
  ];
  const m = mesures(journal, cours, AUJOURDHUI);
  // Trois couples : 04, 05 et 04 de nouveau, dont le dernier a une reprise (rang 1, après une faute).
  expect(m.reprises.rangs.faute['rang-1']).toEqual(cellule(1, 1));
  expect(sommeDes(m.reprises.rangs)).toEqual(cellule(1, 1));
  const couples = Object.values(m.reprises.repartition).flatMap((c) => Object.values(c));
  expect(couples.reduce((s, n) => s + n, 0)).toBe(3);
  expect(m.reprises.repartition.juste['reprises-0']).toBe(2);
  expect(m.reprises.repartition.juste['reprises-1']).toBe(0);
  expect(m.reprises.repartition.faute['reprises-1']).toBe(1);
  expect(sommeDes(m.reprises.rangs)).toEqual(m.delais['meme-jour']);
});

test('apres_un_jour_de_faute_un_jour_plus_ancien_est_la_premiere_reponse_d_un_autre_jour', () => {
  const journal = [
    reponseDecalee(Date.UTC(2026, 0, 5, 12), 1, A, false, 0, ID_DU_COURS),
    // Plus tard, mais à l'heure locale du 04 : un autre jour, même s'il est plus ancien.
    reponseDecalee(Date.UTC(2026, 0, 6, 12), 2, A, true, -3000, ID_DU_COURS),
  ];
  const m = mesures(journal, cours, AUJOURDHUI);
  expect(m.reprises.apresUnJourDeFaute['apres-faute-0']).toEqual(cellule(1, 1));
  expect(sommeDes(m.reprises.rangs)).toEqual(cellule(0, 0));
});

test('deux_reponses_au_meme_instant_se_rangent_par_identifiant_dans_les_deux_ordres', () => {
  const instant = Date.UTC(2026, 0, 5, 10);
  const premiere = reponseInventee(instant, 1, A, false, ID_DU_COURS);
  const seconde = reponseInventee(instant, 2, A, true, ID_DU_COURS);
  const un = reprisesDe([premiere, seconde]);
  const deux = reprisesDe([seconde, premiere]);
  expect(deux).toEqual(un);
  expect(un.rangs.faute['rang-1']).toEqual(cellule(1, 1));
  expect(sommeDes(un.rangs)).toEqual(cellule(1, 1));
});

test('une_unite_absente_du_cours_repondue_deux_fois_le_meme_jour_est_une_reprise', () => {
  const m = reprisesDe([r(5, 10, 0, 'zzzzzzzz', true), r(5, 10, 1, 'zzzzzzzz', false)]);
  expect(m.rangs.juste['rang-1']).toEqual(cellule(1, 0));
});

test('les_cases_des_reprises_font_la_case_meme_jour_des_delais_sur_plusieurs_journaux', () => {
  const journaux: Evenement[][] = [
    [
      r(5, 10, 0, A, false, 'retournee'),
      r(5, 10, 1, B, true),
      r(5, 10, 2, A, true, 'saisie'),
      r(5, 10, 3, A, false, 'choix'),
      r(5, 10, 4, A, true, 'retournee'),
    ],
    ...journauxAuxReprises(3, ID_DU_COURS),
    journalSimule({ unites: 80, passages: 8, graine: 7, cours: ID_DU_COURS }),
  ];
  expect(journaux.at(-1)?.length).toBe(640);
  for (const journal of journaux) {
    const m = mesures(journal, cours, AUJOURDHUI);
    const memeJour = m.delais['meme-jour'];
    expect(memeJour.reponses).toBeGreaterThan(0);
    expect(sommeDes(m.reprises.rangs)).toEqual(memeJour);
    expect(sommeDes(m.reprises.espacements)).toEqual(memeJour);
    expect(sommeDes(m.reprises.modes)).toEqual(memeJour);
    // Le nombre de couples est celui des réponses moins les reprises.
    const couples = CLES_DE_VERDICT.flatMap((v) => Object.values(m.reprises.repartition[v]));
    expect(couples.reduce((s, n) => s + n, 0)).toBe(m.reponses - memeJour.reponses);
  }
});

/** Le premier jour, le motif ; le lendemain, `suite`. Rend les reprises de l'élément. */
function surDeuxJours(motif: string, suite: string): MesuresDeReprises {
  const veille = journeeDeMotifs({
    debut: Date.UTC(2026, 0, 5, 10),
    rangDepart: 1,
    elements: [{ unite: A, motif }],
  });
  const lendemain = journeeDeMotifs({
    debut: Date.UTC(2026, 0, 6, 10),
    rangDepart: 1000,
    elements: [{ unite: A, motif: suite }],
  });
  return reprisesDe([...veille, ...lendemain]);
}

test('apres_un_jour_de_faute_les_reprises_se_comptent_depuis_la_premiere_faute', () => {
  const classe = (m: MesuresDeReprises) =>
    CLES_APRES_UNE_FAUTE.filter((cle) => m.apresUnJourDeFaute[cle].reponses > 0);
  expect(classe(surDeuxJours('FJJ', 'J'))).toEqual(['apres-faute-2']);
  expect(classe(surDeuxJours('JF', 'J'))).toEqual(['apres-faute-0']);
  // Une reprise d'avant la faute ne compte pas : juste, juste, faux, juste.
  expect(classe(surDeuxJours('JJFJ', 'J'))).toEqual(['apres-faute-1']);
  expect(classe(surDeuxJours('FJJJ', 'J'))).toEqual(['apres-faute-3-et-plus']);
  expect(classe(surDeuxJours('FJJJJ', 'J'))).toEqual(['apres-faute-3-et-plus']);
  // Les reprises qui échouent encore comptent aussi : faux, faux, faux.
  expect(classe(surDeuxJours('FFF', 'J'))).toEqual(['apres-faute-2']);
});

test('la_reponse_d_un_autre_jour_donne_son_verdict_a_la_case_pas_celui_du_jour_de_faute', () => {
  const apresUneFaute = surDeuxJours('FJF', 'J').apresUnJourDeFaute['apres-faute-2'];
  expect(apresUneFaute).toEqual(cellule(1, 1));
  const apresUneJuste = surDeuxJours('FJ', 'F').apresUnJourDeFaute['apres-faute-1'];
  expect(apresUneJuste).toEqual(cellule(1, 0));
});

test('un_jour_de_faute_sans_reponse_un_autre_jour_et_un_couple_sans_faute_ne_comptent_nulle_part', () => {
  const sansSuite = reprisesDe(
    journeeDeMotifs({
      debut: Date.UTC(2026, 0, 5, 10),
      rangDepart: 1,
      elements: [{ unite: A, motif: 'FJ' }],
    }),
  );
  expect(sansSuite.apresUnJourDeFaute).toEqual(reprisesVides().apresUnJourDeFaute);
  // Un couple sans faute, suivi d'une réponse le lendemain.
  expect(surDeuxJours('JJ', 'F').apresUnJourDeFaute).toEqual(reprisesVides().apresUnJourDeFaute);
  // Les couples encore ouverts à la fin du journal comptent dans la répartition.
  expect(sansSuite.repartition.faute['reprises-1']).toBe(1);
});

test('un_pretest_ne_change_ni_les_reprises_ni_l_espacement_ni_le_jour_suivant', () => {
  const sans = [
    r(5, 10, 0, A, false, 'retournee'),
    r(5, 10, 10, A, true, 'saisie'),
    r(6, 10, 0, A, true, 'saisie'),
  ];
  const avec = [
    sans[0],
    // Entre deux réponses de A le même jour : ni coupure, ni « autre réponse ».
    r(5, 10, 3, B, true, 'pretest'),
    r(5, 10, 5, A, true, 'pretest'),
    sans[1],
    // Première réponse d'un autre jour : ce n'est pas elle qui est mesurée.
    r(6, 9, 0, A, false, 'pretest'),
    sans[2],
  ] as Evenement[];
  expect(reprisesDe(avec)).toEqual(reprisesDe(sans));
  expect(reprisesDe(sans).espacements.faute['ecart-0']).toEqual(cellule(1, 1));
  expect(reprisesDe(sans).apresUnJourDeFaute['apres-faute-1']).toEqual(cellule(1, 1));
});

test('un_mode_inconnu_n_est_ni_une_reprise_ni_une_autre_reponse_et_un_doublon_compte_une_fois', () => {
  const premiere = r(5, 10, 0, A, true);
  const inconnue = r(5, 10, 1, A, false, 'inconnu' as ModeDeReponse);
  const seconde = r(5, 10, 2, A, true);
  const m = reprisesDe([premiere, inconnue, seconde, seconde]);
  expect(sommeDes(m.rangs)).toEqual(cellule(1, 1));
  expect(m.rangs.juste['rang-1']).toEqual(cellule(1, 1));
  expect(m.espacements.juste['ecart-0']).toEqual(cellule(1, 1));
});

test('les_journaux_aux_reprises_donnent_a_chaque_personne_sept_reponses_a_chaque_case', () => {
  const journaux = journauxAuxReprises(3, ID_DU_COURS);
  expect(journaux).toHaveLength(3);
  const toutes = journaux.map((journal) => reprisesDe(journal));
  expect(toutes[1]).toEqual(toutes[0]);
  expect(toutes[2]).toEqual(toutes[0]);
  const m = toutes[0] as MesuresDeReprises;
  for (const verdict of CLES_DE_VERDICT) {
    for (const cle of CLES_DE_RANG)
      expect(m.rangs[verdict][cle].reponses).toBeGreaterThanOrEqual(7);
    for (const cle of CLES_D_ESPACEMENT) {
      expect(m.espacements[verdict][cle].reponses).toBeGreaterThanOrEqual(7);
    }
    for (const mode of ['retournee', 'saisie'] as const) {
      expect(m.modes[verdict][mode].reponses).toBeGreaterThanOrEqual(7);
    }
    for (const cle of CLES_DE_REPARTITION) {
      expect(m.repartition[verdict][cle]).toBeGreaterThanOrEqual(7);
    }
  }
  for (const cle of CLES_APRES_UNE_FAUTE) {
    expect(m.apresUnJourDeFaute[cle].reponses).toBeGreaterThanOrEqual(7);
  }
  // Aucun mode hors des deux : les autres cases sont vides.
  for (const mode of CLES_DE_MODE.filter((cle) => cle !== 'retournee' && cle !== 'saisie')) {
    expect(m.modes.juste[mode].reponses + m.modes.faute[mode].reponses).toBe(0);
  }
});

test('les_reprises_de_deux_journaux_s_additionnent_et_sans_reponse_tout_est_a_zero', () => {
  const un = mesures(journauxAuxReprises(1, ID_DU_COURS)[0] as Evenement[], cours, AUJOURDHUI);
  const deux = sommerMesures([un, un]);
  for (const verdict of CLES_DE_VERDICT) {
    for (const cle of CLES_DE_RANG) {
      expect(deux.reprises.rangs[verdict][cle].reponses).toBe(
        2 * un.reprises.rangs[verdict][cle].reponses,
      );
      expect(deux.reprises.rangs[verdict][cle].justes).toBe(
        2 * un.reprises.rangs[verdict][cle].justes,
      );
    }
    for (const cle of CLES_D_ESPACEMENT) {
      expect(deux.reprises.espacements[verdict][cle].reponses).toBe(
        2 * un.reprises.espacements[verdict][cle].reponses,
      );
    }
    for (const cle of CLES_DE_MODE) {
      expect(deux.reprises.modes[verdict][cle].reponses).toBe(
        2 * un.reprises.modes[verdict][cle].reponses,
      );
    }
    for (const cle of CLES_DE_REPARTITION) {
      expect(deux.reprises.repartition[verdict][cle]).toBe(
        2 * un.reprises.repartition[verdict][cle],
      );
    }
  }
  for (const cle of CLES_APRES_UNE_FAUTE) {
    expect(deux.reprises.apresUnJourDeFaute[cle]).toEqual({
      reponses: 2 * un.reprises.apresUnJourDeFaute[cle].reponses,
      justes: 2 * un.reprises.apresUnJourDeFaute[cle].justes,
    });
  }
  expect(mesures([], cours, AUJOURDHUI).reprises).toEqual(reprisesVides());
});
