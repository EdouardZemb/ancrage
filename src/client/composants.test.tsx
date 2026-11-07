// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoutonConfirme, Rattrapage } from './composants.js';

/** Un composant dont le rendu échoue. */
function Casse(): never {
  throw new Error('rendu cassé');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Rattrapage', () => {
  it('rattrapage_rend_les_enfants_sans_erreur', () => {
    render(
      <Rattrapage message="Panne" libelleRecharger="Recharger">
        <p>contenu</p>
      </Rattrapage>,
    );

    expect(screen.getByText('contenu')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recharger' })).toBeNull();
  });

  it('rattrapage_remplace_les_enfants_par_le_message_et_recharger', () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recharge = vi.spyOn(location, 'reload').mockImplementation(() => {});

    render(
      <Rattrapage message="Panne d'affichage" libelleRecharger="Recharger">
        <Casse />
      </Rattrapage>,
    );

    // L'erreur est consignée dans la console, pas avalée.
    expect(journal).toHaveBeenCalled();
    expect(
      journal.mock.calls.flat().some((argument) => String(argument).includes('rendu cassé')),
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain("Panne d'affichage");
    // « Recharger » recharge la page, sans aller ailleurs.
    expect(recharge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(recharge).toHaveBeenCalledTimes(1);
  });

  it('rattrapage_offre_l_accueil', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <Rattrapage message="Panne" libelleRecharger="Recharger" lienAccueil="← Accueil">
        <Casse />
      </Rattrapage>,
    );

    // Dans l'alerte, après « Recharger » : un lien du client, qui mène à l'accueil (1f-D11).
    const alerte = screen.getByRole('alert');
    const lien = within(alerte).getByRole('link', { name: '← Accueil' });
    expect(lien.getAttribute('href')).toBe('/');
    const recharger = within(alerte).getByRole('button', { name: 'Recharger' });
    expect(recharger.compareDocumentPosition(lien) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rattrapage_sans_lien_d_accueil', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <Rattrapage message="Panne" libelleRecharger="Recharger">
        <Casse />
      </Rattrapage>,
    );

    // Le filet de l'onglet du cours ne donne pas `lienAccueil` : « Recharger » seul.
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('rattrapage_ne_touche_pas_a_ce_qui_l_entoure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <p>autour</p>
        <Rattrapage message="Panne" libelleRecharger="Recharger">
          <Casse />
        </Rattrapage>
      </div>,
    );

    expect(screen.getByText('autour')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('rattrapage_se_rearme_quand_sa_cle_change', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ecran = (cle: string, casse: boolean) => (
      <Rattrapage key={cle} message="Panne" libelleRecharger="Recharger">
        {casse ? <Casse /> : <p>{cle} va bien</p>}
      </Rattrapage>
    );
    const { rerender } = render(ecran('a', true));
    expect(screen.getByRole('alert')).toBeTruthy();

    // Une autre clé : un Rattrapage neuf, qui montre de nouveau ses enfants.
    rerender(ecran('b', false));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('b va bien')).toBeTruthy();
  });
});

describe('BoutonConfirme', () => {
  function rendre(options: { disabled?: boolean } = {}) {
    const onConfirme = vi.fn();
    render(
      <BoutonConfirme
        libelle="Supprimer"
        confirmer="Confirmer ?"
        description="Supprimer Testa"
        disabled={options.disabled}
        onConfirme={onConfirme}
      />,
    );
    return onConfirme;
  }

  it('premier_toucher_demande_confirmation', () => {
    const onConfirme = rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Testa' }));

    const bouton = screen.getByRole('button', { name: 'Confirmer ? Supprimer Testa' });
    expect(bouton.textContent).toBe('Confirmer ?');
    expect(bouton.className).toContain('a-confirmer');
    expect(onConfirme).not.toHaveBeenCalled();
  });

  it('second_toucher_confirme_une_fois', () => {
    const onConfirme = rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Testa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer ? Supprimer Testa' }));

    expect(onConfirme).toHaveBeenCalledTimes(1);
    // Le bouton est revenu à son état de départ.
    expect(screen.getByRole('button', { name: 'Supprimer Testa' }).textContent).toBe('Supprimer');
  });

  it('retour_a_l_etat_de_depart_apres_5_s', () => {
    vi.useFakeTimers();
    const onConfirme = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Testa' }));

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('button', { name: 'Confirmer ? Supprimer Testa' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });

    const bouton = screen.getByRole('button', { name: 'Supprimer Testa' });
    expect(bouton.textContent).toBe('Supprimer');
    expect(bouton.className).not.toContain('a-confirmer');
    expect(onConfirme).not.toHaveBeenCalled();
  });

  it('desactive_ne_fait_rien', () => {
    const onConfirme = rendre({ disabled: true });
    const bouton = screen.getByRole('button', { name: 'Supprimer Testa' });

    fireEvent.click(bouton);
    fireEvent.click(bouton);

    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(bouton.textContent).toBe('Supprimer');
    expect(onConfirme).not.toHaveBeenCalled();
  });
});
