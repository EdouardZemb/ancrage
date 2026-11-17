import { expect, it } from 'vitest';
import type { Planning } from '../contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { pretestDeTest, reponseDeTest } from '../evenements.fixture.js';
import type { Evenement } from '../journal/evenement.js';
import { etatsDesUnites } from '../progression/etat.js';
import { statistiquesDeChapitre } from '../progression/statistiques.js';
import { unitesDuChoix } from './cartes.js';
import { posablesDuCours } from './heute.js';
import {
  etapeEnCours,
  etapesDuSemestre,
  jourAffiche,
  modulesDesPosables,
  type PlanningDuJour,
} from './semestre.js';

/* Données factices, écrites à la main (invariant 7). Les attendus sont calculés à la main. */

const REPONDU_LE_9 = '2026-10-09T10:00:00.000+02:00';
const DEPART = '2026-10-01';

const MORPHOLOGIE = 'mm000001';
const SCHEMA = 'sc000001';
const EXERCICES = 'ex000001';
const FEUILLE = 'fe000001';

function leCours() {
  return preparerCours(coursServiDeTest());
}

/** Un planning d'étapes datées : le jour, les modules, et le genre (`cours` par défaut). */
function datees(...etapes: [string, string[], ('cours' | 'revision')?][]): Planning {
  return {
    etapes: etapes.map(([seance, modules, genre]) => ({
      titre: `Woche ${seance}`,
      seance,
      genre: genre ?? 'cours',
      modules,
    })),
  };
}

/** Deux étapes relatives : la semaine 1 cite CHAPITRE_1, la semaine 2 cite CHAPITRE_2. */
const SEMAINES: Planning = {
  etapes: [
    { titre: 'Woche 1', semaine: 1, genre: 'cours', modules: [CHAPITRE_1] },
    { titre: 'Woche 2', semaine: 2, genre: 'cours', modules: [CHAPITRE_2] },
  ],
};

function lu(planning: Planning, examen?: string, depart = DEPART): PlanningDuJour {
  return { planning, depart, examen };
}

let compteur = 0;

/** Autant de réponses justes que de boîtes : l'unité arrive dans cette boîte (0 : rien). */
function enBoite(unite: string, boite: number): Evenement[] {
  return Array.from({ length: boite }, () => reponseDeTest(++compteur, unite, true, REPONDU_LE_9));
}

/** Les étapes du semestre du cours de test, pour ce journal. */
function semestre(
  planning: Planning,
  aujourdhui: string,
  evenements: Evenement[] = [],
  sens: 'mix' | 'direct' | 'inverse' = 'mix',
) {
  const cours = leCours();
  const etats = etatsDesUnites(evenements, cours.cours.leitner);
  return etapesDuSemestre(
    posablesDuCours(cours),
    modulesDesPosables(cours),
    etats,
    lu(planning),
    aujourdhui,
    sens,
  );
}

/** Toutes les unités de cartes d'un module, dans la même boîte. */
function moduleEnBoite(module: string, boite: number): Evenement[] {
  return leCours()
    .unites.filter((unite) => unite.module === module)
    .flatMap((unite) => enBoite(unite.id, boite));
}

it('modules_des_posables_cartes_mots_points_exercices_et_fiches', () => {
  const cours = leCours();
  const modules = modulesDesPosables(cours);
  expect(modules.get('c1000001')).toBe(CHAPITRE_1);
  expect(modules.get('c1000001:inverse')).toBe(CHAPITRE_1);
  expect(modules.get('c2000003')).toBe(CHAPITRE_2);
  expect(modules.get('w0000002')).toBe(MORPHOLOGIE);
  expect(modules.get('q0000003')).toBe(SCHEMA);
  expect(modules.get('e1000001')).toBe(EXERCICES);
  expect(modules.get('e2000002')).toBe(EXERCICES);
  expect(modules.get('fb000007')).toBe(FEUILLE);
  expect(modules.get('fb000009')).toBe(FEUILLE);
  // Un trou de fiche ne se pose pas seul : il n'a pas de module ici.
  expect(modules.has('fb000010')).toBe(false);
  expect(modules.has('fb000011')).toBe(false);
  for (const posable of posablesDuCours(cours)) expect(modules.has(posable.id)).toBe(true);
});

it('modules_des_posables_sans_morphologie_ni_exercices', () => {
  const servi = coursServiDeTest();
  const cours = preparerCours({
    ...servi,
    modules: servi.modules.filter((m) => m.type !== 'morphologie' && m.type !== 'exercices'),
  });
  const modules = modulesDesPosables(cours);
  expect(modules.get('c1000001')).toBe(CHAPITRE_1);
  expect(modules.get('q0000001')).toBe(SCHEMA);
  expect(modules.has('w0000001')).toBe(false);
  expect(modules.has('e1000001')).toBe(false);
});

