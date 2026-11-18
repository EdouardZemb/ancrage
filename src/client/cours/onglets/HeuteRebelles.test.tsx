// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import { type ContexteCours, ContexteDuCours } from '../contexte-cours.js';
import { formater, TEXTES_COURS } from '../textes-cours.js';
import { Apercu } from './Apercu.js';
import { type EtatDeHeute, Heute } from './Heute.js';
import { boutons, choisir, cliquer, progression, texteDe } from './onglets.fixture.js';

/*
 * Les éléments rebelles dans « Heute » (M6, tranche 2) : un rebelle ne passe qu'une fois par jour,
 * porte « schwierig » et montre son aide une fois qu'il a cherché. Le cours de test prend un seuil
 * de 2 fautes : une unité juste, puis fausse deux jours différents, est rebelle. Données factices,
 * écrites à la main (invariant 7).
 */

afterEach(cleanup);

const t = TEXTES_COURS.de;

const HERZ = 'c1000001';
const LEBER = 'c1000002';
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
  const servi = cours();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'cartes'
        ? {
            ...module,
            cartes: module.cartes.map((carte) =>
              carte.id === HERZ
                ? { ...carte, aide: 'Herz pumpt, Leber filtert.', confonduAvec: LEBER }
                : carte,
            ),
          }
        : module,
    ),
  };
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
    // Le journal ne change pas : la réponse n'y est jamais entrée.
    const evenements = rebelle(HERZ);
    rendreDansLeCours(<Heute />, contexteDe({ evenements, memoire }));
    expect(progression()).toContain('1 fällig');

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.heute_encore })).toBeNull();
    expect(screen.getByText(t.heute_fertig)).toBeTruthy();

    // Un détour par un autre onglet : l'onglet revient, la mémoire du jour avec lui.
    cleanup();
    rendreDansLeCours(<Heute />, contexteDe({ evenements, memoire }));
    expect(screen.queryByRole('button', { name: t.heute_encore })).toBeNull();
    expect(screen.getByText(t.heute_fertig)).toBeTruthy();
    expect(etatGarde(memoire).seance.file).toEqual([]);
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
    const stat = Array.from(document.querySelectorAll('.stat')).find((s) =>
      s.textContent?.includes(t.apercu_dues),
    );
    expect(stat?.querySelector('b')?.textContent).toBe('1');
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
});

describe('Heute, l_aide du rebelle', () => {
  it('une_carte_retournee_montre_l_aide_au_verso_et_pas_au_recto', () => {
    rendreDansLeCours(<Heute />, contexteDe({ cours: coursAvecAide(), evenements: rebelle(HERZ) }));
    expect(screen.queryByText(t.rebelle_aide)).toBeNull();
    expect(screen.queryByText('Herz pumpt, Leber filtert.')).toBeNull();

    cliquer(t.cartes_retourner);

    expect(screen.getByText(t.rebelle_aide)).toBeTruthy();
    expect(screen.getByText('Herz pumpt, Leber filtert.')).toBeTruthy();
    expect(screen.getByText(/Nicht verwechseln mit:/)).toBeTruthy();
    expect(screen.getByText('Leber')).toBeTruthy();
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
      expect(screen.queryByText(t.rebelle_aide)).toBeNull();

      fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
        target: { value: saisie },
      });
      cliquer(t.cartes_verifier);

      expect(screen.getByText('Herz pumpt, Leber filtert.')).toBeTruthy();
    }
  });

  it('un_element_qui_n_est_pas_rebelle_n_a_pas_d_aide', () => {
    rendreDansLeCours(<Heute />, contexteDe({ cours: coursAvecAide(), evenements: fragile(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(screen.queryByText(t.rebelle_aide)).toBeNull();
    expect(screen.queryByText('Herz pumpt, Leber filtert.')).toBeNull();
  });

  it('un_rebelle_sans_aide_n_affiche_rien_de_plus', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(screen.queryByText(t.rebelle_aide)).toBeNull();
  });

  it('une_aide_qui_n_est_pas_un_texte_ne_s_affiche_pas', () => {
    const servi = coursAvecAide();
    const illisible = {
      ...servi,
      modules: servi.modules.map((module) =>
        module.type === 'cartes'
          ? {
              ...module,
              cartes: module.cartes.map((carte) =>
                carte.id === HERZ ? { ...carte, aide: 42, confonduAvec: 'inconnu' } : carte,
              ),
            }
          : module,
      ),
    } as unknown as CoursServi;
    rendreDansLeCours(<Heute />, contexteDe({ cours: illisible, evenements: rebelle(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(screen.queryByText(t.rebelle_aide)).toBeNull();
  });

  it('une_aide_avec_des_signes_de_balisage_s_affiche_telle_quelle', () => {
    const servi = coursAvecAide();
    const balisee = {
      ...servi,
      modules: servi.modules.map((module) =>
        module.type === 'cartes'
          ? {
              ...module,
              cartes: module.cartes.map((carte) =>
                carte.id === HERZ ? { ...carte, aide: '<b>Herz</b> & Co' } : carte,
              ),
            }
          : module,
      ),
    };
    rendreDansLeCours(<Heute />, contexteDe({ cours: balisee, evenements: rebelle(HERZ) }));

    cliquer(t.cartes_retourner);

    expect(document.querySelector('.aide-rebelle p')?.innerHTML).toBe(
      '&lt;b&gt;Herz&lt;/b&gt; &amp; Co',
    );
  });

  it('la_note_du_schema_s_affiche_apres_la_reponse_d_un_point_rebelle', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(MITTE) }));
    expect(screen.queryByText('Übungsschema ohne Vorbild')).toBeNull();

    choisir('Mitte');

    expect(screen.getByText(t.rebelle_aide)).toBeTruthy();
    expect(screen.getByText('Übungsschema ohne Vorbild')).toBeTruthy();
  });

  it('la_correction_d_une_affirmation_s_affiche_apres_la_reponse_d_un_rebelle', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: rebelle(MAGEN_FAUX) }));
    expect(screen.queryByText('Der Magen ist ein Hohlorgan.')).toBeNull();

    choisir(t.feuille_richtig);

    expect(screen.getByText(t.rebelle_aide)).toBeTruthy();
    expect(screen.getByText('Der Magen ist ein Hohlorgan.')).toBeTruthy();
  });

  it('un_vrai_faux_qui_n_est_pas_rebelle_ne_montre_pas_sa_correction_ici', () => {
    rendreDansLeCours(<Heute />, contexteDe({ evenements: fragile(MAGEN_FAUX) }));

    choisir(t.feuille_richtig);

    expect(screen.queryByText('Der Magen ist ein Hohlorgan.')).toBeNull();
  });
});
