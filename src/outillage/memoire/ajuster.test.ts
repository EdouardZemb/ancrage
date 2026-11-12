import { dateChrono, defineScheduler, Rating } from 'ts-fsrs';
import {
  schedulerDesiredRetentionMiddleware,
  schedulerScheduledDaysMiddleware,
} from 'ts-fsrs/middlewares';
import { FSRS6_DEFAULT_WEIGHTS, FSRS6Model, forgettingCurve } from 'ts-fsrs/models/fsrs-6';
import { expect, test } from 'vitest';
import { revuesDuJournal } from '../../domaine/progression/fsrs.js';
import { poidsFsrsValides } from '../../domaine/progression/reglages.js';
import {
  ajuster,
  elementsDEntrainement,
  MINIMUM_DE_REVUES,
  probabilitesPredites,
  qualiteDe,
} from './ajuster.js';
import {
  journalSimule,
  POIDS_EXTREMES,
  POIDS_SIMULES,
  reponseInventee,
} from './ecrire-journal.fixture.js';

test('les_revues_du_meme_jour_sont_donnees_a_l_optimiseur_a_zero_jour_d_ecart', () => {
  const matin = Date.UTC(2026, 0, 5, 10);
  const jour = 86_400_000;
  // Une unité : un premier jour (trois réponses), puis deux jours plus tard une quatrième.
  const journal = [
    reponseInventee(matin, 0, 'm0000001', true),
    reponseInventee(matin + 60_000, 1, 'm0000001', false),
    reponseInventee(matin + 120_000, 2, 'm0000001', true),
    reponseInventee(matin + 2 * jour, 3, 'm0000001', true),
  ];
  const elements = elementsDEntrainement([journal]);
  // Un élément par révision après la première : chacun porte tout l'historique de l'unité.
  expect(elements).toHaveLength(3);
  expect(elements.map((e) => e.reviews.map((r) => [r.rating, r.deltaT]))).toEqual([
    [
      [3, 0],
      [1, 0],
    ],
    [
      [3, 0],
      [1, 0],
      [3, 0],
    ],
    [
      [3, 0],
      [1, 0],
      [3, 0],
      [3, 2],
    ],
  ]);
  // Le rejeu lit la même suite.
  expect(revuesDuJournal(journal)[0]?.justes).toEqual([true, false, true, true]);
});

test('la_probabilite_predite_est_celle_du_rejeu', () => {
  const journal = journalSimule({ unites: 30, passages: 8, graine: 11, poids: POIDS_SIMULES });
  const suites = revuesDuJournal(journal);
  const planificateur = defineScheduler({
    model: FSRS6Model,
    chrono: dateChrono,
  })
    .use(schedulerDesiredRetentionMiddleware)
    .use(schedulerScheduledDaysMiddleware)
    .create({
      config: {
        weights: [...POIDS_SIMULES],
        enableShortTerm: false,
        numRelearningSteps: 0,
        desiredRetention: 0.9,
      },
    });
  const attendues: number[] = [];
  for (const { jours, justes } of suites) {
    let carte: ReturnType<typeof planificateur.newCard> | undefined;
    jours.forEach((jour, rang) => {
      const maintenant = new Date(`${jour}T12:00:00.000Z`);
      const ecart =
        rang === 0
          ? 0
          : Math.round(
              (maintenant.getTime() - new Date(`${jours[rang - 1]}T12:00:00.000Z`).getTime()) /
                86_400_000,
            );
      if (carte !== undefined && ecart > 0) {
        attendues.push(forgettingCurve(POIDS_SIMULES[20] as number, ecart, carte.stability));
      }
      carte = planificateur.review({
        card: carte ?? planificateur.newCard({ now: maintenant }),
        grade: justes[rang] === true ? Rating.Good : Rating.Again,
        now: maintenant,
      }).card;
    });
  }
  const predites = probabilitesPredites(POIDS_SIMULES, suites).map((p) => p.probabilite);
  expect(predites).toHaveLength(attendues.length);
  predites.forEach((p, i) => {
    expect(p).toBeCloseTo(attendues[i] as number, 8);
  });
});

test('une_qualite_range_chaque_revue_dans_sa_tranche', () => {
  const journal = journalSimule({ unites: 40, passages: 6, graine: 12, poids: POIDS_SIMULES });
  const qualite = qualiteDe(POIDS_SIMULES, [journal]);
  expect(qualite.tranches).toHaveLength(10);
  expect(qualite.tranches.reduce((somme, t) => somme + t.revues, 0)).toBe(qualite.revues);
  expect(qualite.tranches[0]).toMatchObject({ de: 0, a: 10 });
  expect(qualite.tranches[9]).toMatchObject({ de: 90, a: 100 });
  expect(qualite.perte).toBeGreaterThan(0);
  expect(qualite.perte).toBeLessThan(Math.LN2 + 0.2);
});

test('un_journal_trop_court_n_est_pas_ajuste', async () => {
  const journal = journalSimule({ unites: 30, passages: 8, graine: 13, poids: POIDS_SIMULES });
  const resultat = await ajuster([journal]);
  expect(resultat.ajuste).toBe(false);
  expect(resultat.revues).toBeGreaterThan(0);
  expect(resultat.revues).toBeLessThan(MINIMUM_DE_REVUES);
  expect(resultat).not.toHaveProperty('parametres');
});

test('l_ajustement_sur_un_journal_simule_baisse_la_perte_et_rend_21_poids_valides', async () => {
  // Deux personnes, une mémoire loin des poids par défaut : l'ajustement doit s'en rapprocher.
  const journaux = [
    journalSimule({ unites: 330, passages: 9, graine: 21, poids: POIDS_SIMULES }),
    journalSimule({ unites: 330, passages: 9, graine: 22, poids: POIDS_SIMULES }),
  ];
  const resultat = await ajuster(journaux);
  if (!resultat.ajuste) throw new Error('le journal simulé devait suffire');
  expect(resultat.revues).toBeGreaterThanOrEqual(MINIMUM_DE_REVUES);
  const { parametres, avant, apres } = resultat;
  expect(parametres).toHaveLength(21);
  expect(poidsFsrsValides(parametres)).toBe(true);
  for (const poids of parametres) {
    expect(Math.round(poids * 1e4) / 1e4).toBe(poids);
  }
  expect(avant.perte).toBeGreaterThan(apres.perte + 0.05);
  expect(avant.revues).toBe(apres.revues);
  // Les poids par défaut sont bien ceux de « avant ».
  expect(qualiteDe(FSRS6_DEFAULT_WEIGHTS, journaux).perte).toBeCloseTo(avant.perte, 10);
  // La mémoire simulée est celle d'après : la perte ajustée n'en est pas loin.
  expect(apres.perte).toBeLessThan(qualiteDe(POIDS_SIMULES, journaux).perte + 0.02);
}, 60_000);

test('un_poids_que_l_optimiseur_rend_sous_la_borne_du_modele_est_ramene_dedans', async () => {
  const journaux = [
    journalSimule({ unites: 330, passages: 9, graine: 21, poids: POIDS_EXTREMES }),
    journalSimule({ unites: 330, passages: 9, graine: 22, poids: POIDS_EXTREMES }),
  ];
  const resultat = await ajuster(journaux);
  if (!resultat.ajuste) throw new Error('le journal simulé devait suffire');
  expect(poidsFsrsValides(resultat.parametres)).toBe(true);
  expect(resultat.parametres[0]).toBeGreaterThanOrEqual(0.001);
  expect(resultat.apres.perte).toBeLessThan(resultat.avant.perte);
}, 60_000);
