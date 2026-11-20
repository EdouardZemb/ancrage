import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { coursDExemple, idsDesPosables, journalDeCours } from './cours-exemple.fixture.js';
import { nombre, pourcent } from './graphiques.js';
import { mesures, sommerMesures } from './mesures.js';
import { construireRapport } from './rapport.js';
import { journauxAuxReprises } from './reprises.fixture.js';

/*
 * Les empreintes ci-dessous ont été prises sur `main`, avant le lot M8 (la fenêtre de jours) : sans
 * `--depuis`, la page du rapport ne change pas d'un octet. Un lot qui change la page sans
 * `--depuis` reprend ces empreintes, et le dit dans sa PR.
 */

const cours = coursDExemple();
const ID_DU_COURS = cours.cours.id;
const AUJOURDHUI = '2026-03-02';
const EXAMEN = '2026-05-01';
const DEPUIS = '2026-02-15';

/** Le journal de la personne `personne` : 28 jours de 30 réponses, du 01/02/2026. */
const journalDe = (personne: number): Evenement[] =>
  journalDeCours(cours, {
    debut: '2026-02-01',
    jours: 28,
    parJour: 30,
    graine: personne,
    personne,
  });

interface OptionsDePage {
  depuis?: string;
  /** Le jour de l'examen ; `false` pour une page sans projection. */
  examen?: string | false;
  accord?: string;
  aujourdhui?: string;
}

function page(
  journaux: readonly (readonly Evenement[])[],
  { depuis, examen = EXAMEN, accord, aujourdhui = AUJOURDHUI }: OptionsDePage = {},
): string {
  return construireRapport({
    cours,
    journaux,
    aujourdhui,
    ...(examen === false ? {} : { jusquau: examen }),
    ...(accord === undefined ? {} : { accord }),
    ...(depuis === undefined ? {} : { depuis }),
  });
}

const troisPersonnes = (): Evenement[][] => [1, 2, 3].map(journalDe);
const pageEnsemble = (options?: OptionsDePage): string => page(troisPersonnes(), options);
const pagePersonne = (options?: OptionsDePage): string =>
  page([journalDe(1)], { accord: '25/02/2026', ...options });
const pageDesReprises = (): string =>
  page(journauxAuxReprises(3, ID_DU_COURS), { examen: false, aujourdhui: '2026-01-10' });

const pageLimitee = (): string => page([journalDe(1), journalDe(2)]);

const lesTroisPages = (): string[] => [
  pageEnsemble(),
  pagePersonne(),
  pageDesReprises(),
  pageLimitee(),
];

const empreinte = (texte: string): string => createHash('sha256').update(texte).digest('hex');

const EMPREINTE_ENSEMBLE = 'd54c4e53c7a3d19dbd14cb7461737376538f573b79c9b72b05bc366e54fc9a38';
const EMPREINTE_PERSONNE = '53b51d888d5050b91dde4b01b36a134f00cff55afb7f418994c7be5a0c363d46';
const EMPREINTE_LIMITE = 'f03f458a6733f7376df44e9a3c6a2266a4a527def6ec37f475c8c5ca96bbc52f';
const EMPREINTE_REPRISES = '9b127955f22c103a52266e4b76e42faee4b3594ad86ddefb4f9643d28884e4ac';

test('sans_depuis_la_page_est_celle_d_avant_le_lot', () => {
  const pages = lesTroisPages();
  // Le séparateur des milliers de `Intl` suit la version d'ICU : l'empreinte n'en dépendrait pas
  // sur un poste à l'autre si la page n'en portait aucun.
  for (const texte of pages) {
    expect(texte).not.toMatch(/\d[  ]\d/);
  }
  expect(pages.map(empreinte)).toEqual([
    EMPREINTE_ENSEMBLE,
    EMPREINTE_PERSONNE,
    EMPREINTE_REPRISES,
    EMPREINTE_LIMITE,
  ]);
});

