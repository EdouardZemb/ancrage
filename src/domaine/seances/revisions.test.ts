import { expect, it } from 'vitest';
import type { Planning } from '../contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { pretestDeTest, reponseDeTest } from '../evenements.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import { etatsDesUnites } from '../progression/etat.js';
import { posablesDuCours, TAILLE_DE_SEANCE } from './heute.js';
import { avecRevisions, revisionsDuJour } from './revisions.js';
import { modulesDesPosables } from './semestre.js';

/* Données factices, écrites à la main (invariant 7). Les attendus sont calculés à la main. */

const AUJOURDHUI = '2026-10-17';
const SCHEMA = 'sc000001';
const EXERCICES = 'ex000001';
const MORPHOLOGIE = 'mm000001';
const FEUILLE = 'fe000001';

/*
 * Le cours de test, aux intervalles [0, 3, 6, 9, 12, 15] : un élément répondu juste une fois est en
 * boîte 1, à revoir trois jours après sa réponse ; deux fois, en boîte 2, six jours après.
 */
function leCours() {
  return preparerCours({
    ...coursServiDeTest(),
    leitner: { intervalles: [0, 3, 6, 9, 12, 15], nouvellesParSeance: 15 },
  });
}

/**
 * Un planning relatif parti le 03/10 : la semaine 1 cite CHAPITRE_1 (03/10), la semaine 2
 * CHAPITRE_2 et sc000001 (10/10), la semaine 3, une révision sans module, s'ouvre le 17/10, et la
 * semaine 4 cite ex000001 (24/10).
 */
const PLANNING: Planning = {
  etapes: [
    { titre: 'Woche 1', semaine: 1, genre: 'cours', modules: [CHAPITRE_1] },
    { titre: 'Woche 2', semaine: 2, genre: 'cours', modules: [CHAPITRE_2, SCHEMA] },
    { titre: 'Woche 3', semaine: 3, genre: 'revision', modules: [] },
    { titre: 'Woche 4', semaine: 4, genre: 'cours', modules: [EXERCICES] },
  ],
};

let compteur = 0;

function a10h(jour: string): string {
  return `${jour}T10:00:00.000+02:00`;
}

/** L'unité répondue juste `fois` fois le `jour` : en boîte `fois`, dernière réponse ce jour. */
function vu(unite: string, jour = '2026-10-15', fois = 1): Evenement[] {
  return Array.from({ length: fois }, () => reponseDeTest(++compteur, unite, true, a10h(jour)));
}

/** Les révisions du jour (leurs identifiants) pour ce journal, sur le cours de test. */
function revisions(evenements: Evenement[], planning = PLANNING, aujourdhui = AUJOURDHUI) {
  const cours = leCours();
  const etats = etatsDesUnites(evenements, cours.cours.leitner);
  return revisionsDuJour(
    posablesDuCours(cours),
    modulesDesPosables(cours),
    { etats, evenements, aujourdhui },
    { planning, depart: '2026-10-03', examen: undefined },
  ).map(({ id }) => id);
}

/** Un planning d'étapes datées : [jour, modules, genre], le genre étant `cours` par défaut. */
type EtapeDatee = [string, string[], 'revision'?];
function datees(...etapes: EtapeDatee[]): Planning {
  const lignes = etapes.map(([seance, modules, genre], rang) => ({
    titre: `Etappe ${rang + 1}`,
    seance,
    modules,
    genre: genre ?? ('cours' as const),
  }));
  return { etapes: lignes };
}

it('pas_de_revision_quand_l_etape_en_cours_est_une_etape_de_cours', () => {
  const journal = vu('c1000001');
  // Le 12/10, la semaine 2 (10/10) est en cours : c1000001, vu le 15/10 dans ce jeu, ne serait pas
  // encore vu ; on le répond le 10/10 pour qu'il soit révisable à mi-intervalle le 12/10.
  const ancien = vu('c1000001', '2026-10-10');
  expect(revisions(ancien, PLANNING, '2026-10-12')).toEqual([]);
  expect(revisions(journal)).toEqual(['c1000001']);
});

it('pas_de_revision_hors_de_toute_etape', () => {
  // Avant la première ouverture (03/10) : boîte 5 le 20/09, ni due ni neuve le 02/10.
  expect(revisions(vu('c1000001', '2026-09-20', 5), PLANNING, '2026-10-02')).toEqual([]);
  // Après l'horizon (24/10 plus sept jours), la dernière étape étant de cours.
  expect(revisions(vu('c1000001', '2026-10-25', 5), PLANNING, '2026-11-05')).toEqual([]);
});

