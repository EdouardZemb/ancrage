import { expect, it } from 'vitest';
import { journalInvente } from './journal-invente.js';
import { mediane, medianeDuRejeu, mesurerLaTaille } from './mesure-rejeu.js';

it('la_mediane_d_un_nombre_impair_est_la_valeur_du_milieu', () => {
  expect(mediane([9, 1, 5, 3, 7])).toBe(5);
});

it('la_mediane_d_un_nombre_pair_est_la_moyenne_des_deux_du_milieu', () => {
  expect(mediane([4, 1, 2, 3])).toBe(2.5);
});

it('la_mediane_du_rejeu_vient_de_l_horloge_injectee_et_rejoue_a_chaque_fois', () => {
  // Chaque rejeu lit l'horloge deux fois : au départ, puis à l'arrivée.
  const durees = [50, 10, 30];
  const lectures: number[] = [];
  let instant = 0;
  for (const duree of durees) {
    lectures.push(instant, instant + duree);
    instant += 1000;
  }
  let rang = 0;
  let rejeux = 0;

  const resultat = medianeDuRejeu(
    () => {
      rejeux++;
      return new Map();
    },
    [],
    3,
    () => lectures[rang++] as number,
  );

  expect(resultat).toBe(30);
  expect(rejeux).toBe(3);
});

it('la_mesure_d_une_taille_rend_une_duree_par_algorithme_sans_lire_l_horloge_reelle', () => {
  let t = 0;
  const maintenant = () => {
    t += 2;
    return t;
  };

  const resultat = mesurerLaTaille(200, { unites: 20, graine: 1, repetitions: 5, maintenant });

  expect(resultat).toEqual({ leitner: 2, fsrs: 2, 'par-chapitre': 2 });
});

it('le_journal_mesure_est_celui_de_la_graine', () => {
  const vus: number[] = [];
  mesurerLaTaille(150, {
    unites: 10,
    graine: 4,
    repetitions: 1,
    maintenant: () => 0,
    surJournal: (journal) => vus.push(journal.length),
  });

  expect(vus).toEqual([150]);
  expect(journalInvente(150, 10, 4)).toHaveLength(150);
});