/** Les textes de la fenêtre, à la lettre (M8-D6), pour le 15/02/2026. */
const TETE = `<p class="meta">Fenêtre : les tableaux de réussite (moments et modes) et les reprises du jour ne comptent que les réponses du 15/02/2026 et des jours suivants. Le reste se lit sur tout le journal : voir « Comment lire ces chiffres ».</p>`;
const PUCE = `<strong>La fenêtre.</strong> Les tableaux de réussite (moments et modes) et les reprises du jour ne comptent que les réponses du 15/02/2026 et des jours suivants, au jour local de la réponse : un couple compte si son jour est dans la fenêtre, un jour de faute si lui et la première réponse d’un autre jour y sont ; l’espacement d’une reprise compte les autres réponses de tout le journal entre les deux. La réussite que lit la projection (par boîte d’avant avec Leitner ; pour une première réponse et une réponse redonnée le jour même, avec les deux algorithmes), comme la réussite observée à l’échéance, est celle des lignes affichées, donc de la fenêtre ; l’état d’où part la projection se lit sur tout le journal. La fenêtre ne borne ni le moment d’une réponse (sa boîte d’avant, une première réponse, une réponse redonnée le jour même), ni les boîtes, les parts vue et sûre et les éléments rebelles, ni la charge passée et ses jours détaillés, ni les minutes : ils se lisent sur tout le journal.`;
const SUITE_D_ENSEMBLE = `Les personnes actives ne dépendent pas de la fenêtre : elles se comptent au jour du rapport, comme sans elle. Deux rapports d’ensemble à deux fenêtres, ou avec et sans fenêtre, peuvent se comparer : faits le même jour, ils ont la même population et le même état, et leur différence peut donner une case que la règle refuse.`;
const LIGNE_DU_RAPPORT_LIMITE = `<p class="meta">Fenêtre : depuis le 15/02/2026 ; ce rapport n’a aucun tableau qu’elle borne.</p>`;

test('sans_depuis_la_page_ne_parle_d_aucune_fenetre', () => {
  for (const texte of lesTroisPages()) {
    expect(texte).not.toContain('Fenêtre : ');
    expect(texte).not.toContain('<strong>La fenêtre.</strong>');
    expect(texte).not.toContain('dans la fenêtre');
  }
});

test('la_page_dit_sa_fenetre_en_tete_et_dans_comment_lire_ces_chiffres', () => {
  const ensemble = pageEnsemble({ depuis: DEPUIS });
  expect(ensemble).toContain(`Document privé : chiffres d’ensemble de 3 personnes actives.`);
  expect(ensemble).toContain(`\n${TETE}</header>`);
  expect(ensemble).toContain(`<li>${PUCE} ${SUITE_D_ENSEMBLE}</li>`);
  const dansLOrdre = [
    '<strong>Une réponse</strong>',
    '<strong>La fenêtre.</strong>',
    '<strong>La projection</strong>',
  ].map((texte) => ensemble.indexOf(texte));
  expect(dansLOrdre).toEqual([...dansLOrdre].sort((a, b) => a - b));
  expect(dansLOrdre.every((rang) => rang > 0)).toBe(true);

  const personne = pagePersonne({ depuis: DEPUIS });
  expect(personne).toContain('840 réponses, dont 420 dans la fenêtre · ');
  expect(personne).toContain(`\n${TETE}</header>`);
  expect(personne).toContain(`<li>${PUCE}</li>`);
  expect(personne).not.toContain('Les personnes actives ne dépendent pas de la fenêtre');
});

/** Le journal d'une personne dont les réponses d'avant `depuis` sont toutes fausses. */
function fautiveAvant(journal: readonly Evenement[], depuis: string): Evenement[] {
  return journal.map((e) =>
    e.type === 'reponse' && e.repondu_a.slice(0, 10) < depuis
      ? { ...e, resultat: { ...e.resultat, juste: false } }
      : e,
  );
}

/** La dernière cellule de la ligne « 20 » et « Leitner » : la part sûre à l'examen. */
function sureALExamen(html: string): number {
  const ligne = /<tr><th scope="row">20<\/th><td>Leitner<\/td>(.*?)<\/tr>/.exec(html)?.[1] ?? '';
  const cellules = [...ligne.matchAll(/<td>([^<]*)<\/td>/g)].map((c) => c[1] ?? '');
  return Number.parseFloat((cellules.at(-1) ?? '').replace(',', '.'));
}

