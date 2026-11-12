import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { coursDExemple, journalDeCours } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import { construireRapport } from './rapport.js';

const cours = coursDExemple();
const AUJOURDHUI = '2026-03-02';
const EXAMEN = '2026-05-01';

function actif(personne: number): Evenement[] {
  return journalDeCours(cours, {
    debut: '2026-02-01',
    jours: 28,
    parJour: 30,
    graine: personne,
    personne,
  });
}

/** Trois personnes actives, dont une seule réponse tapée « pointage » (moins de 20 réponses d'un mode). */
function troisActives(): Evenement[][] {
  return [actif(1), actif(2), actif(3)];
}

const rapport = (
  journaux: readonly (readonly Evenement[])[],
  en: { jusquau?: string; accord?: string } = {},
) => construireRapport({ cours, journaux, aujourdhui: AUJOURDHUI, jusquau: EXAMEN, ...en });

test('un_rapport_d_ensemble_de_trois_personnes_actives_a_ses_sections', () => {
  const html = rapport(troisActives());
  expect(html).toContain('<title>Rapport de suivi</title>');
  expect(html).toMatch(/<h1>Environ \d+ réponses par jour et par personne jusqu’à l’examen<\/h1>/);
  expect(html).toContain('chiffres d’ensemble');
  expect(html).toContain('Comment lire ces chiffres');
  expect(html).toContain('Selon le moment où l’élément revient');
  expect(html).toContain('Selon le mode de la réponse');
  expect(html).toContain('sans mode');
  expect(html).toContain('Leitner, 20 nouveautés par jour');
  expect(html).toContain('hypothèse');
  expect(html).toContain('01/05/2026');
});

test('un_rapport_ne_charge_rien_du_reseau_et_n_a_aucun_script', () => {
  for (const html of [rapport(troisActives()), rapport([actif(1)], { accord: '25/02/2026' })]) {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/\b(src|href)\s*=/i);
    expect(html).not.toMatch(/<script|<link|<img|<iframe|@import|url\(/i);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('<svg');
  }
});

test('moins_de_trois_personnes_actives_le_rapport_s_arrete_aux_totaux', () => {
  const html = rapport([
    actif(1),
    actif(2),
    journalDeCours(cours, { debut: '2026-02-01', jours: 2, parJour: 5, graine: 9, personne: 3 }),
  ]);
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toContain('<svg');
  expect(html).not.toContain('de justes');
  expect(html).not.toContain('Leitner');
  // Les totaux : 2 × 28 × 30 + 10 réponses sur 80 éléments.
  expect(html).toContain('1 690');
  expect(html).toContain('80');
  expect(html).toContain('01/02/2026');
});

test('un_seul_journal_sans_accord_est_un_rapport_limite', () => {
  const html = rapport([actif(1)]);
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toContain('<svg');
});

test('une_case_de_moins_de_vingt_reponses_est_omise_d_un_rapport_d_ensemble', () => {
  const journaux = troisActives();
  // 5 réponses « pointage », en tout : hors de la fenêtre des mesures du mode, trop peu pour une case.
  const dernier = journaux[0] ?? [];
  const rare = [1, 2, 3, 4, 5].map((n) =>
    reponseInventee(
      Date.UTC(2026, 1, 28, 18, n),
      900_000 + n,
      'xyv4pn7g',
      true,
      cours.cours.id,
      'pointage',
    ),
  );
  journaux[0] = [...dernier, ...rare];
  const html = rapport(journaux);
  expect(html).not.toContain('Point touché');
  // Les modes trop rares se fondent dans « Autres modes » : 5 réponses n'en font pas une case.
  expect(html).not.toContain('Autres modes');
  expect(html).toContain('Carte retournée');
});

test('un_jour_de_moins_de_vingt_reponses_n_est_pas_dessine_dans_un_rapport_d_ensemble', () => {
  const journaux = troisActives().map((journal, rang) => [
    ...journal,
    // Le 1er mars : 3 réponses par personne, 9 en tout.
    ...[0, 1, 2].map((n) =>
      reponseInventee(
        Date.UTC(2026, 2, 1, 9, n),
        800_000 + rang * 10 + n,
        'xyv4pn7g',
        true,
        cours.cours.id,
      ),
    ),
  ]);
  const html = rapport(journaux);
  expect(html).not.toMatch(/1 mars : [\d,\s ]+ réponses/);
  // Le jour d'avant, 90 réponses, est dessiné.
  expect(html).toMatch(/28 févr\. : 30 réponses/);
});

test('un_rapport_de_personne_dit_l_accord_et_ne_cache_aucune_case', () => {
  const journal = [
    ...actif(1),
    ...[0, 1, 2].map((n) =>
      reponseInventee(
        Date.UTC(2026, 2, 1, 9, n),
        800_000 + n,
        'xyv4pn7g',
        true,
        cours.cours.id,
        'pointage',
      ),
    ),
  ];
  const html = rapport([journal], { accord: '25/02/2026' });
  expect(html).toContain('Accord donné le 25/02/2026, d’après la déclaration du responsable');
  expect(html).toContain('la personne suivie');
  expect(html).toContain('Document privé : il décrit la progression d’une personne');
  expect(html).not.toContain('chiffres d’ensemble');
  expect(html).toContain('Point touché');
  expect(html).toMatch(/1 mars : 3 réponses/);
  expect(html).toMatch(/<h1>Environ \d+ réponses par jour jusqu’à l’examen<\/h1>/);
});

test('sans_date_d_examen_le_rapport_n_a_pas_de_projection_et_le_dit', () => {
  const html = construireRapport({
    cours,
    journaux: [actif(1)],
    aujourdhui: AUJOURDHUI,
    accord: '25/02/2026',
  });
  expect(html).toContain('Pas de date d’examen');
  expect(html).not.toContain('Leitner, 20 nouveautés par jour');
  expect(html).not.toContain('<h1>Environ');
  expect(html).toContain('Selon le mode de la réponse');
});

test('les_chiffres_de_la_projection_et_de_l_etat_sont_dans_la_page', () => {
  const html = rapport([actif(1)], { accord: '25/02/2026' });
  expect(html).toContain('840 réponses');
  expect(html).toContain('jours avant l’examen');
  expect(html).toContain('<details>');
  expect(html).toMatch(/<th[^>]*>Nouveautés par jour<\/th>/);
  expect(html).toContain('FSRS');
});

test('le_texte_du_cours_est_echappe', () => {
  const dangereux = { ...cours, cours: { ...cours.cours, titre: '<b>Titre</b> & cie' } };
  const html = construireRapport({
    cours: dangereux,
    journaux: troisActives(),
    aujourdhui: AUJOURDHUI,
    jusquau: EXAMEN,
  });
  expect(html).not.toContain('<b>Titre</b>');
  expect(html).toContain('&lt;b&gt;Titre&lt;/b&gt; &amp; cie');
});
