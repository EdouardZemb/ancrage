// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import type { SensChoisi } from '../../../domaine/seances/cartes.js';
import { contexteDeTest, rendreDansLeCours, reponseDeTest } from '../contexte-cours.fixture.js';
import { type ContexteCours, ContexteDuCours } from '../contexte-cours.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Apercu } from './Apercu.js';
import { Planning } from './Planning.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

/* Données factices, écrites à la main (invariant 7). Le jour de test est le 17/10/2026. */
const REVISION = 'Woche 3 – Wiederholung';
const PLAN = {
  etapes: [
    { titre: 'Woche 1', semaine: 1, modules: [CHAPITRE_1] },
    { titre: 'Woche 2', semaine: 2, modules: [CHAPITRE_2] },
    { titre: REVISION, semaine: 3, genre: 'revision', modules: [] },
  ],
};

/** Un événement plus ancien, sur une unité hors du cours : seul le départ du planning change. */
const DEPART = reponseDeTest(0, 'zz000000', true, '2026-10-10');

function coursAvec(champs: { planning?: unknown; memoire?: unknown } = { planning: PLAN }) {
  return { ...coursServiDeTest(), ...champs } as CoursServi;
}

function unitesDe(contexte: ContexteCours, module: string): string[] {
  return contexte.cours.unites.filter((unite) => unite.module === module).map(({ id }) => id);
}

/** Quatre réponses justes de suite : les unités données sont en boîte 4, donc sûres. */
function sures(depart: number, ids: string[]): Evenement[] {
  return ids.flatMap((id, n) =>
    [0, 1, 2, 3].map((k) => reponseDeTest(depart + n * 4 + k, id, true, '2026-10-10')),
  );
}

function rendre(
  options: { cours?: CoursServi; evenements?: Evenement[]; sens?: SensChoisi } = {},
): ContexteCours {
  const contexte = contexteDeTest({
    cours: options.cours ?? coursAvec(),
    evenements: options.evenements ?? [DEPART],
  });
  if (options.sens !== undefined) {
    contexte.preferences = {
      ...contexte.preferences,
      cartes: { ...contexte.preferences.cartes, sens: options.sens },
    };
  }
  rendreDansLeCours(<Planning />, contexte);
  return contexte;
}

function lignes(): HTMLElement[] {
  return within(screen.getByRole('list', { name: t.onglet_planning })).getAllByRole('listitem');
}

function ligne(titre: string): HTMLElement {
  const trouvee = lignes().find((li) => li.textContent?.includes(titre));
  if (trouvee === undefined) throw new Error(`Pas de ligne « ${titre} »`);
  return trouvee;
}

