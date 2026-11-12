import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { coursDExemple } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import type { ReussiteObservee } from './mesures.js';
import { moyenneDeProjections, type OptionsDeProjection, projeter } from './projection.js';

const leitner = coursDExemple();
const ID_DU_COURS = leitner.cours.id;
const A = 'xyv4pn7g';

const TOUT_JUSTE: ReussiteObservee = {
  premiere: 1,
  memeJour: 1,
  parBoite: [1, 1, 1, 1, 1, 1],
};
const TOUT_FAUX: ReussiteObservee = {
  premiere: 0,
  memeJour: 0,
  parBoite: [0, 0, 0, 0, 0, 0],
};

function options(en: Partial<OptionsDeProjection> = {}): OptionsDeProjection {
  return {
    aujourdhui: '2026-03-01',
    jusquau: '2026-04-10',
    nouvellesParJour: 10,
    algorithme: 'leitner',
    graine: 7,
    reussite: TOUT_JUSTE,
    ...en,
  };
}

function reponse(jour: number, mois: number, rang: number, juste: boolean): Evenement {
  return reponseInventee(Date.UTC(2026, mois - 1, jour, 10), rang, A, juste, ID_DU_COURS);
}

test('la_charge_de_leitner_se_compte_a_la_main_quand_tout_est_juste', () => {
  const p = projeter([], leitner, options());
  // 80 éléments, 10 nouveaux par jour, intervalles 0, 1, 2, 4, 8, 16. Jour 0 : 10 nouveaux ;
  // jour 1 : leurs 10 retours et 10 nouveaux ; jour 2 : les retours des nouveaux de la veille ;
  // jour 3 : les retours du jour 0 (boîte 2) et du jour 2 (boîte 1), et 10 nouveaux.
  expect(p.chargeParJour.slice(0, 4)).toEqual([10, 20, 20, 30]);
  // Les 80 éléments sont vus en huit jours : du 1er au 8e jour.
  expect(p.jourToutVu).toBe('2026-03-08');
  expect(p.partVue).toBe(1);
  expect(p.partSure).toBe(1);
  expect(p.jours).toBe(40);
});

test('une_faute_se_redonne_une_fois_le_meme_jour_et_compte_deux_reponses', () => {
  const p = projeter([], leitner, options({ reussite: TOUT_FAUX }));
  // Chaque première réponse est fausse, puis sa reprise du jour : 20 réponses pour 10 nouveaux.
  expect(p.chargeParJour[0]).toBe(20);
  // Le lendemain, les 10 premiers reviennent (deux réponses chacun) et 10 autres arrivent.
  expect(p.chargeParJour[1]).toBe(40);
  expect(p.partSure).toBe(0);
});

test('la_projection_part_de_l_etat_du_jour_du_journal', () => {
  const journal = [reponse(5, 1, 1, true), reponse(6, 1, 2, true)];
  const p = projeter(
    journal,
    leitner,
    options({
      aujourdhui: '2026-01-08',
      jusquau: '2026-01-15',
      nouvellesParJour: 0,
    }),
  );
  // A, en boîte 2 et échue le 08, revient le 08 (boîte 3, échue le 12), puis le 12.
  expect(p.chargeParJour).toEqual([1, 0, 0, 0, 1, 0, 0]);
  expect(p.partVue).toBe(1 / 80);
});

test('la_charge_se_resume_par_semaine', () => {
  const p = projeter([], leitner, options());
  const premiere = p.chargeParJour.slice(0, 7);
  expect(p.parSemaine[0]).toEqual({
    debut: '2026-03-01',
    moyenne: premiere.reduce((a, b) => a + b, 0) / 7,
  });
  expect(p.parSemaine).toHaveLength(6);
  expect(p.parSemaine[1]?.debut).toBe('2026-03-08');
  const dernierePart = p.chargeParJour.slice(35);
  expect(p.parSemaine[5]?.moyenne).toBe(dernierePart.reduce((a, b) => a + b, 0) / 5);
  expect(p.chargeMoyenne).toBe(p.chargeParJour.reduce((a, b) => a + b, 0) / 40);
});

