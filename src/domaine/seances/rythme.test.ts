import { expect, it } from 'vitest';
import type { Planning } from '../contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { pretestDeTest, reponseDeTest } from '../evenements.fixture.js';
import type { Evenement } from '../journal/evenement.js';
import { etatsDesUnites } from '../progression/etat.js';
import { posablesDuCours } from './heute.js';
import {
  horizonDuRythme,
  JOURS_APRES_LA_DERNIERE_ETAPE,
  neuvesDuJour,
  rythmeDuJour,
  unitesDuPlanning,
} from './rythme.js';

/* Données factices, écrites à la main (invariant 7). Les attendus sont calculés à la main. */

const AUJOURDHUI = '2026-10-17';
const A_10H = `${AUJOURDHUI}T10:00:00.000+02:00`;
const HIER_A_10H = '2026-10-16T10:00:00.000+02:00';

/*
 * Le cours de test : CHAPITRE_1 a 15 unités (8 directes, `c1000001` à `c1000008`, et 7 inverses,
 * `c1000001:inverse` à `c1000007:inverse`), CHAPITRE_2 en a 10 (5 directes, `c2000001` à
 * `c2000005`, et 5 inverses). Chaque cours se calcule dans le test (Stryker).
 */
function leCours(plafond = 15) {
  return preparerCours({
    ...coursServiDeTest(),
    leitner: { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: plafond },
  });
}

function etape(titre: string, quand: { seance: string } | { semaine: number }, modules: string[]) {
  return { titre, ...quand, genre: 'cours' as const, modules };
}

/** Un planning d'étapes datées : le jour, les modules, et le genre (`cours` par défaut). */
function datees(...etapes: [string, string[], ('cours' | 'revision')?][]): Planning {
  return {
    etapes: etapes.map(([seance, modules, genre]) => ({
      ...etape(`Woche ${seance}`, { seance }, modules),
      genre: genre ?? 'cours',
    })),
  };
}

/** Deux étapes relatives : la semaine 1 cite CHAPITRE_1, la semaine 2 cite CHAPITRE_2. */
const SEMAINES: Planning = {
  etapes: [
    etape('Woche 1', { semaine: 1 }, [CHAPITRE_1]),
    etape('Woche 2', { semaine: 2 }, [CHAPITRE_2]),
  ],
};

/** Ce que rend `neuvesDuJour` : les identifiants des candidates et le quota. */
function neuves(
  evenements: Evenement[],
  choix: { chapitre: string | 'tous'; sens: 'mix' | 'direct' | 'inverse' },
  planning?: { planning: Planning; depart: string; examen?: string },
  plafond = 15,
) {
  const cours = leCours(plafond);
  const etats = etatsDesUnites(evenements, cours.cours.leitner);
  const resultat = neuvesDuJour(
    cours,
    posablesDuCours(cours),
    { etats, evenements, aujourdhui: AUJOURDHUI },
    choix,
    planning === undefined ? undefined : { examen: undefined, ...planning },
  );
  return { ids: resultat.candidates.map(({ id }) => id), quota: resultat.quota };
}

const TOUS = { chapitre: 'tous', sens: 'mix' } as const;

/** Un planning relatif parti le 14/10 : la semaine 2 s'ouvre le 21/10, l'horizon est à 4 jours. */
const SEMAINES_DU_14 = { planning: SEMAINES, depart: '2026-10-14' };

function u(id: string, module: string, sens: 'direct' | 'inverse') {
  return { id, module, sens };
}

const TROIS_MODULES = [
  u('a1', 'MA', 'direct'),
  u('a1:i', 'MA', 'inverse'),
  u('a2', 'MA', 'direct'),
  u('a2:i', 'MA', 'inverse'),
  u('b1', 'MB', 'direct'),
  u('b1:i', 'MB', 'inverse'),
  u('c1', 'MC', 'direct'),
  u('c1:i', 'MC', 'inverse'),
];

const idsDe = (unites: { id: string }[]) => unites.map(({ id }) => id);