const morceaux = (html: string): string[] => html.split('<section');
const titreDe = (morceau: string): string => /<h2>(.*?)<\/h2>/.exec(morceau)?.[1] ?? '';

test('la_fenetre_change_la_reussite_et_ni_l_etat_ni_la_charge', () => {
  const cas: [string, readonly (readonly Evenement[])[], OptionsDePage][] = [
    ['une personne', [fautiveAvant(journalDe(1), DEPUIS)], { accord: '25/02/2026' }],
    ['l’ensemble', troisPersonnes().map((j) => fautiveAvant(j, DEPUIS)), {}],
  ];
  for (const [nom, journaux, options] of cas) {
    const sans = morceaux(page(journaux, { ...options, examen: false }));
    const avec = morceaux(page(journaux, { ...options, examen: false, depuis: DEPUIS }));
    expect(avec.length, nom).toBe(sans.length);
    const reprises = avec.findIndex((m) => titreDe(m) === 'Les reprises du jour');
    const moments = reprises - 1;
    const lecture = avec.findIndex((m) => titreDe(m) === 'Comment lire ces chiffres');
    expect(reprises, nom).toBeGreaterThan(1);
    expect(lecture, nom).toBeGreaterThan(reprises);
    for (const [i, morceau] of avec.entries()) {
      if (i === 0) continue;
      if ([moments, reprises, lecture].includes(i))
        expect(morceau, `${nom} ${i}`).not.toBe(sans[i]);
      else expect(morceau, `${nom} ${i}`).toBe(sans[i]);
    }
    // L'en-tête ne diffère que par le paragraphe de tête et, pour une personne, le nombre dans la fenêtre.
    const tete = (avec[0] ?? '').replace(`\n${TETE}`, '').replace(', dont 420 dans la fenêtre', '');
    expect(tete, nom).toBe(sans[0]);
  }
});

test('la_projection_et_la_reussite_a_l_echeance_lisent_la_fenetre', () => {
  const journal = fautiveAvant(journalDe(1), DEPUIS);
  const options = { accord: '25/02/2026' };
  const avec = page([journal], { ...options, depuis: DEPUIS });
  const sans = page([journal], options);

  const m = mesures(journal, cours, AUJOURDHUI, DEPUIS);
  let reponses = 0;
  let justes = 0;
  for (const boite of [1, 2, 3, 4, 5] as const) {
    reponses += m.delais[`boite-${boite}`].reponses;
    justes += m.delais[`boite-${boite}`].justes;
  }
  expect(reponses).toBeGreaterThan(0);
  const attendue = `est de ${pourcent(justes / reponses)} sur ${nombre(reponses)} réponses`;
  expect(avec).toContain(attendue);
  expect(sans).not.toContain(attendue);

  expect(sureALExamen(sans)).toBeGreaterThanOrEqual(0);
  expect(sureALExamen(avec)).toBeGreaterThan(sureALExamen(sans));
});

test('l_etat_de_depart_de_la_projection_ne_depend_pas_de_la_fenetre', () => {
  const posables = idsDesPosables(cours);
  const premiere = new Set(posables.slice(0, Math.floor(posables.length / 2)));
  const entier = journalDe(1);
  const avantLaFenetre = new Set(
    entier.filter((e) => e.repondu_a.slice(0, 10) < DEPUIS).map((e) => e.unite),
  );
  for (const id of posables) expect(avantLaFenetre.has(id), id).toBe(true);
  const reduit = entier.filter((e) => e.repondu_a.slice(0, 10) < DEPUIS || premiere.has(e.unite));

  const colonne = (html: string): string[] =>
    [...html.matchAll(/<tr><th scope="row">\d+<\/th><td>[^<]*<\/td><td>([^<]*)<\/td>/g)].map(
      (c) => c[1] ?? '',
    );
  const options = { accord: '25/02/2026' };
  const avec = colonne(page([reduit], { ...options, depuis: DEPUIS }));
  expect(avec.length).toBeGreaterThan(0);
  expect(avec).toEqual(colonne(page([reduit], options)));
});

