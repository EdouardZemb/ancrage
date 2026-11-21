// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAPITRE_1,
  CHAPITRE_2,
  coursAvecChampsDeCarte,
  coursServiDeTest,
} from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import { statistiquesDeChapitre } from '../../../domaine/progression/statistiques.js';
import { unitesDuChoix } from '../../../domaine/seances/cartes.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import { type ContexteCours, ContexteDuCours } from '../contexte-cours.js';
import { CLE_REBELLES_REPONDUS } from '../ecartes-du-jour.js';
import { formater, TEXTES_COURS } from '../textes-cours.js';
import { Apercu } from './Apercu.js';
import { type EtatDeHeute, Heute } from './Heute.js';
import { boutons, choisir, cliquer, progression, texteDe } from './onglets.fixture.js';

/*
 * Les éléments rebelles dans « Heute » (M6, tranche 2) : un rebelle ne passe qu'une fois par jour
 * et porte « schwierig ». Son aide se montre après toute réponse ; celle d'un élément qui n'est pas
 * rebelle, après une faute seulement (M9). Le cours de test prend un seuil de 2 fautes : une unité
 * juste, puis fausse deux jours différents, est rebelle. Données factices, écrites à la main
 * (invariant 7).
 */

afterEach(cleanup);

const t = TEXTES_COURS.de;

const HERZ = 'c1000001';
const LEBER = 'c1000002';
const NIERE = 'c1000003';
const GASTRITIS = 'w0000001';
const MITTE = 'q0000002';
const ARTIKEL = 'e1000001';
const QCM = 'fb000007';
const MAGEN_FAUX = 'fb000009';

let compteur = 0;
const prochain = (): number => ++compteur;

/** Juste, puis faux deux autres jours, avant aujourd'hui : l'unité est rebelle et due. */
function rebelle(unite: string): Evenement[] {
  return [
    reponseDeTest(prochain(), unite, true, '2026-10-10'),
    reponseDeTest(prochain(), unite, false, '2026-10-11'),
    reponseDeTest(prochain(), unite, false, '2026-10-12'),
  ];
}

/** Juste, puis une seule faute : due, mais pas rebelle. */
function fragile(unite: string): Evenement[] {
  return [
    reponseDeTest(prochain(), unite, true, '2026-10-10'),
    reponseDeTest(prochain(), unite, false, '2026-10-11'),
  ];
}

function cours(champs: Partial<CoursServi> = {}): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    rebelles: { fautes: 2 },
    // Aucune carte neuve : la séance ne compte que ce qui est dû.
    leitner: { ...servi.leitner, nouvellesParSeance: 0 },
    ...champs,
  };
}

/** Le cours dont la carte Herz porte une aide, et la confusion avec Leber. */
function coursAvecAide(): CoursServi {
  return coursAvecChampsDeCarte(cours(), HERZ, {
    aide: 'Herz pumpt, Leber filtert.',
    confonduAvec: LEBER,
  });
}

function contexteDe(options: {
  cours?: CoursServi;
  evenements?: Evenement[];
  memoire?: Map<string, unknown>;
  saisie?: boolean;
}): ContexteCours {
  const contexte = contexteDeTest({ ...options, cours: options.cours ?? cours() });
  contexte.hasard = () => 0;
  if (options.saisie !== undefined) {
    contexte.preferences = {
      ...contexte.preferences,
      cartes: { ...contexte.preferences.cartes, saisie: options.saisie },
    };
  }
  return contexte;
}

function etatGarde(memoire: Map<string, unknown>): EtatDeHeute {
  return memoire.get('heute') as EtatDeHeute;
}

const LIEN = formater(t.heute_rebelles, { n: 1 });

/** Le chiffre « heute zu wiederholen » d'Übersicht. */
const compteDuJour = (): string | undefined =>
  Array.from(document.querySelectorAll('.stat'))
    .find((stat) => stat.textContent?.includes(t.apercu_dues))
    ?.querySelector('b')
    ?.textContent?.trim();

