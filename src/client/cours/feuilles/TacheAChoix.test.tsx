// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAChoix, Tache } from '../../../domaine/contenu/modele.js';
import { coursAvecExplications, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import { useCours } from '../contexte-cours.js';
import { choisirDans, optionsDe, texteDe } from '../onglets/onglets.fixture.js';
import { TacheAChoix, TacheVraiFaux } from './TacheAChoix.js';
import { type ResultatDElement, resultatsDeTache } from './tache.js';

afterEach(cleanup);

/* Données factices, écrites à la main (invariant 7). */

type TacheQcm = Extract<Tache, { genre: 'qcm' }>;

function question(id: string, texte: string, reponse: string, autres: string[]): QuestionAChoix {
  return { id, question: texte, reponse, distracteurs: autres, statut: 'source' };
}

const HEMI = question('fb000031', 'Was bedeutet hemi-?', 'halb', ['ganz', 'doppelt', 'dreifach']);
const POLY = question('fb000032', 'Was bedeutet poly-?', 'viel', ['wenig', 'klein', 'gross']);
const ENDO = question('fb000033', 'Was bedeutet endo-?', 'innen', ['aussen', 'oben', 'unten']);

function tacheDe(...questions: QuestionAChoix[]): TacheQcm {
  return { id: 'fa000031', genre: 'qcm', consigne: 'Wählen Sie die Bedeutung.', questions };
}

/** La tâche reçue passe à la version suivante au clic sur « changer », sans être démontée. */
function Changeante(props: {
  versions: TacheQcm[];
  onRepondu(resultats: readonly ResultatDElement[]): void;
}) {
  const [rang, setRang] = useState(0);
  return (
    <>
      <button type="button" data-testid="changer" onClick={() => setRang(rang + 1)}>
        changer
      </button>
      <TacheAChoix tache={props.versions[rang]} onRepondu={props.onRepondu} />
    </>
  );
}

const HEMI_ERKLAERT: QuestionAChoix = {
  ...HEMI,
  explication: 'Hemi- heisst beim Zimbolwesp immer halb.',
  explicationsDistracteurs: { doppelt: 'Doppelt wäre beim Zimbolwesp di-.' },
};

const EXPLICATION_DU_CHOIX = 'Doppelt wäre beim Zimbolwesp di-.';
const EXPLICATION_DE_LA_REPONSE = 'Hemi- heisst beim Zimbolwesp immer halb.';

/** Les blocs « Erklärung » du `fieldset` de la question nommée. */
function blocsDe(groupe: string): HTMLElement[] {
  return Array.from(screen.getByRole('group', { name: groupe }).querySelectorAll('.explication'));
}

const lignesDe = (bloc: HTMLElement) =>
  Array.from(bloc.querySelectorAll('p')).map((p) => p.textContent);

const sansNumero = (groupe: string) => optionsDe(groupe).map(texteDe);

describe('TacheAChoix', () => {
  it('etat_range_par_question_quand_la_tache_change', () => {
    const onRepondu = vi.fn();
    rendreDansLeCours(
      <Changeante
        versions={[tacheDe(HEMI, POLY), tacheDe(ENDO, POLY, HEMI)]}
        onRepondu={onRepondu}
      />,
      contexteDeTest(),
    );
    const optionsDePoly = sansNumero(POLY.question);
    // Une question jugée est rendue aussitôt (R17).
    choisirDans(HEMI.question, 'halb');
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: HEMI.id, juste: true, mode: 'choix' },
    ]);

    // Une question de plus, et les places changent : chacune garde ses options et son choix.
    fireEvent.click(screen.getByTestId('changer'));

    expect(screen.getAllByRole('group').map((groupe) => groupe.firstChild?.textContent)).toEqual([
      ENDO.question,
      POLY.question,
      HEMI.question,
    ]);
    expect(sansNumero(ENDO.question).sort()).toEqual(['aussen', 'innen', 'oben', 'unten']);
    expect(sansNumero(POLY.question)).toEqual(optionsDePoly);
    expect(optionsDe(POLY.question).every((x) => !x.disabled && x.className === '')).toBe(true);
    expect(optionsDe(HEMI.question).find((x) => texteDe(x) === 'halb')?.className).toBe('right');
    expect(optionsDe(HEMI.question).every((x) => x.disabled)).toBe(true);

    // Chaque question est jugée sur ses propres options, et rendue une fois, dès son choix.
    choisirDans(POLY.question, 'wenig');
    choisirDans(ENDO.question, 'innen');
    fireEvent.click(optionsDe(HEMI.question)[0]);
    expect(onRepondu.mock.calls).toEqual([
      [[{ id: HEMI.id, juste: true, mode: 'choix' }]],
      [[{ id: POLY.id, juste: false, mode: 'choix' }]],
      [[{ id: ENDO.id, juste: true, mode: 'choix' }]],
    ]);
  });

  it('resultats_de_tache_attendent_tous_les_elements_de_la_tache', () => {
    const juger = (_: { id: string }, etat: boolean | null) => etat ?? undefined;
    const etats = { a: true, b: null, c: false };

    // Un élément sans réponse : rien. L'état d'un élément hors de la tâche ne compte pas.
    expect(resultatsDeTache([{ id: 'a' }, { id: 'b' }], etats, juger, 'choix')).toBeUndefined();
    expect(resultatsDeTache([{ id: 'c' }, { id: 'a' }], etats, juger, 'association')).toEqual([
      { id: 'c', juste: false, mode: 'association' },
      { id: 'a', juste: true, mode: 'association' },
    ]);
  });

  it('vrai_faux_affiche_la_correction_apres_reponse', () => {
    const onRepondu = vi.fn();
    const tache: Extract<Tache, { genre: 'vrai-faux' }> = {
      id: 'fa000034',
      genre: 'vrai-faux',
      consigne: 'Richtig oder falsch?',
      affirmations: [
        { id: 'fb000034', affirmation: 'Die Milz filtert das Blut.', vrai: true, statut: 'source' },
        {
          id: 'fb000035',
          affirmation: 'Der Magen ist paarig.',
          vrai: false,
          correction: 'Der Magen ist ein Hohlorgan.',
          statut: 'source',
        },
      ],
    };
    rendreDansLeCours(<TacheVraiFaux tache={tache} onRepondu={onRepondu} />, contexteDeTest());
    expect(sansNumero('Der Magen ist paarig.')).toEqual(['Richtig', 'Falsch']);
    expect(screen.queryByText('Der Magen ist ein Hohlorgan.')).toBeNull();

    choisirDans('Der Magen ist paarig.', 'Richtig');
    expect(screen.getByText('Der Magen ist ein Hohlorgan.')).toBeTruthy();
    expect(optionsDe('Der Magen ist paarig.').map((x) => x.className)).toEqual(['wrong', 'right']);
    // L'affirmation jugée est rendue aussitôt (R17).
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: 'fb000035', juste: false, mode: 'choix' },
    ]);

    // Sans correction, rien de plus ; chaque affirmation est rendue une fois, dès son choix.
    choisirDans('Die Milz filtert das Blut.', 'Richtig');
    fireEvent.click(optionsDe('Der Magen ist paarig.')[1]);
    expect(onRepondu.mock.calls).toEqual([
      [[{ id: 'fb000035', juste: false, mode: 'choix' }]],
      [[{ id: 'fb000034', juste: true, mode: 'choix' }]],
    ]);
  });

  it('vrai_faux_affiche_la_correction_apres_un_choix_juste_aussi', () => {
    const tache: Extract<Tache, { genre: 'vrai-faux' }> = {
      id: 'fa000036',
      genre: 'vrai-faux',
      consigne: 'Richtig oder falsch?',
      affirmations: [
        {
          id: 'fb000036',
          affirmation: 'Der Topf ist ein Besteck.',
          vrai: false,
          correction: 'Der Topf ist ein Kochgeschirr mit Deckel.',
          statut: 'source',
        },
      ],
    };
    rendreDansLeCours(<TacheVraiFaux tache={tache} onRepondu={vi.fn()} />, contexteDeTest());
    expect(screen.queryByText('Der Topf ist ein Kochgeschirr mit Deckel.')).toBeNull();

    choisirDans('Der Topf ist ein Besteck.', 'Falsch');

    expect(optionsDe('Der Topf ist ein Besteck.').map((x) => x.className)).toEqual(['', 'right']);
    expect(screen.getByText('Der Topf ist ein Kochgeschirr mit Deckel.')).toBeTruthy();
  });

  it('qcm_un_choix_faux_montre_l_explication_du_choix_puis_celle_de_la_reponse', () => {
    rendreDansLeCours(
      <TacheAChoix tache={tacheDe(HEMI_ERKLAERT)} onRepondu={vi.fn()} />,
      contexteDeTest(),
    );

    choisirDans(HEMI.question, 'doppelt');

    expect(document.querySelector('.options .wrong')?.textContent).toContain('doppelt');
    const blocs = blocsDe(HEMI.question);
    expect(blocs).toHaveLength(1);
    expect(blocs[0].getAttribute('role')).toBe('status');
    expect(lignesDe(blocs[0])).toEqual([EXPLICATION_DU_CHOIX, EXPLICATION_DE_LA_REPONSE]);
  });

  it('qcm_un_distracteur_sans_explication_montre_celle_de_la_reponse', () => {
    rendreDansLeCours(
      <TacheAChoix tache={tacheDe(HEMI_ERKLAERT)} onRepondu={vi.fn()} />,
      contexteDeTest(),
    );

    choisirDans(HEMI.question, 'ganz');

    expect(document.querySelector('.options .wrong')?.textContent).toContain('ganz');
    const blocs = blocsDe(HEMI.question);
    expect(blocs).toHaveLength(1);
    expect(lignesDe(blocs[0])).toEqual([EXPLICATION_DE_LA_REPONSE]);
  });

  it('qcm_un_choix_juste_ne_montre_l_explication_qu_a_un_rebelle', () => {
    const tache = tacheDe(HEMI_ERKLAERT);
    rendreDansLeCours(<TacheAChoix tache={tache} onRepondu={vi.fn()} />, contexteDeTest());
    choisirDans(HEMI.question, 'halb');
    expect(document.querySelector('.options .right')?.textContent).toContain('halb');
    expect(document.querySelector('.explication')).toBeNull();
    cleanup();

    const contexte = { ...contexteDeTest(), rebelles: new Set([HEMI.id]) };
    rendreDansLeCours(<TacheAChoix tache={tache} onRepondu={vi.fn()} />, contexte);
    choisirDans(HEMI.question, 'halb');
    expect(document.querySelector('.options .right')?.textContent).toContain('halb');
    expect(lignesDe(blocsDe(HEMI.question)[0])).toEqual([EXPLICATION_DE_LA_REPONSE]);
  });

  it('qcm_l_explication_attend_le_choix', () => {
    const contexte = { ...contexteDeTest(), rebelles: new Set([HEMI.id]) };
    rendreDansLeCours(<TacheAChoix tache={tacheDe(HEMI_ERKLAERT)} onRepondu={vi.fn()} />, contexte);

    expect(document.querySelector('.explication')).toBeNull();
  });

  it('qcm_l_explication_reste_dans_sa_question', () => {
    rendreDansLeCours(
      <TacheAChoix tache={tacheDe(HEMI_ERKLAERT, POLY)} onRepondu={vi.fn()} />,
      contexteDeTest(),
    );

    choisirDans(HEMI.question, 'doppelt');

    expect(blocsDe(HEMI.question)).toHaveLength(1);
    expect(blocsDe(POLY.question)).toHaveLength(0);
  });

  it('qcm_sans_explication_rien_ne_s_affiche_apres_une_faute', () => {
    rendreDansLeCours(<TacheAChoix tache={tacheDe(HEMI)} onRepondu={vi.fn()} />, contexteDeTest());

    choisirDans(HEMI.question, 'ganz');

    expect(document.querySelector('.options .wrong')?.textContent).toContain('ganz');
    expect(document.querySelector('.explication')).toBeNull();
  });

  it('qcm_le_verdict_rebelle_est_fige_au_choix', () => {
    const FB7 = 'fb000007';
    const cours = { ...coursAvecExplications(coursServiDeTest()), rebelles: { fautes: 2 } };
    const evenements = [
      reponseDeTest(1, FB7, true, '2026-10-10'),
      reponseDeTest(2, FB7, false, '2026-10-11'),
      reponseDeTest(3, FB7, false, '2026-10-12'),
      reponseDeTest(4, FB7, true, '2026-10-13'),
      reponseDeTest(5, FB7, true, '2026-10-14'),
    ];
    const contexte = contexteDeTest({ cours, evenements, aujourdhui: AUJOURDHUI_DE_TEST });
    expect(contexte.rebelles.has(FB7)).toBe(true);
    const tache = contexte.cours.cours.modules
      .flatMap((m) => (m.type === 'feuille' ? m.parties.flatMap((p) => p.taches) : []))
      .find((x) => x.id === 'fa000003');
    if (tache?.genre !== 'qcm') throw new Error('la tâche qcm du cours de test manque');

    function TacheQuiEnregistre() {
      const { enregistrer } = useCours();
      return (
        <TacheAChoix
          tache={tache as TacheQcm}
          onRepondu={(resultats) => {
            for (const { id, juste, mode } of resultats) void enregistrer(id, juste, mode);
          }}
        />
      );
    }
    rendreDansUnCoursVivant(<TacheQuiEnregistre />, contexte);
    expect(screen.getByText('schwierig')).toBeTruthy();

    choisirDans('Was bedeutet hyper-?', 'über dem Mass');

    expect(document.querySelector('.options .right')?.textContent).toContain('über dem Mass');
    // Le journal a pris la réponse : la question n'est plus rebelle, la marque disparaît.
    expect(screen.queryByText('schwierig')).toBeNull();
    // Le verdict a été figé au choix : l'explication de la réponse reste montrée.
    expect(lignesDe(blocsDe('Was bedeutet hyper-?')[0])).toEqual([
      'Der Murmelkrat misst immer zu viel, also darüber.',
    ]);
  });
});
