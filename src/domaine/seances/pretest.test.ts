import { expect, it } from 'vitest';
import type { Planning } from '../contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, carte, coursServiDeTest } from '../cours/cours.fixture.js';
import { type CoursPrepare, preparerCours } from '../cours/prepare.js';
import { pretestDeTest, reponseDeTest } from '../evenements.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import { etatsDesUnites } from '../progression/etat.js';
import {
  FENETRE_DU_PRETEST,
  pretestDuJour,
  pretestFait,
  questionsDuPretest,
  TAILLE_DU_PRETEST,
} from './pretest.js';

/* Données factices, écrites à la main (invariant 7). Les attendus sont calculés à la main. */

const AUJOURDHUI = '2026-10-17';
const A_10H = `${AUJOURDHUI}T10:00:00.000+02:00`;

/* CHAPITRE_1 : 8 cartes, `c1000001` à `c1000008`, huit versos distincts. CHAPITRE_2 : 5 cartes. */
const DIRECTES_1 = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `c100000${n}`);
const DIRECTES_2 = [1, 2, 3, 4, 5].map((n) => `c200000${n}`);

function leCours(): CoursPrepare {
  return preparerCours(coursServiDeTest());
}

/** Un cours dont le premier module de cartes (CHAPITRE_1) n'a que ces cartes. */
function coursDe(...cartes: ReturnType<typeof carte>[]): CoursPrepare {
  const base = coursServiDeTest();
  const premier = base.modules[0];
  if (premier?.type !== 'cartes') throw new Error('fixture');
  return preparerCours({ ...base, modules: [{ ...premier, cartes }] });
}

function etape(
  titre: string,
  quand: { seance: string } | { semaine: number },
  modules: string[],
  genre: 'cours' | 'revision' = 'cours',
) {
  return { titre, ...quand, genre, modules };
}

/** Un planning d'une étape datée, à `jours` jours d'aujourd'hui. */
function dans(jours: number, modules = [CHAPITRE_1]): Planning {
  const jour = `2026-10-${17 + jours}`;
  return { etapes: [etape('Woche', { seance: jour }, modules)] };
}

function propose(
  planning: Planning,
  evenements: Evenement[] = [],
  cours = leCours(),
  aujourdhui = AUJOURDHUI,
  depart = AUJOURDHUI,
) {
  const etats = etatsDesUnites(evenements, cours.cours.leitner);
  return pretestDuJour(planning, depart, aujourdhui, cours.unites, etats, evenements);
}

const idsDe = (unites: { id: string }[] | undefined) => unites?.map(({ id }) => id);

it('constantes_du_pretest', () => {
  expect(TAILLE_DU_PRETEST).toBe(5);
  expect(FENETRE_DU_PRETEST).toBe(3);
});

it('pretest_propose_deux_jours_avant_une_etape_datee', () => {
  const planning = dans(2);
  const resultat = propose(planning);
  expect(resultat?.etape).toBe(planning.etapes[0]);
  expect(idsDe(resultat?.neuves)).toStrictEqual(DIRECTES_1);
  expect(idsDe(resultat?.pool)).toStrictEqual(DIRECTES_1);
});

it('pretest_propose_de_un_a_trois_jours_avant_jamais_quatre_ni_le_jour_meme', () => {
  expect(propose(dans(0))).toBeUndefined();
  expect(propose(dans(1))).toBeDefined();
  expect(propose(dans(2))).toBeDefined();
  expect(propose(dans(3))).toBeDefined();
  expect(propose(dans(4))).toBeUndefined();
  // Une étape déjà ouverte n'en propose plus.
  expect(propose(dans(-1))).toBeUndefined();
});

it('pretest_d_une_etape_relative_sur_son_ouverture_calculee', () => {
  const planning: Planning = {
    etapes: [
      etape('Woche 1', { semaine: 1 }, [CHAPITRE_1]),
      etape('Woche 2', { semaine: 2 }, [CHAPITRE_2]),
    ],
  };
  // Parti le 14/10, la semaine 2 s'ouvre le 21/10 : à quatre jours le 17, à deux jours le 19.
  expect(propose(planning, [], leCours(), '2026-10-17', '2026-10-14')).toBeUndefined();
  const resultat = propose(planning, [], leCours(), '2026-10-19', '2026-10-14');
  expect(resultat?.etape.titre).toBe('Woche 2');
  expect(idsDe(resultat?.neuves)).toStrictEqual(DIRECTES_2);
  // La semaine 1 est ouverte dès le départ : jamais de pré-test.
  expect(propose({ etapes: [planning.etapes[0] as never] })).toBeUndefined();
});

it('pas_de_pretest_avant_une_etape_revision', () => {
  const planning: Planning = {
    etapes: [etape('Wiederholung', { seance: '2026-10-19' }, [CHAPITRE_1], 'revision')],
  };
  expect(propose(planning)).toBeUndefined();
});

it('pas_de_pretest_pour_une_etape_d_une_seule_carte', () => {
  const cours = coursDe(carte('c1000001', 'b', 'Herz', 'Organ im Brustkorb'));
  expect(propose(dans(2), [], cours)).toBeUndefined();
});

it('pas_de_pretest_quand_les_directes_n_ont_qu_une_reponse_distincte', () => {
  const cours = coursDe(
    carte('c1000001', 'b', 'Herz', 'Organ'),
    carte('c1000002', 'b', 'Leber', 'Organ'),
  );
  expect(propose(dans(2), [], cours)).toBeUndefined();
  // Avec deux versos distincts, il se propose.
  const deux = coursDe(
    carte('c1000001', 'b', 'Herz', 'Organ'),
    carte('c1000002', 'b', 'Leber', 'Drüse'),
  );
  expect(propose(dans(2), [], deux)).toBeDefined();
});