describe('Heute, les rebelles', () => {
  it('un_rebelle_manque_sort_et_l_ecran_de_fin_ne_le_compte_pas_comme_du', () => {
    const contexte = contexteDe({ evenements: rebelle(HERZ) });
    rendreDansUnCoursVivant(<Heute />, contexte);
    expect(document.querySelector('.card .front')?.textContent).toBe('Herz');

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    expect(contexte.enregistrer).toHaveBeenCalledExactlyOnceWith(HERZ, false, 'retournee');
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.getByText(formater(t.heute_resultat, { justes: 0, faites: 1 }))).toBeTruthy();
    // Il reste dû pour l'ordonnanceur, plus pour « Heute » : ni reste, ni nouvelle ronde.
    expect(screen.queryByText(/Noch \d+ fällig/)).toBeNull();
    expect(screen.queryByRole('button', { name: t.heute_encore })).toBeNull();
    expect(screen.getByText(t.heute_fertig)).toBeTruthy();
    // Le lien vers la liste, avec le nombre de rebelles.
    cliquer(LIEN);
    expect(contexte.aller).toHaveBeenCalledExactlyOnceWith('progression');
  });

  it('un_rebelle_dont_l_ecriture_echoue_ne_revient_ni_par_la_ronde_ni_apres_un_detour', () => {
    const memoire = new Map<string, unknown>();
    // Le journal ne change pas : aucune réponse n'y entre. Herz est rebelle, Leber fragile, toutes
    // deux dues.
    const evenements = [...rebelle(HERZ), ...fragile(LEBER)];
    const contexte = contexteDe({ evenements, memoire });
    rendreDansLeCours(<Heute />, contexte);
    expect(progression()).toContain('2 fällig');
    const toutManquer = () => {
      for (let i = 0; i < 4 && screen.queryByRole('heading', { name: t.heute_fin }) === null; i++) {
        cliquer(t.cartes_retourner);
        cliquer(t.cartes_pas_su);
      }
    };
    const reponsesA = (unite: string) =>
      vi.mocked(contexte.enregistrer).mock.calls.filter(([id]) => id === unite).length;

    // Herz, rebelle, sort au premier manque ; Leber revient une fois.
    toutManquer();
    expect(reponsesA(HERZ)).toBe(1);
    expect(reponsesA(LEBER)).toBe(2);
    // Seule Leber reste due : le rebelle noté par l'onglet n'est pas compté.
    expect(screen.getByText(/Noch 1 fällig/)).toBeTruthy();
    cliquer(t.heute_encore);
    expect(etatGarde(memoire).seance.file.map(({ id }) => id)).toEqual([LEBER]);
    expect(progression()).toContain('1 fällig');

    // Un détour par un autre onglet : la mémoire du jour revient avec l'onglet.
    cleanup();
    rendreDansLeCours(<Heute />, contexteDe({ evenements, memoire }));
    toutManquer();
    expect(screen.getByText(/Noch 1 fällig/)).toBeTruthy();
    expect(screen.queryByText(/Noch 2 fällig/)).toBeNull();
    cliquer(t.heute_encore);
    expect(etatGarde(memoire).seance.file.map(({ id }) => id)).toEqual([LEBER]);
  });

  it('le_lien_vers_la_liste_compte_les_rebelles_et_non_les_ecartes', () => {
    // Herz est rebelle et due ; Leber est rebelle et déjà répondue aujourd'hui (écartée).
    const evenements = [
      ...rebelle(HERZ),
      ...rebelle(LEBER),
      reponseDeTest(prochain(), LEBER, false, AUJOURDHUI_DE_TEST),
      // Niere est rebelle, mais ni due ni répondue aujourd'hui : elle compte aussi.
      ...[
        ['04', true],
        ['05', true],
        ['06', true],
        ['07', false],
        ['08', false],
        ['15', true],
        ['16', true],
      ].map(([jour, juste]) => reponseDeTest(prochain(), NIERE, juste === true, `2026-10-${jour}`)),
    ];
    rendreDansLeCours(<Heute />, contexteDe({ evenements }));

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    expect(screen.getByRole('button', { name: formater(t.heute_rebelles, { n: 3 }) })).toBeTruthy();
  });

  it('un_manque_dans_un_onglet_avant_le_premier_geste_recompose_la_seance_sans_lui', () => {
    const memoire = new Map<string, unknown>();
    const avant = fragile(HERZ);
    const rendu = rendreDansLeCours(<Heute />, contexteDe({ evenements: avant, memoire }));
    expect(etatGarde(memoire).seance.file.map(({ id }) => id)).toEqual([HERZ]);

    // Un onglet le manque aujourd'hui : il devient rebelle, et il est écarté pour aujourd'hui.
    const apres = [...avant, reponseDeTest(prochain(), HERZ, false, AUJOURDHUI_DE_TEST)];
    rendu.rerender(
      <ContexteDuCours.Provider value={contexteDe({ evenements: apres, memoire })}>
        <Heute />
      </ContexteDuCours.Provider>,
    );

    expect(etatGarde(memoire).seance.file).toEqual([]);
    expect(screen.getByRole('heading', { name: t.heute_rien })).toBeTruthy();
    expect(screen.getByRole('button', { name: LIEN })).toBeTruthy();
  });

  it('un_mot_qui_devient_rebelle_par_sa_reponse_revient_une_fois', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ evenements: fragile(GASTRITIS), memoire });
    rendreDansUnCoursVivant(<Heute />, contexte);
    const morphemes = contexte.cours.morphologie?.morphemes ?? [];
    const mot = contexte.cours.morphologie?.mots.find(({ id }) => id === GASTRITIS);
    expect(mot).toBeDefined();

    // Chaque partie est mal nommée : le mot est manqué, et sa faute d'aujourd'hui le rend rebelle.
    for (const segment of mot?.segments ?? []) {
      const sens = morphemes.find(({ id }) => id === segment.morpheme)?.sens;
      const faux = boutons().find((option) => texteDe(option) !== sens);
      expect(faux).toBeDefined();
      fireEvent.click(faux as HTMLButtonElement);
    }
    expect(etatGarde(memoire).repondue).toBe(false);
    cliquer(t.suivante);

    // Le verdict est celui du geste qui jugeait : le mot n'était pas rebelle, il revient.
    expect(etatGarde(memoire).seance.file.map(({ id }) => id)).toEqual([GASTRITIS]);
    expect(etatGarde(memoire).seance.revenus).toEqual([GASTRITIS]);
    expect(progression()).toContain('1 beantwortet · 1 offen');
    // Il est rebelle à son retour : le journal a bien rangé sa réponse.
    expect(screen.getAllByText(t.rebelle_marque)).toHaveLength(1);
  });

  it('un_element_manque_qui_n_est_pas_rebelle_revient_comme_avant', () => {
    const memoire = new Map<string, unknown>();
    rendreDansUnCoursVivant(<Heute />, contexteDe({ evenements: fragile(HERZ), memoire }));

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    expect(etatGarde(memoire).seance.file.map(({ id }) => id)).toEqual([HERZ]);
    expect(progression()).toContain('1 beantwortet · 1 offen');
  });

  it('un_rebelle_vu_en_pretest_aujourd_hui_entre_dans_la_seance', () => {
    const evenements = [
      ...rebelle(HERZ),
      reponseDeTest(prochain(), HERZ, false, AUJOURDHUI_DE_TEST, 'pretest'),
    ];
    rendreDansLeCours(<Heute />, contexteDe({ evenements }));

    expect(document.querySelector('.card .front')?.textContent).toBe('Herz');
  });

  it('sans_rebelle_aucun_lien_vers_la_liste', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: [] }));

    expect(screen.getByRole('heading', { name: t.heute_rien })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Schwierige Begriffe/ })).toBeNull();
  });

  it('uebersicht_et_heute_disent_le_meme_compte_avec_un_rebelle_ecarte', () => {
    const evenements = [
      ...rebelle(HERZ),
      reponseDeTest(prochain(), HERZ, false, AUJOURDHUI_DE_TEST),
      reponseDeTest(prochain(), LEBER, false, '2026-10-10'),
    ];
    rendreDansLeCours(<Heute />, contexteDe({ evenements }));
    // Seule Leber est à poser : Herz, rebelle déjà répondue, est écartée.
    expect(progression()).toContain('1 fällig');
    cleanup();

    rendreDansLeCours(<Apercu />, contexteDe({ evenements }));
    expect(compteDuJour()).toBe('1');
  });

  it('uebersicht_exclut_un_rebelle_que_l_onglet_heute_a_note_sans_que_le_journal_l_ait', () => {
    // L'écriture a échoué : le journal ne dit rien d'aujourd'hui, mais l'onglet a noté Herz.
    const evenements = [...rebelle(HERZ), reponseDeTest(prochain(), LEBER, false, '2026-10-10')];
    const memoire = new Map<string, unknown>();
    rendreDansLeCours(<Apercu />, contexteDe({ evenements, memoire }));
    expect(compteDuJour()).toBe('2');
    cleanup();

    memoire.set(CLE_REBELLES_REPONDUS, { jour: AUJOURDHUI_DE_TEST, ids: [HERZ] });
    rendreDansLeCours(<Apercu />, contexteDe({ evenements, memoire }));
    expect(compteDuJour()).toBe('1');
    cleanup();

    // Une note d'un autre jour ne compte pas.
    memoire.set(CLE_REBELLES_REPONDUS, { jour: '2026-10-16', ids: [HERZ] });
    rendreDansLeCours(<Apercu />, contexteDe({ evenements, memoire }));
    expect(compteDuJour()).toBe('2');
  });

  it('la_ligne_fallig_d_un_chapitre_ne_change_pas_quand_un_de_ses_rebelles_est_ecarte', () => {
    // Herz est rebelle, et répondue (fausse) aujourd'hui : écartée de « Heute », mais Karteikarten
    // la pose encore, donc le chapitre la compte toujours.
    const evenements = [
      ...rebelle(HERZ),
      reponseDeTest(prochain(), HERZ, false, AUJOURDHUI_DE_TEST),
    ];
    const contexte = contexteDe({ evenements });
    const unitesDuChapitre = unitesDuChoix(contexte.cours, CHAPITRE_1, 'mix');
    const attendu = statistiquesDeChapitre(unitesDuChapitre, contexte.etats, AUJOURDHUI_DE_TEST);
    expect(attendu.dues).toBeGreaterThan(0);

    rendreDansLeCours(<Apercu />, contexte);

    const ligne = formater(t.apercu_chapitre, {
      sures: attendu.sures,
      total: attendu.total,
      dues: attendu.dues,
      neues: attendu.boites[0],
    });
    expect(screen.getByText(ligne)).toBeTruthy();
    // Alors que le compte du jour, lui, a écarté Herz.
    expect(compteDuJour()).toBe('0');
  });

  it.each([
    ['une_carte', HERZ],
    ['un_mot', GASTRITIS],
    ['un_point_de_schema', MITTE],
    ['un_exercice', ARTIKEL],
    ['une_question_fermee', QCM],
  ])('la_marque_schwierig_sur_%s_rebelle', (_nom, id) => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(id) }));

    expect(screen.getAllByText(t.rebelle_marque)).toHaveLength(1);
  });

  it.each([
    ['une_carte', HERZ],
    ['un_mot', GASTRITIS],
    ['un_point_de_schema', MITTE],
    ['un_exercice', ARTIKEL],
    ['une_question_fermee', QCM],
  ])('%s_qui_n_est_pas_rebelle_n_est_pas_marque', (_nom, id) => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: fragile(id) }));

    expect(screen.queryByText(t.rebelle_marque)).toBeNull();
  });
});

