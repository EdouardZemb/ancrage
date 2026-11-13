// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAChoix, Tache } from '../../../domaine/contenu/modele.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansUnCoursNavigable,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import {
  type ContexteCours,
  etatDOngletSur,
  oubliDOngletSur,
  type PredicatsDeSeance,
  seanceDansLaMemoire,
  useCours,
} from '../contexte-cours.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Feuilles } from './Feuilles.js';
import { choisirDans as choisir, optionsDe, progression, texteDe } from './onglets.fixture.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

/* Données factices, écrites à la main (invariant 7). */

function question(
  id: string,
  texte: string,
  reponse: string,
  distracteurs: string[],
): QuestionAChoix {
  return { id, question: texte, reponse, distracteurs, statut: 'source' };
}

const TACHY = 'Was bedeutet tachy-?';
const BRADY = 'Was bedeutet brady-?';
const BRADY_ID = 'fb000022';
const HARN = 'Welches Organ bildet den Harn?';

/** Une tâche d'un genre qu'une version suivante saurait afficher (F1-D11). */
const TACHE_DE_DEMAIN = {
  id: 'fa000029',
  genre: 'zeichnen',
  consigne: 'Zeichnen Sie das Herz.',
} as unknown as Tache;

/**
 * La fiche de la Unit 2, plus récente que celle du cours de test : deux tâches à choix, et entre
 * elles une tâche d'un genre inconnu. Trois éléments en tout.
 */
const UNIT_2: ModuleServiDe<'feuille'> = {
  type: 'feuille',
  id: 'fe000002',
  numero: 2,
  titre: 'Unit 2 – Übungsblatt',
  parties: [
    {
      titre: 'Teil A: Vorsilben',
      taches: [
        {
          id: 'fa000021',
          genre: 'qcm',
          consigne: 'Wählen Sie die Bedeutung.',
          questions: [
            question('fb000021', TACHY, 'schnell', ['langsam', 'innen', 'halb']),
            question('fb000022', BRADY, 'langsam', ['schnell', 'innen', 'halb']),
          ],
        },
        TACHE_DE_DEMAIN,
      ],
    },
    {
      titre: 'Teil B: Organe',
      taches: [
        {
          id: 'fa000022',
          genre: 'qcm',
          consigne: 'Wählen Sie das Organ.',
          questions: [question('fb000023', HARN, 'Niere', ['Herz', 'Leber', 'Milz'])],
        },
      ],
    },
  ],
};

/**
 * Le cours de test, avec une fiche de la Unit 9 d'une seule tâche. Plus récente que celle de la
 * Unit 1, elle est la première de la liste (`ouvrirLaUnit2` l'ouvre).
 */
function coursAvecUneTache(tache: Tache): CoursServi {
  const unique: ModuleServiDe<'feuille'> = {
    type: 'feuille',
    id: 'fe000009',
    numero: 9,
    titre: 'Unit 9 – Übungsblatt',
    parties: [{ titre: 'Teil A', taches: [tache] }],
  };
  const servi = coursServiDeTest();
  return { ...servi, modules: [...servi.modules, unique] };
}

/** Le cours de test, avec sa fiche de la Unit 1 et celle de la Unit 2. */
function coursAvecDeuxFeuilles(): CoursServi {
  const servi = coursServiDeTest();
  return { ...servi, modules: [...servi.modules, UNIT_2] };
}

function contexteDe(...reponses: [string, boolean][]): ContexteCours {
  return contexteDeTest({
    cours: coursAvecDeuxFeuilles(),
    evenements: reponses.map(
      ([unite, juste], n): Evenement => reponseDeTest(n + 1, unite, juste, AUJOURDHUI_DE_TEST),
    ),
  });
}

/** Les réponses de départ du test « ergebnis_suit… » : la veille de `AUJOURDHUI_DE_TEST`. */
const VEILLE_JUSTE = reponseDeTest(1, 'fb000021', true, '2026-10-16');
const VEILLE_FAUX = reponseDeTest(2, 'fb000022', false, '2026-10-16');

function lignes(): HTMLElement[] {
  return within(screen.getByRole('list', { name: t.onglet_feuilles })).getAllByRole('listitem');
}

function score(ligne: HTMLElement): string {
  return ligne.querySelector('.meta')?.textContent ?? '';
}

function bouton(ligne: HTMLElement, libelle: string): HTMLElement | null {
  return within(ligne).queryByRole('button', { name: libelle });
}

/** Un bouton (« Bearbeiten » par défaut) sur la fiche de la Unit 2, la première de la liste. */
function ouvrirLaUnit2(libelle: string = t.feuilles_bearbeiten): void {
  fireEvent.click(bouton(lignes()[0], libelle) as HTMLElement);
}

