// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import {
  coursAvecReglages,
  coursSans,
  coursServiDeTest,
} from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import { APPAREIL_DE_TEST, idDeTest } from '../../stockage/evenements.fixture.js';
import { contexteDeTest, rendreDansLeCours, reponseDeTest } from '../contexte-cours.fixture.js';
import { Progression } from './Progression.js';

afterEach(cleanup);

// Les 14 jours de l'écran : du 4 au 17 octobre 2026.
const PREMIER_JOUR = '2026-10-04';
const MODULES_ANNEXES = ['morphologie', 'schema', 'texte-annote', 'exercices'];

/** Une suite de réponses : le numéro de chacune (son identifiant, sa seconde) est donné par la suite. */
function reponses(
  depart: number,
  jour: string,
  ...unites: [unite: string, juste: boolean][]
): Evenement[] {
  return unites.map(([unite, juste], i) => reponseDeTest(depart + i, unite, juste, jour));
}

/** Un examen remis, avec ses chiffres. */
function examen(
  n: number,
  jour: string,
  resultat: {
    points?: number;
    questions?: number;
    note?: number;
    minutes?: number;
    chapitres?: number;
  } = {},
  unite = 'ey000001',
): Evenement {
  return {
    id: idDeTest(n),
    cours: 'cs000001',
    unite,
    type: 'examen',
    resultat: { points: 15, questions: 20, note: 4.5, minutes: 14, chapitres: 2, ...resultat },
    repondu_a: `${jour}T09:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000+02:00`,
    appareil: APPAREIL_DE_TEST,
    v: 1,
  };
}

/** Un journal sur plusieurs jours, dont un hors de la fenêtre de 14 jours. */
const JOURNAL: Evenement[] = [
  // Aujourd'hui : un mot, un point de schéma, un exercice, tous réussis.
  ...reponses(0, '2026-10-17', ['w0000001', true], ['q0000001', true], ['e1000001', true]),
  // Hier : un autre point de schéma.
  ...reponses(10, '2026-10-16', ['q0000002', true]),
  // Le 14 : six réponses, dont un texte et un exercice réussis, un exercice raté.
  ...reponses(
    20,
    '2026-10-14',
    ['c1000001', true],
    ['c1000001', false],
    ['t1000001', true],
    ['e2000001', true],
    ['e2000002', false],
    ['c1000002', false],
  ),
  // Le premier jour de la fenêtre.
  ...reponses(30, PREMIER_JOUR, ['c1000002', true], ['e1000002', false]),
  // La veille de la fenêtre : compte dans le total, pas dans les barres.
  ...reponses(
    40,
    '2026-10-03',
    ['c1000003', true],
    ['c1000003', true],
    ['c1000003', true],
    ['c1000003', true],
    ['c1000003', true],
  ),
];

function barres(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.days > div'));
}

function total(): string {
  return document.querySelector('p.muted')?.textContent ?? '';
}

/** Les lignes `<b> <span> <em>` du tableau qui suit le titre. */
function lignes(titre: string): string[][] {
  const entete = screen.getByRole('heading', { name: titre });
  const table = entete.nextElementSibling as HTMLElement;
  expect(table.className).toBe('table');
  return Array.from(table.querySelectorAll<HTMLElement>(':scope > div')).map((ligne) => [
    ligne.querySelector('b')?.textContent ?? '',
    ligne.querySelector('span')?.textContent ?? '',
    ligne.querySelector('em')?.textContent ?? '',
  ]);
}

function couleurs(titre: string): string[] {
  const entete = screen.getByRole('heading', { name: titre });
  return Array.from((entete.nextElementSibling as HTMLElement).querySelectorAll('em')).map(
    (note) => note.style.color,
  );
}