it('etape_en_cours_la_derniere_ouverte', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-12', []], ['2026-10-20', []]);
  expect(etapeEnCours(lu(planning), '2026-10-17')).toBe(planning.etapes[1]);
});

it('etape_en_cours_le_jour_d_une_ouverture_c_est_elle', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-12', []], ['2026-10-20', []]);
  expect(etapeEnCours(lu(planning), '2026-10-19')).toBe(planning.etapes[1]);
  expect(etapeEnCours(lu(planning), '2026-10-20')).toBe(planning.etapes[2]);
});

it('etape_en_cours_deux_etapes_le_meme_jour_la_derniere_du_planning', () => {
  const planning = datees(['2026-10-12', []], ['2026-10-12', []]);
  expect(etapeEnCours(lu(planning), '2026-10-14')).toBe(planning.etapes[1]);
});

it('etape_en_cours_aucune_avant_la_premiere_ouverture', () => {
  const planning = datees(['2026-10-18', []]);
  expect(etapeEnCours(lu(planning), '2026-10-17')).toBeUndefined();
  expect(etapeEnCours(lu(planning), '2026-10-18')).toBe(planning.etapes[0]);
});

it('etape_en_cours_aucune_sept_jours_apres_la_derniere', () => {
  const planning = datees(['2026-10-10', []]);
  expect(etapeEnCours(lu(planning), '2026-10-16')).toBe(planning.etapes[0]);
  expect(etapeEnCours(lu(planning), '2026-10-17')).toBeUndefined();
});

it('etape_en_cours_relative_suit_le_depart', () => {
  const relatif = lu(SEMAINES, undefined, '2026-10-14');
  expect(etapeEnCours(relatif, '2026-10-20')).toBe(SEMAINES.etapes[0]);
  expect(etapeEnCours(relatif, '2026-10-21')).toBe(SEMAINES.etapes[1]);
  // Un autre départ décale les ouvertures : la semaine 2 s'ouvre le 28/10.
  expect(etapeEnCours(lu(SEMAINES, undefined, '2026-10-21'), '2026-10-21')).toBe(
    SEMAINES.etapes[0],
  );
});

it('etape_en_cours_un_examen_proche_ne_la_coupe_pas_avant_lui', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-25', []]);
  // L'examen du 19/10 raccourcit l'horizon du rythme, jamais l'étape.
  expect(etapeEnCours(lu(planning, '2026-10-19'), '2026-10-17')).toBe(planning.etapes[0]);
  expect(etapeEnCours(lu(planning, '2026-10-19'), '2026-10-19')).toBe(planning.etapes[0]);
});

it('etape_en_cours_le_lendemain_de_l_examen_jusqu_a_sept_jours_apres_la_derniere', () => {
  const planning = datees(['2026-10-10', []]);
  const examen = lu(planning, '2026-10-12');
  expect(etapeEnCours(examen, '2026-10-13')).toBe(planning.etapes[0]);
  expect(etapeEnCours(examen, '2026-10-16')).toBe(planning.etapes[0]);
  expect(etapeEnCours(examen, '2026-10-17')).toBeUndefined();
});

it('etape_en_cours_une_derniere_revision_dure_jusqu_a_l_examen', () => {
  const revision = datees(['2026-10-03', []], ['2026-10-17', [], 'revision']);
  const finale = revision.etapes[1];
  // L'examen du 10/11 : en cours au 24/10 (la dernière ouverture plus sept jours) et au 10/11.
  expect(etapeEnCours(lu(revision, '2026-11-10'), '2026-10-24')).toBe(finale);
  expect(etapeEnCours(lu(revision, '2026-11-10'), '2026-11-10')).toBe(finale);
  expect(etapeEnCours(lu(revision, '2026-11-10'), '2026-11-11')).toBeUndefined();
  // Un examen au 24/10 : en cours ce jour-là, qui est celui de l'examen.
  expect(etapeEnCours(lu(revision, '2026-10-24'), '2026-10-24')).toBe(finale);
  // Un examen au 20/10 : la règle commune, plus rien au 24/10.
  expect(etapeEnCours(lu(revision, '2026-10-20'), '2026-10-24')).toBeUndefined();
  // Une dernière étape de cours : la règle commune.
  const cours = datees(['2026-10-03', []], ['2026-10-17', []]);
  expect(etapeEnCours(lu(cours, '2026-11-10'), '2026-10-24')).toBeUndefined();
  // Sans examen : la règle commune.
  expect(etapeEnCours(lu(revision), '2026-10-24')).toBeUndefined();
  // Un examen avant l'horizon ne coupe pas une étape de révision avant l'horizon.
  expect(etapeEnCours(lu(revision, '2026-10-20'), '2026-10-22')).toBe(finale);
  // Une révision qui n'est pas la dernière : la règle commune.
  const milieu = datees(['2026-10-03', [], 'revision'], ['2026-10-17', []]);
  expect(etapeEnCours(lu(milieu, '2026-11-10'), '2026-10-24')).toBeUndefined();
});

