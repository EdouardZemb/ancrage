// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import {
  CHAPITRE_1,
  CHAPITRE_2,
  coursSans,
  coursServiDeTest,
} from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  examenDeTest,
  rendreDansLeCours,
  rendreDansUnCoursNavigable,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import { Apercu } from './Apercu.js';
import { Cartes } from './Cartes.js';

afterEach(cleanup);

/** Le nombre d'un des quatre chiffres, repéré par son libellé. */
function chiffre(libelle: string): string {
  const carte = screen.getByText(libelle).closest('.stat');
  return carte?.querySelector('b')?.textContent ?? '';
}

function lignes(titre: string): HTMLElement[] {
  return within(screen.getByRole('list', { name: titre })).getAllByRole('listitem');
}

/**
 * Un journal varié : une carte sûre (quatre réponses justes), une carte due (une faute il y a deux
 * jours), une carte répondue aujourd'hui, trois mots, une unité que le cours n'a plus, et deux
 * examens. Des réponses le 15, le 16 et le 17 : trois jours de suite.
 */
const JOURNAL = [
  reponseDeTest(1, 'c1000001', true, '2026-10-10'),
  reponseDeTest(2, 'c1000001', true, '2026-10-10'),
  reponseDeTest(3, 'c1000001', true, '2026-10-10'),
  reponseDeTest(4, 'c1000001', true, '2026-10-10'),
  reponseDeTest(5, 'c2000001', false, '2026-10-15'),
  examenDeTest(6, 4.5, '2026-10-15'),
  reponseDeTest(7, 'w0000003', false, '2026-10-16'),
  examenDeTest(8, 5, '2026-10-16'),
  reponseDeTest(9, 'c1000002', true, AUJOURDHUI_DE_TEST),
  reponseDeTest(10, 'w0000001', true, AUJOURDHUI_DE_TEST),
  reponseDeTest(11, 'w0000002', false, AUJOURDHUI_DE_TEST),
  reponseDeTest(12, 'zz000001', true, AUJOURDHUI_DE_TEST),
];

