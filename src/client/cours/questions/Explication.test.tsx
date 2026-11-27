// @vitest-environment happy-dom
import { cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Explication } from './Explication.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

function rendre(props: Parameters<typeof Explication>[0]): HTMLElement {
  const { container } = rendreDansLeCours(<Explication {...props} />, contexteDeTest());
  return container as HTMLElement;
}

/* Textes factices, écrits à la main (invariant 7). */

describe('Explication', () => {
  it('le_bloc_dit_le_choix_puis_les_distracteurs_puis_la_reponse', () => {
    const racine = rendre({
      choix: 'Das Wort A ist frei erfunden.',
      distracteurs: [
        { distracteur: 'B', texte: 'Der Text zu B.' },
        { distracteur: 'C', texte: 'Der Text zu C.' },
      ],
      reponse: 'Die Antwort ist D.',
    });

    const bloc = racine.querySelector('.explication');
    expect(bloc?.firstElementChild?.tagName).toBe('B');
    expect(bloc?.firstElementChild?.className).toBe('kind');
    expect(bloc?.firstElementChild?.textContent).toBe('Erklärung');
    const lignes = Array.from(bloc?.querySelectorAll('p') ?? []);
    expect(lignes.map((p) => p.textContent)).toEqual([
      'Das Wort A ist frei erfunden.',
      'B – Der Text zu B.',
      'C – Der Text zu C.',
      'Die Antwort ist D.',
    ]);
    expect(lignes[1].querySelector('b')?.textContent).toBe('B');
    expect(t.explication_titre).toBe('Erklärung');
  });

  it.each([
    ['rien', {}],
    ['une liste vide', { distracteurs: [] }],
    ['des textes absents', { choix: undefined, reponse: undefined, distracteurs: [] }],
  ])('rien_a_expliquer_ne_rend_rien_%s', (_nom, props) => {
    expect(rendre(props).innerHTML).toBe('');
  });

  it('le_bloc_n_annonce_que_sur_demande', () => {
    const avec = rendre({ reponse: 'Ein Satz.', annonce: true });
    expect(avec.querySelector('.explication')?.getAttribute('role')).toBe('status');
    cleanup();

    const sans = rendre({ reponse: 'Ein Satz.' });
    expect(sans.querySelector('.explication')?.hasAttribute('role')).toBe(false);
  });

  it('le_texte_du_cours_est_echappe', () => {
    const racine = rendre({ choix: 'Ein <i>Zimbolwesp</i>' });

    expect(racine.querySelector('.explication p')?.textContent).toBe('Ein <i>Zimbolwesp</i>');
    expect(racine.querySelector('.explication i')).toBeNull();
  });
});