it('etapes_du_semestre_dans_l_ordre_avec_leur_ouverture', () => {
  const planning = datees(['2026-10-10', [CHAPITRE_1]], ['2026-10-12', [CHAPITRE_2]]);
  const etapes = semestre(planning, '2026-10-14');
  expect(etapes.map((e) => e.etape)).toEqual(planning.etapes);
  expect(etapes[0]?.etape).toBe(planning.etapes[0]);
  expect(etapes.map((e) => e.ouverture)).toEqual(['2026-10-10', '2026-10-12']);

  const cours = leCours();
  const relatives = etapesDuSemestre(
    posablesDuCours(cours),
    modulesDesPosables(cours),
    new Map(),
    lu(SEMAINES, undefined, '2026-10-14'),
    '2026-10-14',
    'mix',
  );
  expect(relatives.map((e) => e.ouverture)).toEqual(['2026-10-14', '2026-10-21']);
});

it('etat_a_venir_puis_ouverte_le_jour_de_l_ouverture', () => {
  const planning = datees(['2026-10-10', [CHAPITRE_1]], ['2026-10-18', [CHAPITRE_2]]);
  expect(semestre(planning, '2026-10-17').map((e) => e.etat)).toEqual(['ouverte', 'a-venir']);
  expect(semestre(planning, '2026-10-18').map((e) => e.etat)).toEqual(['ouverte', 'ouverte']);
});

it('etat_sure_quand_tous_les_elements_sont_en_boite_4_ou_5', () => {
  const planning = datees(['2026-10-10', [CHAPITRE_2]]);
  const unites = leCours().unites.filter((unite) => unite.module === CHAPITRE_2);
  const [premiere, ...autres] = unites;
  const quatre = autres.flatMap((unite) => enBoite(unite.id, 4));
  const sures = semestre(planning, '2026-10-14', [...enBoite(premiere?.id ?? '', 5), ...quatre]);
  expect(sures[0]).toMatchObject({
    etat: 'sure',
    total: 10,
    sures: 10,
    boites: [0, 0, 0, 0, 9, 1],
  });

  // Une unité en boîte 3 : l'étape reste ouverte.
  const evenements = [
    ...enBoite(premiere?.id ?? '', 3),
    ...autres.flatMap((unite) => enBoite(unite.id, 4)),
  ];
  expect(semestre(planning, '2026-10-14', evenements)[0]).toMatchObject({
    etat: 'ouverte',
    sures: 9,
    boites: [0, 0, 0, 1, 9, 0],
  });
});

it('une_etape_sure_avant_son_ouverture', () => {
  const planning = datees(['2026-10-10', [CHAPITRE_1]], ['2026-10-20', [CHAPITRE_2]]);
  const etapes = semestre(planning, '2026-10-17', moduleEnBoite(CHAPITRE_2, 4));
  expect(etapes[1]?.etat).toBe('sure');
  expect(etapes[0]?.etat).toBe('ouverte');
});

it('une_etape_sans_element_n_est_jamais_sure', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-12', [], 'revision']);
  const etapes = semestre(planning, '2026-10-14');
  expect(etapes[1]).toMatchObject({
    etat: 'ouverte',
    total: 0,
    sures: 0,
    boites: [0, 0, 0, 0, 0, 0],
    retard: 0,
  });
});

it('les_cartes_dans_les_deux_sens_comme_l_uebersicht', () => {
  const planning = datees(['2026-10-10', [CHAPITRE_2]]);
  const cours = leCours();
  const directes = cours.unites
    .filter((unite) => unite.module === CHAPITRE_2 && unite.sens === 'direct')
    .flatMap((unite) => enBoite(unite.id, 4));
  const etapes = semestre(planning, '2026-10-14', directes, 'direct');
  // Les inverses comptent, quel que soit le sens choisi : l'étape n'est pas sûre.
  expect(etapes[0]).toMatchObject({ etat: 'ouverte', total: 10, sures: 5 });

  const etats = etatsDesUnites(directes, cours.cours.leitner);
  const attendu = statistiquesDeChapitre(
    unitesDuChoix(cours, CHAPITRE_2, 'mix'),
    etats,
    '2026-10-14',
  );
  expect(etapes[0]).toMatchObject({
    total: attendu.total,
    sures: attendu.sures,
    boites: attendu.boites,
  });
});