describe('Apercu', () => {
  it('apercu_affiche_les_chiffres_du_journal', () => {
    const contexte = contexteDeTest({ evenements: JOURNAL });
    rendreDansLeCours(<Apercu />, contexte);

    const total = contexte.cours.unites.length;
    expect(chiffre('Fragen sicher gewusst')).toBe(`1 / ${total}`);
    // La carte fausse le 15 et les deux mots faux (le 16 et aujourd'hui, la boîte 1 revient le
    // jour même) sont dus : le chiffre est celui de « Heute » (M2-P5).
    expect(chiffre('heute zu wiederholen')).toBe('3');
    expect(chiffre('Wörter zerlegt / gebildet')).toBe('1 / 3');
    // Le dernier examen remis, pas le meilleur.
    expect(chiffre('letzte Prüfungsnote')).toBe('5.0');
    expect(screen.queryByText('noch keine Probeprüfung')).toBeNull();
    expect(screen.getByText(/Tage in Folge gelernt/).textContent).toBe(
      'Jede Karte wird in beide Richtungen abgefragt: Begriff → Bedeutung und Bedeutung → ' +
        'Begriff. 3 Tage in Folge gelernt · 4 Antworten heute.',
    );
  });

  it('apercu_un_mot_du_compte_dans_les_a_revoir_aujourd_hui_pas_dans_son_chapitre', () => {
    // M2-P5 : le chiffre est celui de « Heute », tous types confondus ; la ligne d'un chapitre
    // ne compte que ses cartes.
    const contexte = contexteDeTest({
      evenements: [reponseDeTest(1, 'w0000001', false, '2026-10-10')],
    });
    rendreDansLeCours(<Apercu />, contexte);

    expect(chiffre('heute zu wiederholen')).toBe('1');
    for (const chapitre of lignes('Kapitel')) {
      expect(chapitre.textContent).toContain(' 0 fällig · ');
    }
  });

  it('apercu_sans_journal_aucune_note', () => {
    const contexte = contexteDeTest();
    rendreDansLeCours(<Apercu />, contexte);

    expect(chiffre('Fragen sicher gewusst')).toBe(`0 / ${contexte.cours.unites.length}`);
    expect(chiffre('heute zu wiederholen')).toBe('0');
    expect(chiffre('Wörter zerlegt / gebildet')).toBe('0 / 3');
    expect(chiffre('noch keine Probeprüfung')).toBe('–');
    expect(screen.queryByText('letzte Prüfungsnote')).toBeNull();
    expect(screen.getByText(/Tage in Folge gelernt/).textContent).toContain(
      '0 Tage in Folge gelernt · 0 Antworten heute.',
    );
  });

  it('apercu_un_chapitre_par_module_de_cartes', () => {
    const contexte = contexteDeTest({ evenements: JOURNAL });
    rendreDansLeCours(<Apercu />, contexte);

    const chapitres = lignes('Kapitel');
    expect(chapitres).toHaveLength(2);
    const dans = (module: string) =>
      contexte.cours.unites.filter((unite) => unite.module === module).length;
    // Chapitre 1 : une sûre (c1000001), une en boîte 1 (c1000002), aucune due.
    expect(chapitres[0].querySelector('.num')?.textContent).toBe('1');
    expect(chapitres[0].textContent).toContain('Anfangskapitel');
    expect(chapitres[0].textContent).toContain(
      `1/${dans(CHAPITRE_1)} sicher · 0 fällig · ${dans(CHAPITRE_1) - 2} neu`,
    );
    // Chapitre 2 : une due (c2000001).
    expect(chapitres[1].querySelector('.num')?.textContent).toBe('2');
    expect(chapitres[1].textContent).toContain('Vorsilben');
    expect(chapitres[1].textContent).toContain(
      `0/${dans(CHAPITRE_2)} sicher · 1 fällig · ${dans(CHAPITRE_2) - 1} neu`,
    );
    for (const chapitre of chapitres) {
      expect(within(chapitre).getByRole('button').textContent).toBe('Lernen');
    }
    expect(screen.getByText('neu / Fach 1')).toBeTruthy();
    expect(screen.getByText('Fach 4 · sicher')).toBeTruthy();
  });

  it('lernen_choisit_le_chapitre_et_ouvre_les_cartes', () => {
    const contexte = contexteDeTest();
    rendreDansLeCours(<Apercu />, contexte);

    fireEvent.click(within(lignes('Kapitel')[1]).getByRole('button', { name: 'Lernen' }));

    expect(contexte.changerPreferences).toHaveBeenCalledWith({
      ...contexte.preferences,
      cartes: { ...contexte.preferences.cartes, chapitre: CHAPITRE_2 },
    });
    expect(contexte.aller).toHaveBeenCalledWith('cartes');
    // Le chapitre est choisi avant d'ouvrir les cartes, qui le lisent.
    const [preferences] = (contexte.changerPreferences as Mock).mock.invocationCallOrder;
    const [aller] = (contexte.aller as Mock).mock.invocationCallOrder;
    expect(preferences).toBeLessThan(aller);
  });

  it('lernen_repart_d_une_serie_neuve', () => {
    const contexte = contexteDeTest();
    contexte.preferences = {
      ...contexte.preferences,
      cartes: { chapitre: CHAPITRE_1, sens: 'direct', saisie: true },
    };
    const { aller } = rendreDansUnCoursNavigable(
      { apercu: () => <Apercu />, cartes: () => <Cartes /> },
      'cartes',
      contexte,
    );
    const progression = () => document.querySelector('.progressline')?.textContent;
    // Une série en cours sur le chapitre 1, une carte déjà répondue.
    fireEvent.click(screen.getByRole('button', { name: 'Karte umdrehen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gewusst' }));
    expect(progression()).toBe('1 beantwortet · 7 übrig');

    aller('apercu');
    fireEvent.click(within(lignes('Kapitel')[0]).getByRole('button', { name: 'Lernen' }));

    // Le même chapitre, mais une série neuve, comme « session = null » du prototype (H:1738).
    expect(progression()).toBe('0 beantwortet · 7 übrig');
    expect(contexte.oublierEtatDOnglet).toHaveBeenCalledWith('cartes');
  });

  it('lernen_oublie_la_serie_avant_d_ouvrir_les_cartes', () => {
    const contexte = contexteDeTest();
    rendreDansLeCours(<Apercu />, contexte);

    fireEvent.click(within(lignes('Kapitel')[1]).getByRole('button', { name: 'Lernen' }));

    // L'onglet des cartes se monte après l'oubli, sinon il retrouverait l'ancienne série.
    expect(contexte.oublierEtatDOnglet).toHaveBeenCalledExactlyOnceWith('cartes');
    const [oubli] = (contexte.oublierEtatDOnglet as Mock).mock.invocationCallOrder;
    const [aller] = (contexte.aller as Mock).mock.invocationCallOrder;
    expect(oubli).toBeLessThan(aller);
  });

  it('weitere_uebungen_sous_titres_et_onglets', () => {
    const contexte = contexteDeTest({ evenements: JOURNAL });
    rendreDansLeCours(<Apercu />, contexte);

    const autres = lignes('Weitere Übungen');
    expect(autres).toHaveLength(5);
    // Le titre du module et sa description (décision 19).
    expect(autres[0].textContent).toContain('Baukasten');
    expect(autres[0].textContent).toContain('Rezeptwörter in Teile zerlegen und neu bilden · 1/3');
    // « Schemata » est un texte d'interface ; le sous-titre joint les titres des schémas.
    expect(autres[1].textContent).toContain('Schemata');
    expect(autres[1].textContent).toContain('Das Musterorgan · 0/5');
    expect(autres[2].textContent).toContain('Berichte');
    expect(autres[2].textContent).toContain('Kochbegriffe und Zutaten in Rezepten · 0/2');
    expect(autres[3].textContent).toContain('Grammatik');
    expect(autres[3].textContent).toContain('Artikel und Plural zum Üben · 0/5');
    expect(autres[4].textContent).toContain('Arbeitsblätter');

    const onglets = ['mots', 'schemas', 'textes', 'exercices', 'feuilles'];
    autres.forEach((ligne, i) => {
      fireEvent.click(within(ligne).getByRole('button', { name: 'Üben' }));
      expect(contexte.aller).toHaveBeenLastCalledWith(onglets[i]);
    });
  });

  it('ligne_arbeitsblaetter_dans_l_apercu', () => {
    // Deux éléments de la fiche réussis, l'un après une faute ; un troisième raté (F1-D12).
    const contexte = contexteDeTest({
      evenements: [
        reponseDeTest(1, 'fb000007', false, AUJOURDHUI_DE_TEST),
        reponseDeTest(2, 'fb000007', true, AUJOURDHUI_DE_TEST),
        reponseDeTest(3, 'fb000012', true, AUJOURDHUI_DE_TEST),
        reponseDeTest(4, 'fb000013', false, AUJOURDHUI_DE_TEST),
      ],
    });
    rendreDansLeCours(<Apercu />, contexte);

    // « Arbeitsblätter » est un texte d'interface, après la Grammatik, comme son onglet. Une seule
    // fiche : le singulier.
    const ligne = lignes('Weitere Übungen').at(-1) as HTMLElement;
    expect(ligne.querySelector('.title')?.firstChild?.textContent).toBe('Arbeitsblätter');
    expect(ligne.querySelector('.meta')?.textContent).toBe('1 Arbeitsblatt · 2/13');
    fireEvent.click(within(ligne).getByRole('button', { name: 'Üben' }));
    expect(contexte.aller).toHaveBeenLastCalledWith('feuilles');
    cleanup();

    // Deux fiches, dont une sans tâche : le pluriel, et le même total.
    const servi = coursServiDeTest();
    const vide: CoursServi['modules'][number] = {
      type: 'feuille',
      id: 'fe000002',
      numero: 2,
      titre: 'Unit 2 – Übungsblatt',
      parties: [],
    };
    rendreDansLeCours(
      <Apercu />,
      contexteDeTest({ cours: { ...servi, modules: [...servi.modules, vide] } }),
    );
    expect(lignes('Weitere Übungen').at(-1)?.querySelector('.meta')?.textContent).toBe(
      '2 Arbeitsblätter · 0/13',
    );
    cleanup();

    // Sans fiche, pas de ligne.
    rendreDansLeCours(<Apercu />, contexteDeTest({ cours: coursSans('feuille') }));
    expect(lignes('Weitere Übungen').map((x) => x.textContent)).not.toContainEqual(
      expect.stringContaining('Arbeitsblätter'),
    );
  });

  it('ligne_arbeitsblaetter_compte_la_derniere_reponse', () => {
    // Le score de l'onglet (F1-D3, R15) : un élément juste puis faux ne compte plus.
    const meta = (...reponses: [string, boolean][]) => {
      const evenements = reponses.map(([unite, juste], n) =>
        reponseDeTest(n + 1, unite, juste, AUJOURDHUI_DE_TEST),
      );
      rendreDansLeCours(<Apercu />, contexteDeTest({ evenements }));
      const texte = lignes('Weitere Übungen').at(-1)?.querySelector('.meta')?.textContent;
      cleanup();
      return texte;
    };

    expect(meta(['fb000007', true], ['fb000012', true])).toBe('1 Arbeitsblatt · 2/13');
    expect(meta(['fb000007', true], ['fb000012', true], ['fb000007', false])).toBe(
      '1 Arbeitsblatt · 1/13',
    );
  });

  it('apercu_d_un_cours_de_cartes_seulement', () => {
    const servi = coursServiDeTest();
    const cours: CoursServi = {
      ...servi,
      modules: servi.modules.filter((module) => module.type === 'cartes'),
    };
    rendreDansLeCours(<Apercu />, contexteDeTest({ cours }));

    expect(lignes('Kapitel')).toHaveLength(2);
    // Ni mots, ni examen : leurs chiffres n'ont pas de sens ; ni « Weitere Übungen ».
    expect(screen.queryByText('Wörter zerlegt / gebildet')).toBeNull();
    expect(screen.queryByText('noch keine Probeprüfung')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Weitere Übungen' })).toBeNull();
  });
});
