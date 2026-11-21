// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UniteDeCarte, unitesDeCartes } from '../../../domaine/cartes/unites.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { AideDeLElement } from './AideEtMarque.js';
import { ETAT_DE_CARTE_NEUF, type EtatDeCarte, QuestionCarte } from './QuestionCarte.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

describe('AideDeLElement', () => {
  it.each([
    ['vide', ''],
    ['faite d_espaces', '   '],
  ])('un_texte_%s_n_est_pas_une_aide', (_nom, texte) => {
    rendreDansLeCours(<AideDeLElement aide={{ texte }} />, contexteDeTest());

    expect(screen.queryByText(t.aide_titre)).toBeNull();
  });

  it('une_confusion_sans_texte_utile_reste_une_aide', () => {
    rendreDansLeCours(
      <AideDeLElement aide={{ texte: ' ', confusion: { recto: 'Leber', verso: 'Drüse' } }} />,
      contexteDeTest(),
    );

    expect(screen.getByText(t.aide_titre)).toBeTruthy();
    expect(screen.getByText('Leber')).toBeTruthy();
    expect(document.querySelector('.aide > p:not(.muted)')).toBeNull();
  });

  it('rien_a_montrer_ne_rend_rien', () => {
    rendreDansLeCours(<AideDeLElement aide={undefined} />, contexteDeTest());

    expect(document.querySelector('.aide')).toBeNull();
  });
});

describe('QuestionCarte, la marque et l_aide d_un rebelle', () => {
  const servi = coursServiDeTest();
  const avecAide = {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'cartes'
        ? {
            ...module,
            cartes: module.cartes.map((carte) =>
              carte.id === 'c1000001' ? { ...carte, aide: 'Herz pumpt.' } : carte,
            ),
          }
        : module,
    ),
  };
  const unites = unitesDeCartes(avecAide.modules.flatMap((m) => (m.type === 'cartes' ? [m] : [])));
  const trouvee = unites.find((u) => u.id === 'c1000001');
  if (trouvee === undefined) throw new Error('cours de test changé');
  const HERZ: UniteDeCarte = trouvee;

  function Posee() {
    const [etat, setEtat] = useState<EtatDeCarte>(ETAT_DE_CARTE_NEUF);
    return (
      <QuestionCarte
        unite={HERZ}
        saisie={false}
        etat={etat}
        onEtat={setEtat}
        onReponse={vi.fn()}
        rebelle
      />
    );
  }

  it('la_marque_est_au_dessus_de_la_carte_et_hors_de_son_aria_label', () => {
    rendreDansLeCours(<Posee />, contexteDeTest({ cours: avecAide }));

    const carte = screen.getByRole('button', { name: t.cartes_retourner });
    const marque = screen.getByText(t.rebelle_marque);
    expect(carte.contains(marque)).toBe(false);
    expect(marque.closest('p.rebelle')?.nextElementSibling).toBe(carte);
  });

  it('l_aide_reste_invisible_tant_que_la_carte_n_est_pas_retournee_puis_suit_la_carte', () => {
    rendreDansLeCours(<Posee />, contexteDeTest({ cours: avecAide }));
    expect(screen.queryByText(t.aide_titre)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t.cartes_retourner }));

    const carte = screen.getByRole('button', { name: t.cartes_retourner });
    const aide = screen.getByText('Herz pumpt.').closest('.aide');
    expect(carte.contains(aide)).toBe(false);
    // Après la carte, avant la zone de réponse.
    expect(carte.nextElementSibling).toBe(aide);
    expect(aide?.nextElementSibling?.className).toBe('answer');
  });
});