it('etapes_du_semestre_compte_les_mots_et_les_points', () => {
  const evenements = [
    ...enBoite('w0000001', 4),
    ...enBoite('q0000001', 5),
    ...enBoite('q0000002', 1),
  ];
  const planning = datees(['2026-10-10', [MORPHOLOGIE, SCHEMA]]);
  // 3 mots et 5 points : 8 éléments, dont 2 sûrs.
  expect(semestre(planning, '2026-10-14', evenements)[0]).toMatchObject({
    total: 8,
    sures: 2,
    boites: [5, 1, 0, 0, 1, 1],
  });
  // 5 exercices et 3 questions fermées de fiche : 8 éléments.
  const autre = datees(['2026-10-10', [EXERCICES, FEUILLE]]);
  expect(semestre(autre, '2026-10-14', enBoite('fb000007', 4))[0]).toMatchObject({
    total: 8,
    sures: 1,
    boites: [7, 0, 0, 0, 1, 0],
  });
});

it('retard_d_une_etape_depassee_ses_cartes_neuves_au_sens_choisi', () => {
  const planning = datees(
    ['2026-10-10', [CHAPITRE_1]],
    ['2026-10-12', [CHAPITRE_2]],
    ['2026-10-16', [MORPHOLOGIE]],
  );
  const evenements = enBoite('c2000001', 1);
  const retards = (sens: 'mix' | 'direct' | 'inverse') =>
    semestre(planning, '2026-10-16', evenements, sens).map((e) => e.retard);
  expect(retards('direct')).toEqual([8, 4, 0]);
  expect(retards('inverse')).toEqual([7, 5, 0]);
  expect(retards('mix')).toEqual([15, 9, 0]);
});

it('pas_de_retard_pour_l_etape_en_cours_ni_pour_une_etape_du_meme_jour', () => {
  const planning = datees(['2026-10-12', [CHAPITRE_1]], ['2026-10-12', [CHAPITRE_2]]);
  const etapes = semestre(planning, '2026-10-14');
  expect(etapes.map((e) => e.retard)).toEqual([0, 0]);
  expect(etapes.map((e) => e.enCours)).toEqual([false, true]);
  // Seule une étape ouverte avant elle est dépassée.
  const decalee = datees(['2026-10-10', [CHAPITRE_1]], ['2026-10-12', [CHAPITRE_2]]);
  expect(semestre(decalee, '2026-10-14').map((e) => e.retard)).toEqual([15, 0]);
});

it('le_retard_se_mesure_a_la_derniere_ouverture_meme_dans_le_desordre', () => {
  // Un planning dont les étapes ne se suivent pas par date : la dernière ouverture est le 12/10,
  // l'étape en cours est la dernière du planning (le 09/10) et n'a jamais de retard.
  const planning = datees(
    ['2026-10-12', [SCHEMA]],
    ['2026-10-10', [CHAPITRE_1]],
    ['2026-10-09', [CHAPITRE_2]],
  );
  const etapes = semestre(planning, '2026-10-14');
  expect(etapes.map((e) => e.retard)).toEqual([0, 15, 0]);
  expect(etapes.map((e) => e.enCours)).toEqual([false, false, true]);
});

it('pas_de_retard_pour_une_etape_a_venir', () => {
  const planning = datees(
    ['2026-10-10', [SCHEMA]],
    ['2026-10-12', [CHAPITRE_2]],
    ['2026-10-25', [CHAPITRE_1]],
  );
  expect(semestre(planning, '2026-10-14').map((e) => e.retard)).toEqual([0, 0, 0]);
  // Rien d'ouvert encore : rien n'est dépassé.
  const futur = datees(['2026-10-20', [CHAPITRE_1]], ['2026-10-25', [CHAPITRE_2]]);
  expect(semestre(futur, '2026-10-14').map((e) => e.retard)).toEqual([0, 0]);
});

it('un_pretest_laisse_la_carte_dans_le_retard', () => {
  const planning = datees(
    ['2026-10-10', [CHAPITRE_1]],
    ['2026-10-12', [CHAPITRE_2]],
    ['2026-10-16', [SCHEMA]],
  );
  const pretest = pretestDeTest(++compteur, 'c1000001', true, REPONDU_LE_9);
  expect(semestre(planning, '2026-10-16', [pretest], 'direct')[0]?.retard).toBe(8);
  const vue = reponseDeTest(++compteur, 'c1000002', true, REPONDU_LE_9);
  expect(semestre(planning, '2026-10-16', [pretest, vue], 'direct')[0]?.retard).toBe(7);
});

it('une_seule_etape_en_cours_et_aucune_hors_de_l_horizon', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-12', []], ['2026-10-14', []]);
  expect(semestre(planning, '2026-10-15').map((e) => e.enCours)).toEqual([false, false, true]);
  expect(semestre(planning, '2026-10-21').map((e) => e.enCours)).toEqual([false, false, false]);
});

it('jour_affiche_jj_mm_aaaa', () => {
  expect(jourAffiche('2026-10-07')).toBe('07.10.2026');
  expect(jourAffiche('2030-06-30')).toBe('30.06.2030');
});
