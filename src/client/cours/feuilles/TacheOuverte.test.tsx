// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tache } from '../../../domaine/contenu/modele.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { TacheOuverte } from './TacheOuverte.js';

afterEach(cleanup);

/* Données factices, écrites à la main (invariant 7). */

const tache: Extract<Tache, { genre: 'ouverte' }> = {
  id: 'fa000061',
  genre: 'ouverte',
  consigne: 'Beantworten Sie die Fragen.',
  questions: [
    { id: 'fb000061', question: 'Was filtert die Milz?', reponse: 'Das Blut', statut: 'source' },
    {
      id: 'fb000062',
      question: 'Was ist die Aorta?',
      reponse: 'Der Backofen',
      statut: 'source',
    },
  ],
};

const bouton = (nom: string, rang = 0) => screen.getAllByRole('button', { name: nom })[rang];

describe('TacheOuverte', () => {
  it('ouverte_gewusst_enregistre_juste', () => {
    const onRepondu = vi.fn();
    rendreDansLeCours(<TacheOuverte tache={tache} onRepondu={onRepondu} />, contexteDeTest());
    expect(screen.queryByText('Das Blut')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gewusst' })).toBeNull();

    fireEvent.click(bouton('Antwort zeigen'));
    expect(screen.getByText('Das Blut')).toBeTruthy();
    fireEvent.click(bouton('Gewusst'));
    // Une question jugée est rendue aussitôt (R17).
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: 'fb000061', juste: true, mode: 'montree' },
    ]);

    fireEvent.click(bouton('Antwort zeigen'));
    expect(screen.getByText('Der Backofen')).toBeTruthy();
    fireEvent.click(bouton('Nicht gewusst'));

    expect(onRepondu.mock.calls).toEqual([
      [[{ id: 'fb000061', juste: true, mode: 'montree' }]],
      [[{ id: 'fb000062', juste: false, mode: 'montree' }]],
    ]);
    expect(screen.queryByRole('button', { name: 'Gewusst' })).toBeNull();
  });
});
