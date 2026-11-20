import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { coursDExemple, journalDeCours } from './cours-exemple.fixture.js';
import { construireRapport } from './rapport.js';
import { journauxAuxReprises } from './reprises.fixture.js';

/*
 * Les empreintes ci-dessous ont été prises sur `main`, avant le lot M8 (la fenêtre de jours) : sans
 * `--depuis`, la page du rapport ne change pas d'un octet. Un lot qui change la page sans
 * `--depuis` reprend ces empreintes, et le dit dans sa PR.
 */

const cours = coursDExemple();
const ID_DU_COURS = cours.cours.id;

/** Le journal de la personne `personne` : 28 jours de 30 réponses, du 01/02/2026. */
const journalDe = (personne: number): Evenement[] =>
  journalDeCours(cours, {
    debut: '2026-02-01',
    jours: 28,
    parJour: 30,
    graine: personne,
    personne,
  });

const empreinte = (page: string): string => createHash('sha256').update(page).digest('hex');

const EMPREINTE_ENSEMBLE = 'd54c4e53c7a3d19dbd14cb7461737376538f573b79c9b72b05bc366e54fc9a38';
const EMPREINTE_PERSONNE = '53b51d888d5050b91dde4b01b36a134f00cff55afb7f418994c7be5a0c363d46';
const EMPREINTE_REPRISES = '9b127955f22c103a52266e4b76e42faee4b3594ad86ddefb4f9643d28884e4ac';

test('sans_depuis_la_page_est_celle_d_avant_le_lot', () => {
  const ensemble = construireRapport({
    cours,
    journaux: [1, 2, 3].map(journalDe),
    aujourdhui: '2026-03-02',
    jusquau: '2026-05-01',
  });
  const personne = construireRapport({
    cours,
    journaux: [journalDe(1)],
    aujourdhui: '2026-03-02',
    jusquau: '2026-05-01',
    accord: '25/02/2026',
  });
  const reprises = construireRapport({
    cours,
    journaux: journauxAuxReprises(3, ID_DU_COURS),
    aujourdhui: '2026-01-10',
  });
  // Le séparateur des milliers de `Intl` suit la version d'ICU : l'empreinte n'en dépendrait pas
  // sur un poste à l'autre si la page n'en portait aucun.
  for (const page of [ensemble, personne, reprises]) {
    expect(page).not.toMatch(/\d[  ]\d/);
  }
  expect([empreinte(ensemble), empreinte(personne), empreinte(reprises)]).toEqual([
    EMPREINTE_ENSEMBLE,
    EMPREINTE_PERSONNE,
    EMPREINTE_REPRISES,
  ]);
});
