// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tache } from '../../../domaine/contenu/modele.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { TacheOrthographe } from './TacheOrthographe.js';

afterEach(cleanup);

/* Données factices, écrites à la main (invariant 7). */

const tache: Extract<Tache, { genre: 'orthographe' }> = {
  id: 'fa000051',
  genre: 'orthographe',
  consigne: 'Verbessern Sie die Schreibweise.',
  mots: [
    { id: 'fb000051', fautif: 'rueebli', reponse: 'Rüebli', statut: 'source' },
    { id: 'fb000052', fautif: 'zervix', reponse: 'Cervix', statut: 'source' },
  ],
};

function repondre(fautif: string, saisie: string): void {
  fireEvent.input(screen.getByLabelText(fautif), { target: { value: saisie } });
  fireEvent.submit(screen.getByLabelText(fautif).closest('form') as HTMLFormElement);
}

describe('TacheOrthographe', () => {
  it('orthographe_sans_majuscule_automatique', () => {
    rendreDansLeCours(<TacheOrthographe tache={tache} onRepondu={vi.fn()} />, contexteDeTest());

    expect(screen.getByText('rueebli')).toBeTruthy();
    const champs = screen.getAllByRole('textbox');
    expect(champs).toHaveLength(2);
    for (const champ of champs) {
      expect(champ.getAttribute('autocapitalize')).toBe('off');
    }
  });

  it('orthographe_casse_fausse_enregistre_faux', () => {
    const onRepondu = vi.fn();
    rendreDansLeCours(<TacheOrthographe tache={tache} onRepondu={onRepondu} />, contexteDeTest());

    // Un mot jugé est rendu aussitôt (R17).
    repondre('rueebli', 'rüebli');
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([{ id: 'fb000051', juste: false }]);
    repondre('zervix', ' Cervix ');

    expect(onRepondu.mock.calls).toEqual([
      [[{ id: 'fb000051', juste: false }]],
      [[{ id: 'fb000052', juste: true }]],
    ]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('orthographe_saisie_vide_jamais_enregistree', () => {
    // Un champ vide, ou fait d'espaces, n'est pas une réponse fausse : rien n'est jugé (R16).
    const onRepondu = vi.fn();
    rendreDansLeCours(<TacheOrthographe tache={tache} onRepondu={onRepondu} />, contexteDeTest());

    repondre('zervix', '');
    repondre('zervix', '   ');

    expect(onRepondu).not.toHaveBeenCalled();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    repondre('zervix', 'Cervix');
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([{ id: 'fb000052', juste: true }]);
  });
});