it('unites_du_planning_les_etapes_ouvertes_dans_l_ordre_puis_les_modules_non_nommes', () => {
  const cours = leCours();
  // L'étape 1 cite CHAPITRE_2, l'étape 2 cite CHAPITRE_1 : CHAPITRE_2 d'abord.
  const planning = datees(['2026-10-10', [CHAPITRE_2]], ['2026-10-12', [CHAPITRE_1]]);
  const unites = unitesDuPlanning(planning, AUJOURDHUI, AUJOURDHUI, cours.unites);
  expect(unites).toHaveLength(25);
  expect(unites.slice(0, 10).every(({ module }) => module === CHAPITRE_2)).toBe(true);
  expect(unites.slice(10).every(({ module }) => module === CHAPITRE_1)).toBe(true);

  // Aucune étape ne nomme CHAPITRE_1 : il vient après CHAPITRE_2.
  const seul = datees(['2026-10-10', [CHAPITRE_2]]);
  const modules = unitesDuPlanning(seul, AUJOURDHUI, AUJOURDHUI, cours.unites).map((x) => x.module);
  expect(modules.filter((m, i) => m !== modules[i - 1])).toEqual([CHAPITRE_2, CHAPITRE_1]);
});

it('unites_du_planning_sans_les_modules_fermes', () => {
  const cours = leCours();
  // CHAPITRE_1 n'est cité que par une étape qui s'ouvre dans trois jours : il est fermé.
  const planning = datees(['2026-10-10', [CHAPITRE_2]], ['2026-10-20', [CHAPITRE_1]]);
  const unites = unitesDuPlanning(planning, AUJOURDHUI, AUJOURDHUI, cours.unites);
  expect(unites).toHaveLength(10);
  expect(unites.every(({ module }) => module === CHAPITRE_2)).toBe(true);
});

it('unites_du_planning_un_module_non_nomme_entre_deux_nommes_vient_en_dernier', () => {
  // MB, dans le cours entre MA et MC, n'est cité par aucune étape ; l'étape cite MC puis MA.
  const planning = datees(['2026-10-10', ['MC', 'MA']]);
  const rendu = unitesDuPlanning(planning, AUJOURDHUI, AUJOURDHUI, TROIS_MODULES);
  expect(idsDe(rendu)).toEqual(['c1', 'c1:i', 'a1', 'a2', 'a1:i', 'a2:i', 'b1', 'b1:i']);
});

it('unites_du_planning_garde_l_ordre_du_cours_dans_un_module', () => {
  const directes = ['x3', 'x1', 'x2'].map((id) => u(id, 'MX', 'direct'));
  const rendu = unitesDuPlanning(datees(['2026-10-10', ['MX']]), AUJOURDHUI, AUJOURDHUI, directes);
  expect(idsDe(rendu)).toEqual(['x3', 'x1', 'x2']);
});

it('unites_du_planning_les_directes_d_un_module_avant_ses_inverses', () => {
  const cours = leCours();
  const planning = datees(['2026-10-10', [CHAPITRE_1, CHAPITRE_2]]);
  const rendu = unitesDuPlanning(planning, AUJOURDHUI, AUJOURDHUI, cours.unites);
  const un = ['c1000001', 'c1000002', 'c1000003', 'c1000004', 'c1000005', 'c1000006', 'c1000007'];
  const deux = ['c2000001', 'c2000002', 'c2000003', 'c2000004', 'c2000005'];
  expect(idsDe(rendu)).toEqual([
    ...un,
    'c1000008',
    ...un.map((id) => `${id}:inverse`),
    ...deux,
    ...deux.map((id) => `${id}:inverse`),
  ]);
});

it('unites_du_planning_une_etape_revision_ouvre_ses_modules', () => {
  const planning = datees(['2026-10-10', ['MA']], ['2026-10-17', ['MC'], 'revision']);
  const rendu = unitesDuPlanning(planning, AUJOURDHUI, AUJOURDHUI, TROIS_MODULES);
  expect(idsDe(rendu)).toEqual(['a1', 'a2', 'a1:i', 'a2:i', 'c1', 'c1:i', 'b1', 'b1:i']);
});