describe('Progression', () => {
  it('quatorze_jours_et_totaux', () => {
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements: JOURNAL }));

    expect(screen.getByRole('heading', { name: 'Letzte 14 Tage' })).toBeTruthy();
    // Quatorze barres, du 4 au 17, avec le numéro du jour dessous.
    expect(barres()).toHaveLength(14);
    expect(
      Array.from(document.querySelectorAll('.dayl span')).map((jour) => jour.textContent),
    ).toEqual(['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']);
    const attendu: Record<string, number> = {
      '2026-10-04': 2,
      '2026-10-14': 6,
      '2026-10-16': 1,
      '2026-10-17': 3,
    };
    const jours = Array.from({ length: 14 }, (_, i) => `2026-10-${String(4 + i).padStart(2, '0')}`);
    expect(barres().map((barre) => barre.getAttribute('title'))).toEqual(
      jours.map((jour) => `${jour}: ${attendu[jour] ?? 0} Antworten`),
    );
    // La barre la plus haute est celle du jour le plus chargé ; un jour sans réponse est un trait.
    const hauteurs = barres().map((barre) => Number.parseFloat(barre.style.height));
    expect(hauteurs[10]).toBe(100);
    expect(hauteurs[13]).toBeCloseTo(50);
    expect(hauteurs[0]).toBeCloseTo(100 / 3);
    // Une seule réponse sur six reste lisible : au moins 6 %.
    expect(hauteurs[12]).toBeCloseTo(100 / 6);
    expect(hauteurs[1]).toBe(2);
    expect(barres().map((barre) => barre.className)).toEqual(
      jours.map((jour) => (attendu[jour] === undefined ? 'zero' : '')),
    );
    // Les barres se lisent aussi sans les voir.
    expect(screen.getAllByRole('img', { name: '2026-10-14: 6 Antworten' })).toHaveLength(1);

    // 17 réponses en tout (dont cinq avant la fenêtre), la série du 16 au 17, et les réussites
    // de chaque module.
    expect(total()).toBe(
      '17 Antworten insgesamt · 2 Tage in Folge · 1 von 3 Wörtern im Baukasten · ' +
        '2 von 5 Strukturen in den Schemata · 1 von 2 Berichten · 2 von 5 Grammatik-Aufgaben',
    );
  });

  it('un_jour_peu_charge_garde_une_barre_lisible', () => {
    // 1 réponse contre 40 ferait 2,5 % : la barre fait au moins 6 %.
    const evenements = [
      ...reponses(
        0,
        '2026-10-15',
        ...Array.from({ length: 40 }, (): [string, boolean] => ['c1000001', true]),
      ),
      ...reponses(50, '2026-10-16', ['c1000001', true]),
    ];
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements }));

    const hauteurs = barres().map((barre) => Number.parseFloat(barre.style.height));
    expect(hauteurs.slice(-4)).toEqual([2, 100, 6, 2]);
  });

  it('sans_reponse_rien_n_est_compte_et_les_barres_sont_des_traits', () => {
    rendreDansLeCours(<Progression />, contexteDeTest());

    expect(barres()).toHaveLength(14);
    expect(barres().every((barre) => barre.className === 'zero')).toBe(true);
    expect(barres().every((barre) => Number.parseFloat(barre.style.height) === 2)).toBe(true);
    expect(total()).toBe(
      '0 Antworten insgesamt · 0 Tage in Folge · 0 von 3 Wörtern im Baukasten · ' +
        '0 von 5 Strukturen in den Schemata · 0 von 2 Berichten · 0 von 5 Grammatik-Aufgaben',
    );
  });

  it('un_module_absent_n_a_pas_de_total', () => {
    for (const [sans, absent] of [
      ['morphologie', 'Wörtern'],
      ['schema', 'Schemata'],
      ['texte-annote', 'Berichten'],
      ['exercices', 'Grammatik-Aufgaben'],
    ]) {
      const rendu = rendreDansLeCours(
        <Progression />,
        contexteDeTest({ cours: coursSans(sans), evenements: JOURNAL }),
      );
      const ligne = total();
      expect(ligne, sans).toContain('17 Antworten insgesamt · 2 Tage in Folge');
      expect(ligne, sans).not.toContain(absent);
      expect(ligne, sans).not.toContain(' 0 von 0 ');
      // Les trois autres y sont, séparés comme avant.
      expect(ligne.split(' · '), sans).toHaveLength(5);
      rendu.unmount();
    }

    rendreDansLeCours(
      <Progression />,
      contexteDeTest({ cours: coursSans(...MODULES_ANNEXES), evenements: JOURNAL }),
    );
    expect(total()).toBe('17 Antworten insgesamt · 2 Tage in Folge');
  });

  it('le_titre_du_module_des_mots_vient_du_contenu', () => {
    const servi = coursServiDeTest();
    const cours: CoursServi = {
      ...servi,
      modules: servi.modules.map((module) =>
        module.type === 'morphologie' ? { ...module, titre: 'Wortbaukasten' } : module,
      ),
    };
    rendreDansLeCours(<Progression />, contexteDeTest({ cours }));

    expect(total()).toContain(
      '0 von 3 Wörtern im Wortbaukasten · 0 von 5 Strukturen in den Schemata',
    );
  });

  it('la_serie_compte_depuis_hier_quand_aujourd_hui_est_vide', () => {
    const evenements = [
      ...reponses(0, '2026-10-16', ['c1000001', true]),
      ...reponses(10, '2026-10-15', ['c1000001', true]),
    ];
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements, aujourdhui: '2026-10-17' }));

    expect(total()).toContain('2 Antworten insgesamt · 2 Tage in Folge');
  });

  it('les_jours_suivent_le_jour_local_de_l_appareil', () => {
    // 23 h 30 à +02:00 est le 16 ; en UTC, ce serait déjà le 17 à 21 h 30.
    const tard: Evenement = {
      ...reponseDeTest(0, 'c1000001', true, '2026-10-16'),
      repondu_a: '2026-10-16T23:30:00.000+02:00',
    };
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements: [tard] }));

    expect(
      barres()
        .map((barre) => barre.getAttribute('title'))
        .slice(-2),
    ).toEqual(['2026-10-16: 1 Antworten', '2026-10-17: 0 Antworten']);
  });

  it('dix_derniers_examens', () => {
    // Douze examens, un par jour, du 1er au 12 octobre ; les deux plus anciens ne se montrent pas.
    const evenements = Array.from({ length: 12 }, (_, i) =>
      examen(i, `2026-10-${String(i + 1).padStart(2, '0')}`, {
        points: 5 + i,
        // 3.5, 4.0, 4.5, 3.5 ... : une note sur trois est insuffisante.
        note: [3.5, 4, 4.5][i % 3],
        minutes: 10 + i,
        chapitres: 1 + (i % 4),
      }),
    );
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements }));

    expect(screen.getByRole('heading', { name: 'Probeprüfungen' })).toBeTruthy();
    const montres = lignes('Probeprüfungen');
    expect(montres).toHaveLength(10);
    // Le plus récent d'abord (le 12), jusqu'au troisième (le 3).
    expect(montres.map(([jour]) => jour)).toEqual(
      Array.from({ length: 10 }, (_, k) => `2026-10-${String(12 - k).padStart(2, '0')}`),
    );
    expect(montres[0]).toEqual(['2026-10-12', '16 / 20 Punkte · 4 Kapitel · 21 Min.', 'Note 4.5']);
    expect(montres[9]).toEqual(['2026-10-03', '7 / 20 Punkte · 3 Kapitel · 12 Min.', 'Note 4.5']);
    expect(screen.queryByText('2026-10-02')).toBeNull();
    expect(screen.queryByText('2026-10-01')).toBeNull();
    expect(screen.queryByText(/Noch keine Probeprüfung/)).toBeNull();
  });

  it('examens_colores_selon_la_note_suffisante_du_contenu', () => {
    const evenements = [
      examen(0, '2026-10-10', { note: 3.5 }),
      examen(1, '2026-10-11', { note: 4 }),
      examen(2, '2026-10-12', { note: 4.5 }),
    ];
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements }));
    // Le plus récent d'abord : 4.5 et 4 suffisent (4 est atteint), 3.5 non.
    expect(couleurs('Probeprüfungen')).toEqual(['var(--good)', 'var(--good)', 'var(--bad)']);
    cleanup();

    rendreDansLeCours(
      <Progression />,
      contexteDeTest({ cours: coursAvecReglages({ noteSuffisante: 4.5 }), evenements }),
    );
    expect(couleurs('Probeprüfungen')).toEqual(['var(--good)', 'var(--bad)', 'var(--bad)']);
  });

  it('aucun_examen_renvoie_vers_l_onglet_du_module', () => {
    rendreDansLeCours(
      <Progression />,
      contexteDeTest({ cours: coursAvecReglages({ titre: 'Prüfung' }) }),
    );

    expect(screen.getByRole('heading', { name: 'Probeprüfungen' })).toBeTruthy();
    expect(screen.getByText('Noch keine Probeprüfung – im Tab «Prüfung» starten.')).toBeTruthy();
  });

  it('les_examens_ne_sont_filtres_par_aucune_unite', () => {
    // L'unité d'un examen est l'identifiant de son module : celle-ci n'est plus celle du cours.
    const evenements = [
      examen(0, '2026-10-10', { note: 5 }, 'ey000001'),
      examen(1, '2026-10-11', { note: 5.5 }, 'zz999999'),
    ];
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements }));

    expect(lignes('Probeprüfungen').map(([jour]) => jour)).toEqual(['2026-10-11', '2026-10-10']);
  });

  it('un_cours_sans_module_examen_montre_les_examens_deja_remis_sans_inviter_a_en_passer', () => {
    const sans = contexteDeTest({
      cours: coursSans('examen'),
      evenements: [examen(0, '2026-10-10')],
    });
    rendreDansLeCours(<Progression />, sans);

    expect(lignes('Probeprüfungen')).toHaveLength(1);
    cleanup();

    rendreDansLeCours(<Progression />, contexteDeTest({ cours: coursSans('examen') }));
    expect(screen.queryByRole('heading', { name: 'Probeprüfungen' })).toBeNull();
    expect(screen.queryByText(/Noch keine Probeprüfung/)).toBeNull();
  });

  it('douze_cartes_difficiles', () => {
    // Quatorze unités ratées : u1 (c1000001) quatorze fois, u2 treize fois... u14 une fois.
    // La première a aussi trente et une réussites : 14 - 0,3 × 31 = 4,7 la range entre u10 (5)
    // et u11 (4). Elle n'est plus la plus difficile, quoi qu'elle compte le plus de fautes.
    const ids = [
      'c1000001',
      'c1000002',
      'c1000003',
      'c1000004',
      'c1000005',
      'c1000006',
      'c1000007',
      'c1000008',
      'c2000001',
      'c2000002',
      'c2000003',
      'c2000004',
      'c2000005',
      'c1000001:inverse',
    ];
    const fautes: [string, boolean][] = ids.flatMap((id, i) =>
      Array.from({ length: 14 - i }, (): [string, boolean] => [id, false]),
    );
    const reussites: [string, boolean][] = Array.from({ length: 31 }, () => ['c1000001', true]);
    const evenements = reponses(0, '2026-10-17', ...fautes, ...reussites);
    const contexte = contexteDeTest({ evenements });
    const unite = (id: string) => {
      const trouvee = contexte.cours.unites.find((x) => x.id === id);
      if (trouvee === undefined) throw new Error(`unité ${id} absente de la fixture`);
      return trouvee;
    };
    rendreDansLeCours(<Progression />, contexte);

    expect(screen.getByRole('heading', { name: 'Schwierige Karten' })).toBeTruthy();
    const montrees = lignes('Schwierige Karten');
    expect(montrees).toHaveLength(12);
    // u2 à u9, puis u10, u1 (4,7), u11 et u12 ; u13 et u14 ne figurent pas.
    const ordre = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11];
    const fautesDe = (i: number) => 14 - i;
    expect(montrees).toEqual(
      ordre.map((i) => [unite(ids[i]).question, unite(ids[i]).reponse, `${fautesDe(i)}× falsch`]),
    );
    expect(montrees.map(([question]) => question)).not.toContain(unite(ids[12]).question);
    expect(montrees.map(([question]) => question)).not.toContain(unite(ids[13]).question);
    expect(screen.queryByText(/Noch keine Fehler/)).toBeNull();
  });

  it('cartes_difficiles_seulement_les_ratees_du_cours', () => {
    const evenements = [
      // Réussie : jamais difficile.
      ...reponses(0, '2026-10-17', ['c1000001', true], ['c1000001', true]),
      // Une unité que le cours n'a plus : ignorée, sans erreur.
      ...reponses(10, '2026-10-17', ['zz999999', false], ['zz999999', false]),
      // Une exercice raté n'est pas une carte.
      ...reponses(20, '2026-10-17', ['e1000001', false]),
      // Une carte ratée : seule à paraître.
      ...reponses(30, '2026-10-17', ['c1000002', false]),
    ];
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements }));

    expect(lignes('Schwierige Karten')).toEqual([
      ['Leber', 'Grosse Drüse im Oberbauch', '1× falsch'],
    ]);
  });

  it('aucune_carte_difficile_le_dit', () => {
    rendreDansLeCours(<Progression />, contexteDeTest());

    expect(
      screen.getByText(
        'Noch keine Fehler – sobald eine Karte falsch beantwortet wird, erscheint sie hier.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Schwierige Karten' })).toBeTruthy();
  });

  it('pas_de_remise_a_zero', () => {
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements: JOURNAL }));

    // Le journal ne fait que grandir (invariant 5, décision 2) : ni bouton, ni confirmation.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/Neu anfangen|Lernstand|zurücksetzen|löschen/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Neu anfangen' })).toBeNull();
  });

  it('les_titres_dans_l_ordre_du_prototype', () => {
    rendreDansLeCours(<Progression />, contexteDeTest({ evenements: JOURNAL }));

    expect(screen.getAllByRole('heading').map((titre) => titre.textContent)).toEqual([
      'Letzte 14 Tage',
      'Probeprüfungen',
      'Schwierige Karten',
    ]);
  });
});