it('revisions_l_etape_de_revision_cite_ses_modules_comme_une_autre', () => {
  const planning = datees(['2026-10-01', [CHAPITRE_1]], ['2026-10-17', [CHAPITRE_2], 'revision']);
  const journal = [...vu('c1000001'), ...vu('c2000001')];
  expect(revisions(journal, planning)).toEqual(['c1000001', 'c2000001']);
});

it('revisions_des_modules_des_etapes_ouvertes_seulement', () => {
  const journal = [
    ...vu('c1000001'),
    ...vu('q0000003'),
    // Le module de cet exercice n'est cité que par la semaine 4, fermée.
    ...vu('e1000001'),
    // Ce mot est d'un module qu'aucune étape ne nomme.
    ...vu('w0000002'),
  ];
  expect(revisions(journal)).toEqual(['c1000001', 'q0000003']);
});

it('revisions_ni_neuves_ni_dues', () => {
  const journal = [
    ...vu('c1000001'),
    // Vu le 10/10 : due depuis le 13/10.
    ...vu('c1000003', '2026-10-10'),
  ];
  // c1000002 est neuve.
  expect(revisions(journal)).toEqual(['c1000001']);
});

it('revisions_sans_ce_qui_est_repondu_aujourd_hui', () => {
  const journal = [...vu('c1000001'), ...vu('c1000002'), ...vu('c1000002', AUJOURDHUI)];
  expect(revisions(journal)).toEqual(['c1000001']);
});

it('revisions_pas_avant_la_moitie_de_l_intervalle', () => {
  const journal = [
    // Boîte 2 (six jours) : répondue il y a deux jours, non ; il y a trois jours, oui.
    ...vu('c1000001', '2026-10-15', 2),
    ...vu('c1000002', '2026-10-14', 2),
    // Boîte 1 (trois jours) : répondue hier, non ; avant-hier, oui.
    ...vu('c1000003', '2026-10-16'),
    ...vu('c1000004', '2026-10-15'),
  ];
  expect(revisions(journal)).toEqual(['c1000004', 'c1000002']);
});

it('revisions_trois_jours_de_suite_ne_menent_pas_en_boite_5', () => {
  const cours = leCours();
  let journal = vu('c1000001', '2026-10-14', 2);
  for (const jour of ['2026-10-17', '2026-10-18', '2026-10-19']) {
    for (const id of revisions(journal, PLANNING, jour)) {
      journal = [...journal, ...vu(id, jour)];
    }
  }
  const etats = etatsDesUnites(journal, cours.cours.leitner);
  // Révisée le 17/10 seulement : boîte 3 (échéance au 26/10), non revue les 18 et 19.
  expect(etats.get('c1000001')?.boite).toBe(3);
  expect(journal.filter((e) => e.unite === 'c1000001')).toHaveLength(3);
});

it('revisions_tour_a_tour_entre_les_etapes', () => {
  const journal = [...vu('c1000001'), ...vu('c1000002'), ...vu('c1000003'), ...vu('c2000001')];
  expect(revisions(journal)).toEqual(['c1000001', 'c2000001', 'c1000002', 'c1000003']);
});

it('revisions_les_plus_fragiles_d_abord_puis_l_ordre_du_cours', () => {
  const journal = [
    // Boîte 3, échéance le 18/10 : la boîte l'emporte sur l'échéance.
    ...vu('c1000001', '2026-10-09', 3),
    // Boîte 2, échéances les 20/10 et 19/10 : la plus proche d'abord, contre l'ordre du cours.
    ...vu('c1000002', '2026-10-14', 2),
    ...vu('c1000003', '2026-10-13', 2),
    // Boîte 1, même échéance (18/10) : l'ordre du cours.
    ...vu('c1000004'),
    ...vu('c1000005'),
  ];
  expect(revisions(journal)).toEqual(['c1000004', 'c1000005', 'c1000003', 'c1000002', 'c1000001']);
});

it('revisions_de_tout_genre_de_posable', () => {
  const planning = datees(
    ['2026-10-01', [CHAPITRE_1, MORPHOLOGIE, SCHEMA, EXERCICES, FEUILLE]],
    ['2026-10-16', [], 'revision'],
  );
  const unites = ['c1000001', 'w0000002', 'q0000003', 'e1000001', 'fb000007'];
  const journal = unites.flatMap((unite) => vu(unite));
  expect(revisions(journal, planning)).toEqual(unites);
});

