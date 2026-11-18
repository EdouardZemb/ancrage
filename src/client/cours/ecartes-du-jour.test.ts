import { expect, it } from 'vitest';
import { avecRepondu, ecartesDuMoment } from './ecartes-du-jour.js';

it('les_ecartes_du_moment_sont_ceux_du_journal_et_ceux_de_l_onglet_du_meme_jour', () => {
  const journal = new Set(['a']);

  const ecartes = ecartesDuMoment(journal, { jour: '2026-10-17', ids: ['b'] }, '2026-10-17');

  expect([...ecartes].sort()).toEqual(['a', 'b']);
  expect([...journal]).toEqual(['a']);
});

it('l_ensemble_d_un_autre_jour_ne_compte_pas', () => {
  const journal = new Set(['a']);

  const ecartes = ecartesDuMoment(journal, { jour: '2026-10-16', ids: ['b'] }, '2026-10-17');

  expect([...ecartes]).toEqual(['a']);
});

it('un_rebelle_repondu_s_ajoute_une_fois_et_un_autre_jour_repart_a_zero', () => {
  const vide = { jour: '2026-10-17', ids: [] };

  const un = avecRepondu(vide, 'a', '2026-10-17');
  const deux = avecRepondu(un, 'b', '2026-10-17');

  expect(deux).toEqual({ jour: '2026-10-17', ids: ['a', 'b'] });
  expect(avecRepondu(deux, 'a', '2026-10-17').ids).toEqual(['a', 'b']);
  expect(avecRepondu(deux, 'c', '2026-10-18')).toEqual({ jour: '2026-10-18', ids: ['c'] });
});