it('unites_du_planning_le_rang_vient_des_etapes_ouvertes_et_de_leur_premiere_citation', () => {
  // L'étape 1, fermée, cite MC avant l'étape 2, ouverte, qui cite MB puis MC : MB avant MC.
  const fermee = datees(['2026-10-20', ['MC']], ['2026-10-10', ['MB', 'MC']]);
  expect(idsDe(unitesDuPlanning(fermee, AUJOURDHUI, AUJOURDHUI, TROIS_MODULES))).toEqual([
    'b1',
    'b1:i',
    'c1',
    'c1:i',
    'a1',
    'a2',
    'a1:i',
    'a2:i',
  ]);
  // MA est citée par deux étapes ouvertes : elle garde le rang de la première.
  const doublon = datees(['2026-10-10', ['MA', 'MB']], ['2026-10-12', ['MC', 'MA']]);
  expect(idsDe(unitesDuPlanning(doublon, AUJOURDHUI, AUJOURDHUI, TROIS_MODULES))).toEqual([
    'a1',
    'a2',
    'a1:i',
    'a2:i',
    'b1',
    'b1:i',
    'c1',
    'c1:i',
  ]);
});

it('unites_du_planning_vide_quand_tout_est_ferme', () => {
  const cours = leCours();
  const planning = datees(['2026-10-18', [CHAPITRE_1, CHAPITRE_2]]);
  expect(unitesDuPlanning(planning, AUJOURDHUI, AUJOURDHUI, cours.unites)).toEqual([]);
});

it('horizon_la_prochaine_ouverture_datee', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-20', []], ['2026-10-25', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, undefined)).toBe('2026-10-20');
});

it('horizon_la_prochaine_ouverture_relative', () => {
  // Départ le 14/10 : les semaines 1, 2 et 3 s'ouvrent les 14, 21 et 28.
  const planning: Planning = {
    etapes: [1, 2, 3].map((n) => etape(`Woche ${n}`, { semaine: n }, [])),
  };
  expect(horizonDuRythme(planning, '2026-10-14', AUJOURDHUI, undefined)).toBe('2026-10-21');
});

it('horizon_le_jour_d_une_ouverture_c_est_la_suivante', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-17', []], ['2026-10-24', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, undefined)).toBe('2026-10-24');
});

it('horizon_deux_etapes_le_meme_jour', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-20', []], ['2026-10-20', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, undefined)).toBe('2026-10-20');
});

it('horizon_apres_la_derniere_ouverture_sept_jours', () => {
  expect(JOURS_APRES_LA_DERNIERE_ETAPE).toBe(7);
  const planning = datees(['2026-10-01', []], ['2026-10-12', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, undefined)).toBe('2026-10-19');
  // La dernière ouverture, même dans le désordre, est la plus tardive.
  const desordre = datees(['2026-10-12', []], ['2026-10-01', []]);
  expect(horizonDuRythme(desordre, AUJOURDHUI, AUJOURDHUI, undefined)).toBe('2026-10-19');
});

it('horizon_une_etape_revision_compte', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-19', [], 'revision'], ['2026-10-24', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, undefined)).toBe('2026-10-19');
});

it('horizon_l_examen_avant_la_prochaine_ouverture', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-24', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, '2026-10-20')).toBe('2026-10-20');
  // Après la dernière ouverture (le 12/10, soit un horizon au 19/10) : l'examen borne aussi.
  const derniere = datees(['2026-10-12', []]);
  expect(horizonDuRythme(derniere, AUJOURDHUI, AUJOURDHUI, '2026-10-18')).toBe('2026-10-18');
});

it('horizon_l_examen_d_aujourd_hui_ou_passe_ne_compte_pas', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-24', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, '2026-10-17')).toBe('2026-10-24');
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, '2026-10-16')).toBe('2026-10-24');
});