it('revisions_une_unite_citee_par_deux_etapes_n_est_prise_qu_une_fois', () => {
  const planning = datees(
    ['2026-10-01', [CHAPITRE_1]],
    ['2026-10-02', [CHAPITRE_1, CHAPITRE_2]],
    ['2026-10-16', [], 'revision'],
  );
  const journal = [...vu('c1000001'), ...vu('c2000001')];
  expect(revisions(journal, planning)).toEqual(['c1000001', 'c2000001']);
});

/** Toutes les étapes de cours ouvertes, puis une révision : tous les posables du cours de test. */
function toutLeCours() {
  const cours = leCours();
  const posables = posablesDuCours(cours);
  const modules = [...new Set(modulesDesPosables(cours).values())];
  const planning = datees(['2026-10-01', modules], ['2026-10-16', [], 'revision']);
  return { posables, planning };
}

it('revisions_au_plus_une_seance_moins_les_reponses_du_jour', () => {
  const { posables, planning } = toutLeCours();
  expect(posables).toHaveLength(41);
  const tous = posables.flatMap(({ id }) => vu(id));
  const repondus = (n: number) => posables.slice(0, n).flatMap(({ id }) => vu(id, AUJOURDHUI));
  // Rien répondu : 41 révisables, une séance pleine au plus.
  expect(revisions(tous, planning)).toHaveLength(TAILLE_DE_SEANCE);
  // Cinq répondus : 36 révisables, quinze au plus.
  expect(revisions([...tous, ...repondus(5)], planning)).toHaveLength(15);
  // Vingt répondus : aucune place.
  expect(revisions([...tous, ...repondus(20)], planning)).toEqual([]);
  // Vingt-cinq répondus : toujours aucune, et non tout sauf les cinq dernières.
  expect(revisions([...tous, ...repondus(25)], planning)).toEqual([]);
});

it('revisions_la_coupe_se_fait_au_milieu_d_un_tour', () => {
  const planning = datees(
    ['2026-10-01', [CHAPITRE_1]],
    ['2026-10-02', [CHAPITRE_2]],
    ['2026-10-16', [], 'revision'],
  );
  const { posables } = toutLeCours();
  const autres = posables.filter(({ id }) => id !== 'c1000001' && id !== 'c2000001');
  const dujour = autres.slice(0, 19).flatMap(({ id }) => vu(id, AUJOURDHUI));
  // Dix-neuf répondus : une place, deux étapes qui en ont une à donner ; la première l'emporte.
  expect(revisions([...vu('c1000001'), ...vu('c2000001'), ...dujour], planning)).toEqual([
    'c1000001',
  ]);
});

it('revisions_une_reponse_a_une_unite_hors_du_cours_ne_compte_pas', () => {
  const { posables, planning } = toutLeCours();
  const tous = posables.flatMap(({ id }) => vu(id));
  const fantomes = Array.from({ length: 6 }, (_, i) => vu(`zz00000${i}`, AUJOURDHUI)).flat();
  expect(revisions([...tous, ...fantomes], planning)).toHaveLength(TAILLE_DE_SEANCE);
});

it('un_pretest_ne_rend_rien_revisable_et_ne_compte_pas', () => {
  const { posables, planning } = toutLeCours();
  // Une carte vue seulement par un pré-test n'est pas révisable.
  const pretest = [pretestDeTest(++compteur, 'c1000001', true, a10h('2026-10-15'))];
  expect(revisions(pretest, planning)).toEqual([]);
  // Un pré-test ne repousse pas la dernière réponse (15/10, non le 16/10) : à mi-intervalle.
  const avec = [...vu('c1000002'), pretestDeTest(++compteur, 'c1000002', true, a10h('2026-10-16'))];
  expect(revisions(avec, planning)).toEqual(['c1000002']);
  // Vingt pré-tests aujourd'hui ne comptent pas parmi les réponses du jour.
  const pretestsDuJour = posables
    .slice(10, 30)
    .map(({ id }) => pretestDeTest(++compteur, id, true, a10h(AUJOURDHUI)));
  expect(revisions([...vu('c1000002'), ...pretestsDuJour], planning)).toEqual(['c1000002']);
});

/** La séance de test : cette file, rien de plus. */
function seanceDe(ids: string[], revenus: string[] = []) {
  const cours = leCours();
  const posables = posablesDuCours(cours);
  const parId = new Map(posables.map((p) => [p.id, p]));
  const file = ids.map((id) => {
    const p = parId.get(id);
    if (p === undefined) throw new Error(`posable inconnu : ${id}`);
    return p;
  });
  return { file, revenus, faites: 4, justes: 3 };
}