it('pas_de_pretest_sans_unite_directe_neuve', () => {
  const toutes = DIRECTES_1.map((id, i) => reponseDeTest(i + 1, id, true, A_10H));
  expect(propose(dans(2), toutes)).toBeUndefined();
  // Une seule directe neuve suffit.
  expect(idsDe(propose(dans(2), toutes.slice(1))?.neuves)).toStrictEqual(['c1000001']);
});

it('pretest_fait_des_une_reponse_pretest_a_un_de_ses_modules', () => {
  const cours = leCours();
  const premiere = dans(2).etapes[0] as Planning['etapes'][number];
  expect(pretestFait(premiere, cours.unites, [])).toBe(false);
  expect(pretestFait(premiere, cours.unites, [pretestDeTest(1, 'c1000003', false, A_10H)])).toBe(
    true,
  );
  expect(
    pretestFait(premiere, cours.unites, [pretestDeTest(1, 'c1000003:inverse', true, A_10H)]),
  ).toBe(true);
});

it('une_reponse_ordinaire_ou_un_pretest_d_une_autre_etape_ne_le_fait_pas', () => {
  const cours = leCours();
  const premiere = dans(2).etapes[0] as Planning['etapes'][number];
  expect(pretestFait(premiere, cours.unites, [reponseDeTest(1, 'c1000003', true, A_10H)])).toBe(
    false,
  );
  expect(pretestFait(premiere, cours.unites, [pretestDeTest(1, 'c2000001', true, A_10H)])).toBe(
    false,
  );
  // Une unité que le cours ne connaît pas ne le fait pas non plus.
  expect(pretestFait(premiere, cours.unites, [pretestDeTest(1, 'zzzzzzzz', true, A_10H)])).toBe(
    false,
  );
});

it('deux_etapes_dans_la_fenetre_la_premiere_qui_n_est_pas_faite', () => {
  const planning: Planning = {
    etapes: [
      etape('Woche A', { seance: '2026-10-18' }, [CHAPITRE_1]),
      etape('Woche B', { seance: '2026-10-19' }, [CHAPITRE_2]),
    ],
  };
  expect(propose(planning)?.etape.titre).toBe('Woche A');
  const faitA = [pretestDeTest(1, 'c1000001', true, A_10H)];
  expect(propose(planning, faitA)?.etape.titre).toBe('Woche B');
  const faitB = [...faitA, pretestDeTest(2, 'c2000001', true, A_10H)];
  expect(propose(planning, faitB)).toBeUndefined();
});

function questions(cours: CoursPrepare, planning: Planning, graine = 5) {
  const resultat = propose(planning, [], cours);
  if (resultat === undefined) throw new Error('pas de pré-test');
  return questionsDuPretest(resultat, cours.index, hasardDeterministe(graine));
}

it('questions_au_plus_cinq_cartes_distinctes_au_sens_direct', () => {
  const lesQuestions = questions(leCours(), dans(2));
  expect(lesQuestions).toHaveLength(5);
  expect(new Set(lesQuestions.map(({ unite }) => unite.carte)).size).toBe(5);
  for (const { unite } of lesQuestions) {
    expect(unite.sens).toBe('direct');
    expect(DIRECTES_1).toContain(unite.id);
  }
});

it('questions_moins_de_cinq_quand_l_etape_en_a_moins', () => {
  const cours = coursDe(
    carte('c1000001', 'b', 'Herz', 'Organ'),
    carte('c1000002', 'b', 'Leber', 'Drüse'),
    carte('c1000003', 'b', 'Niere', 'Filter'),
  );
  expect(questions(cours, dans(2))).toHaveLength(3);
  // Cinq cartes neuves : cinq questions, pas une de plus.
  expect(questions(leCours(), dans(2, [CHAPITRE_2]))).toHaveLength(5);
});

it('questions_options_du_pool_de_l_etape_avec_la_bonne_reponse', () => {
  const cours = coursDe(
    carte('c1000001', 'b', 'Herz', 'Organ'),
    carte('c1000002', 'b', 'Leber', 'Drüse'),
  );
  for (const { unite, options } of questions(cours, dans(2))) {
    expect(options.slice().sort()).toStrictEqual(['Drüse', 'Organ']);
    expect(options).toContain(unite.reponse);
  }
  const grand = leCours();
  const versos = new Set(grand.unites.filter((u) => u.sens === 'direct').map((u) => u.reponse));
  for (const { unite, options } of questions(grand, dans(2))) {
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain(unite.reponse);
    for (const option of options) expect(versos.has(option)).toBe(true);
  }
  // Le pool est celui de l'étape : une étape de CHAPITRE_2 ne tire pas dans CHAPITRE_1.
  const versos2 = new Set(
    grand.unites
      .filter((u) => u.module === CHAPITRE_2 && u.sens === 'direct')
      .map((u) => u.reponse),
  );
  for (const { options } of questions(grand, dans(2, [CHAPITRE_2]))) {
    for (const option of options) expect(versos2.has(option)).toBe(true);
  }
});

it('questions_meme_tirage_pour_le_meme_hasard', () => {
  const cours = leCours();
  const a = questions(cours, dans(2), 9);
  expect(questions(cours, dans(2), 9)).toStrictEqual(a);
  // Un autre hasard tire autrement : le tirage passe bien par lui.
  const autres = [1, 2, 3, 4, 5, 6, 7].map((graine) => questions(cours, dans(2), graine));
  expect(autres.some((q) => JSON.stringify(q) !== JSON.stringify(a))).toBe(true);
});