it('horizon_l_examen_apres_l_horizon_ne_compte_pas', () => {
  const planning = datees(['2026-10-10', []], ['2026-10-24', []]);
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, '2026-10-30')).toBe('2026-10-24');
  // Le même jour que l'horizon : rien ne change.
  expect(horizonDuRythme(planning, AUJOURDHUI, AUJOURDHUI, '2026-10-24')).toBe('2026-10-24');
});

it('rythme_arrondi_vers_le_haut', () => {
  // 18 cartes sur 7 jours (17/10 au 24/10) : 2,57, soit 3.
  expect(rythmeDuJour(18, AUJOURDHUI, '2026-10-24', 15)).toBe(3);
});

it('rythme_quotient_exact', () => {
  expect(rythmeDuJour(14, AUJOURDHUI, '2026-10-24', 15)).toBe(2);
});

it('rythme_une_carte_au_moins_tant_qu_il_en_reste', () => {
  expect(rythmeDuJour(1, AUJOURDHUI, '2026-10-24', 15)).toBe(1);
});

it('rythme_nul_sans_carte', () => {
  expect(rythmeDuJour(0, AUJOURDHUI, '2026-10-24', 15)).toBe(0);
});

it('rythme_horizon_passe_vaut_un_jour', () => {
  expect(rythmeDuJour(5, AUJOURDHUI, '2026-10-16', 15)).toBe(5);
  // Un horizon d'aujourd'hui, et de demain : de même.
  expect(rythmeDuJour(5, AUJOURDHUI, AUJOURDHUI, 15)).toBe(5);
  expect(rythmeDuJour(5, AUJOURDHUI, '2026-10-18', 15)).toBe(5);
});

it('rythme_borne_par_le_plafond', () => {
  expect(rythmeDuJour(100, AUJOURDHUI, '2026-10-19', 15)).toBe(15);
  // Au plafond exactement : 30 sur 2 jours, c'est 15 ; 28 sur 2 jours, c'est 14.
  expect(rythmeDuJour(30, AUJOURDHUI, '2026-10-19', 15)).toBe(15);
  expect(rythmeDuJour(28, AUJOURDHUI, '2026-10-19', 15)).toBe(14);
});

it('neuves_du_jour_sans_planning_comme_avant', () => {
  // Une carte de CHAPITRE_1 découverte aujourd'hui : le plafond baisse d'une, quel que soit le choix.
  const journal = [reponseDeTest(1, 'c1000001', true, A_10H)];
  const tous = neuves(journal, TOUS);
  expect(tous.quota).toBe(14);
  // Les cartes neuves du choix, dans l'ordre du cours : 25 unités moins la découverte.
  expect(tous.ids).toHaveLength(24);
  expect(tous.ids[0]).toBe('c1000001:inverse');
  const un = neuves(journal, { chapitre: CHAPITRE_1, sens: 'mix' });
  expect(un).toEqual({ quota: 14, ids: tous.ids.filter((id) => id.startsWith('c1')) });
  expect(un.ids).toHaveLength(14);
  const deux = neuves(journal, { chapitre: CHAPITRE_2, sens: 'mix' });
  expect(deux).toEqual({ quota: 14, ids: tous.ids.filter((id) => id.startsWith('c2')) });
  expect(deux.ids).toHaveLength(10);
});

it('neuves_du_jour_sans_planning_le_sens_choisi_filtre', () => {
  const direct = neuves([], { chapitre: CHAPITRE_2, sens: 'direct' });
  expect(direct).toEqual({
    quota: 15,
    ids: ['c2000001', 'c2000002', 'c2000003', 'c2000004', 'c2000005'],
  });
});

it('neuves_du_jour_avec_planning_coupe_au_quota_dans_l_ordre', () => {
  // CHAPITRE_1 seul est ouvert (15 unités), l'horizon est le 21/10 : 4 jours, 15/4 → 4.
  expect(neuves([], TOUS, SEMAINES_DU_14)).toEqual({
    quota: 4,
    ids: ['c1000001', 'c1000002', 'c1000003', 'c1000004'],
  });
});