test('la_meme_graine_rend_la_meme_projection', () => {
  const reussite: ReussiteObservee = {
    premiere: 0.7,
    memeJour: 0.6,
    parBoite: [0, 0.6, 0.7, 0.8, 0.9, 0.95],
  };
  const un = projeter([], leitner, options({ reussite, graine: 3 }));
  const deux = projeter([], leitner, options({ reussite, graine: 3 }));
  const autre = projeter([], leitner, options({ reussite, graine: 4 }));
  expect(deux).toEqual(un);
  expect(autre.chargeParJour).not.toEqual(un.chargeParJour);
});

test('sans_nouveaute_ni_journal_il_n_y_a_rien_a_faire', () => {
  const p = projeter([], leitner, options({ nouvellesParJour: 0 }));
  expect(p.chargeMoyenne).toBe(0);
  expect(p.jourToutVu).toBeNull();
  expect(p.partVue).toBe(0);
});

test('un_jour_d_examen_deja_passe_ne_donne_aucune_charge', () => {
  const p = projeter([], leitner, options({ jusquau: '2026-03-01' }));
  expect(p.jours).toBe(0);
  expect(p.chargeParJour).toEqual([]);
  expect(p.parSemaine).toEqual([]);
});

const fsrs = coursDExemple({ algorithme: 'fsrs', retention: 0.9 });

test('fsrs_part_du_journal_rejoue_et_projette_a_la_retention_visee', () => {
  const journal = [reponse(20, 2, 1, true)];
  // Le 20/02, une première réponse juste : à la fin de la semaine elle est due.
  const dueLe = projeter(
    journal,
    fsrs,
    options({ algorithme: 'fsrs', aujourdhui: '2026-03-01', nouvellesParJour: 0 }),
  );
  expect(dueLe.chargeParJour[0]).toBeGreaterThanOrEqual(1);
  const pasDue = projeter(
    journal,
    fsrs,
    options({
      algorithme: 'fsrs',
      aujourdhui: '2026-02-20',
      jusquau: '2026-02-21',
      nouvellesParJour: 0,
    }),
  );
  expect(pasDue.chargeParJour).toEqual([0]);
});

test('fsrs_decouvre_le_cours_dans_l_ordre_et_le_projette_sur_le_meme_tirage', () => {
  const un = projeter([], fsrs, options({ algorithme: 'fsrs', graine: 5 }));
  const deux = projeter([], fsrs, options({ algorithme: 'fsrs', graine: 5 }));
  expect(deux).toEqual(un);
  expect(un.jourToutVu).toBe('2026-03-08');
  expect(un.partVue).toBe(1);
  expect(un.partSure).toBeGreaterThan(0);
  expect(un.partSure).toBeLessThanOrEqual(1);
  // La charge du premier jour : 10 nouveaux, plus leurs reprises, au plus 20.
  expect(un.chargeParJour[0]).toBeGreaterThanOrEqual(10);
  expect(un.chargeParJour[0]).toBeLessThanOrEqual(20);
});

test('une_retention_plus_basse_demande_moins_de_revisions_que_la_retention_haute', () => {
  const basse = coursDExemple({ algorithme: 'fsrs', retention: 0.8 });
  const haute = coursDExemple({ algorithme: 'fsrs', retention: 0.95 });
  const chargeBasse = projeter([], basse, options({ algorithme: 'fsrs' })).chargeMoyenne;
  const chargeHaute = projeter([], haute, options({ algorithme: 'fsrs' })).chargeMoyenne;
  expect(chargeBasse).toBeLessThan(chargeHaute);
});

test('la_moyenne_de_deux_projections_est_la_charge_par_personne', () => {
  const un = projeter([], leitner, options({ nouvellesParJour: 10 }));
  const autre = projeter([], leitner, options({ nouvellesParJour: 20 }));
  const moyenne = moyenneDeProjections([un, autre]);
  expect(moyenne.chargeParJour[0]).toBe(15);
  expect(moyenne.chargeMoyenne).toBe((un.chargeMoyenne + autre.chargeMoyenne) / 2);
  expect(moyenne.parSemaine).toHaveLength(un.parSemaine.length);
  // 10 par jour voient tout le cours le 08/03, 20 par jour le 04/03 : la dernière personne fait foi.
  expect(moyenne.jourToutVu).toBe('2026-03-08');
  expect(moyenneDeProjections([un])).toEqual(un);
  const jamais = projeter([], leitner, options({ nouvellesParJour: 0 }));
  expect(moyenneDeProjections([un, jamais]).jourToutVu).toBeNull();
});
