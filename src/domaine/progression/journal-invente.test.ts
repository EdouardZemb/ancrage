import { expect, it } from 'vitest';
import { FORMAT_IDENTIFIANT } from '../contenu/identifiants.js';
import { schemaEvenement } from '../journal/evenement.js';
import { jourDe } from '../journal/temps.js';
import {
  CHAPITRE_INVENTE,
  COURS_INVENTE,
  chapitreInvente,
  DERNIER_JOUR_INVENTE,
  journalInvente,
} from './journal-invente.js';

it('le_meme_journal_pour_la_meme_graine', () => {
  expect(journalInvente(300, 20, 7)).toEqual(journalInvente(300, 20, 7));
  expect(journalInvente(300, 20, 7)).not.toEqual(journalInvente(300, 20, 8));
});

it('chaque_evenement_est_valide_et_les_identifiants_sont_tous_differents', () => {
  const journal = journalInvente(2000, 50, 1);

  expect(journal).toHaveLength(2000);
  for (const evenement of journal) {
    expect(schemaEvenement.safeParse(evenement).success).toBe(true);
    expect(evenement.type).toBe('reponse');
    expect(evenement.cours).toBe(COURS_INVENTE);
  }
  expect(new Set(journal.map((evenement) => evenement.id)).size).toBe(2000);
});

it('les_reponses_tiennent_sur_soixante_jours_dans_l_ordre_du_temps', () => {
  const journal = journalInvente(1000, 30, 3);
  const instants = journal.map((evenement) => Date.parse(evenement.repondu_a));

  expect(instants).toEqual([...instants].sort((a, b) => a - b));
  const jours = new Set(journal.map((evenement) => jourDe(evenement.repondu_a)));
  expect(jours.size).toBeGreaterThan(50);
  expect(jours.size).toBeLessThanOrEqual(60);
  expect(Math.max(...[...jours].map((jour) => Date.parse(jour)))).toBeLessThanOrEqual(
    Date.parse(DERNIER_JOUR_INVENTE),
  );
});

it('les_unites_sont_inventees_et_leur_nombre_est_celui_demande', () => {
  const journal = journalInvente(5000, 40, 5);
  const unites = new Set(journal.map((evenement) => evenement.unite));

  expect(unites.size).toBe(40);
  for (const unite of unites) {
    expect(FORMAT_IDENTIFIANT.test(unite)).toBe(true);
  }
});

it('environ_sept_reponses_sur_dix_sont_justes', () => {
  const journal = journalInvente(10000, 100, 11);
  const justes = journal.filter(
    (evenement) => evenement.type === 'reponse' && evenement.resultat.juste,
  ).length;

  expect(justes / 10000).toBeGreaterThan(0.67);
  expect(justes / 10000).toBeLessThan(0.73);
});

it('la_moitie_des_unites_est_d_un_chapitre', () => {
  const unites = [...new Set(journalInvente(3000, 100, 2).map((evenement) => evenement.unite))];
  const chapitrees = unites.filter((unite) => chapitreInvente(unite) !== undefined);

  expect(chapitrees).toHaveLength(50);
  expect(chapitreInvente(chapitrees[0] as string)).toBe(CHAPITRE_INVENTE);
});
