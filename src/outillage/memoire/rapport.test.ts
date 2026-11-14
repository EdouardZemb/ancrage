import { expect, test } from 'vitest';
import type { Evenement, ModeDeReponse } from '../../domaine/journal/evenement.js';
import { coursDExemple, idsDesPosables, journalDeCours } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import { nombre, pourcent } from './graphiques.js';
import { mesures } from './mesures.js';
import { construireRapport, regrouperLesBoites, tuilesAffichables } from './rapport.js';

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

test('moins_de_trois_personnes_actives_le_rapport_ne_garde_que_le_nombre_d_elements', () => {
  const html = rapport([
    actif(1),
    actif(2),
    journalDeCours(cours, { debut: '2026-02-01', jours: 2, parJour: 5, graine: 9, personne: 3 }),
  ]);
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toContain('<svg');
  expect(html).not.toContain('de justes');
  expect(html).not.toContain('Leitner');
  // Le nombre d'éléments du cours, et rien qui décrive une personne : ni total de réponses
  // (2 × 28 × 30 + 10 = 1 690), ni premier ou dernier jour du journal.
  expect(html).toContain('Éléments à savoir');
  expect(html).toContain('80');
  expect(html).not.toContain('1 690');
  expect(html).not.toContain('01/02/2026');
  expect(html).not.toContain('28/02/2026');
  expect(html).toContain('ne garde donc que ce qui ne distingue personne');
});

test('une_personne_active_et_deux_comptes_anciens_ne_font_pas_un_rapport_complet', () => {
  // A répond 30 fois par jour pendant deux mois ; B et C, 25 fois un seul jour, bien avant.
  const ancien = (personne: number) =>
    journalDeCours(cours, {
      debut: '2025-11-01',
      jours: 1,
      parJour: 25,
      graine: personne,
      personne,
    });
  const html = rapport([
    journalDeCours(cours, {
      debut: '2026-01-06',
      jours: 56,
      parJour: 30,
      graine: 1,
      personne: 1,
    }),
    ancien(2),
    ancien(3),
  ]);
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toContain('<svg');
  expect(html).not.toContain('Semaine du');
  expect(html).not.toContain('06/01/2026');
});