it('neuves_du_jour_au_sens_choisi', () => {
  // Les directes de CHAPITRE_1 : 8 sur 4 jours, 2 par jour.
  expect(neuves([], { chapitre: 'tous', sens: 'direct' }, SEMAINES_DU_14)).toEqual({
    quota: 2,
    ids: ['c1000001', 'c1000002'],
  });
  // Les inverses : 7 sur 4 jours, 2 par jour.
  expect(neuves([], { chapitre: 'tous', sens: 'inverse' }, SEMAINES_DU_14)).toEqual({
    quota: 2,
    ids: ['c1000001:inverse', 'c1000002:inverse'],
  });
  // Le chapitre choisi ne joue pas : CHAPITRE_2 est fermé, le choix donne les mêmes neuves.
  expect(neuves([], { chapitre: CHAPITRE_2, sens: 'direct' }, SEMAINES_DU_14)).toEqual({
    quota: 2,
    ids: ['c1000001', 'c1000002'],
  });
});

it('neuves_du_jour_les_decouvertes_du_planning_ne_changent_pas_le_rythme', () => {
  // Deux cartes découvertes aujourd'hui : R = 13 neuves + 2 découvertes = 15, rythme 4 ; quota 4 - 2.
  const journal = ['c1000001', 'c1000002'].map((id, i) => reponseDeTest(i + 1, id, true, A_10H));
  expect(neuves(journal, TOUS, SEMAINES_DU_14)).toEqual({
    quota: 2,
    ids: ['c1000003', 'c1000004'],
  });
});

it('neuves_du_jour_une_decouverte_hors_planning_ne_pese_que_sur_le_plafond', () => {
  // Plafond 5, rythme 4. Trois cartes de CHAPITRE_2 (fermé) découvertes : 5 - 3 = 2 sous le rythme.
  const decouvertes = ['c2000001', 'c2000002', 'c2000003'].map((id, i) =>
    reponseDeTest(i + 1, id, true, A_10H),
  );
  expect(neuves(decouvertes, TOUS, SEMAINES_DU_14, 5).quota).toBe(2);
  // Une seule : 5 - 1 = 4, le rythme est atteint, rien ne baisse.
  expect(neuves(decouvertes.slice(0, 1), TOUS, SEMAINES_DU_14, 5).quota).toBe(4);
  // Aucune : le rythme (4) seul.
  expect(neuves([], TOUS, SEMAINES_DU_14, 5).quota).toBe(4);
  // Plafond haut : les trois découvertes n'entrent pas dans le rythme, qui reste 4.
  expect(neuves(decouvertes, TOUS, SEMAINES_DU_14, 100).quota).toBe(4);
});

it('neuves_du_jour_quota_jamais_negatif', () => {
  // Les découvertes du jour dépassent le plafond : 7 cartes de CHAPITRE_2, plafond 5.
  const hors = ['c2000001', 'c2000002', 'c2000003', 'c2000004'].flatMap((id, i) => [
    reponseDeTest(2 * i + 1, id, true, A_10H),
    reponseDeTest(2 * i + 2, `${id}:inverse`, true, A_10H),
  ]);
  expect(neuves(hors.slice(0, 7), TOUS, SEMAINES_DU_14, 5)).toEqual({ quota: 0, ids: [] });
  // Les découvertes du planning dépassent le rythme : 6 cartes de CHAPITRE_1, rythme 4.
  const dedans = ['c1000001', 'c1000002', 'c1000003', 'c1000004', 'c1000005', 'c1000006'].map(
    (id, i) => reponseDeTest(i + 1, id, true, A_10H),
  );
  expect(neuves(dedans, TOUS, SEMAINES_DU_14)).toEqual({ quota: 0, ids: [] });
});

it('neuves_du_jour_le_retard_d_une_etape_passe_en_tete', () => {
  // L'étape 1 (10/10) cite CHAPITRE_1, l'étape 2 (16/10) CHAPITRE_2, l'étape 3, de révision, s'ouvre
  // le 23/10 : 6 jours. R = 25, 25/6 → 5, toutes de CHAPITRE_1 (le retard d'abord).
  const planning = datees(
    ['2026-10-10', [CHAPITRE_1]],
    ['2026-10-16', [CHAPITRE_2]],
    ['2026-10-23', [], 'revision'],
  );
  expect(neuves([], TOUS, { planning, depart: '2026-10-10' })).toEqual({
    quota: 5,
    ids: ['c1000001', 'c1000002', 'c1000003', 'c1000004', 'c1000005'],
  });
});

