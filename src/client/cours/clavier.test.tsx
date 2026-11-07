// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTouches } from './clavier.js';

afterEach(cleanup);

function Sonde(props: { touches: Record<string, () => void>; actif?: boolean }) {
  useTouches(props.touches, props.actif ?? true);
  return (
    <div>
      <input aria-label="saisie" />
      <select aria-label="choix">
        <option>a</option>
      </select>
      <textarea aria-label="texte" />
      <button type="button">bouton</button>
    </div>
  );
}

describe('useTouches', () => {
  it('touche_connue_appelle_son_gestionnaire_et_garde_le_defaut_des_autres', () => {
    const espace = vi.fn();
    const un = vi.fn();
    render(<Sonde touches={{ ' ': espace, '1': un }} />);

    // Une touche gérée n'a plus son effet du navigateur (l'espace fait défiler la page).
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(window, { key: '1' })).toBe(false);
    expect(espace).toHaveBeenCalledTimes(1);
    expect(un).toHaveBeenCalledTimes(1);

    // Une touche inconnue n'appelle rien et garde son effet, y compris un nom de l'objet.
    expect(fireEvent.keyDown(window, { key: '3' })).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'constructor' })).toBe(true);
    expect(espace).toHaveBeenCalledTimes(1);
    expect(un).toHaveBeenCalledTimes(1);
  });

  it('ignore_les_saisies_les_listes_et_les_zones_de_texte', () => {
    const gestionnaire = vi.fn();
    const { getByLabelText, getByRole } = render(<Sonde touches={{ '1': gestionnaire }} />);

    for (const cible of [
      getByLabelText('saisie'),
      getByLabelText('choix'),
      getByLabelText('texte'),
    ]) {
      expect(fireEvent.keyDown(cible, { key: '1' })).toBe(true);
    }
    expect(gestionnaire).not.toHaveBeenCalled();

    // Un bouton n'est pas une saisie : la touche vaut aussi quand il a le focus.
    fireEvent.keyDown(getByRole('button'), { key: '1' });
    expect(gestionnaire).toHaveBeenCalledTimes(1);
  });

  it('ignore_les_combinaisons', () => {
    const gestionnaire = vi.fn();
    render(<Sonde touches={{ '1': gestionnaire }} />);

    // Ctrl+1 change d'onglet du navigateur : la touche garde son effet.
    expect(fireEvent.keyDown(window, { key: '1', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: '1', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: '1', altKey: true })).toBe(true);
    expect(gestionnaire).not.toHaveBeenCalled();

    // Sur un clavier AZERTY, les chiffres s'obtiennent avec la majuscule : la touche reste valable.
    fireEvent.keyDown(window, { key: '1', shiftKey: true });
    expect(gestionnaire).toHaveBeenCalledTimes(1);
  });

  it('touche_repetee_empechee_sans_action', () => {
    const espace = vi.fn();
    render(<Sonde touches={{ ' ': espace }} />);

    // Une touche tenue ne répond qu'une fois, et ne fait pas défiler la page pour autant.
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(window, { key: ' ', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(window, { key: ' ', repeat: true })).toBe(false);
    expect(espace).toHaveBeenCalledTimes(1);

    // Une touche que l'onglet ne gère pas garde son effet, répétée ou non.
    expect(fireEvent.keyDown(window, { key: 'a', repeat: true })).toBe(true);
  });

  it('espace_et_entree_laisses_aux_boutons_et_aux_liens', () => {
    const espace = vi.fn();
    const entree = vi.fn();
    const un = vi.fn();
    const { getByRole, getByText } = render(
      <>
        <Sonde touches={{ ' ': espace, Enter: entree, '1': un }} />
        <a href="/ailleurs">lien</a>
        {/* biome-ignore lint/a11y/useSemanticElements: la carte du cours est un `div` (Cartes). */}
        <div role="button" tabIndex={0}>
          carte
        </div>
      </>,
    );
    const bouton = getByRole('button', { name: 'bouton' });
    const lien = getByText('lien');

    // Le navigateur active un bouton ou un lien par Espace ou Enter : on n'y touche pas.
    for (const cible of [bouton, lien]) {
      expect(fireEvent.keyDown(cible, { key: ' ' })).toBe(true);
      expect(fireEvent.keyDown(cible, { key: 'Enter' })).toBe(true);
    }
    expect(espace).not.toHaveBeenCalled();
    expect(entree).not.toHaveBeenCalled();

    // Les chiffres restent gérés partout, bouton compris.
    expect(fireEvent.keyDown(bouton, { key: '1' })).toBe(false);
    expect(un).toHaveBeenCalledTimes(1);

    // La carte du cours, un `div` avec le rôle de bouton, n'a pas d'activation native : on la gère.
    const carte = getByText('carte');
    expect(fireEvent.keyDown(carte, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(carte, { key: 'Enter' })).toBe(false);
    expect(espace).toHaveBeenCalledTimes(1);
    expect(entree).toHaveBeenCalledTimes(1);
  });

  it('inactif_n_ecoute_pas', () => {
    const gestionnaire = vi.fn();
    const { rerender } = render(<Sonde touches={{ '1': gestionnaire }} actif={false} />);

    expect(fireEvent.keyDown(window, { key: '1' })).toBe(true);
    expect(gestionnaire).not.toHaveBeenCalled();

    rerender(<Sonde touches={{ '1': gestionnaire }} actif />);
    fireEvent.keyDown(window, { key: '1' });
    expect(gestionnaire).toHaveBeenCalledTimes(1);

    rerender(<Sonde touches={{ '1': gestionnaire }} actif={false} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(gestionnaire).toHaveBeenCalledTimes(1);
  });

  it('les_touches_du_dernier_rendu_servent', () => {
    const avant = vi.fn();
    const apres = vi.fn();
    const { rerender } = render(<Sonde touches={{ '1': avant }} />);
    rerender(<Sonde touches={{ '1': apres }} />);

    fireEvent.keyDown(window, { key: '1' });

    expect(avant).not.toHaveBeenCalled();
    expect(apres).toHaveBeenCalledTimes(1);
  });

  it('se_retire_au_demontage', () => {
    const gestionnaire = vi.fn();
    const { unmount } = render(<Sonde touches={{ '1': gestionnaire }} />);

    // Preact diffère le nettoyage d'un effet ; `act` le fait passer avant la touche.
    act(() => {
      unmount();
    });
    fireEvent.keyDown(window, { key: '1' });

    expect(gestionnaire).not.toHaveBeenCalled();
  });
});
