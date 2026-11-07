import { expect, test } from 'vitest';
import { estDocumentationSeule } from './documentation-seule.js';

test('docs_et_racine', () => {
  expect(estDocumentationSeule(['docs/exploitation.md', 'CLAUDE.md'])).toBe(true);
});

test('plan_competence_et_modele_de_pr', () => {
  expect(
    estDocumentationSeule([
      '.claude/plans/x.md',
      '.claude/skills/feuille/SKILL.md',
      '.github/pull_request_template.md',
    ]),
  ).toBe(true);
});

test('liste_vide_lance_tout', () => {
  expect(estDocumentationSeule([])).toBe(false);
});

test('code_lance_tout', () => {
  expect(estDocumentationSeule(['docs/a.md', 'src/client/App.tsx'])).toBe(false);
});

test('le_contenu_n_est_jamais_de_la_documentation', () => {
  expect(estDocumentationSeule(['exemple-contenu/kueche/notes.md'])).toBe(false);
});

test('autre_fichier_de_docs', () => {
  expect(estDocumentationSeule(['docs/schema.png'])).toBe(false);
});

test('script_d_une_competence', () => {
  expect(estDocumentationSeule(['.claude/skills/feuille/extraire.py'])).toBe(false);
});

test('markdown_hors_des_dossiers_permis', () => {
  expect(estDocumentationSeule(['src/client/LISEZMOI.md'])).toBe(false);
});

test('renommage_compte_ses_deux_noms', () => {
  expect(estDocumentationSeule(['src/x.ts', 'docs/x.md'])).toBe(false);
});