test('une_case_de_deux_personnes_et_cent_reponses_est_omise_d_un_rapport_d_ensemble', () => {
  const journaux = troisActives();
  // Deux personnes, 50 réponses « pointage » chacune, le 1er mars : 100 réponses de 2 personnes.
  for (const rang of [0, 1]) {
    const rares = Array.from({ length: 50 }, (_, n) =>
      reponseInventee(
        Date.UTC(2026, 2, 1, 9, 0, n),
        700_000 + rang * 100 + n,
        'xyv4pn7g',
        true,
        cours.cours.id,
        'pointage',
      ),
    );
    journaux[rang] = [...(journaux[rang] ?? []), ...rares];
  }
  const html = rapport(journaux);
  expect(html).not.toContain('Point touché');
  expect(html).not.toContain('Autres modes');
  expect(html).not.toMatch(/1 mars : /);
  // Le jour d'avant, trois personnes et 90 réponses : dessiné.
  expect(html).toMatch(/28 févr\. : 30 réponses/);
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

// Les scénarios de la relecture : rien ne s'affiche qui ne vienne de cases que la règle admet.

let rangDeTest = 5_000_000;
function reponseAu(
  jour: string,
  minute: number,
  unite: string,
  juste: boolean,
  mode?: ModeDeReponse,
): Evenement {
  rangDeTest += 1;
  const [a = 0, m = 1, j = 1] = jour.split('-').map(Number);
  return reponseInventee(
    Date.UTC(a, m - 1, j, 8, minute),
    rangDeTest,
    unite,
    juste,
    cours.cours.id,
    mode,
  );
}

/** `n` réponses d'une même personne le même jour, sur les `n` premières unités du cours. */
function uneParUnite(jour: string, n: number, mode?: ModeDeReponse): Evenement[] {
  return idsDesPosables(cours)
    .slice(0, n)
    .map((unite, i) => reponseAu(jour, i, unite, true, mode));
}

test('un_compte_ancien_ne_change_aucun_chiffre_du_rapport_d_ensemble', () => {
  const sans = rapport(troisActives());
  const ancien = [reponseAu('2025-12-01', 0, 'xyv4pn7g', true)];
  const avec = rapport([...troisActives(), ancien]);
  expect(avec).toBe(sans);
  expect(avec).not.toContain('01/12/2025');
});

test('une_boite_refusee_se_fond_avec_sa_voisine_et_ne_donne_ni_tuile_ni_complement', () => {
  // Une quatrième personne active, 25 éléments vus seulement : elle est seule dans la boîte « jamais
  // vus » (55 éléments), que trois autres personnes n'ont pas.
  const quatrieme = uneParUnite('2026-02-20', 25);
  const html = rapport([...troisActives(), quatrieme]);
  expect(html).not.toContain('Jamais vus :');
  expect(html).toContain('Jamais vus + Boîte 1');
  expect(html).not.toContain('du cours déjà vu');
  expect(html).not.toContain('n’est pas encore vu');
});

test('regrouper_les_boites_fond_une_boite_refusee_avec_sa_voisine', () => {
  const admise = (comptes: readonly number[]) =>
    comptes.filter((c) => c > 0).length >= 3 && comptes.reduce((s, c) => s + c, 0) >= 20;
  const trois = [10, 10, 10, 0];
  // La boîte 5 d'une seule personne se fond avec la 4 (voisine de gauche, car dernière).
  const groupes = regrouperLesBoites(
    [[0, 0, 0, 0], trois, trois, trois, trois, [0, 0, 0, 30]],
    admise,
  );
  expect(groupes?.map((g) => g.rangs)).toEqual([[1], [2], [3], [4, 5]]);
  // Même le tout refusé : rien.
  expect(regrouperLesBoites([[30, 0, 0, 0]], admise)).toBeNull();
  expect(regrouperLesBoites([[0, 0, 0, 0]], admise)).toBeNull();
  // Une boîte refusée au milieu se fond avec sa voisine de droite.
  expect(regrouperLesBoites([trois, [30, 0, 0, 0], trois], admise)?.map((g) => g.rangs)).toEqual([
    [0],
    [1, 2],
  ]);
});

test('une_semaine_ne_compte_que_ses_jours_affiches_et_se_divise_par_ses_personnes', () => {
  // Trois personnes à 10 par jour, sauf le 10/02 ; ce jour-là, une quatrième seule répond 25 fois.
  const duree = (debut: string, jours: number, personne: number) =>
    journalDeCours(cours, { debut, jours, parJour: 10, graine: personne, personne });
  const journaux = [1, 2, 3].map((n) => [
    ...duree('2026-02-01', 9, n),
    ...duree('2026-02-11', 18, n + 10),
  ]);
  journaux.push(uneParUnite('2026-02-10', 25));
  const html = rapport(journaux);
  // La semaine du 09/02 : six jours affichés, trois personnes, 10 par jour. Ni 25 ni N = 4.
  expect(html).toMatch(/09\/02\/2026<\/th><td>10<\/td>/);
  expect(html).not.toMatch(/10 févr\. : 25/);
});

test('une_personne_seule_un_jour_ne_fixe_ni_la_periode_ni_une_semaine', () => {
  const journaux = troisActives();
  journaux.push([...uneParUnite('2026-01-20', 25), ...uneParUnite('2026-02-20', 25)]);
  const html = rapport(journaux);
  expect(html).not.toContain('20/01/2026');
  expect(html).not.toContain('19/01/2026');
});

test('un_moment_ou_un_mode_d_une_seule_personne_n_est_ni_affiche_ni_additionne', () => {
  // La quatrième personne redonne vingt-quatre fois la même unité le même jour, en « pointage » :
  // « redonnée le jour même » et « point touché » sont à elle seule.
  const quatrieme = Array.from({ length: 25 }, (_, i) =>
    reponseAu('2026-02-20', i, 'xyv4pn7g', true, 'pointage'),
  );
  const html = rapport([...troisActives(), quatrieme]);
  expect(html).not.toContain('Redonnée le jour même');
  expect(html).not.toContain('Point touché');
  expect(html).not.toContain('Autres moments');
  // Aucun total de réponses n'est imprimé à côté de lignes dont certaines sont écartées.
  expect(html).not.toMatch(/réponses · objectif/);
});

test('la_reussite_observee_a_l_echeance_ne_lit_que_les_lignes_affichees', () => {
  // La quatrième personne est seule aux moments « boîte 3 » et « boîte 4 », qui ne s'affichent pas.
  const jours = ['2026-02-01', '2026-02-02', '2026-02-04', '2026-02-08', '2026-02-16'];
  const quatrieme = [
    ...jours.map((jour, i) => reponseAu(jour, i, 'xyv4pn7g', true)),
    ...uneParUnite('2026-02-20', 21).slice(1),
  ];
  const quatre = [...troisActives(), quatrieme];
  const m = quatre.map((journal) => mesures(journal, cours, AUJOURDHUI));
  expect(m[3]?.delais['boite-3'].reponses).toBeGreaterThan(0);
  expect(m[3]?.delais['boite-4'].reponses).toBeGreaterThan(0);
  const affichees = m.reduce(
    (cumul, x) => ({
      reponses: cumul.reponses + x.delais['boite-1'].reponses + x.delais['boite-2'].reponses,
      justes: cumul.justes + x.delais['boite-1'].justes + x.delais['boite-2'].justes,
    }),
    { reponses: 0, justes: 0 },
  );
  const html = rapport(quatre);
  // Le pourcentage des seuls moments affichés, sans effectif.
  expect(html).toContain(
    `à l’échéance, sur les lignes affichées, est de ${pourcent(affichees.justes / affichees.reponses)}.`,
  );
  expect(html).not.toContain(`sur ${nombre(affichees.reponses)} réponses`);
  expect(html).not.toContain('depuis la boîte 3');
  expect(html).not.toContain('depuis la boîte 4');
});

test('une_case_dont_une_personne_fait_98_pour_cent_est_ecartee', () => {
  const unites = idsDesPosables(cours);
  const pointage = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      reponseAu('2026-02-27', i, unites[i % 5] ?? 'xyv4pn7g', true, 'pointage'),
    );
  const avec = (parts: number[]) =>
    troisActives().map((journal, rang) => [...journal, ...pointage(parts[rang] ?? 0)]);
  // 98, 1 et 1 réponses : une personne à 98 % de la case.
  expect(rapport(avec([98, 1, 1]))).not.toContain('Point touché');
  // 35, 8 et 7 : 70 % pile, la même case passe.
  expect(rapport(avec([35, 8, 7]))).toContain('Point touché');
});

// Troisième tour : aucun compte exact, aucun complément qui isole une case refusée.

const JOURS_DE_CHAINE = ['2026-02-01', '2026-02-02', '2026-02-04', '2026-02-08', '2026-02-16'];

/**
 * Un journal où l'unité `i` finit dans la boîte `cibles[i]` : autant de bonnes réponses que la
 * boîte, aux jours où l'unité est due (intervalles 0, 1, 2, 4, 8).
 */
function auxBoites(cibles: readonly number[]): Evenement[] {
  const unites = idsDesPosables(cours);
  return cibles.flatMap((boite, i) =>
    JOURS_DE_CHAINE.slice(0, boite).map((jour) =>
      reponseAu(jour, i, unites[i] ?? 'xyv4pn7g', true),
    ),
  );
}

const repete = (n: number, boite: number): number[] => Array.from({ length: n }, () => boite);

/** A : 20 éléments en boîtes 1, 3, 4 et 5. B et C : 20, 2, 29 et 29 en boîtes 1, 3, 4 et 5. */
function troisAuxBoites(): Evenement[][] {
  const a = auxBoites([...repete(20, 1), ...repete(20, 3), ...repete(20, 4), ...repete(20, 5)]);
  const bc = () =>
    auxBoites([...repete(20, 1), ...repete(2, 3), ...repete(29, 4), ...repete(29, 5)]);
  return [a, bc(), bc()];
}

test('la_tuile_sure_ne_se_montre_pas_quand_la_boite_refusee_se_retrouverait', () => {
  const journaux = troisAuxBoites();
  const boites = journaux.map((journal) => mesures(journal, cours, AUJOURDHUI).boites);
  expect(boites[0]).toEqual([0, 20, 0, 20, 20, 20]);
  expect(boites[1]).toEqual([0, 20, 0, 2, 29, 29]);
  const html = rapport(journaux);
  // La boîte 3 (A à 83 %) est refusée et se fond avec la 4 ; la boîte 5 reste seule.
  expect(html).toContain('Boîte 3 + Boîte 4 (sûrs)');
  // Les parts « sûr » (boîtes 4 et 5) diraient la boîte 3 par différence : ni tuile ni titre.
  expect(html).not.toContain('du cours sûr');
  expect(html).not.toContain('est sûr');
  // Aucun compte exact d'éléments, ni dans le texte ni dans une infobulle.
  expect(html).not.toMatch(/\d éléments(?! à savoir)/);
  expect(html).not.toMatch(/<title>[^<]*Boîte[^<]*: \d+ ?<\/title>/);
});

test('les_tuiles_de_boites_demandent_une_reunion_exacte_de_groupes_affiches', () => {
  const groupe = (...rangs: number[]) => ({ rangs, comptes: [1] });
  expect(tuilesAffichables(null)).toEqual({ vu: false, sur: false });
  // Boîte 0 seule : « vu ». Boîtes 4 et 5 seules, sans chevauchement : « sûr ».
  expect(tuilesAffichables([groupe(0), groupe(1, 2, 3), groupe(4), groupe(5)])).toEqual({
    vu: true,
    sur: true,
  });
  // La boîte 0 fondue avec la 1 : pas de « vu ».
  expect(tuilesAffichables([groupe(0, 1), groupe(2, 3), groupe(4, 5)])).toEqual({
    vu: false,
    sur: true,
  });
  // Un groupe qui chevauche : la boîte 3 avec la 4 ; pas de « sûr », même si la 5 est seule.
  expect(tuilesAffichables([groupe(0), groupe(1), groupe(3, 4), groupe(5)])).toEqual({
    vu: true,
    sur: false,
  });
  // Aucune boîte sûre n'a de groupe : pas de « sûr ».
  expect(tuilesAffichables([groupe(0), groupe(1, 2, 3)])).toEqual({ vu: true, sur: false });
});

test('un_rapport_d_ensemble_n_imprime_aucun_nombre_de_reponses_par_ligne', () => {
  // La quatrième personne est seule au mode « pointage » : un mode omis, que les moments, qui
  // partagent son total, ne doivent pas permettre de retrouver.
  const quatrieme = Array.from({ length: 25 }, (_, i) =>
    reponseAu('2026-02-20', i, 'xyv4pn7g', true, 'pointage'),
  );
  const html = rapport([...troisActives(), quatrieme]);
  expect(html).not.toContain('Point touché');
  expect(html).not.toContain('<th scope="col">Réponses</th>');
  expect(html).not.toContain(' de justes sur ');
  expect(html).not.toMatch(/ % · \d/);
  // La page de moments et de modes n'a que des pourcentages entiers.
  expect(html).toMatch(/<th scope="col">Réponses justes<\/th><\/tr>/);
  // Le rapport d'une personne garde ses effectifs.
  const seul = rapport([actif(1)], { accord: '25/02/2026' });
  expect(seul).toContain('<th scope="col">Réponses</th>');
  expect(seul).toContain(' de justes sur ');
});

test('la_mediane_se_dit_sur_la_page', () => {
  const html = rapport(troisActives());
  expect(html).toContain('Tout le cours est vu le (personne médiane)');
  expect(html).toContain('Minutes par jour (au rythme de la personne médiane)');
  expect(html).toContain('min par jour, au rythme de la personne médiane');
  expect(html).toContain('celui de la personne médiane');
  expect(html).toContain('Ce que cela ne garantit pas');
});

test('l_ecart_median_demande_la_regle_comme_toute_case', () => {
  // La première personne répond à 20 secondes d'écart ; les deux autres, à cinq minutes : il n'y a
  // d'écart de moins de deux minutes que chez une seule personne, la case est refusée.
  const lente = () =>
    Array.from({ length: 25 }, (_, i) =>
      reponseAu('2026-02-20', 5 * i, idsDesPosables(cours)[i] ?? 'xyv4pn7g', true),
    );
  const html = rapport([actif(1), lente(), lente()]);
  expect(html).toContain('durée inconnue');
  expect(html).toContain('non communiqué');
  // Avec trois personnes qui répondent vite, la durée est donnée.
  expect(rapport(troisActives())).toContain('min par jour');
});

test('une_case_autres_additionne_les_personnes_et_les_reponses_de_toutes_les_cases_fondues', () => {
  // Trois personnes de plus, actives, qui n'ont chacune qu'un mode rare (huit réponses) : chaque
  // mode est refusé seul, mais réunis ils font trois personnes et vingt-quatre réponses.
  const rare = (mode: ModeDeReponse) => [
    ...uneParUnite('2026-02-20', 8, mode),
    ...uneParUnite('2026-02-21', 15, 'retournee'),
  ];
  const html = rapport([...troisActives(), rare('montree'), rare('lecture'), rare('assemblage')]);
  expect(html).not.toContain('Réponse montrée');
  expect(html).not.toContain('Bilan d’un texte');
  expect(html).toContain('Autres modes');
});

test('un_jour_se_divise_par_les_personnes_du_jour_et_non_par_toutes', () => {
  // Une quatrième personne ne répond que le 10/02 ; le 27/02, trois personnes font 30 chacune.
  const journaux = [...troisActives(), uneParUnite('2026-02-10', 25)];
  const html = rapport(journaux);
  expect(html).toMatch(/27 févr\. : 30 réponses/);
});

test('la_projection_ne_lit_que_les_moments_affiches', () => {
  // La quatrième personne est seule au moment « boîte 3 », dont la réponse est juste ou fausse selon
  // la variante ; le jour même elle se trompe encore, dans les deux cas : elle finit en boîte 1, à la
  // même échéance. Seul le moment « boîte 3 », qui ne s'affiche pas, change : ni lui ni la
  // projection ne doivent le lire.
  const quatrieme = (juste: boolean) => [
    ...JOURS_DE_CHAINE.slice(0, 3).map((jour, i) =>
      reponseAu(jour, i, 'xyv4pn7g', true, 'pointage'),
    ),
    reponseAu('2026-02-08', 0, 'xyv4pn7g', juste, 'pointage'),
    reponseAu('2026-02-08', 1, 'xyv4pn7g', false, 'pointage'),
    ...uneParUnite('2026-02-20', 21, 'pointage').slice(1),
  ];
  const m = (juste: boolean) => mesures(quatrieme(juste), cours, AUJOURDHUI);
  expect(m(true).delais['boite-3']).toEqual({ reponses: 1, justes: 1 });
  expect(m(false).delais['boite-3']).toEqual({ reponses: 1, justes: 0 });
  expect(m(true).boites).toEqual(m(false).boites);
  // Les lignes de Leitner de la table des scénarios (FSRS rejoue la suite des réponses de chaque
  // personne, et diffère donc d'une variante à l'autre).
  const lignesDeLeitner = (html: string): string[] =>
    html.match(/<tr><th scope="row">\d+<\/th><td>Leitner<\/td>.*?<\/tr>/g) ?? [];
  const juste = lignesDeLeitner(rapport([...troisActives(), quatrieme(true)]));
  const fausse = lignesDeLeitner(rapport([...troisActives(), quatrieme(false)]));
  expect(juste).toHaveLength(4);
  expect(juste).toEqual(fausse);
});

// Quatrième tour : les largeurs et la médiane d'un rapport d'ensemble.

test('les_boites_d_un_rapport_d_ensemble_sont_des_pourcentages_entiers_qui_font_cent', () => {
  const html = rapport(troisActives());
  const boites = html.slice(html.indexOf('aria-label="Les éléments du cours par boîte"'));
  const pourcents = [...boites.matchAll(/<title>Boîte[^<]*: (\d+) %<\/title>/g)].map((m) =>
    Number(m[1]),
  );
  expect(pourcents.length).toBeGreaterThan(1);
  const somme = pourcents.reduce((s, n) => s + n, 0);
  // Des pourcentages entiers, qui font cent à l'arrondi près : jamais des comptes d'éléments.
  expect(somme).toBeGreaterThanOrEqual(98);
  expect(somme).toBeLessThanOrEqual(102);
  // Chaque largeur suit son pourcentage : (720 - 2 par écart) × part.
  const largeurs = [...boites.matchAll(/<rect class="b\d" x="[\d.]+" y="0" width="([\d.]+)"/g)].map(
    (m) => Number(m[1]),
  );
  const utile = 720 - 2 * (pourcents.length - 1);
  expect(largeurs).toHaveLength(pourcents.length);
  pourcents.forEach((pourcent, i) => {
    expect(largeurs[i]).toBeCloseTo((utile * pourcent) / somme, 1);
  });
});

test('les_barres_de_reussite_d_un_rapport_d_ensemble_ont_la_largeur_d_un_pourcentage_entier', () => {
  const html = rapport(troisActives());
  const barres = [
    ...html.matchAll(
      /<rect class="s[12]" x="200" y="[\d.]+" width="([\d.]+)" height="14"[^>]*><title>[^<]*: (\d+) % de justes<\/title>/g,
    ),
  ];
  expect(barres.length).toBeGreaterThan(3);
  for (const [, largeur, pourcent] of barres) {
    // 400 de large pour 100 % : 4 par point, sans décimale d'un pourcentage plus précis.
    expect(Number(largeur)).toBe(4 * Number(pourcent));
  }
});

test('l_ecart_median_est_celui_de_la_personne_mediane_et_non_celui_de_toutes_les_reponses', () => {
  // Une personne répond à 60 secondes d'écart (60 écarts), les deux autres à 100 secondes (20
  // écarts chacune). Mêlés, la moitié des écarts valent 60 : la médiane mêlée est 60. Les écarts
  // médians de chaque personne sont 60, 100 et 100 : celui de la personne médiane est 100.
  const unites = idsDesPosables(cours);
  const suite = (reponses: number, ecart: number) =>
    Array.from({ length: reponses }, (_, i) => {
      rangDeTest += 1;
      return reponseInventee(
        Date.UTC(2026, 1, 20, 8, 0, i * ecart),
        rangDeTest,
        unites[i % unites.length] ?? 'xyv4pn7g',
        true,
        cours.cours.id,
      );
    });
  const html = rapport([suite(61, 60), suite(21, 100), suite(21, 100)]);
  expect(html).toContain('(100 secondes)');
  expect(html).not.toContain('(60 secondes)');
});
