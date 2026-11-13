// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UniteDeCarte, unitesDeCartes } from '../../../domaine/cartes/unites.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { ETAT_DE_CARTE_NEUF, type EtatDeCarte, QuestionCarte } from './QuestionCarte.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;
const unites = unitesDeCartes(
  coursServiDeTest().modules.flatMap((m) => (m.type === 'cartes' ? [m] : [])),
);
const HERZ = unites.find((u) => u.id === 'c1000001');
const HERZ_INVERSE = unites.find((u) => u.id === 'c1000001:inverse');
if (HERZ === undefined || HERZ_INVERSE === undefined) throw new Error('cours de test changé');

/** La carte, avec l'état qu'un appelant en garderait. */
function Posee(props: {
  unite: UniteDeCarte;
  saisie?: boolean;
  onReponse(juste: boolean): void;
  onEtat?(e: EtatDeCarte): void;
}) {
  const [etat, setEtat] = useState<EtatDeCarte>(ETAT_DE_CARTE_NEUF);
  return (
    <QuestionCarte
      unite={props.unite}
      saisie={props.saisie ?? false}
      etat={etat}
      onEtat={(e) => {
        setEtat(e);
        props.onEtat?.(e);
      }}
      onReponse={props.onReponse}
    />
  );
}

describe('QuestionCarte', () => {
  it('retourner_puis_su_repond_juste', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(<Posee unite={HERZ} onReponse={onReponse} />, contexteDeTest());
    expect(screen.getByText(t.cartes_indice)).toBeTruthy();
    expect(screen.getByText(t.cartes_neuve)).toBeTruthy();
    expect(screen.getByText(t.cartes_touches)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.cartes_retourner }));
    fireEvent.click(screen.getByRole('button', { name: t.cartes_su }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(true, 'retournee');
  });

  it('pas_su_repond_faux_et_les_touches_repondent', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(<Posee unite={HERZ} onReponse={onReponse} />, contexteDeTest());
    touche('1');
    expect(onReponse).not.toHaveBeenCalled();
    touche(' ');
    touche('1');
    expect(onReponse).toHaveBeenLastCalledWith(false, 'retournee');
    touche('2');
    expect(onReponse).toHaveBeenLastCalledWith(true, 'retournee');
  });

  it('une_saisie_fausse_montre_le_verdict_et_aussi_juste_repond_juste', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(
      <Posee unite={HERZ_INVERSE} saisie onReponse={onReponse} />,
      contexteDeTest(),
    );
    expect(screen.getByText(t.cartes_touches_saisie)).toBeTruthy();
    fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
      target: { value: 'Xyz' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));
    expect(onReponse).not.toHaveBeenCalled();
    expect(screen.getByText(t.cartes_fausse)).toBeTruthy();
    expect(screen.getByText('Xyz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.cartes_aussi_juste }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(true, 'corrigee');
  });

  it('une_saisie_fausse_puis_suivante_repond_faux', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(
      <Posee unite={HERZ_INVERSE} saisie onReponse={onReponse} />,
      contexteDeTest(),
    );
    fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
      target: { value: 'Xyz' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));
    fireEvent.click(screen.getByRole('button', { name: t.cartes_suivante }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(false, 'saisie');
  });

  it('la_saisie_ne_vaut_que_pour_une_inverse', () => {
    rendreDansLeCours(<Posee unite={HERZ} saisie onReponse={vi.fn()} />, contexteDeTest());
    expect(screen.queryByLabelText(t.cartes_saisie_etiquette)).toBeNull();
    expect(screen.getByText(t.cartes_indice)).toBeTruthy();
  });

  it('retourner_ne_rappelle_que_l_etat', () => {
    const onReponse = vi.fn();
    const onEtat = vi.fn();
    rendreDansLeCours(
      <Posee unite={HERZ} onReponse={onReponse} onEtat={onEtat} />,
      contexteDeTest(),
    );
    touche('Enter');
    expect(onEtat).toHaveBeenCalledTimes(1);
    expect(onEtat).toHaveBeenCalledWith({ retournee: true, verdict: null });
    expect(onReponse).not.toHaveBeenCalled();
  });
});