/** Un autre onglet (le Quiz, la Prüfung) qui répond à des éléments de la fiche (F1-D3). */
function Ailleurs(props: { reponses: [string, boolean][] }) {
  const { enregistrer } = useCours();
  const repondre = () => {
    for (const [unite, juste] of props.reponses) void enregistrer(unite, juste, 'choix');
  };
  return (
    <button type="button" data-testid="ailleurs" onClick={repondre}>
      ailleurs
    </button>
  );
}

/** Une tâche à trous sans liste, de deux phrases : chaque trou est une case à remplir. */
const TROUS: Tache = {
  id: 'fa000041',
  genre: 'trous',
  consigne: 'Ergänzen Sie.',
  phrases: [
    { id: 'fb000041', texte: 'Das ___ schlägt.', reponses: ['Herz'], statut: 'source' },
    { id: 'fb000042', texte: 'Die ___ filtert das Blut.', reponses: ['Milz'], statut: 'source' },
  ],
};

/** Un appariement de deux paires : les termes attendent dans la réserve, dans un ordre tiré. */
const APPARIEMENT: Tache = {
  id: 'fa000043',
  genre: 'appariement',
  consigne: 'Ordnen Sie zu.',
  paires: [
    { id: 'fb000043', terme: 'Milz', cible: 'Filtert das Blut', statut: 'source' },
    { id: 'fb000044', terme: 'Magen', cible: 'Verdaut die Nahrung', statut: 'source' },
  ],
};

function suivant(): HTMLElement {
  return screen.getByRole('button', { name: t.suivante });
}

function consigne(): string {
  return document.querySelector('.tache .consigne')?.textContent ?? '';
}

/** Toute la Unit 2 jusqu'au bilan : tachy- et l'organe justes, brady- répondu par `brady`. */
function faireLaUnit2(brady: string): void {
  choisir(TACHY, 'schnell');
  choisir(BRADY, brady);
  fireEvent.click(suivant());
  choisir(HARN, 'Niere');
  fireEvent.click(suivant());
}

/** Les options de la question attendent toutes une réponse : ni choisies, ni colorées. */
function enAttente(question: string): boolean {
  return optionsDe(question).every((x) => !x.disabled && x.className === '');
}