/** L'aide de Herz et sa confusion avec Leber, montrées sous la carte retournée. */
function verAideEtConfusion(): void {
  expect(screen.getByText(t.aide_titre)).toBeTruthy();
  expect(screen.getByText('Herz pumpt, Leber filtert.')).toBeTruthy();
  expect(screen.getByText(/Nicht verwechseln mit:/)).toBeTruthy();
  expect(screen.getByText('Leber')).toBeTruthy();
}

describe('Heute, l_aide d_un element', () => {
  it('une_carte_retournee_montre_l_aide_au_verso_et_pas_au_recto', () => {
    rendreDansLeCours(<Heute />, contexteDe({ cours: coursAvecAide(), evenements: rebelle(HERZ) }));
    expect(screen.queryByText(t.aide_titre)).toBeNull();
    expect(screen.queryByText('Herz pumpt, Leber filtert.')).toBeNull();

    cliquer(t.cartes_retourner);

    verAideEtConfusion();
  });

  it('une_carte_saisie_montre_l_aide_avec_le_verdict_juste_ou_faux', () => {
    for (const saisie of ['Herz', 'Nichts']) {
      cleanup();
      rendreDansLeCours(
        <Heute />,
        contexteDe({
          cours: coursAvecAide(),
          evenements: rebelle(`${HERZ}:inverse`),
          saisie: true,
        }),
      );
      expect(screen.queryByText(t.aide_titre)).toBeNull();

      fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
        target: { value: saisie },
      });
      cliquer(t.cartes_verifier);

      expect(screen.getByText('Herz pumpt, Leber filtert.')).toBeTruthy();
    }
  });

  it('une_carte_retournee_qui_n_est_pas_rebelle_montre_son_aide_au_verso', () => {
    rendreDansLeCours(<Heute />, contexteDe({ cours: coursAvecAide(), evenements: fragile(HERZ) }));
    expect(screen.queryByText(t.aide_titre)).toBeNull();

    cliquer(t.cartes_retourner);

    verAideEtConfusion();
  });

  it('une_carte_saisie_qui_n_est_pas_rebelle_montre_l_aide_apres_une_faute_seulement', () => {
    const poser = (saisie: string) => {
      rendreDansLeCours(
        <Heute />,
        contexteDe({
          cours: coursAvecAide(),
          evenements: fragile(`${HERZ}:inverse`),
          saisie: true,
        }),
      );
      fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
        target: { value: saisie },
      });
      cliquer(t.cartes_verifier);
    };
    poser('Nichts');
    expect(screen.getByText(t.cartes_fausse)).toBeTruthy();
    expect(screen.getByText('Herz pumpt, Leber filtert.')).toBeTruthy();
    cleanup();

    poser('Herz');
    expect(screen.getByText(t.cartes_juste)).toBeTruthy();
    expect(screen.queryByText(t.aide_titre)).toBeNull();
  });

  it('un_rebelle_sans_aide_n_affiche_rien_de_plus', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(screen.queryByText(t.aide_titre)).toBeNull();
  });

  it('une_aide_qui_n_est_pas_un_texte_ne_s_affiche_pas', () => {
    const illisible = coursAvecChampsDeCarte(cours(), HERZ, { aide: 42, confonduAvec: 'inconnu' });
    rendreDansLeCours(<Heute />, contexteDe({ cours: illisible, evenements: rebelle(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(screen.queryByText(t.aide_titre)).toBeNull();
  });

  it('une_aide_avec_des_signes_de_balisage_s_affiche_telle_quelle', () => {
    const balisee = coursAvecChampsDeCarte(cours(), HERZ, { aide: '<b>Herz</b> & Co' });
    rendreDansLeCours(<Heute />, contexteDe({ cours: balisee, evenements: rebelle(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(document.querySelector('.aide p')?.innerHTML).toBe('&lt;b&gt;Herz&lt;/b&gt; &amp; Co');
  });

  it('la_note_du_schema_s_affiche_apres_la_reponse_d_un_point_rebelle', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(MITTE) }));
    expect(screen.queryByText('Übungsschema ohne Vorbild')).toBeNull();

    choisir('Mitte');

    expect(screen.getByText(t.aide_titre)).toBeTruthy();
    expect(screen.getByText('Übungsschema ohne Vorbild')).toBeTruthy();
  });

  it('la_correction_d_une_affirmation_s_affiche_apres_la_reponse_d_un_rebelle', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(MAGEN_FAUX) }));
    expect(screen.queryByText('Der Magen ist ein Hohlorgan.')).toBeNull();

    choisir(t.feuille_richtig);

    expect(screen.getByText(t.aide_titre)).toBeTruthy();
    expect(screen.getByText('Der Magen ist ein Hohlorgan.')).toBeTruthy();
  });

  it('un_vrai_faux_qui_n_est_pas_rebelle_montre_sa_correction_apres_une_faute_seulement', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: fragile(MAGEN_FAUX) }));
    expect(screen.queryByText('Der Magen ist ein Hohlorgan.')).toBeNull();

    choisir(t.feuille_richtig);

    expect(screen.getByText('Der Magen ist ein Hohlorgan.')).toBeTruthy();
    cleanup();

    rendreDansLeCours(<Heute />, contexteDe({ evenements: fragile(MAGEN_FAUX) }));
    choisir(t.feuille_falsch);

    expect(document.querySelector('.options .right')).not.toBeNull();
    expect(document.querySelector('.options .wrong')).toBeNull();
    expect(screen.queryByText('Der Magen ist ein Hohlorgan.')).toBeNull();
  });

  it('un_point_qui_n_est_pas_rebelle_montre_la_note_apres_une_faute_seulement', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: fragile(MITTE) }));
    expect(screen.queryByText('Übungsschema ohne Vorbild')).toBeNull();

    choisir('Rand');

    expect(screen.getByText(t.verdict_fausse)).toBeTruthy();
    expect(screen.getByText('Übungsschema ohne Vorbild')).toBeTruthy();
    cleanup();

    rendreDansLeCours(<Heute />, contexteDe({ evenements: fragile(MITTE) }));
    choisir('Mitte');

    expect(screen.getByText(t.verdict_juste)).toBeTruthy();
    expect(screen.queryByText('Übungsschema ohne Vorbild')).toBeNull();
  });

  it('un_vrai_faux_rebelle_montre_sa_correction_apres_une_reponse_juste', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(MAGEN_FAUX) }));

    choisir(t.feuille_falsch);

    expect(document.querySelector('.options .wrong')).toBeNull();
    expect(screen.getByText('Der Magen ist ein Hohlorgan.')).toBeTruthy();
  });
});