/** L'état du cours de test après ce journal. */
function etatsDe(evenements: Evenement[]) {
  return etatsDesUnites(evenements, leCours().cours.leitner);
}

const IDS = (seance: { file: { id: string }[] }) => seance.file.map(({ id }) => id);

it('avec_revisions_remplit_les_places_libres', () => {
  const dues = ['c1000001', 'c1000002', 'c1000003'];
  const etats = etatsDe(dues.flatMap((id) => vu(id, '2026-10-10')));
  const seance = seanceDe(dues);
  const aReviser = seanceDe(['c1000004', 'c1000005']).file;
  const rendue = avecRevisions(seance, aReviser, etats, hasardDeterministe(7));
  expect(IDS(rendue).sort()).toEqual(
    ['c1000001', 'c1000002', 'c1000003', 'c1000004', 'c1000005'].sort(),
  );
});

it('avec_revisions_melange_les_revisions_aux_dues', () => {
  const dues = ['c1000001', 'c1000002', 'c1000003', 'c1000004'];
  const etats = etatsDe(dues.flatMap((id) => vu(id, '2026-10-10')));
  const aReviser = seanceDe(['c1000005', 'c1000006']).file;
  const positions = new Set<number>();
  for (let graine = 1; graine <= 30; graine++) {
    const rendue = avecRevisions(seanceDe(dues), aReviser, etats, hasardDeterministe(graine));
    positions.add(IDS(rendue).indexOf('c1000005'));
  }
  // Une révision ne reste ni en fin de file ni en tête : le hasard la place parmi les dues.
  expect(positions.size).toBeGreaterThan(2);
  expect(positions.has(0)).toBe(true);
});

it('avec_revisions_les_neuves_restent_en_fin_de_file', () => {
  const dues = ['c1000001', 'c1000002'];
  const etats = etatsDe(dues.flatMap((id) => vu(id, '2026-10-10')));
  // c1000006 et c1000007 sont neuves (aucune réponse).
  const seance = seanceDe([...dues, 'c1000006', 'c1000007']);
  const aReviser = seanceDe(['c1000004', 'c1000005']).file;
  for (let graine = 1; graine <= 10; graine++) {
    const rendue = avecRevisions(seance, aReviser, etats, hasardDeterministe(graine));
    const ids = IDS(rendue);
    expect(ids.slice(0, 4).sort()).toEqual(['c1000001', 'c1000002', 'c1000004', 'c1000005']);
    expect(ids.slice(4)).toEqual(['c1000006', 'c1000007']);
  }
});

it('avec_revisions_sans_place_rend_la_seance_telle_quelle', () => {
  const cours = leCours();
  const posables = posablesDuCours(cours);
  const ids = posables.map(({ id }) => id);
  const etats = etatsDe(ids.slice(0, 22).flatMap((id) => vu(id, '2026-10-10')));
  const aReviser = seanceDe(['c2000005']).file;
  const pleine = seanceDe(ids.slice(0, TAILLE_DE_SEANCE));
  expect(avecRevisions(pleine, aReviser, etats, hasardDeterministe(1))).toBe(pleine);
  // Deux revenus allongent la file au-delà de vingt : aucune place, et non une place négative.
  const longue = seanceDe(ids.slice(0, TAILLE_DE_SEANCE + 2), ids.slice(0, 2));
  expect(avecRevisions(longue, aReviser, etats, hasardDeterministe(1))).toBe(longue);
  // Une file à dix-neuf éléments laisse une place, une seule révision entre.
  const presque = seanceDe(ids.slice(0, TAILLE_DE_SEANCE - 1));
  const deux = seanceDe(['c2000004', 'c2000005']).file;
  expect(avecRevisions(presque, deux, etats, hasardDeterministe(1)).file).toHaveLength(20);
});

it('avec_revisions_garde_revenus_faites_et_justes', () => {
  const etats = etatsDe(vu('c1000001', '2026-10-10'));
  const seance = seanceDe(['c1000001'], ['c1000001']);
  const aReviser = seanceDe(['c1000004']).file;
  const rendue = avecRevisions(seance, aReviser, etats, hasardDeterministe(3));
  expect(rendue.revenus).toEqual(['c1000001']);
  expect(rendue.faites).toBe(4);
  expect(rendue.justes).toBe(3);
  expect(IDS(rendue).sort()).toEqual(['c1000001', 'c1000004']);
});