describe('Feuilles', () => {
  it('liste_de_la_plus_recente_a_la_plus_ancienne_avec_score', () => {
    // La dernière réponse fait foi (F1-D3), quel que soit l'onglet qui l'a donnée.
    rendreDansUnCoursVivant(
      <Feuilles />,
      contexteDe(
        ['fb000021', true],
        ['fb000022', false],
        ['fb000007', true],
        ['fb000008', true],
        ['fb000008', false],
      ),
    );

    const [unit2, unit1, ...reste] = lignes();
    expect(reste).toHaveLength(0);
    expect(unit2.querySelector('.num')?.textContent).toBe('2');
    expect(unit2.textContent).toContain('Unit 2 – Übungsblatt');
    expect(score(unit2)).toBe('1/3 richtig');
    expect(unit1.querySelector('.num')?.textContent).toBe('1');
    expect(unit1.textContent).toContain('Unit 1 – Übungsblatt');
    expect(score(unit1)).toBe('1/13 richtig');
    // La Unit 2 est entamée, la Unit 1 aussi (une réponse chacune) : les deux se reprennent.
    expect(bouton(unit2, t.feuilles_weitermachen)).toBeTruthy();
    expect(bouton(unit1, t.feuilles_weitermachen)).toBeTruthy();
  });

  it('bouton_fehler_absent_sans_erreur', () => {
    // Jamais faite, ou faite sans faute : rien à répéter (vigilance 5).
    for (const reponses of [[], [['fb000021', true] as [string, boolean]]]) {
      rendreDansUnCoursVivant(<Feuilles />, contexteDe(...reponses));
      for (const ligne of lignes()) expect(bouton(ligne, t.feuilles_fehler)).toBeNull();
      cleanup();
    }

    // Une faute dans la Unit 2 : le bouton n'apparaît que sur elle.
    rendreDansUnCoursVivant(<Feuilles />, contexteDe(['fb000023', false]));
    const [unit2, unit1] = lignes();
    expect(bouton(unit2, t.feuilles_fehler)).toBeTruthy();
    expect(bouton(unit1, t.feuilles_fehler)).toBeNull();
  });

  it('fiche_toute_juste_affiche_total_sur_total', () => {
    // Une faute corrigée ensuite ne compte plus (vigilance 5).
    rendreDansUnCoursVivant(
      <Feuilles />,
      contexteDe(['fb000021', false], ['fb000021', true], ['fb000022', true], ['fb000023', true]),
    );

    const [unit2] = lignes();
    expect(score(unit2)).toBe('3/3 richtig');
    expect(bouton(unit2, t.feuilles_fehler)).toBeNull();
  });

  it('bearbeiten_deroule_les_taches_dans_l_ordre', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe());

    ouvrirLaUnit2();

    // La première tâche du papier, sa partie, sa consigne et ses deux questions.
    expect(screen.queryByRole('list', { name: t.onglet_feuilles })).toBeNull();
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(document.querySelector('.tache .kind')?.textContent).toBe('Teil A: Vorsilben');
    expect(consigne()).toBe('Wählen Sie die Bedeutung.');
    expect(optionsDe(TACHY).map(texteDe).sort()).toEqual(['halb', 'innen', 'langsam', 'schnell']);
    expect(optionsDe(BRADY).map(texteDe).sort()).toEqual(['halb', 'innen', 'langsam', 'schnell']);
    // « Weiter » attend que toute la tâche soit répondue.
    choisir(TACHY, 'schnell');
    expect(screen.queryByRole('button', { name: t.suivante })).toBeNull();
    choisir(BRADY, 'langsam');
    expect(document.activeElement).toBe(suivant());

    fireEvent.click(suivant());

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 2 von 2');
    expect(document.querySelector('.tache .kind')?.textContent).toBe('Teil B: Organe');
    expect(consigne()).toBe('Wählen Sie das Organ.');
    expect(optionsDe(HARN).map(texteDe).sort()).toEqual(['Herz', 'Leber', 'Milz', 'Niere']);
    expect(screen.queryByRole('group', { name: TACHY })).toBeNull();
  });

  it('weiter_porte_le_focus_sur_la_consigne', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe());
    ouvrirLaUnit2();
    choisir(TACHY, 'schnell');
    choisir(BRADY, 'langsam');

    fireEvent.click(suivant());

    // La tâche suivante commence par sa consigne : un lecteur d'écran la lit (point 8).
    const nouvelle = document.querySelector('.tache .consigne') as HTMLElement;
    expect(nouvelle.textContent).toBe('Wählen Sie das Organ.');
    expect(nouvelle.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(nouvelle);
  });

  it('qcm_enregistre_chaque_question', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();

    // Un choix répond aussitôt : la question se colore et ne répond plus.
    choisir(TACHY, 'schnell');
    const tachy = optionsDe(TACHY);
    expect(tachy.find((x) => texteDe(x) === 'schnell')?.className).toBe('right');
    expect(tachy.filter((x) => x.className === '')).toHaveLength(3);
    expect(tachy.every((x) => x.disabled)).toBe(true);
    expect(enAttente(BRADY)).toBe(true);
    // La question jugée entre aussitôt au journal, avant la fin de la tâche (R17).
    expect(contexte.enregistrer).toHaveBeenCalledExactlyOnceWith('fb000021', true, 'choix');
    expect(screen.queryByRole('button', { name: t.suivante })).toBeNull();

    choisir(BRADY, 'innen');

    // Un mauvais choix : il est rouge, la bonne réponse verte.
    const brady = optionsDe(BRADY);
    expect(brady.find((x) => texteDe(x) === 'innen')?.className).toBe('wrong');
    expect(brady.find((x) => texteDe(x) === 'langsam')?.className).toBe('right');
    // Une réponse par question, sur l'identifiant de la question.
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(contexte.enregistrer).toHaveBeenCalledWith('fb000021', true, 'choix');
    expect(contexte.enregistrer).toHaveBeenCalledWith('fb000022', false, 'choix');
    // Un clic de plus ne change rien.
    fireEvent.click(brady[0]);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
  });

  it('bilan_puis_retour_a_la_liste', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe());
    ouvrirLaUnit2();
    faireLaUnit2('schnell');

    // Le bilan du déroulé : deux réponses justes sur trois.
    const bilan = document.querySelector('.done') as HTMLElement;
    expect(within(bilan).getByRole('heading').textContent).toBe('Unit 2 – Übungsblatt');
    expect(bilan.textContent).toContain('2 von 3 richtig');
    const retour = screen.getByRole('button', { name: t.feuilles_zurueck });
    expect(document.activeElement).toBe(retour);

    fireEvent.click(retour);

    // La liste, avec le score à jour et la faute à répéter.
    const [unit2] = lignes();
    expect(score(unit2)).toBe('2/3 richtig');
    expect(bouton(unit2, t.feuilles_fehler)).toBeTruthy();
  });

  it('bilan_propose_fehler_wiederholen_s_il_reste_une_erreur', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();
    faireLaUnit2('schnell');

    // Une erreur : le bilan propose de la répéter, et la répétition ne montre qu'elle.
    const bilan = document.querySelector('.done') as HTMLElement;
    fireEvent.click(within(bilan).getByRole('button', { name: t.feuilles_fehler }));

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 1');
    expect(screen.queryByRole('group', { name: TACHY })).toBeNull();
    expect(enAttente(BRADY)).toBe(true);
    choisir(BRADY, 'langsam');
    fireEvent.click(suivant());
    // Plus d'erreur : le bilan ne le propose plus.
    expect(document.querySelector('.done')?.textContent).toContain('1 von 1 richtig');
    expect(screen.queryByRole('button', { name: t.feuilles_fehler })).toBeNull();
    expect(contexte.enregistrer).toHaveBeenCalledTimes(4);
  });

  it('fehler_wiederholen_ne_montre_que_les_erreurs', () => {
    const contexte = contexteDe(['fb000021', true], ['fb000022', false], ['fb000023', false]);
    rendreDansUnCoursVivant(<Feuilles />, contexte);

    ouvrirLaUnit2(t.feuilles_fehler);

    // La première tâche, réduite à sa question fausse.
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(screen.queryByRole('group', { name: TACHY })).toBeNull();
    choisir(BRADY, 'langsam');
    expect(contexte.enregistrer).toHaveBeenCalledExactlyOnceWith('fb000022', true, 'choix');
    // L'erreur corrigée ne raccourcit pas le déroulé en cours.
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(optionsDe(BRADY).find((x) => texteDe(x) === 'langsam')?.className).toBe('right');
    fireEvent.click(suivant());
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 2 von 2');
    choisir(HARN, 'Niere');
    fireEvent.click(suivant());

    expect(document.querySelector('.done')?.textContent).toContain('2 von 2 richtig');
    fireEvent.click(screen.getByRole('button', { name: t.feuilles_zurueck }));
    const [unit2] = lignes();
    expect(score(unit2)).toBe('3/3 richtig');
    expect(bouton(unit2, t.feuilles_fehler)).toBeNull();
  });

  it('deroule_fige_quand_un_element_est_repondu_ailleurs', () => {
    // Deux questions fausses dans la tâche 1, l'organe juste : une seule tâche à refaire.
    const contexte = contexteDe(['fb000021', false], ['fb000022', false], ['fb000023', true]);
    rendreDansUnCoursVivant(
      <>
        <Ailleurs
          reponses={[
            ['fb000021', true],
            ['fb000023', false],
          ]}
        />
        <Feuilles />
      </>,
      contexte,
    );
    ouvrirLaUnit2(t.feuilles_fehler);
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 1');
    // La seconde question répondue d'abord : la tâche attend encore la première.
    choisir(BRADY, 'langsam');
    const optionsDeTachy = optionsDe(TACHY).map(texteDe);

    // Ailleurs, la première question devient juste et l'organe faux : le déroulé n'en sait rien.
    fireEvent.click(screen.getByTestId('ailleurs'));

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 1');
    expect(optionsDe(TACHY).map(texteDe)).toEqual(optionsDeTachy);
    expect(enAttente(TACHY)).toBe(true);
    expect(optionsDe(BRADY).find((x) => texteDe(x) === 'langsam')?.className).toBe('right');
    // Chaque question est jugée sur ses propres options, et enregistrée dès qu'elle l'est (R17) ;
    // le déroulé va à son terme.
    choisir(TACHY, 'schnell');
    expect(vi.mocked(contexte.enregistrer).mock.calls).toEqual([
      ['fb000022', true, 'choix'],
      ['fb000021', true, 'choix'],
      ['fb000023', false, 'choix'],
      ['fb000021', true, 'choix'],
    ]);
    fireEvent.click(suivant());
    expect(document.querySelector('.done')?.textContent).toContain('2 von 2 richtig');
  });

  it('quitter_puis_revenir_reprend_la_tache', () => {
    const contexte = contexteDe();
    const { aller } = rendreDansUnCoursNavigable(
      { feuilles: () => <Feuilles />, apercu: () => <p>ailleurs</p> },
      'feuilles',
      contexte,
    );
    ouvrirLaUnit2();
    choisir(TACHY, 'schnell');
    const options = optionsDe(BRADY).map(texteDe);

    // Une tâche à moitié faite : la question répondue l'est encore au retour (vigilance 5).
    aller('apercu');
    expect(screen.getByText('ailleurs')).toBeTruthy();
    aller('feuilles');
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(optionsDe(TACHY).find((x) => texteDe(x) === 'schnell')?.className).toBe('right');
    expect(optionsDe(TACHY).every((x) => x.disabled)).toBe(true);
    expect(optionsDe(BRADY).map(texteDe)).toEqual(options);
    // La question répondue est déjà au journal (R17), une seule fois malgré le détour.
    expect(contexte.enregistrer).toHaveBeenCalledExactlyOnceWith('fb000021', true, 'choix');

    // La tâche finie : au retour, « Weiter » attend, et rien n'est enregistré deux fois.
    choisir(BRADY, 'langsam');
    aller('apercu');
    aller('feuilles');
    expect(suivant()).toBeTruthy();
    expect(optionsDe(BRADY).every((x) => x.disabled)).toBe(true);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);

    // La tâche suivante, retrouvée après un autre détour.
    fireEvent.click(suivant());
    aller('apercu');
    aller('feuilles');
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 2 von 2');
    expect(consigne()).toBe('Wählen Sie das Organ.');
  });

  it('zurueck_garde_les_reponses_deja_jugees', () => {
    // Une tâche quittée à moitié : la question jugée est au journal, et compte (R17).
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();
    choisir(TACHY, 'schnell');

    fireEvent.click(screen.getByRole('button', { name: t.feuilles_zurueck }));

    expect(contexte.enregistrer).toHaveBeenCalledExactlyOnceWith('fb000021', true, 'choix');
    expect(score(lignes()[0])).toBe('1/3 richtig');
  });

  it('ouvrir_deux_fois_la_meme_fiche', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();
    faireLaUnit2('schnell');
    fireEvent.click(screen.getByRole('button', { name: t.feuilles_zurueck }));

    // « Fehler wiederholen » : la question fausse, sans le choix du déroulé précédent.
    ouvrirLaUnit2(t.feuilles_fehler);
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 1');
    expect(enAttente(BRADY)).toBe(true);
    expect(screen.queryByRole('button', { name: t.suivante })).toBeNull();
    choisir(BRADY, 'langsam');
    fireEvent.click(suivant());
    expect(document.querySelector('.done')?.textContent).toContain('1 von 1 richtig');
    fireEvent.click(screen.getByRole('button', { name: t.feuilles_zurueck }));

    // « Neu beginnen » : toute la fiche, neuve, et « Weiter » jusqu'au bilan.
    ouvrirLaUnit2(t.feuilles_neu_beginnen);
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(enAttente(TACHY) && enAttente(BRADY)).toBe(true);
    faireLaUnit2('langsam');
    expect(document.querySelector('.done')?.textContent).toContain('3 von 3 richtig');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(7);
  });

  it('tache_de_genre_inconnu_sautee', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe());
    // La fiche s'affiche, et sa tâche inconnue ne compte aucun élément.
    expect(score(lignes()[0])).toBe('0/3 richtig');

    ouvrirLaUnit2();

    // Deux tâches à faire, pas trois : celle d'un genre inconnu est sautée (F1-D11).
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    choisir(TACHY, 'schnell');
    choisir(BRADY, 'langsam');
    fireEvent.click(suivant());
    expect(consigne()).toBe('Wählen Sie das Organ.');
    expect(screen.queryByText('Zeichnen Sie das Herz.')).toBeNull();
  });

  it('fiche_neuve_n_offre_que_bearbeiten', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe());

    for (const ligne of lignes()) {
      expect(bouton(ligne, t.feuilles_bearbeiten)).toBeTruthy();
      expect(bouton(ligne, t.feuilles_weitermachen)).toBeNull();
      expect(bouton(ligne, t.feuilles_neu_beginnen)).toBeNull();
      expect(bouton(ligne, t.feuilles_fehler)).toBeNull();
      expect(bouton(ligne, t.feuilles_ergebnis)).toBeNull();
    }
  });

  it('ergebnis_offert_sur_une_fiche_entamee_ou_faite', () => {
    // Entamée (une réponse sur trois), puis faite (les trois éléments répondus).
    for (const reponses of [
      [['fb000021', true]],
      [
        ['fb000021', true],
        ['fb000022', true],
        ['fb000023', true],
      ],
    ] as [string, boolean][][]) {
      rendreDansUnCoursVivant(<Feuilles />, contexteDe(...reponses));
      const [unit2] = lignes();
      expect(bouton(unit2, t.feuilles_ergebnis)).toBeTruthy();
      expect(bouton(unit2, t.feuilles_ergebnis)?.className).toBe('ghost');
      const boutons = within(unit2).getAllByRole('button');
      expect(boutons[boutons.length - 1]?.textContent).toBe(t.feuilles_ergebnis);
      cleanup();
    }
  });

  it('ergebnis_s_ouvre_et_revient_a_la_liste', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe(['fb000021', true]));

    ouvrirLaUnit2(t.feuilles_ergebnis);

    // La tâche d'un genre inconnu n'y paraît pas, et le score reste celui de la liste.
    expect(document.querySelector('h2')?.textContent).toBe('Unit 2 – Übungsblatt');
    expect(document.querySelectorAll('.resultats li')).toHaveLength(3);
    expect(screen.queryByText('Zeichnen Sie das Herz.')).toBeNull();
    expect(document.querySelector('section')?.textContent).toContain('1/3 richtig');

    fireEvent.click(screen.getAllByRole('button', { name: t.feuilles_zurueck })[0] as HTMLElement);

    expect(score(lignes()[0])).toBe('1/3 richtig');
  });

  it('ergebnis_n_est_pas_une_seance', () => {
    const { contexte, seance } = avecSeance(contexteDe(['fb000021', true]));
    rendreDansUnCoursVivant(<Feuilles />, contexte);

    ouvrirLaUnit2(t.feuilles_ergebnis);

    expect(document.querySelector('.resultats')).toBeTruthy();
    expect(seance()).toBeNull();
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('ergebnis_suit_une_reponse_donnee_ailleurs', () => {
    rendreDansUnCoursVivant(
      <>
        <Feuilles />
        <Ailleurs reponses={[['fb000022', true]]} />
      </>,
      { ...contexteDe(), evenements: [VEILLE_JUSTE, VEILLE_FAUX] },
    );
    ouvrirLaUnit2(t.feuilles_ergebnis);
    const ligneDeBrady = () =>
      Array.from(document.querySelectorAll('.resultats li')).find((li) =>
        li.textContent?.includes(BRADY),
      )?.textContent ?? '';
    expect(ligneDeBrady()).toContain('Falsch · 2026-10-16');

    fireEvent.click(screen.getByTestId('ailleurs'));

    // Sans rouvrir la vue : elle se dérive du journal à chaque rendu.
    expect(ligneDeBrady()).toContain('Richtig · 2026-10-17');
  });

  it('ergebnis_retrouve_apres_un_detour', () => {
    const { aller } = rendreDansUnCoursNavigable(
      { feuilles: () => <Feuilles />, apercu: () => <p>ailleurs</p> },
      'feuilles',
      contexteDe(['fb000021', true]),
    );
    ouvrirLaUnit2(t.feuilles_ergebnis);

    aller('apercu');
    aller('feuilles');

    expect(document.querySelector('h2')?.textContent).toBe('Unit 2 – Übungsblatt');
    expect(document.querySelector('.resultats')).toBeTruthy();
  });

  it('ergebnis_d_une_fiche_retiree_rend_la_liste', () => {
    const contexte = contexteDe(['fb000021', true]);
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2(t.feuilles_ergebnis);
    expect(document.querySelector('.resultats')).toBeTruthy();
    cleanup();

    // Le même cours, sans la Unit 2, et la mémoire des onglets du premier.
    const sansUnit2: ContexteCours = {
      ...contexteDeTest({ cours: coursServiDeTest() }),
      useEtatDOnglet: contexte.useEtatDOnglet,
      oublierEtatDOnglet: contexte.oublierEtatDOnglet,
    };
    rendreDansUnCoursVivant(<Feuilles />, sansUnit2);

    const [unique, ...reste] = lignes();
    expect(reste).toHaveLength(0);
    expect(unique.textContent).toContain('Unit 1 – Übungsblatt');
    expect(document.querySelector('.resultats')).toBeNull();
  });

  it('weitermachen_apres_l_ergebnis_deroule_la_fiche', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe(['fb000021', true]));
    ouvrirLaUnit2(t.feuilles_ergebnis);
    fireEvent.click(screen.getAllByRole('button', { name: t.feuilles_zurueck })[0] as HTMLElement);

    ouvrirLaUnit2(t.feuilles_weitermachen);

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
  });

  it('fiche_entamee_se_reprend_par_weitermachen', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();
    choisir(TACHY, 'schnell');
    choisir(BRADY, 'langsam');
    fireEvent.click(suivant());
    fireEvent.click(screen.getByRole('button', { name: t.feuilles_zurueck }));

    // Deux questions sur trois répondues : on reprend, ou on recommence.
    const [unit2, unit1] = lignes();
    expect(bouton(unit2, t.feuilles_bearbeiten)).toBeNull();
    expect(bouton(unit2, t.feuilles_weitermachen)).toBeTruthy();
    expect(bouton(unit2, t.feuilles_neu_beginnen)).toBeTruthy();
    expect(bouton(unit2, t.feuilles_fehler)).toBeNull();
    expect(bouton(unit1, t.feuilles_bearbeiten)).toBeTruthy();

    ouvrirLaUnit2(t.feuilles_weitermachen);

    // La première tâche qui a un élément jamais répondu, sans ses deux questions déjà répondues.
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 1');
    expect(consigne()).toBe('Wählen Sie das Organ.');
    expect(screen.queryByRole('group', { name: TACHY })).toBeNull();
    choisir(HARN, 'Niere');
    fireEvent.click(suivant());
    expect(document.querySelector('.done')?.textContent).toContain('1 von 1 richtig');
  });

  it('weitermachen_ne_ramene_pas_une_question_deja_repondue_dans_la_meme_tache', () => {
    // Seule tachy- est répondue : la tâche 1 revient, réduite à brady-.
    rendreDansUnCoursVivant(<Feuilles />, contexteDe(['fb000021', false]));

    ouvrirLaUnit2(t.feuilles_weitermachen);

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(consigne()).toBe('Wählen Sie die Bedeutung.');
    expect(screen.queryByRole('group', { name: TACHY })).toBeNull();
    expect(enAttente(BRADY)).toBe(true);
  });

  it('neu_beginnen_refait_toute_la_fiche', () => {
    rendreDansUnCoursVivant(<Feuilles />, contexteDe(['fb000021', true]));

    ouvrirLaUnit2(t.feuilles_neu_beginnen);

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(enAttente(TACHY) && enAttente(BRADY)).toBe(true);
  });

  it('fiche_entierement_repondue_offre_neu_beginnen', () => {
    rendreDansUnCoursVivant(
      <Feuilles />,
      contexteDe(['fb000021', true], ['fb000022', true], ['fb000023', true]),
    );

    const [unit2] = lignes();
    expect(bouton(unit2, t.feuilles_bearbeiten)).toBeNull();
    expect(bouton(unit2, t.feuilles_weitermachen)).toBeNull();
    expect(bouton(unit2, t.feuilles_fehler)).toBeNull();
    // « Neu beginnen » est alors le bouton principal.
    expect(bouton(unit2, t.feuilles_neu_beginnen)?.className).toBe('small-btn');

    ouvrirLaUnit2(t.feuilles_neu_beginnen);

    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 2');
    expect(enAttente(TACHY)).toBe(true);
  });

  it('fehler_wiederholen_reste_offert_dans_les_etats_entame_et_fait', () => {
    // Entamée avec une erreur, puis faite avec une erreur.
    for (const reponses of [
      [['fb000021', false]],
      [
        ['fb000021', true],
        ['fb000022', true],
        ['fb000023', false],
      ],
    ] as [string, boolean][][]) {
      rendreDansUnCoursVivant(<Feuilles />, contexteDe(...reponses));
      const [unit2] = lignes();
      expect(bouton(unit2, t.feuilles_fehler)).toBeTruthy();
      expect(bouton(unit2, t.feuilles_neu_beginnen)).toBeTruthy();
      cleanup();
    }
  });

  /** « Weiter » mène au bilan : la fiche est finie, et ce n'est plus une séance. */
  function versLeBilan(seance: () => unknown): void {
    fireEvent.click(suivant());
    expect(document.querySelector('.done')).toBeTruthy();
    expect(seance()).toBeNull();
  }

  /** Le contexte donné, dont la mémoire des onglets garde les prédicats de séance. */
  function avecSeance(base: ContexteCours) {
    const memoire = new Map<string, unknown>();
    const predicats: PredicatsDeSeance = new Map();
    const contexte: ContexteCours = {
      ...base,
      useEtatDOnglet: etatDOngletSur(memoire, predicats),
      oublierEtatDOnglet: oubliDOngletSur(memoire, predicats),
    };
    return { contexte, seance: () => seanceDansLaMemoire(memoire, predicats) };
  }

  /** Le contexte de `contexteDe`, dont la mémoire des onglets garde les prédicats de séance. */
  const contexteAvecSeance = (...reponses: [string, boolean][]) =>
    avecSeance(contexteDe(...reponses));

  it('fiche_finie_en_mode_erreurs_n_est_plus_une_seance', () => {
    // Une seule erreur : « Fehler wiederholen » n'a qu'une tâche, sur les deux de la fiche.
    const { contexte, seance } = contexteAvecSeance([BRADY_ID, false]);
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    expect(seance()).toBeNull();
    ouvrirLaUnit2(t.feuilles_fehler);
    expect(progression()).toBe('Unit 2 – Übungsblatt · Schritt 1 von 1');
    expect(seance()).toBeNull();

    choisir(BRADY, 'langsam');
    // Une réponse donnée, et la tâche en cours : une séance.
    expect(seance()).toBe('journalisee');

    // La seule tâche du déroulé est faite : le rang atteint le nombre de tâches du déroulé (une),
    // non celui de la fiche (deux).
    versLeBilan(seance);
  });

  it('une_tache_restante_garde_la_seance', () => {
    const { contexte, seance } = contexteAvecSeance();
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();
    expect(seance()).toBeNull();

    choisir(TACHY, 'schnell');
    choisir(BRADY, 'langsam');
    fireEvent.click(suivant());
    // La première tâche est faite, la seconde reste (la tâche d'un genre inconnu est sautée).
    expect(consigne()).toBe('Wählen Sie das Organ.');
    expect(seance()).toBe('journalisee');

    choisir(HARN, 'Niere');
    expect(seance()).toBe('journalisee');
    versLeBilan(seance);
  });

  it('tache_entamee_ouvre_une_seance', () => {
    // Une tâche à trous, jugée d'un coup par « Prüfen » : avant, rien ne va au journal.
    const { contexte, seance } = avecSeance(contexteDeTest({ cours: coursAvecUneTache(TROUS) }));
    rendreDansUnCoursVivant(<Feuilles />, contexte);
    ouvrirLaUnit2();
    expect(seance()).toBeNull();

    // Une case remplie : aucune réponse n'est donnée, mais un rechargement perdrait la saisie.
    const [premiere] = document.querySelectorAll<HTMLInputElement>('input.trou');
    fireEvent.input(premiere, { target: { value: 'Herz' } });

    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(seance()).toBe('journalisee');
  });

  it('tache_revenue_a_l_initial_n_en_est_plus_une', () => {
    const base = contexteDeTest({ cours: coursAvecUneTache(APPARIEMENT) });
    const hasard = vi.fn(base.hasard);
    const { contexte, seance } = avecSeance({ ...base, hasard });
    const { aller } = rendreDansUnCoursNavigable(
      { feuilles: () => <Feuilles />, apercu: () => <p>ailleurs</p> },
      'feuilles',
      contexte,
    );
    ouvrirLaUnit2();
    // L'ordre de la réserve est tiré à l'ouverture de la tâche.
    const tirages = hasard.mock.calls.length;
    expect(tirages).toBeGreaterThan(0);
    expect(seance()).toBeNull();

    // Un terme posé : la tâche est entamée, et le reste après un détour par un autre onglet.
    fireEvent.click(screen.getByRole('button', { name: 'Milz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filtert das Blut' }));
    expect(seance()).toBe('journalisee');
    aller('apercu');
    expect(seance()).toBe('journalisee');
    aller('feuilles');

    // Rendu à la réserve, le terme retrouve son état initial : plus de séance.
    fireEvent.click(screen.getByRole('button', { name: 'Milz' }));
    expect(seance()).toBeNull();
    // La séance se lit sans rien tirer : l'ordre de la réserve est celui du départ.
    expect(hasard).toHaveBeenCalledTimes(tirages);
  });

  // Chaque genre de tâche arrive à sa vue par la route de la fiche (`vueDeTache`), et à elle seule :
  // une marque propre à la vue est à l'écran, celles des autres n'y sont pas.
  const GENRES: [string, Tache, () => boolean][] = [
    [
      'qcm',
      {
        id: 'fa000031',
        genre: 'qcm',
        consigne: 'Wählen.',
        questions: [question('fb000031', 'Frage QCM?', 'a', ['b', 'c', 'd'])],
      },
      () => screen.queryByRole('group', { name: 'Frage QCM?' }) !== null,
    ],
    [
      'vrai-faux',
      {
        id: 'fa000032',
        genre: 'vrai-faux',
        consigne: 'Richtig oder falsch?',
        affirmations: [
          { id: 'fb000032', affirmation: 'Die Milz filtert.', vrai: true, statut: 'source' },
        ],
      },
      () => screen.queryByRole('button', { name: new RegExp(`${t.feuille_richtig}$`) }) !== null,
    ],
    [
      'trous',
      {
        id: 'fa000033',
        genre: 'trous',
        consigne: 'Ergänzen.',
        liste: ['Herz', 'Niere'],
        phrases: [
          { id: 'fb000033', texte: 'Das ___ schlägt.', reponses: ['Herz'], statut: 'source' },
        ],
      },
      () => document.querySelector('.pastilles') !== null,
    ],
    [
      'trous_sans_liste',
      {
        id: 'fa000034',
        genre: 'trous',
        consigne: 'Ergänzen.',
        phrases: [
          { id: 'fb000034', texte: 'Das ___ schlägt.', reponses: ['Herz'], statut: 'source' },
        ],
      },
      () => document.querySelector('input.trou') !== null,
    ],
    [
      'orthographe',
      {
        id: 'fa000035',
        genre: 'orthographe',
        consigne: 'Korrigieren.',
        mots: [{ id: 'fb000035', fautif: 'Tachykardi', reponse: 'Tachykardie', statut: 'source' }],
      },
      () =>
        screen.queryByText('Tachykardi') !== null && document.querySelector('input.trou') === null,
    ],
    [
      'ouverte',
      {
        id: 'fa000036',
        genre: 'ouverte',
        consigne: 'Beantworten.',
        questions: [
          {
            id: 'fb000036',
            question: 'Wozu dient die Leber?',
            reponse: 'Stoffwechsel',
            statut: 'source',
          },
        ],
      },
      () => screen.queryByRole('button', { name: t.feuilles_zeigen }) !== null,
    ],
    [
      'appariement',
      {
        id: 'fa000037',
        genre: 'appariement',
        consigne: 'Zuordnen.',
        paires: [{ id: 'fb000037', terme: 'Milz', cible: 'Filtert das Blut', statut: 'source' }],
      },
      () => screen.queryByRole('button', { name: 'Filtert das Blut' }) !== null,
    ],
    [
      'classement',
      {
        id: 'fa000038',
        genre: 'classement',
        consigne: 'Einordnen.',
        categories: ['Tempo'],
        elements: [{ id: 'fb000038', terme: 'tachy-', categorie: 'Tempo', statut: 'source' }],
      },
      () => screen.queryByRole('button', { name: 'Tempo' }) !== null,
    ],
  ];

  it.each(GENRES)('fiche_aiguille_%s', (genre, tache, marque) => {
    const contexte = contexteDeTest({ cours: coursAvecUneTache(tache) });
    rendreDansUnCoursVivant(<Feuilles />, contexte);

    ouvrirLaUnit2();

    expect(consigne()).toBe(tache.consigne);
    expect(marque()).toBe(true);
    // Les marques des autres genres n'y sont pas.
    for (const [autre, , marqueDeLAutre] of GENRES) {
      if (autre !== genre) expect(marqueDeLAutre()).toBe(false);
    }
  });
});