it('neuves_du_jour_derniere_etape_horizon_de_sept_jours', () => {
  // Dernière ouverture le 12/10 : horizon le 19/10, 2 jours. R = 25, 25/2 → 13.
  const planning = datees(['2026-10-09', [CHAPITRE_1]], ['2026-10-12', [CHAPITRE_2]]);
  const rendu = neuves([], TOUS, { planning, depart: '2026-10-09' });
  expect(rendu.quota).toBe(13);
  expect(rendu.ids).toHaveLength(13);
});

it('neuves_du_jour_horizon_d_aujourd_hui_donne_un_jour_et_le_plafond_borne', () => {
  // Une seule étape, passée le 10/10 : horizon le 17/10, J = 1. R = 25, plafond 15.
  const planning = datees(['2026-10-10', [CHAPITRE_1, CHAPITRE_2]]);
  const rendu = neuves([], TOUS, { planning, depart: '2026-10-10' });
  expect(rendu.quota).toBe(15);
  expect(rendu.ids).toHaveLength(15);
});

it('neuves_du_jour_les_modules_non_nommes_comptent_des_le_premier_jour', () => {
  // Aucune étape ne nomme CHAPITRE_1 : R = 10 + 15 = 25 sur 4 jours (17/10 au 21/10), soit 7. Les
  // sept premières : les 5 directes de CHAPITRE_2, puis ses 2 premières inverses.
  const planning: Planning = {
    etapes: [
      etape('Woche 1', { semaine: 1 }, [CHAPITRE_2]),
      etape('Woche 2', { semaine: 2 }, [CHAPITRE_2]),
    ],
  };
  expect(neuves([], TOUS, { planning, depart: '2026-10-14' })).toEqual({
    quota: 7,
    ids: [
      'c2000001',
      'c2000002',
      'c2000003',
      'c2000004',
      'c2000005',
      'c2000001:inverse',
      'c2000002:inverse',
    ],
  });
});

it('neuves_du_jour_l_examen_borne_l_horizon', () => {
  // L'examen le 19/10, avant la semaine 2 (21/10) : 2 jours. R = 15, 15/2 → 8.
  const rendu = neuves([], TOUS, { ...SEMAINES_DU_14, examen: '2026-10-19' });
  expect(rendu.quota).toBe(8);
  expect(rendu.ids).toHaveLength(8);
});

it('neuves_du_jour_un_pretest_ne_change_rien', () => {
  const sans = [reponseDeTest(1, 'c1000008', true, HIER_A_10H)];
  const avec = [
    ...sans,
    pretestDeTest(2, 'c1000001', false, HIER_A_10H),
    pretestDeTest(3, 'c1000002', true, A_10H),
    pretestDeTest(4, 'c2000001', true, A_10H),
  ];
  expect(neuves(avec, TOUS, SEMAINES_DU_14)).toEqual(neuves(sans, TOUS, SEMAINES_DU_14));
  expect(neuves(avec, TOUS)).toEqual(neuves(sans, TOUS));
});

it('neuves_du_jour_une_unite_absente_des_posables_n_est_pas_candidate', () => {
  const cours = leCours();
  const posables = posablesDuCours(cours).filter(({ id }) => id !== 'c1000002');
  const evenements: Evenement[] = [];
  const etats = etatsDesUnites(evenements, cours.cours.leitner);
  const rendu = neuvesDuJour(cours, posables, { etats, evenements, aujourdhui: AUJOURDHUI }, TOUS, {
    ...SEMAINES_DU_14,
    examen: undefined,
  });
  expect(rendu.candidates.map(({ id }) => id)).toEqual([
    'c1000001',
    'c1000003',
    'c1000004',
    'c1000005',
  ]);
});