describe('Planning', () => {
  it('le_lernplan_montre_les_etapes_dans_l_ordre_avec_leur_date', () => {
    rendre();

    const rangees = lignes();
    expect(rangees).toHaveLength(3);
    const attendues: [string, string][] = [
      ['Woche 1', 'ab 10.10.2026'],
      ['Woche 2', 'ab 17.10.2026'],
      [REVISION, 'ab 24.10.2026'],
    ];
    attendues.forEach(([titre, ouverture], rang) => {
      expect(rangees[rang].textContent).toContain(titre);
      expect(rangees[rang].textContent).toContain(ouverture);
      expect(rangees[rang].querySelector('.num')?.textContent).toBe(String(rang + 1));
    });
  });

  it.each([
    [REVISION, 'Kommt noch', 'unit'],
    ['Woche 1', 'Freigeschaltet', 'frei'],
    ['Woche 2', 'Sicher', 'ok'],
  ])('l_etat_de_chaque_etape_%s', (titre, libelle, classe) => {
    const contexte = contexteDeTest({ cours: coursAvec(), evenements: [DEPART] });
    const evenements = [DEPART, ...sures(1, unitesDe(contexte, CHAPITRE_2))];
    rendre({ evenements });

    const pastille = ligne(titre).querySelector(`.pill.${classe}`);
    expect(pastille?.textContent).toBe(libelle);
    // L'état se lit : un seul mot d'état par étape, jamais `offen`.
    expect(ligne(titre).querySelectorAll('.pill.unit, .pill.frei, .pill.ok')).toHaveLength(1);
    expect(document.querySelector('.pill.offen')).toBeNull();
  });

  it('l_etape_en_cours_porte_jetzt_et_aria_current', () => {
    rendre();

    const rangees = lignes();
    expect(rangees.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(rangees[1].querySelector('.pill.jetzt')?.textContent).toBe(t.planning_jetzt);
    expect(document.querySelectorAll('.pill.jetzt')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('une_etape_de_revision_dit_wiederholung', () => {
    rendre();

    expect(ligne(REVISION).querySelector('.meta')?.textContent).toBe(
      `${t.planning_revision} · ab 24.10.2026`,
    );
    expect(ligne('Woche 1').querySelector('.meta')?.textContent).toBe(
      'ab 10.10.2026 · 0/15 sicher',
    );
  });

  it('une_etape_sans_element_n_a_ni_barre_ni_compte', () => {
    rendre();

    const revision = ligne(REVISION);
    expect(revision.querySelector('.bar')).toBeNull();
    expect(revision.textContent).not.toContain('sicher');
    // Une étape qui a des éléments a l'un et l'autre.
    expect(ligne('Woche 1').querySelector('.bar')).not.toBeNull();
    expect(ligne('Woche 1').textContent).toContain('0/15 sicher');
  });

  it('le_retard_d_une_etape_depassee_se_dit_en_meta', () => {
    const contexte = contexteDeTest({ cours: coursAvec(), evenements: [DEPART] });
    const toutesSaufUne = unitesDe(contexte, CHAPITRE_1).slice(1);
    const evenements = [
      DEPART,
      ...toutesSaufUne.map((id, n) => reponseDeTest(1 + n, id, true, '2026-10-17')),
    ];
    rendre({ evenements });

    // Une seule carte neuve reste : le singulier.
    expect(Array.from(ligne('Woche 1').querySelectorAll('.meta')).at(-1)?.textContent).toBe(
      t.planning_retard_1,
    );
    cleanup();

    // Aucune réponse : les quinze cartes du chapitre, le pluriel.
    rendre();
    expect(ligne('Woche 1').textContent).toContain('15 neue Karten zum Nachholen');
  });

  it('pas_de_retard_pour_l_etape_en_cours', () => {
    rendre();

    // Woche 2 est en cours et a dix cartes neuves : ce n'est pas un retard.
    expect(ligne('Woche 2').textContent).not.toContain('Nachholen');
    expect(ligne(REVISION).textContent).not.toContain('Nachholen');
    expect(ligne('Woche 1').textContent).toContain('Nachholen');
  });

  it('le_compte_a_rebours_en_tete_quand_le_cours_a_un_examen', () => {
    const memoire = { algorithme: 'fsrs', retention: 0.9, examen: '2026-10-20' };
    rendre({ cours: coursAvec({ planning: PLAN, memoire }) });

    const compte = document.querySelector('.examenline');
    expect(compte?.textContent).toBe('Noch 3 Tage bis zur Prüfung');
    // En tête : avant la liste.
    const liste = screen.getByRole('list', { name: t.onglet_planning });
    expect(compte?.compareDocumentPosition(liste)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    cleanup();

    rendre();
    expect(document.querySelector('.examenline')).toBeNull();
    expect(document.querySelector('.controls')).toBeNull();
  });

  it('le_lernplan_n_a_ni_pourcentage_ni_rouge', () => {
    const contexte = contexteDeTest({ cours: coursAvec(), evenements: [DEPART] });
    const evenements = [
      DEPART,
      ...sures(1, unitesDe(contexte, CHAPITRE_2)),
      reponseDeTest(100, 'c1000001', false, '2026-10-17'),
    ];
    rendre({ evenements });

    expect(document.body.textContent).not.toContain('%');
    expect(document.body.querySelector('.ko, .wrong')).toBeNull();
    expect(document.body.querySelector('button')).toBeNull();
  });

  it('le_lernplan_compte_les_deux_sens_comme_l_uebersicht', () => {
    const contexte = contexteDeTest({ cours: coursAvec(), evenements: [DEPART] });
    // Une carte sûre dans chaque sens : deux sûres sur quinze.
    const evenements = [DEPART, ...sures(1, ['c1000001', 'c1000001:inverse'])];
    expect(unitesDe(contexte, CHAPITRE_1)).toHaveLength(15);

    rendre({ evenements, sens: 'direct' });
    const duLernplan = /(\d+\/\d+) sicher/.exec(ligne('Woche 1').textContent ?? '')?.[1];
    cleanup();

    const direct = contexteDeTest({ cours: coursAvec(), evenements });
    direct.preferences = {
      ...direct.preferences,
      cartes: { ...direct.preferences.cartes, sens: 'direct' },
    };
    rendreDansLeCours(<Apercu />, direct);
    const chapitre = screen
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('Anfangskapitel'));
    const delUebersicht = /(\d+\/\d+) sicher/.exec(chapitre?.textContent ?? '')?.[1];

    expect(duLernplan).toBe('2/15');
    expect(delUebersicht).toBe(duLernplan);
  });

  it.each([
    ['direct', 6],
    ['inverse', 7],
    ['mix', 13],
  ] as const)('le_retard_suit_le_sens_choisi_dans_karteikarten_%s', (sens, retard) => {
    const evenements = [
      DEPART,
      reponseDeTest(1, 'c1000001', true, '2026-10-17'),
      reponseDeTest(2, 'c1000002', true, '2026-10-17'),
    ];
    rendre({ evenements, sens });

    expect(ligne('Woche 1').textContent).toContain(`${retard} neue Karten zum Nachholen`);
  });

  it('le_lernplan_suit_le_jour_et_le_sens_d_une_meme_vue', () => {
    const cours = coursAvec();
    const evenements = [DEPART];
    const modele = { ...contexteDeTest({ cours, evenements }), aujourdhui: '2026-10-23' };
    const vue = rendreDansLeCours(<Planning />, modele);
    const courants = () => lignes().map((li) => li.getAttribute('aria-current'));
    expect(courants()).toEqual([null, 'step', null]);

    const lendemain = { ...modele, aujourdhui: '2026-10-24' };
    vue.rerender(
      <ContexteDuCours.Provider value={lendemain}>
        <Planning />
      </ContexteDuCours.Provider>,
    );
    expect(courants()).toEqual([null, null, 'step']);
    expect(ligne('Woche 1').textContent).toContain('15 neue Karten zum Nachholen');

    const direct = {
      ...lendemain,
      preferences: {
        ...lendemain.preferences,
        cartes: { ...lendemain.preferences.cartes, sens: 'direct' as const },
      },
    };
    vue.rerender(
      <ContexteDuCours.Provider value={direct}>
        <Planning />
      </ContexteDuCours.Provider>,
    );
    expect(ligne('Woche 1').textContent).toContain('8 neue Karten zum Nachholen');
  });

  it('sans_planning_rien', () => {
    const sans = rendreDansLeCours(<Planning />, contexteDeTest({ cours: coursAvec({}) }));
    expect(sans.container.innerHTML).toBe('');
    cleanup();

    // Un planning que ce client ne lit pas vaut pas de planning.
    const illisible = { etapes: [{ titre: 'x', modules: [] }] };
    const vue = rendreDansLeCours(
      <Planning />,
      contexteDeTest({ cours: coursAvec({ planning: illisible }) }),
    );
    expect(vue.container.innerHTML).toBe('');
    expect(screen.queryByRole('list')).toBeNull();
  });
});
