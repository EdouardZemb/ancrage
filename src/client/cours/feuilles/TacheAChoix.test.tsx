// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAChoix, Tache } from '../../../domaine/contenu/modele.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
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
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([{ id: HEMI.id, juste: true }]);

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
      [[{ id: HEMI.id, juste: true }]],
      [[{ id: POLY.id, juste: false }]],
      [[{ id: ENDO.id, juste: true }]],
    ]);
  });

  it('resultats_de_tache_attendent_tous_les_elements_de_la_tache', () => {
    const juger = (_: { id: string }, etat: boolean | null) => etat ?? undefined;
    const etats = { a: true, b: null, c: false };

    // Un élément sans réponse : rien. L'état d'un élément hors de la tâche ne compte pas.
    expect(resultatsDeTache([{ id: 'a' }, { id: 'b' }], etats, juger)).toBeUndefined();
    expect(resultatsDeTache([{ id: 'c' }, { id: 'a' }], etats, juger)).toEqual([
      { id: 'c', juste: false },
      { id: 'a', juste: true },
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
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([{ id: 'fb000035', juste: false }]);

    // Sans correction, rien de plus ; chaque affirmation est rendue une fois, dès son choix.
    choisirDans('Die Milz filtert das Blut.', 'Richtig');
    fireEvent.click(optionsDe('Der Magen ist paarig.')[1]);
    expect(onRepondu.mock.calls).toEqual([
      [[{ id: 'fb000035', juste: false }]],
      [[{ id: 'fb000034', juste: true }]],
    ]);
  });
});