describe('Heute, les rebelles à une étape de révision et selon le sens', () => {
  const PLANNING = {
    etapes: [
      { titre: 'Woche 1', seance: '2026-10-10', genre: 'cours', modules: [CHAPITRE_1] },
      { titre: 'Woche 2', seance: '2026-10-13', genre: 'cours', modules: [CHAPITRE_2] },
      { titre: 'Woche 3', seance: '2026-10-17', genre: 'revision', modules: [] },
    ],
  };
  // Intervalles longs : un élément juste hier n'est pas dû, il est révisable.
  const coursDeRevision = (): CoursServi => ({
    ...cours({ planning: PLANNING }),
    leitner: { intervalles: [0, 3, 6, 9, 12, 15], nouvellesParSeance: 0 },
  });
  /** Rebelle (deux fautes, deux succès de suite) mais pas due : sa dernière réponse juste est du 10. */
  const rebelleRevisable = (unite: string): Evenement[] =>
    [
      ['04', true],
      ['05', true],
      ['06', true],
      ['07', false],
      ['08', false],
      ['09', true],
      ['10', true],
    ].map(([jour, juste]) => reponseDeTest(prochain(), unite, juste === true, `2026-10-${jour}`));

  it('a_une_etape_de_revision_un_rebelle_deja_repondu_aujourd_hui_n_est_pas_dans_la_file', () => {
    const revisables = [HERZ, LEBER, 'c1000003'];
    const autres = revisables
      .slice(1)
      .map((id) => reponseDeTest(prochain(), id, true, '2026-10-15'));
    const avant = new Map<string, unknown>();
    rendreDansLeCours(
      <Heute />,
      contexteDe({
        cours: coursDeRevision(),
        evenements: [...rebelleRevisable(HERZ), ...autres],
        memoire: avant,
      }),
    );
    // Sans réponse du jour, le rebelle est une révision de la séance.
    expect(etatGarde(avant).seance.file.map(({ id }) => id)).toContain(HERZ);
    cleanup();

    // Le journal ne dit rien d'aujourd'hui pour Herz (l'écriture a échoué), mais l'onglet l'a noté :
    // il n'est ni dans la file, ni parmi les révisions retenues.
    const apres = new Map<string, unknown>();
    apres.set(CLE_REBELLES_REPONDUS, { jour: AUJOURDHUI_DE_TEST, ids: [HERZ] });
    rendreDansLeCours(
      <Heute />,
      contexteDe({
        cours: coursDeRevision(),
        evenements: [...rebelleRevisable(HERZ), ...autres],
        memoire: apres,
      }),
    );

    expect(etatGarde(apres).seance.file.map(({ id }) => id)).not.toContain(HERZ);
    expect(etatGarde(apres).revisions ?? []).not.toContain(HERZ);
    // Les autres révisions, elles, sont bien retenues.
    expect(etatGarde(apres).revisions).toEqual(expect.arrayContaining(revisables.slice(1)));
  });

  it('le_sens_direct_manque_revient_et_le_sens_inverse_rebelle_manque_sort', () => {
    const contexte = contexteDe({
      evenements: [
        reponseDeTest(prochain(), HERZ, false, '2026-10-10'),
        ...rebelle(`${HERZ}:inverse`),
      ],
      saisie: false,
    });
    rendreDansUnCoursVivant(<Heute />, contexte);

    for (let i = 0; i < 6 && screen.queryByRole('heading', { name: t.heute_fin }) === null; i++) {
      cliquer(t.cartes_retourner);
      cliquer(t.cartes_pas_su);
    }

    const reponsesA = (unite: string) =>
      vi.mocked(contexte.enregistrer).mock.calls.filter(([id]) => id === unite).length;
    // Le sens direct, qui n'est pas rebelle, est repris une fois ; l'inverse, rebelle, sort.
    expect(reponsesA(HERZ)).toBe(2);
    expect(reponsesA(`${HERZ}:inverse`)).toBe(1);
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
  });
});