test('une_personne_active_sans_reponse_dans_la_fenetre_reste_dans_la_population', () => {
  const troisieme = journalDeCours(cours, {
    debut: '2026-02-01',
    jours: 14,
    parJour: 30,
    graine: 3,
    personne: 3,
  });
  const html = page([journalDe(1), journalDe(2), troisieme], { depuis: DEPUIS, examen: false });
  expect(html).toContain('chiffres d’ensemble de 3 personnes actives');
  const sections = morceaux(html);
  const reprises = sections.findIndex((m) => titreDe(m) === 'Les reprises du jour');
  expect(sections[reprises - 1]).not.toContain('<th scope="row">');
  expect(sections[reprises]?.split('Ce tableau est omis').length).toBe(6);
  expect(sections[reprises]).not.toContain('<th scope="row">');
});

test('une_fenetre_sans_reponse_s_ecrit_et_le_dit', () => {
  const vide = '2026-03-01';
  const personne = pagePersonne({ depuis: vide });
  for (const texte of [
    '840 réponses, dont aucune dans la fenêtre · ',
    'Pas assez de réponses pour comparer la réussite',
    'Aucune reprise après une faute',
    'Aucune reprise après une réponse juste',
    'Aucun jour de faute suivi d’une réponse un autre jour.',
  ]) {
    expect(personne).toContain(texte);
  }

  const ensemble = pageEnsemble({ depuis: vide });
  expect(ensemble).toContain('chiffres d’ensemble de 3 personnes actives');
  expect(ensemble).toContain('Pas assez de réponses pour comparer la réussite');
  const reprises = morceaux(ensemble).find((m) => titreDe(m) === 'Les reprises du jour') ?? '';
  expect(reprises).not.toBe('');
  expect(reprises).not.toContain('<th scope="row">');
  expect(reprises.split('Ce tableau est omis').length).toBe(6);
  for (const texte of ['dont aucune', 'Aucune reprise', 'Aucun jour de faute']) {
    expect(ensemble).not.toContain(texte);
  }
});

test('le_rapport_limite_dit_sa_fenetre_et_rien_d_autre', () => {
  const deux = [journalDe(1), journalDe(2)];
  const avec = page(deux, { depuis: DEPUIS });
  const sans = page(deux);
  expect(sans).toContain('Rapport d’ensemble : moins de trois personnes actives');
  expect(avec).toContain(`\n${LIGNE_DU_RAPPORT_LIMITE}</header>`);
  expect(avec.replace(`\n${LIGNE_DU_RAPPORT_LIMITE}`, '')).toBe(sans);
});

test('un_rapport_d_ensemble_lit_la_reussite_de_la_fenetre_dans_ses_lignes_et_sa_projection', () => {
  const journaux = troisPersonnes().map((j) => fautiveAvant(j, DEPUIS));
  const avec = page(journaux, { depuis: DEPUIS });
  const sans = page(journaux);
  const somme = (depuis?: string) =>
    sommerMesures(journaux.map((j) => mesures(j, cours, AUJOURDHUI, depuis)));
  const ligne = (part: string): string => `<th scope="row">Carte retournée</th><td>${part}</td>`;
  const enFenetre = somme(DEPUIS).modes.retournee;
  const surTout = somme().modes.retournee;
  const attendue = ligne(pourcent(enFenetre.justes / enFenetre.reponses));
  const fausse = ligne(pourcent(surTout.justes / surTout.reponses));
  expect(attendue).not.toBe(fausse);
  const sections = morceaux(avec);
  const moments = sections[sections.findIndex((m) => titreDe(m) === 'Les reprises du jour') - 1];
  expect(moments).toContain(attendue);
  expect(moments).not.toContain(fausse);

  // La projection d'ensemble lit la réussite de la fenêtre : moins de réponses par jour à tenir.
  const parJour = (html: string): number => {
    const ligne = /<tr><th scope="row">20<\/th><td>Leitner<\/td>(.*?)<\/tr>/.exec(html)?.[1] ?? '';
    return Number([...ligne.matchAll(/<td>([^<]*)<\/td>/g)][1]?.[1]);
  };
  expect(parJour(avec)).toBeLessThan(parJour(sans));
});
